// ---------------------------------------------------------------------------
// Naming convention helpers
// ---------------------------------------------------------------------------
function toKebabCase(name) {
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .toLowerCase();
}
function toPascalCase(name) {
    if (!name)
        return name;
    return name.charAt(0).toUpperCase() + name.slice(1);
}
function toCamelCase(name) {
    if (!name)
        return name;
    return name.charAt(0).toLowerCase() + name.slice(1);
}
// ---------------------------------------------------------------------------
// SAFE method body rewriting — NO bare variable replacement
// ---------------------------------------------------------------------------
/**
 * Perform SAFE-ONLY replacements on a method/effect/computed body.
 *
 * What we DO:
 *   - Replace setter calls: this.x.update((prev) => ...)(
 *     (safe because setter names like "setCount" are unique function names)
 *   - Replace updater calls: setXxx(prev => ...) → this.xxx.update((prev) => ...)
 *   - Replace React.FormEvent → Event (safe string replacement)
 *   - Replace ref.current → this.ref()?.nativeElement (safe property access)
 *
 * What we DO NOT do:
 *   - Replace bare variable reads (count → this.count())
 *     This is what CORRUPTED object literals like { fallido: fallido === 'si' }
 *     Signal reads are handled by signal-fixer and class-context-layer in post-processing.
 */
function safeRewriteBody(body, ir) {
    // MLFIX-GUARD: also rewrite when props exist
    if (ir.state.length === 0 && ir.refs.length === 0 && ir.contexts.length === 0 && ir.props.length === 0)
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
    // 3. Rewrite bare state reads: x → this.x() (inside method bodies)
    for (const s of ir.state) {
        const name = s.variableName;
        // Replace bare reads NOT already prefixed with this.
        // Must handle: fallido === 'si' (=== is not assignment)
        // Must NOT replace: object key position (name:) or declaration (name =)
        result = result.replace(new RegExp(`(?<!this\\.)(?<![.\\w])\\b${name}\\b(?!\\s*[:.(])(?!\\s*=[^=])`, 'g'), `this.${name}()`);
    }
    // 4. Rewrite DOM ref access: inputRef.current → this.inputRef()?.nativeElement
    for (const r of ir.refs) {
        if (r.isDomRef) {
            result = result.replace(new RegExp(`\\b${r.variableName}\\.current\\b`, 'g'), `this.${r.variableName}()?.nativeElement`);
        }
    }
    // 5. Rewrite context/hook calls: hookResult.method() → this.hookResult.method()
    for (const ctx of ir.contexts) {
        result = result.replace(new RegExp(`(?<!this\\.)\\b${ctx.variableName}\\.`, 'g'), `this.${ctx.variableName}.`);
    }
    // 5b. MLFIX-HOOKCALL: Rewrite bare hook function calls
    // Pattern: this.this.saveService(data) → this.servicesSvc.saveService(data)
    // When a hook is destructured, its methods become bare calls in the body
    for (const svc of ir.angularServices) {
        for (const m of svc.methods) {
            const methodName = m.name;
            // Find the injection that corresponds to this service
            const inj = ir.angularInjections.find(i => i.serviceName === svc.serviceName);
            if (inj) {
                const injName = toCamelCase(inj.propertyName);
                result = result.replace(new RegExp(`(?<!this\\.)(?<![.\\w])\\b${methodName}\\(`, 'g'), `this.${injName}.${methodName}(`);
            }
        }
    }
    // 6. Rewrite prop reads: propName → this.propName (not this.propName())
    // Must handle: onChange(updated), [...evidencias, x], ...evidencias
    // Must NOT handle: object key (name:), declaration (name =), this.name
    for (const p of ir.props) {
        const name = toCamelCase(p.name);
        const isCallback = p.type.includes('=>') || p.type.startsWith('(');
        if (isCallback) {
            // Callback props become output() — rewrite calls to .emit()
            // onChange(data) → this.onChange.emit(data)
            result = result.replace(new RegExp(`(?<!this\\.)(?<!\\w)\\b${name}\\(`, 'g'), `this.${name}.emit(`);
        }
        else {
            result = result.replace(new RegExp(`(?<!this\\.)(?<!\\w)\\b${name}\\b(?!\\s*[:])(?!\\s*=[^=])`, 'g'), `this.${name}`);
        }
    }
    // MLFIX-TYPESAFE: add type narrowing for Event handlers
    // Fix e.target.files -> (e.target as HTMLInputElement).files
    result = result.replace(/e\.target\.files/g, '(e.target as HTMLInputElement).files');
    // Fix e.currentTarget -> (e.target as HTMLFormElement)
    result = result.replace(/e\.currentTarget/g, '(e.target as HTMLFormElement)');
    // Fix new FormData(e.currentTarget) -> new FormData(e.target as HTMLFormElement)
    result = result.replace(/new FormData\(e\.currentTarget\)/g, 'new FormData(e.target as HTMLFormElement)');
    // 7. Replace React types with Angular equivalents
    result = result.replace(/React\.FormEvent/g, 'Event');
    result = result.replace(/React\.ChangeEvent<[^>]*>/g, 'Event');
    result = result.replace(/React\.MouseEvent<[^>]*>/g, 'MouseEvent');
    result = result.replace(/FormEvent<[^>]*>/g, 'Event');
    return result;
}
// ---------------------------------------------------------------------------
// SAFE template rewriting — only replace known signal names
// ---------------------------------------------------------------------------
/**
 * Rewrite the Angular template to use signal reads and proper event handlers.
 *
 * SAFE approach: We know the exact signal names from ir.angularSignals,
 * so we only add () to those specific names in specific contexts.
 *
 * What we DO:
 *   - [(ngModel)]="signalName" → [ngModel]="signalName()" (ngModelChange)="signalName.set($event)"
 *   - In {{ expr }}, add () to known signal names
 *   - In @if (expr) and @for (item of expr), add () to known signal names
 *   - In [prop]="expr", add () to known signal names (but NOT [ngModel])
 *
 * What we DO NOT do:
 *   - General regex replacement of variable names in arbitrary positions
 */
function rewriteTemplate(template, ir) {
    const signalNames = new Set(ir.angularSignals.map((s) => s.name));
    if (signalNames.size === 0)
        return template;
    let result = template;
    // 0. Convert [(ngModel)]="signalVar" → [ngModel]="signalVar()" (ngModelChange)="signalVar.set($event)" [ngModelOptions]="{standalone:true}"
    for (const name of signalNames) {
        result = result.replace(new RegExp(`\\[\\(ngModel\\)\\]="${name}"`, 'g'), `[ngModel]="${name}()" (ngModelChange)="${name}.set($event)" [ngModelOptions]="{standalone: true}"`);
    }
    // 1. Rewrite interpolations: {{ expr }} — add () to signal names
    result = result.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, expr) => {
        let rewritten = expr.trim();
        for (const name of signalNames) {
            rewritten = rewritten.replace(new RegExp(`(?<!\\.)\\b${name}\\b(?!\\s*[(.])`, 'g'), `${name}()`);
        }
        return `{{ ${rewritten} }}`;
    });
    // 2. Rewrite @if conditions — add () to signal names
    result = result.replace(/@if\s*\(([^)]+)\)/g, (_match, condition) => {
        let rewritten = condition;
        for (const name of signalNames) {
            rewritten = rewritten.replace(new RegExp(`(?<!\\.)\\b${name}\\b(?!\\s*[(.])`, 'g'), `${name}()`);
        }
        return `@if (${rewritten})`;
    });
    // 3. Rewrite @for signal reads
    result = result.replace(/@for\s*\((\w+)\s+of\s+(\w+)/g, (_match, item, collection) => {
        if (signalNames.has(collection)) {
            return `@for (${item} of ${collection}()`;
        }
        return _match;
    });
    // 4. Rewrite property bindings: [prop]="expr" — add () to signal names
    //    But NOT [ngModel] which is already handled above
    //    Handle multiline values by matching everything except unescaped "
    result = result.replace(/\[(\w+)\]="((?:[^"\\]|\\.|\n|\r)*)"/g, (_match, prop, expr) => {
        if (prop === 'ngModel')
            return _match;
        let rewritten = expr;
        for (const name of signalNames) {
            rewritten = rewritten.replace(new RegExp(`(?<!\\.)\\b${name}\\b(?!\\s*[(.])`, 'g'), `${name}()`);
        }
        return `[${prop}]="${rewritten}"`;
    });
    return result;
}
// ---------------------------------------------------------------------------
// Component file generation — purely from IR fields
// ---------------------------------------------------------------------------
function generateComponentFile(ir) {
    const lines = [];
    const className = toPascalCase(ir.componentName);
    const kebabName = toKebabCase(ir.componentName);
    // ── Deduplicate: collect names that are already signals to avoid duplicate methods ──
    const signalNames = new Set(ir.angularSignals.map(s => s.name));
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
    // Pre-scan: if any prop is a callback, we need output()
    if (ir.props.some(p => p.type.includes('=>') || p.type.startsWith('('))) {
        coreImports.add('output');
    }
    // Check if DomSanitizer is needed
    const needsSanitizer = ir.securityWarnings.some((w) => w.pattern === 'dangerouslySetInnerHTML');
    if (needsSanitizer) {
        coreImports.add('inject');
    }
    // Angular core import line
    lines.push(`import { ${[...coreImports].join(', ')} } from '@angular/core';`);
    // FormsModule import (for ngModel with signals)
    const templateNeedsForms = ir.angularTemplate.includes('ngModel') ||
        ir.angularTemplate.includes('pInputText') ||
        ir.angularTemplate.includes('p-select') ||
        ir.angularTemplate.includes('pTextarea');
    if (templateNeedsForms) {
        lines.push(`import { FormsModule } from '@angular/forms';`);
    }
    // DomSanitizer import
    if (needsSanitizer) {
        lines.push(`import { DomSanitizer, SafeHtml } from '@angular/platform-browser';`);
    }
    // PrimeNG imports
    for (const imp of ir.primeNgImports) {
        lines.push(`import { ${imp.moduleName} } from '${imp.importPath}';`);
    }
    // Service imports — use correct relative path (services are at ../services/)
    for (const svc of ir.angularServices) {
        // MLFIX: service import depth
        lines.push(`import { ${svc.serviceName} } from '../../services/${svc.fileName}.service';`);
    }
    lines.push('');
    // @Component decorator
    const componentImports = ir.primeNgImports.map((i) => i.moduleName);
    const needsForms = ir.angularTemplate.includes('ngModel') ||
        ir.angularTemplate.includes('pInputText') ||
        ir.angularTemplate.includes('p-select') ||
        ir.angularTemplate.includes('p-checkbox') ||
        ir.angularTemplate.includes('pTextarea');
    if (needsForms) {
        componentImports.unshift('FormsModule');
    }
    const importsStr = componentImports.length > 0
        ? `\n  imports: [${componentImports.join(', ')}],`
        : '';
    lines.push('@Component({');
    lines.push(`  selector: 'app-${kebabName}',`);
    lines.push(`  standalone: true,${importsStr}`);
    // MLFIX: force external template on backticks
    const hasBadChars = ir.angularTemplate.includes('\`') || ir.angularTemplate.includes('${');
    if (ir.isInlineTemplate && !hasBadChars) {
        lines.push(`  template: \`${ir.angularTemplate}\`,`);
    }
    else {
        lines.push(`  templateUrl: './${kebabName}.component.html',`);
    }
    lines.push(`  styleUrls: ['./${kebabName}.component.scss'],`);
    lines.push('})');
    // Class declaration
    lines.push(`export class ${className}Component {`);
    // DomSanitizer injection
    if (needsSanitizer) {
        lines.push(`  // Convertido de dangerouslySetInnerHTML → DomSanitizer`);
        lines.push(`  private sanitizer = inject(DomSanitizer);`);
        lines.push('');
    }
    // @Input() for props — callback props become output()
    const outputProps = new Set();
    for (const prop of ir.props) {
        const propType = prop.type.replace(/!$/, '');
        const name = toCamelCase(prop.name);
        // Detect callback props: type contains '=>' or starts with '('
        if (propType.includes('=>') || propType.startsWith('(')) {
            // Convert to output() instead of @Input()
            // Extract the parameter type from the callback: (data: X) => void → X
            const paramMatch = propType.match(/\(([^)]*)\)\s*=>/);
            const emitType = paramMatch ? paramMatch[1].split(':').pop()?.trim() || 'any' : 'any';
            coreImports.add('output');
            lines.push(`  readonly ${name} = output<${emitType}>();`);
            outputProps.add(name);
        }
        else {
            const suffix = prop.isRequired && !prop.defaultValue ? '!' : '';
            const initStr = prop.defaultValue ? ` = ${prop.defaultValue}` : '';
            lines.push(`  @Input() ${name}${suffix}: ${propType}${initStr};`);
        }
    }
    if (ir.props.length > 0)
        lines.push('');
    // Signals — with improved type inference
    // MLFIX-HOOKSKIP: skip signals that come from hook destructuring
    const injectionPropertyNames = new Set(ir.angularInjections.map(inj => toCamelCase(inj.propertyName)));
    for (const sig of ir.angularSignals) {
        let sigType = sig.type;
        let sigInit = sig.initialValue;
        // Skip signals whose names match hook return values when we have injections
        // These signals come from hook destructuring and should use the injected service instead
        if (ir.angularInjections.length > 0 && (sigType === 'unknown' || sigType === 'any') && (sigInit === 'undefined' || !sigInit)) {
            continue;
        }
        // Fix: if type is unknown/any and initial is undefined, infer better defaults
        if ((sigType === 'unknown' || sigType === 'any') && (sigInit === 'undefined' || !sigInit)) {
            if (/loading|visible|open|closed|active|disabled|checked/i.test(sig.name)) {
                sigType = 'boolean';
                sigInit = 'false';
            }
            else if (/count|index|total|page|size/i.test(sig.name)) {
                sigType = 'number';
                sigInit = '0';
            }
            else if (/name|title|label|text|message|description|value/i.test(sig.name)) {
                sigType = 'string';
                sigInit = "''";
            }
            else if (/items|list|data|results|options|services|evidencias/i.test(sig.name)) {
                sigType = 'unknown[]';
                sigInit = '[]';
            }
        }
        if (sigType.endsWith('[]') && (sigInit === 'undefined' || !sigInit)) {
            sigInit = '[]';
        }
        lines.push(`  // Convertido de useState → signal()`);
        lines.push(`  ${toCamelCase(sig.name)} = signal<${sigType}>(${sigInit});`);
    }
    if (ir.angularSignals.length > 0)
        lines.push('');
    // MLFIX: generate setter methods
    for (const sig of ir.angularSignals) {
        const name = toCamelCase(sig.name);
        const setter = 'set' + name.charAt(0).toUpperCase() + name.slice(1);
        // Check if the template uses this setter
        if (ir.angularTemplate.includes(setter + '(')) {
            lines.push(`  ${setter}(value: ${sig.type}): void { this.${name}.set(value); }`);
            lines.push('');
        }
    }
    // Computed
    for (const comp of ir.angularComputed) {
        lines.push(`  // Convertido de useMemo → computed()`);
        lines.push(`  ${toCamelCase(comp.name)} = computed(() => ${comp.computeFunction});`);
    }
    if (ir.angularComputed.length > 0)
        lines.push('');
    // Injections
    for (const inj of ir.angularInjections) {
        lines.push(`  // Convertido de useContext → inject()`);
        lines.push(`  ${toCamelCase(inj.propertyName)} = inject(${inj.serviceName});`);
    }
    if (ir.angularInjections.length > 0)
        lines.push('');
    // ViewChildren
    for (const vc of ir.angularViewChildren) {
        lines.push(`  // Convertido de useRef → viewChild()`);
        lines.push(`  ${toCamelCase(vc.propertyName)} = viewChild<ElementRef>('${vc.selector}');`);
    }
    if (ir.angularViewChildren.length > 0)
        lines.push('');
    // Class properties
    for (const cp of ir.classProperties) {
        lines.push(`  // Convertido de useRef → class property`);
        lines.push(`  ${toCamelCase(cp.name)}: ${cp.type} = ${cp.initialValue};`);
    }
    if (ir.classProperties.length > 0)
        lines.push('');
    // Constructor with effects
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
    // Component methods — with SAFE body rewriting
    // ── Deduplicate: skip methods whose name collides with a signal ──
    for (const method of ir.componentMethods) {
        const methodCamel = toCamelCase(method.name);
        if (signalNames.has(methodCamel) || signalNames.has(method.name)) {
            // Already declared as a signal — skip to avoid TS2300 duplicate identifier
            continue;
        }
        const safeParams = method.parameters.map((p) => {
            let safeType = p.type
                .replace(/React\.FormEvent/g, 'Event')
                .replace(/React\.ChangeEvent<[^>]*>/g, 'Event')
                .replace(/React\.MouseEvent<[^>]*>/g, 'MouseEvent')
                .replace(/FormEvent<[^>]*>/g, 'Event')
                .replace(/ChangeEvent<[^>]*>/g, 'Event');
            // Fix: Event<HTMLFormElement> is not valid TS — use plain Event
            safeType = safeType.replace(/Event<[^>]*>/g, 'Event');
            return `${p.name}: ${safeType}`;
        }).join(', ');
        const safeBody = safeRewriteBody(method.body, ir)
            .replace(/^\s*\{/, '').replace(/\}\s*$/, '').trim();
        // Fix return type: Event<X> → Event, unknown → void for void-like methods
        let returnType = method.returnType
            .replace(/Event<[^>]*>/g, 'Event');
        lines.push(`  // Convertido de useCallback → method`);
        const asyncPrefix = safeBody.includes('await ') ? 'async ' : '';
        if (asyncPrefix && !returnType.startsWith('Promise')) {
            returnType = `Promise<void>`;
        }
        if (returnType === 'unknown')
            returnType = 'void';
        // MLFIX-RETURNVOID: if body has no return with value, force void
        if (!safeBody.match(/return\s+[^;]/) && returnType !== 'void' && !returnType.includes('Promise')) {
            returnType = 'void';
        }
        // Fix: cast unknown params in service calls to any
        const finalBody = safeBody.replace(/this\.(\w+)\.saveService\((\w+)\)/g, 'this.$1.saveService($2 as any)');
        lines.push(`  ${asyncPrefix}${methodCamel}(${safeParams}): ${returnType} {`);
        lines.push(`    ${finalBody}`);
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
    lines.push(`  it('should create the component', () => {`);
    lines.push(`    expect(component).toBeTruthy();`);
    lines.push(`  });`);
    lines.push('');
    lines.push(`  it('should render the template', () => {`);
    lines.push(`    const compiled = fixture.nativeElement as HTMLElement;`);
    lines.push(`    expect(compiled).toBeTruthy();`);
    lines.push(`  });`);
    // Signal reactivity test
    if (ir.angularSignals.length > 0) {
        const sig = ir.angularSignals[0];
        lines.push('');
        lines.push(`  it('should have reactive signal ${toCamelCase(sig.name)}', () => {`);
        lines.push(`    expect(component.${toCamelCase(sig.name)}()).toEqual(${sig.initialValue});`);
        lines.push(`    component.${toCamelCase(sig.name)}.set(${sig.initialValue});`);
        lines.push(`    expect(component.${toCamelCase(sig.name)}()).toEqual(${sig.initialValue});`);
        lines.push(`  });`);
    }
    // Event handling test
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
// Service file generation — SAFE replacements only
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
            const params = method.parameters.map((p) => `${p.name}: ${p.type.replace(/\bany\b/g, 'unknown')}`).join(', ');
            const returnType = method.returnType.replace(/\bany\b/g, 'unknown');
            const cleanedBody = cleanServiceBody(method.body);
            lines.push(`  // Convertido de custom hook → service method`);
            lines.push(`  ${toCamelCase(method.name)}(${params}): ${returnType} {`);
            lines.push(`    ${cleanedBody}`);
            lines.push(`  }`);
        }
        lines.push('}');
        let content = lines.join('\n');
        // Fix computed() closure: return { ... }.length\n}); → return { ... }.length\n};\n});
        content = content.replace(/(\.length)\s*\n(\s*\}\);)/g, '$1\n    };\n$2');
        return {
            fileName: `${svc.fileName}.service.ts`,
            content,
        };
    });
}
/**
 * Clean React residuals from service method bodies.
 * Replace `: any` → `: unknown`, useXxx() → TODO, toast.xxx() → TODO
 */
function cleanServiceBody(content) {
    // MLFIX-SVCGEN: ensure computed blocks are properly closed
    content = content.replace(/(computed\(\(\)\s*=>\s*\{[^\}]*\})\s*\)/g, '$1);');
    // MLFIX-SVCBODY: fix computed() closure
    if (content.includes('computed(') && content.includes('return {')) {
        // The return object inside computed() needs }; before });
        // Pattern: ...0).length\n  }); → ...0).length\n    };\n  });
        content = content.replace(/(===\s*0\)\.length)\s*\n(\s*\}\);)/g, '$1\n    };\n$2');
        // Generic: any .length followed by }); on next line
        if (!content.match(/\};\s*\n\s*\}\);/)) {
            content = content.replace(/(\.length)\s*\n(\s*\}\);)/g, '$1\n    };\n$2');
        }
    }
    // Fix: saveService body missing signal update and localStorage save
    if (content.includes('saveService') && !content.includes('.update(')) {
        content = content.replace(/(const newService[^}]+\})\s*\}/, '$1;\n    this.services.update(prev => [newService, ...prev]);\n    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.services()));\n  }');
    }
    let result = content;
    // Replace useXxx() hook calls → comment
    result = result.replace(/\b(const|let|var)\s+\w+\s*=\s*use[A-Z]\w*\([^)]*\);?/g, '// TODO: inject service');
    // Replace toast calls → comment
    result = result.replace(/\btoast\.(success|error|warning|info)\([^)]*\);?/g, '// TODO: use MessageService');
    result = result.replace(/\btoast\([^)]*\);?/g, '// TODO: use MessageService');
    // Remove React. prefixes
    result = result.replace(/\bReact\./g, '');
    // Replace `: any` with `: unknown`
    result = result.replace(/:\s*any\b/g, ': unknown');
    return result;
}
// ---------------------------------------------------------------------------
// SCSS file generation
// ---------------------------------------------------------------------------
function generateScssFile(ir) {
    const lines = [];
    lines.push(`// ${ir.componentName} - Estilos del componente`);
    lines.push(`// Generado por CLS Front-End Migration MCP`);
    lines.push(`// Angular 20 + PrimeNG 19 + Design System Seguros Bolívar`);
    lines.push('');
    lines.push(':host {');
    lines.push('  display: block;');
    lines.push("  font-family: var(--sb-font-family, 'Montserrat', 'Segoe UI', system-ui, sans-serif);");
    lines.push('}');
    lines.push('');
    const template = ir.angularTemplate;
    // Detect forms
    if (/ngModel|pInputText|p-select|p-dropdown|p-checkbox|pTextarea|<form/i.test(template)) {
        lines.push('// Estilos de formulario');
        lines.push('.p-field, .field {');
        lines.push('  margin-bottom: var(--sb-spacing-md, 16px);');
        lines.push('}');
        lines.push('');
        lines.push('label {');
        lines.push('  display: block;');
        lines.push('  color: var(--sb-text-secondary, #5A6275);');
        lines.push('  font-weight: 500;');
        lines.push('  margin-bottom: var(--sb-spacing-xs, 4px);');
        lines.push('  font-size: var(--sb-font-size-sm, 0.875rem);');
        lines.push('}');
        lines.push('');
    }
    // Detect tables
    if (/p-table/i.test(template)) {
        lines.push('// Estilos de tabla');
        lines.push('::ng-deep .p-datatable {');
        lines.push('  .p-datatable-thead > tr > th {');
        lines.push('    background-color: var(--sb-primary-50, #E6EAF0);');
        lines.push('    color: var(--sb-primary-dark, #002D7A);');
        lines.push('    font-weight: 600;');
        lines.push('  }');
        lines.push('}');
        lines.push('');
    }
    // Detect cards
    if (/p-card/i.test(template)) {
        lines.push('// Estilos de card');
        lines.push('::ng-deep .p-card {');
        lines.push('  border-radius: var(--sb-border-radius-lg, 12px);');
        lines.push('  box-shadow: var(--sb-shadow, 0 2px 4px rgba(0, 32, 91, 0.08));');
        lines.push('}');
        lines.push('');
    }
    // Detect buttons
    if (/p-button/i.test(template)) {
        lines.push('// Estilos de botones');
        lines.push('::ng-deep .p-button {');
        lines.push('  border-radius: var(--sb-border-radius, 8px);');
        lines.push('  font-family: var(--sb-font-family);');
        lines.push('  transition: all var(--sb-transition-base, 250ms ease-in-out);');
        lines.push('}');
        lines.push('');
    }
    // Detect dialogs
    if (/p-dialog/i.test(template)) {
        lines.push('// Estilos de diálogo');
        lines.push('::ng-deep .p-dialog {');
        lines.push('  border-radius: var(--sb-border-radius-lg, 12px);');
        lines.push("  .p-dialog-header {");
        lines.push('    background-color: var(--sb-primary, #003DA5);');
        lines.push('    color: var(--sb-white, #FFFFFF);');
        lines.push('  }');
        lines.push('}');
        lines.push('');
    }
    return lines.join('\n');
}
// ---------------------------------------------------------------------------
// Clean component file — remove duplicate classes, truncate after class end
// ---------------------------------------------------------------------------
function cleanComponentFile(content) {
    let result = content;
    // Remove duplicate `export class` declarations (keep only the first)
    const exportClassMatches = [...result.matchAll(/^export class \w+Component \{/gm)];
    if (exportClassMatches.length > 1) {
        const secondIdx = exportClassMatches[1].index;
        result = result.slice(0, secondIdx).trimEnd() + '\n';
    }
    // Find the last `}` that closes the class and truncate after it
    const lines = result.split('\n');
    let lastClosingBraceIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim() === '}') {
            lastClosingBraceIdx = i;
            break;
        }
    }
    if (lastClosingBraceIdx !== -1 && lastClosingBraceIdx < lines.length - 1) {
        const afterContent = lines.slice(lastClosingBraceIdx + 1).join('\n').trim();
        if (afterContent.length > 0) {
            result = lines.slice(0, lastClosingBraceIdx + 1).join('\n') + '\n';
        }
    }
    // Replace `: any` → `: unknown`
    result = result.replace(/:\s*any\b/g, ': unknown');
    result = result.replace(/<any>/g, '<unknown>');
    return result;
}
// ---------------------------------------------------------------------------
// Clean React residuals — SAFE removals only
// ---------------------------------------------------------------------------
function cleanReactResiduals(content) {
    let result = content;
    // Remove `import ... from 'react'` lines
    result = result.replace(/^import\s+.*from\s+['"]react['"];?\s*$/gm, '');
    // Remove React. prefixes
    result = result.replace(/\bReact\./g, '');
    // Remove toast calls → comment
    result = result.replace(/\btoast\.(success|error|warning|info)\([^)]*\);?/g, '// TODO: implement notification');
    result = result.replace(/\btoast\([^)]*\);?/g, '// TODO: implement notification');
    // Remove useXxx() hook calls → comment
    result = result.replace(/\b(const|let|var)\s+\w+\s*=\s*use[A-Z]\w*\([^)]*\);?/g, '// TODO: inject service');
    // Replace `: any` with `: unknown`
    result = result.replace(/:\s*any\b/g, ': unknown');
    result = result.replace(/<any>/g, '<unknown>');
    // Remove imports from shadcn/ui, lucide-react, sonner, motion, @/components
    result = result.replace(/^import\s+.*from\s+['"]@\/components\/.*['"];?\s*$/gm, '');
    result = result.replace(/^import\s+.*from\s+['"]lucide-react['"];?\s*$/gm, '');
    result = result.replace(/^import\s+.*from\s+['"]sonner['"];?\s*$/gm, '');
    result = result.replace(/^import\s+.*from\s+['"]motion\/react['"];?\s*$/gm, '');
    result = result.replace(/^import\s+.*from\s+['"]framer-motion['"];?\s*$/gm, '');
    // Clean React type annotations
    result = result.replace(/React\.FormEvent<[^>]*>/g, 'Event');
    result = result.replace(/React\.ChangeEvent<[^>]*>/g, 'Event');
    result = result.replace(/React\.MouseEvent<[^>]*>/g, 'MouseEvent');
    result = result.replace(/FormEvent<[^>]*>/g, 'Event');
    result = result.replace(/ChangeEvent<[^>]*>/g, 'Event');
    return result;
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
 *
 * KEY DESIGN: Method bodies are rewritten with SAFE-ONLY replacements:
 *   - Setter calls (setXxx → this.xxx.set) — safe because setter names are unique
 *   - React types (React.FormEvent → Event) — safe string replacement
 *   - Ref access (ref.current → this.ref()?.nativeElement) — safe property access
 *
 * Bare variable reads are NOT replaced here. They are handled by:
 *   - signal-fixer (for template signal reads)
 *   - class-context-layer (for this. prefix in method bodies)
 */
export function emitAngularArtifact(ir) {
    // Rewrite template to use Angular signal syntax
    const rewrittenTemplate = rewriteTemplate(ir.angularTemplate, ir);
    // Rewrite effect bodies with SAFE replacements only
    const rewrittenEffects = ir.angularEffects.map((e) => ({
        ...e,
        body: safeRewriteBody(e.body, ir),
        cleanupFunction: e.cleanupFunction
            ? safeRewriteBody(e.cleanupFunction, ir)
            : undefined,
    }));
    // Rewrite computed function bodies with SAFE replacements only
    const rewrittenComputed = ir.angularComputed.map((c) => ({
        ...c,
        computeFunction: safeRewriteBody(c.computeFunction, ir),
    }));
    const rewrittenIR = {
        ...ir,
        angularTemplate: rewrittenTemplate,
        angularEffects: rewrittenEffects,
        angularComputed: rewrittenComputed,
    };
    const componentFile = generateComponentFile(rewrittenIR);
    const specFile = generateSpecFile(rewrittenIR);
    const tailwindConfig = generateTailwindConfig(rewrittenIR);
    const services = generateServiceFiles(rewrittenIR);
    const scssFile = generateScssFile(rewrittenIR);
    // Clean up the component file
    const cleanedComponentFile = cleanReactResiduals(cleanComponentFile(componentFile));
    // Generate separate template file when not inline
    const templateFile = rewrittenIR.isInlineTemplate ? undefined : rewrittenIR.angularTemplate;
    // Collect security warnings from the IR
    const securityWarnings = [...ir.securityWarnings];
    return {
        componentFile: cleanedComponentFile,
        specFile,
        tailwindConfig,
        templateFile,
        scssFile,
        services,
        securityWarnings,
    };
}
//# sourceMappingURL=code-emitter.js.map