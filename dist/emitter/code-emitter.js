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
 * Rewrite a JavaScript/TypeScript code body (method body, effect body, computed)
 * to use Angular signal syntax.
 *
 * - `setCount(prev => prev + 1)` → `this.count.update((prev) => prev + 1)`
 * - `setCount(value)` → `this.count.set(value)`
 * - bare `count` reads → `this.count()`
 * - `React.FormEvent` → `Event`
 * - `inputRef.current` → `this.inputRef()?.nativeElement`
 */
function rewriteCodeBody(body, ir) {
    if (ir.state.length === 0 && ir.refs.length === 0)
        return body;
    let result = body;
    // 1. Rewrite setter calls with updater function: setX(prev => ...) → this.x.update(...)
    for (const s of ir.state) {
        const updaterPattern = new RegExp(`\\b${s.setterName}\\(\\s*\\(?\\s*(\\w+)\\s*\\)?\\s*=>`, 'g');
        result = result.replace(updaterPattern, `this.${s.variableName}.update(($1) =>`);
    }
    // 2. Rewrite setter calls with direct value: setX(expr) → this.x.set(expr)
    for (const s of ir.state) {
        result = result.replace(new RegExp(`\\b${s.setterName}\\(`, 'g'), `this.${s.variableName}.set(`);
    }
    // 3. Rewrite state variable reads: count → this.count()
    for (const s of ir.state) {
        result = result.replace(new RegExp(`(?<!\\.)\\b${s.variableName}\\b(?!\\s*[(.=])`, 'g'), `this.${s.variableName}()`);
    }
    // 4. Rewrite DOM ref access: inputRef.current → this.inputRef()?.nativeElement
    for (const r of ir.refs) {
        if (r.isDomRef) {
            result = result.replace(new RegExp(`\\b${r.variableName}\\.current\\b`, 'g'), `this.${r.variableName}()?.nativeElement`);
        }
    }
    // 5. Replace React types with Angular equivalents
    result = result.replace(/React\.FormEvent/g, 'Event');
    result = result.replace(/React\.ChangeEvent<[^>]*>/g, 'Event');
    result = result.replace(/React\.MouseEvent<[^>]*>/g, 'MouseEvent');
    return result;
}
/**
 * Rewrite an event handler expression from the template.
 * Handles patterns like:
 * - `(e) => setNewTitle(e.target.value)` → `newTitle.set($event.target.value)`
 * - `() => toggleTask(task.id)` → `toggleTask(task.id)`
 * - `() => setCount(count + 1)` → `count.set(count() + 1)`
 * - `handleSubmit` → `handleSubmit($event)`
 */
function rewriteTemplateEventHandler(expr, ir) {
    let result = expr;
    // Strip outer arrow: (e) => body or () => body → body
    // Match: (params) => body  or  () => body
    const arrowMatch = result.match(/^\s*\(?([^)]*)\)?\s*=>\s*([\s\S]+)$/);
    if (arrowMatch) {
        const params = arrowMatch[1].trim();
        let body = arrowMatch[2].trim();
        // Replace the event parameter (e, event, evt) with $event
        if (params && params !== '') {
            const paramName = params.split(/[,:]/)[0].trim();
            body = body.replace(new RegExp(`\\b${paramName}\\b`, 'g'), '$event');
        }
        result = body;
    }
    // Rewrite setter calls with updater: setX(prev => ...) → x.update(...)
    for (const s of ir.state) {
        const updaterPattern = new RegExp(`\\b${s.setterName}\\(\\s*\\(?\\s*(\\w+)\\s*\\)?\\s*=>`, 'g');
        result = result.replace(updaterPattern, `${s.variableName}.update(($1) =>`);
    }
    // Rewrite setter calls with direct value: setX(expr) → x.set(expr)
    for (const s of ir.state) {
        result = result.replace(new RegExp(`\\b${s.setterName}\\(`, 'g'), `${s.variableName}.set(`);
    }
    // Rewrite state variable reads in the expression: count → count()
    for (const s of ir.state) {
        result = result.replace(new RegExp(`(?<!\\.)\\b${s.variableName}\\b(?!\\s*[(.=])`, 'g'), `${s.variableName}()`);
    }
    return result;
}
/**
 * Rewrite the Angular template to use signal reads and proper event handlers.
 * Only rewrites inside attribute values and interpolations, not plain text.
 */
function rewriteTemplate(template, ir) {
    if (ir.state.length === 0)
        return template;
    let result = template;
    // 1. Rewrite event handler attribute values: (click)="expr" → (click)="rewritten"
    result = result.replace(/\((click|change|submit|input|focus|blur|keydown|keyup|mouseenter|mouseleave)\)="([^"]*)"/g, (_match, event, expr) => {
        const rewritten = rewriteTemplateEventHandler(expr, ir);
        return `(${event})="${rewritten}"`;
    });
    // 2. Rewrite interpolations: {{ expr }} → {{ expr() }} for signal reads
    result = result.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, expr) => {
        let rewritten = expr.trim();
        for (const s of ir.state) {
            rewritten = rewritten.replace(new RegExp(`(?<!\\.)\\b${s.variableName}\\b(?!\\s*[(.])`, 'g'), `${s.variableName}()`);
        }
        return `{{ ${rewritten} }}`;
    });
    // 3. Rewrite property bindings: [value]="expr" → [value]="expr()" for signals
    result = result.replace(/\[(\w+)\]="([^"]*)"/g, (_match, prop, expr) => {
        let rewritten = expr;
        for (const s of ir.state) {
            rewritten = rewritten.replace(new RegExp(`(?<!\\.)\\b${s.variableName}\\b(?!\\s*[(.])`, 'g'), `${s.variableName}()`);
        }
        return `[${prop}]="${rewritten}"`;
    });
    // 4. Rewrite @if conditions for signal reads
    result = result.replace(/@if\s*\(([^)]+)\)/g, (_match, condition) => {
        let rewritten = condition;
        for (const s of ir.state) {
            rewritten = rewritten.replace(new RegExp(`(?<!\\.)\\b${s.variableName}\\b(?!\\s*[(.])`, 'g'), `${s.variableName}()`);
        }
        return `@if (${rewritten})`;
    });
    return result;
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
    // Rewrite template to use Angular signal syntax for event handlers and interpolations
    const rewrittenTemplate = rewriteTemplate(ir.angularTemplate, ir);
    // Rewrite method bodies to use this.signal() and this.signal.set/update
    const rewrittenMethods = ir.componentMethods.map((m) => ({
        ...m,
        body: rewriteCodeBody(m.body, ir),
        // Replace React types in parameters
        parameters: m.parameters.map((p) => ({
            ...p,
            type: p.type.replace(/React\.FormEvent/g, 'Event')
                .replace(/React\.ChangeEvent<[^>]*>/g, 'Event')
                .replace(/React\.MouseEvent<[^>]*>/g, 'MouseEvent'),
        })),
    }));
    // Rewrite effect bodies
    const rewrittenEffects = ir.angularEffects.map((e) => ({
        ...e,
        body: rewriteCodeBody(e.body, ir),
        cleanupFunction: e.cleanupFunction
            ? rewriteCodeBody(e.cleanupFunction, ir)
            : undefined,
    }));
    // Rewrite computed function bodies
    const rewrittenComputed = ir.angularComputed.map((c) => ({
        ...c,
        computeFunction: rewriteCodeBody(c.computeFunction, ir),
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