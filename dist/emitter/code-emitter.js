// ---------------------------------------------------------------------------
// Naming convention helpers
// ---------------------------------------------------------------------------
/**
 * Convert a PascalCase component name to kebab-case for file names.
 */
function toKebabCase(name) {
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .toLowerCase();
}
/**
 * Ensure a class name is PascalCase.
 */
function toPascalCase(name) {
    if (!name)
        return name;
    return name.charAt(0).toUpperCase() + name.slice(1);
}
/**
 * Ensure a method/property name is camelCase.
 */
function toCamelCase(name) {
    if (!name)
        return name;
    return name.charAt(0).toLowerCase() + name.slice(1);
}
// ---------------------------------------------------------------------------
// Signal-aware expression rewriting
// ---------------------------------------------------------------------------
/**
 * Build a map of React setter names → signal names from the IR.
 * e.g., { setCount: 'count', setName: 'name' }
 */
function buildSetterMap(state) {
    const map = new Map();
    for (const s of state) {
        map.set(s.setterName, s.variableName);
    }
    return map;
}
/**
 * Build a set of state variable names that became signals.
 */
function buildStateVarSet(state) {
    return new Set(state.map((s) => s.variableName));
}
/**
 * Rewrite React state expressions to Angular signal syntax in a code string.
 *
 * Transforms:
 * - `setCount(count + 1)` → `count.set(count() + 1)`
 * - `setCount(prev => prev + 1)` → `count.update((prev) => prev + 1)`
 * - `() => setCount(count + 1)` → `count.set(count() + 1)`
 * - bare `count` reads (as state var) → `count()` (signal read)
 */
function rewriteToSignalSyntax(code, setterMap, stateVars) {
    let result = code;
    // 1. Rewrite setter calls: setX(prev => ...) → x.update((prev) => ...)
    //    and setX(value) → x.set(value)
    for (const [setter, signalName] of setterMap) {
        // Pattern: setX(prev => expr) or setX((prev) => expr) → x.update(...)
        const updaterRegex = new RegExp(`${setter}\\(\\s*\\(?\\s*(\\w+)\\s*\\)?\\s*=>\\s*`, 'g');
        if (updaterRegex.test(result)) {
            result = result.replace(new RegExp(`${setter}\\(\\s*\\(?\\s*(\\w+)\\s*\\)?\\s*=>`, 'g'), `${signalName}.update(($1) =>`);
        }
        else {
            // Pattern: setX(expr) → x.set(expr)
            result = result.replace(new RegExp(`${setter}\\(`, 'g'), `${signalName}.set(`);
        }
    }
    // 2. Remove arrow function wrappers: () => expr → expr
    //    This handles onClick={() => count.set(...)} → count.set(...)
    result = result.replace(/\(\)\s*=>\s*/g, '');
    // 3. Rewrite state variable reads to signal reads: count → count()
    //    Only for standalone identifiers, not when already followed by ( or .
    for (const varName of stateVars) {
        // Match varName that is NOT preceded by . and NOT followed by ( or . or =
        // Use word boundary to avoid partial matches
        result = result.replace(new RegExp(`(?<!\\.)\\b${varName}\\b(?!\\s*[(.=])`, 'g'), `${varName}()`);
    }
    return result;
}
/**
 * Rewrite the Angular template to use signal syntax for event handlers
 * and interpolations.
 */
function rewriteTemplate(template, state) {
    if (state.length === 0)
        return template;
    const setterMap = buildSetterMap(state);
    const stateVars = buildStateVarSet(state);
    return rewriteToSignalSyntax(template, setterMap, stateVars);
}
/**
 * Rewrite method bodies to use signal syntax.
 */
function rewriteMethodBody(body, state) {
    if (state.length === 0)
        return body;
    const setterMap = buildSetterMap(state);
    const stateVars = buildStateVarSet(state);
    return rewriteToSignalSyntax(body, setterMap, stateVars);
}
// ---------------------------------------------------------------------------
// Component file generation
// ---------------------------------------------------------------------------
function generateComponentFile(ir) {
    const lines = [];
    const className = toPascalCase(ir.componentName);
    const kebabName = toKebabCase(ir.componentName);
    // Collect Angular core imports
    const coreImports = new Set(['Component']);
    if (ir.angularSignals.length > 0)
        coreImports.add('signal');
    if (ir.angularEffects.length > 0)
        coreImports.add('effect');
    if (ir.angularComputed.length > 0)
        coreImports.add('computed');
    if (ir.angularInjections.length > 0)
        coreImports.add('inject');
    if (ir.angularViewChildren.length > 0)
        coreImports.add('viewChild');
    if (ir.angularViewChildren.length > 0)
        coreImports.add('ElementRef');
    if (ir.props.length > 0)
        coreImports.add('Input');
    // Check if DomSanitizer is needed
    const needsSanitizer = ir.securityWarnings.some((w) => w.pattern === 'dangerouslySetInnerHTML');
    if (needsSanitizer) {
        coreImports.add('inject');
    }
    // Angular core import line
    lines.push(`import { ${[...coreImports].join(', ')} } from '@angular/core';`);
    // DomSanitizer import
    if (needsSanitizer) {
        lines.push(`import { DomSanitizer, SafeHtml } from '@angular/platform-browser';`);
    }
    // PrimeNG imports
    for (const imp of ir.primeNgImports) {
        lines.push(`import { ${imp.moduleName} } from '${imp.importPath}';`);
    }
    // Service imports
    for (const svc of ir.angularServices) {
        lines.push(`import { ${svc.serviceName} } from './${svc.fileName}';`);
    }
    lines.push('');
    // @Component decorator
    const componentImports = ir.primeNgImports.map((i) => i.moduleName);
    const importsStr = componentImports.length > 0
        ? `\n  imports: [${componentImports.join(', ')}],`
        : '';
    lines.push('@Component({');
    lines.push(`  selector: 'app-${kebabName}',`);
    lines.push(`  standalone: true,${importsStr}`);
    if (ir.isInlineTemplate) {
        lines.push(`  template: \`${ir.angularTemplate}\`,`);
    }
    else {
        lines.push(`  templateUrl: './${kebabName}.component.html',`);
    }
    lines.push('})');
    // Class declaration
    lines.push(`export class ${className}Component {`);
    // DomSanitizer injection
    if (needsSanitizer) {
        lines.push(`  // Convertido de dangerouslySetInnerHTML → DomSanitizer`);
        lines.push(`  private sanitizer = inject(DomSanitizer);`);
        lines.push('');
    }
    // @Input() for props
    for (const prop of ir.props) {
        const defaultStr = prop.defaultValue ? ` = ${prop.defaultValue}` : prop.isRequired ? '!' : ' = undefined';
        lines.push(`  @Input() ${toCamelCase(prop.name)}: ${prop.type}${defaultStr};`);
    }
    if (ir.props.length > 0)
        lines.push('');
    // Signals — Convertido de useState → signal()
    for (const sig of ir.angularSignals) {
        lines.push(`  // Convertido de useState → signal()`);
        lines.push(`  ${toCamelCase(sig.name)} = signal<${sig.type}>(${sig.initialValue});`);
    }
    if (ir.angularSignals.length > 0)
        lines.push('');
    // Computed — Convertido de useMemo → computed()
    for (const comp of ir.angularComputed) {
        lines.push(`  // Convertido de useMemo → computed()`);
        lines.push(`  ${toCamelCase(comp.name)} = computed(() => ${comp.computeFunction});`);
    }
    if (ir.angularComputed.length > 0)
        lines.push('');
    // Injections — Convertido de useContext → inject()
    for (const inj of ir.angularInjections) {
        lines.push(`  // Convertido de useContext → inject()`);
        lines.push(`  ${toCamelCase(inj.propertyName)} = inject(${inj.serviceName});`);
    }
    if (ir.angularInjections.length > 0)
        lines.push('');
    // ViewChildren — Convertido de useRef (DOM) → viewChild()
    for (const vc of ir.angularViewChildren) {
        lines.push(`  // Convertido de useRef → viewChild()`);
        lines.push(`  ${toCamelCase(vc.propertyName)} = viewChild<ElementRef>('${vc.selector}');`);
    }
    if (ir.angularViewChildren.length > 0)
        lines.push('');
    // Class properties — Convertido de useRef (value) → class property
    for (const cp of ir.classProperties) {
        lines.push(`  // Convertido de useRef → class property`);
        lines.push(`  ${toCamelCase(cp.name)}: ${cp.type} = ${cp.initialValue};`);
    }
    if (ir.classProperties.length > 0)
        lines.push('');
    // Constructor with effects — Convertido de useEffect → effect()
    if (ir.angularEffects.length > 0) {
        lines.push('  constructor() {');
        for (const eff of ir.angularEffects) {
            lines.push(`    // Convertido de useEffect → effect()`);
            lines.push(`    effect(() => {`);
            lines.push(`      ${eff.body}`);
            if (eff.cleanupFunction) {
                lines.push(`      return () => { ${eff.cleanupFunction} };`);
            }
            lines.push(`    });`);
        }
        lines.push('  }');
        lines.push('');
    }
    // Sanitizer helper method
    if (needsSanitizer) {
        lines.push(`  sanitizeHtml(content: string): SafeHtml {`);
        lines.push(`    return this.sanitizer.bypassSecurityTrustHtml(content);`);
        lines.push(`  }`);
        lines.push('');
    }
    // Component methods — Convertido de useCallback → method
    for (const method of ir.componentMethods) {
        const params = method.parameters.map((p) => `${p.name}: ${p.type}`).join(', ');
        lines.push(`  // Convertido de useCallback → method`);
        lines.push(`  ${toCamelCase(method.name)}(${params}): ${method.returnType} {`);
        lines.push(`    ${method.body}`);
        lines.push(`  }`);
        lines.push('');
    }
    lines.push('}');
    return lines.join('\n');
}
// ---------------------------------------------------------------------------
// Spec file generation
// ---------------------------------------------------------------------------
function generateSpecFile(ir) {
    const className = toPascalCase(ir.componentName);
    const kebabName = toKebabCase(ir.componentName);
    const lines = [];
    lines.push(`import { ComponentFixture, TestBed } from '@angular/core/testing';`);
    lines.push(`import { ${className}Component } from './${kebabName}.component';`);
    lines.push('');
    lines.push(`describe('${className}Component', () => {`);
    lines.push(`  let component: ${className}Component;`);
    lines.push(`  let fixture: ComponentFixture<${className}Component>;`);
    lines.push('');
    lines.push(`  beforeEach(async () => {`);
    lines.push(`    await TestBed.configureTestingModule({`);
    lines.push(`      imports: [${className}Component],`);
    lines.push(`    }).compileComponents();`);
    lines.push('');
    lines.push(`    fixture = TestBed.createComponent(${className}Component);`);
    lines.push(`    component = fixture.componentInstance;`);
    lines.push(`    fixture.detectChanges();`);
    lines.push(`  });`);
    lines.push('');
    // Test: should create the component
    lines.push(`  it('should create the component', () => {`);
    lines.push(`    expect(component).toBeTruthy();`);
    lines.push(`  });`);
    lines.push('');
    // Test: should render the template
    lines.push(`  it('should render the template', () => {`);
    lines.push(`    const compiled = fixture.nativeElement as HTMLElement;`);
    lines.push(`    expect(compiled).toBeTruthy();`);
    lines.push(`  });`);
    // Test: signal reactivity (if signals exist)
    if (ir.angularSignals.length > 0) {
        const sig = ir.angularSignals[0];
        lines.push('');
        lines.push(`  it('should have reactive signal ${toCamelCase(sig.name)}', () => {`);
        lines.push(`    expect(component.${toCamelCase(sig.name)}()).toEqual(${sig.initialValue});`);
        lines.push(`    component.${toCamelCase(sig.name)}.set(${sig.initialValue});`);
        lines.push(`    expect(component.${toCamelCase(sig.name)}()).toEqual(${sig.initialValue});`);
        lines.push(`  });`);
    }
    // Test: event handling (if event handlers exist)
    const eventBindings = ir.templateBindings.filter((b) => b.type === 'event');
    if (eventBindings.length > 0) {
        const firstEvent = eventBindings[0];
        const eventName = firstEvent.angularSyntax.replace(/[()]/g, '');
        lines.push('');
        lines.push(`  it('should handle ${eventName} event', () => {`);
        lines.push(`    const compiled = fixture.nativeElement as HTMLElement;`);
        lines.push(`    const element = compiled.querySelector('[class]') || compiled.firstElementChild;`);
        lines.push(`    if (element) {`);
        lines.push(`      element.dispatchEvent(new Event('${eventName}'));`);
        lines.push(`      fixture.detectChanges();`);
        lines.push(`      expect(component).toBeTruthy();`);
        lines.push(`    }`);
        lines.push(`  });`);
    }
    lines.push('});');
    return lines.join('\n');
}
// ---------------------------------------------------------------------------
// Tailwind config generation
// ---------------------------------------------------------------------------
function generateTailwindConfig(ir) {
    const kebabName = toKebabCase(ir.componentName);
    const lines = [];
    lines.push(`/** @type {import('tailwindcss').Config} */`);
    lines.push(`module.exports = {`);
    lines.push(`  content: [`);
    lines.push(`    './${kebabName}.component.ts',`);
    lines.push(`    './${kebabName}.component.html',`);
    lines.push(`  ],`);
    lines.push(`  theme: {`);
    lines.push(`    extend: {},`);
    lines.push(`  },`);
    lines.push(`  plugins: [],`);
    lines.push(`  presets: [require('primeng/resources/primeng-preset')],`);
    lines.push(`};`);
    return lines.join('\n');
}
// ---------------------------------------------------------------------------
// Service file generation
// ---------------------------------------------------------------------------
function generateServiceFiles(ir) {
    return ir.angularServices.map((svc) => {
        const lines = [];
        lines.push(`import { Injectable } from '@angular/core';`);
        lines.push('');
        lines.push(`@Injectable({`);
        lines.push(`  providedIn: 'root',`);
        lines.push(`})`);
        lines.push(`export class ${toPascalCase(svc.serviceName)} {`);
        for (const method of svc.methods) {
            const params = method.parameters.map((p) => `${p.name}: ${p.type}`).join(', ');
            lines.push(`  // Convertido de custom hook → service method`);
            lines.push(`  ${toCamelCase(method.name)}(${params}): ${method.returnType} {`);
            lines.push(`    ${method.body}`);
            lines.push(`  }`);
        }
        lines.push('}');
        return {
            fileName: `${svc.fileName}.service.ts`,
            content: lines.join('\n'),
        };
    });
}
// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
/**
 * Generates the final Angular artifact files from a fully-transformed ComponentIR.
 *
 * Takes a ComponentIR that has been processed through the full pipeline
 * (AST_Parser → State_Mapper → Template_Generator → PrimeNG_Mapper) and
 * produces string content for each output file.
 */
export function emitAngularArtifact(ir) {
    // Rewrite template and method bodies to use Angular signal syntax
    const rewrittenTemplate = rewriteTemplate(ir.angularTemplate, ir.state);
    const rewrittenMethods = ir.componentMethods.map((m) => ({
        ...m,
        body: rewriteMethodBody(m.body, ir.state),
    }));
    const rewrittenEffects = ir.angularEffects.map((e) => ({
        ...e,
        body: rewriteMethodBody(e.body, ir.state),
        cleanupFunction: e.cleanupFunction
            ? rewriteMethodBody(e.cleanupFunction, ir.state)
            : undefined,
    }));
    const rewrittenComputed = ir.angularComputed.map((c) => ({
        ...c,
        computeFunction: rewriteMethodBody(c.computeFunction, ir.state),
    }));
    const rewrittenIR = {
        ...ir,
        angularTemplate: rewrittenTemplate,
        componentMethods: rewrittenMethods,
        angularEffects: rewrittenEffects,
        angularComputed: rewrittenComputed,
    };
    const componentFile = generateComponentFile(rewrittenIR);
    const specFile = generateSpecFile(rewrittenIR);
    const tailwindConfig = generateTailwindConfig(rewrittenIR);
    const services = generateServiceFiles(rewrittenIR);
    // Generate separate template file when not inline
    const templateFile = rewrittenIR.isInlineTemplate ? undefined : rewrittenIR.angularTemplate;
    // Collect security warnings from the IR
    const securityWarnings = [...ir.securityWarnings];
    return {
        componentFile,
        specFile,
        tailwindConfig,
        templateFile,
        services,
        securityWarnings,
    };
}
//# sourceMappingURL=code-emitter.js.map