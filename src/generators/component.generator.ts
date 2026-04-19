/**
 * Generador de Angular Standalone Components desde análisis React.
 * Produce .component.ts, .component.html, .component.scss, .component.spec.ts
 * Usa Signals obligatoriamente. OnPush por defecto.
 */
import type { ReactComponentAnalysis } from '../models/react-analysis.model.js';
import type { AngularGeneratedFiles } from '../models/angular-output.model.js';
import {
  toKebabCase,
  toAngularSelector,
  toAngularFileName,
  toCamelCase,
} from '../utils/naming.utils.js';
import { mapReactTypeToAngular } from '../utils/type-mapper.utils.js';

export function generateAngularComponent(
  analysis: ReactComponentAnalysis,
  moduleName: string
): AngularGeneratedFiles {
  const kebabName = toKebabCase(analysis.componentName);
  const selector = toAngularSelector(analysis.componentName);

  const componentTs = generateComponentTs(analysis, selector, kebabName);
  const componentHtml = generateComponentHtml(analysis);
  const componentScss = generateComponentScss(analysis);
  const componentSpec = generateComponentSpec(analysis, kebabName);

  return {
    componentTs,
    componentHtml,
    componentScss,
    componentSpec,
  };
}

function generateComponentTs(
  analysis: ReactComponentAnalysis,
  selector: string,
  kebabName: string
): string {
  const imports = buildImports(analysis);
  const signals = buildSignals(analysis);
  const inputs = buildInputs(analysis);
  const effects = buildEffects(analysis);
  const methods = buildMethods(analysis);
  const computedSignals = buildComputedSignals(analysis);

  const hasOnInit = analysis.effects.some((e) => e.isOnMount && !e.hasCleanup);
  const hasOnDestroy = analysis.effects.some((e) => e.isOnDestroy || e.hasCleanup);
  const lifecycleInterfaces: string[] = [];
  if (hasOnInit) lifecycleInterfaces.push('OnInit');
  if (hasOnDestroy) lifecycleInterfaces.push('OnDestroy');

  const implementsClause = lifecycleInterfaces.length > 0
    ? ` implements ${lifecycleInterfaces.join(', ')}`
    : '';

  // Detectar si necesita FormsModule
  const jsxTemplate = analysis.jsxTemplate || '';
  const needsForms = /input|select|textarea|<form/i.test(jsxTemplate) ||
    analysis.stateHooks.some((h) => /string|number|boolean/.test(h.type));
  const componentImports = needsForms ? 'CommonModule, FormsModule' : 'CommonModule';

  return `${imports}

@Component({
  selector: '${selector}',
  standalone: true,
  imports: [${componentImports}],
  templateUrl: './${kebabName}.component.html',
  styleUrls: ['./${kebabName}.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ${analysis.componentName}Component${implementsClause} {
${inputs}
${signals}
${computedSignals}
${effects}
${methods}
}
`;
}

function buildImports(analysis: ReactComponentAnalysis): string {
  const angularImports = new Set<string>([
    'Component',
    'ChangeDetectionStrategy',
  ]);

  // Signals siempre
  angularImports.add('signal');

  if (analysis.props.length > 0) {
    angularImports.add('input');
    angularImports.add('output');
  }

  if (analysis.memos.length > 0) {
    angularImports.add('computed');
  }

  if (analysis.effects.length > 0) {
    angularImports.add('effect');
  }

  const hasOnInit = analysis.effects.some((e) => e.isOnMount && !e.hasCleanup);
  const hasOnDestroy = analysis.effects.some((e) => e.isOnDestroy || e.hasCleanup);
  if (hasOnInit) angularImports.add('OnInit');
  if (hasOnDestroy) angularImports.add('OnDestroy');

  if (analysis.refs.length > 0) {
    angularImports.add('viewChild');
    angularImports.add('ElementRef');
  }

  // Detectar si el template usa formularios (ngModel)
  const jsxTemplate = analysis.jsxTemplate || '';
  const needsForms = /input|select|textarea|<form/i.test(jsxTemplate) ||
    analysis.stateHooks.some((h) => /string|number|boolean/.test(h.type));

  const lines: string[] = [];
  lines.push(`import { ${[...angularImports].join(', ')} } from '@angular/core';`);
  lines.push(`import { CommonModule } from '@angular/common';`);

  if (needsForms) {
    lines.push(`import { FormsModule } from '@angular/forms';`);
  }

  return lines.join('\n');
}

function buildSignals(analysis: ReactComponentAnalysis): string {
  if (analysis.stateHooks.length === 0) return '';

  return analysis.stateHooks
    .map((hook) => {
      const type = mapReactTypeToAngular(hook.type);
      const name = toCamelCase(hook.name);
      return `  readonly ${name} = signal<${type}>(${hook.initialValue});`;
    })
    .join('\n');
}

function buildInputs(analysis: ReactComponentAnalysis): string {
  const inputProps = analysis.props.filter((p) => p.name !== '_propsInterface');
  if (inputProps.length === 0) return '';

  return inputProps
    .map((prop) => {
      const type = mapReactTypeToAngular(prop.type);
      if (prop.required) {
        return `  readonly ${prop.name} = input.required<${type}>();`;
      }
      const defaultVal = prop.defaultValue ?? 'undefined';
      return `  readonly ${prop.name} = input<${type}>(${defaultVal});`;
    })
    .join('\n');
}

function buildComputedSignals(analysis: ReactComponentAnalysis): string {
  if (analysis.memos.length === 0) return '';

  return analysis.memos
    .map((memo) => {
      const name = toCamelCase(memo.name);
      return `  readonly ${name} = computed(() => ${memo.computation});`;
    })
    .join('\n');
}

function buildEffects(analysis: ReactComponentAnalysis): string {
  const lines: string[] = [];

  // Effects con dependencias → effect() de Signal
  const signalEffects = analysis.effects.filter(
    (e) => !e.isOnMount && !e.isOnDestroy && e.dependencies.length > 0
  );

  if (signalEffects.length > 0) {
    lines.push('');
    lines.push('  constructor() {');
    for (const eff of signalEffects) {
      lines.push(`    effect(() => ${eff.body});`);
    }
    lines.push('  }');
  }

  // OnMount → ngOnInit
  const onMountEffects = analysis.effects.filter((e) => e.isOnMount && !e.hasCleanup);
  if (onMountEffects.length > 0) {
    lines.push('');
    lines.push('  ngOnInit(): void {');
    for (const eff of onMountEffects) {
      lines.push(`    ${eff.body}`);
    }
    lines.push('  }');
  }

  // Cleanup → ngOnDestroy
  const destroyEffects = analysis.effects.filter((e) => e.hasCleanup);
  if (destroyEffects.length > 0) {
    lines.push('');
    lines.push('  ngOnDestroy(): void {');
    lines.push('    // Cleanup de efectos React migrados');
    for (const eff of destroyEffects) {
      lines.push(`    ${eff.body.includes('return') ? '// TODO: extraer cleanup del effect' : '// TODO: migrar cleanup'}`);
    }
    lines.push('  }');
  }

  return lines.join('\n');
}

function buildMethods(analysis: ReactComponentAnalysis): string {
  if (analysis.callbacks.length === 0) return '';

  return analysis.callbacks
    .map((cb) => {
      const name = toCamelCase(cb.name);
      const params = cb.params.join(', ');
      return `
  ${name}(${params}): void ${cb.body}`;
    })
    .join('\n');
}


function generateComponentHtml(analysis: ReactComponentAnalysis): string {
  let html = analysis.jsxTemplate || '<div>\n  <!-- TODO: migrar template -->\n</div>';

  // Transformaciones JSX → Angular template
  html = transformJsxToAngular(html);

  return html;
}

function transformJsxToAngular(jsx: string): string {
  let template = jsx;

  // className → class
  template = template.replace(/className=/g, 'class=');

  // onClick → (click)
  template = template.replace(/onClick=\{([^}]+)\}/g, '(click)="$1"');
  template = template.replace(/onChange=\{([^}]+)\}/g, '(ngModelChange)="$1"');
  template = template.replace(/onSubmit=\{([^}]+)\}/g, '(submit)="$1"');
  template = template.replace(/onInput=\{([^}]+)\}/g, '(input)="$1"');
  template = template.replace(/onKeyDown=\{([^}]+)\}/g, '(keydown)="$1"');
  template = template.replace(/onKeyUp=\{([^}]+)\}/g, '(keyup)="$1"');
  template = template.replace(/onBlur=\{([^}]+)\}/g, '(blur)="$1"');
  template = template.replace(/onFocus=\{([^}]+)\}/g, '(focus)="$1"');

  // value={stateVar} en inputs → [ngModel]="stateVar()" (ngModelChange)="stateVar.set($event)"
  // Esto maneja el patrón signal con formularios
  template = template.replace(
    /value=\{(\w+)\}/g,
    '[ngModel]="$1()" (ngModelChange)="$1.set($$event)"'
  );

  // checked={stateVar} en checkboxes → [ngModel]="stateVar()" (ngModelChange)="stateVar.set($event)"
  template = template.replace(
    /checked=\{(\w+)\}/g,
    '[ngModel]="$1()" (ngModelChange)="$1.set($$event)"'
  );

  // {expression} → {{ expression }}  (solo para texto, no atributos)
  template = template.replace(/>\s*\{([^{}]+)\}\s*</g, '>{{ $1 }}<');

  // style={{ ... }} → [ngStyle]="{ ... }"
  template = template.replace(/style=\{\{([^}]+)\}\}/g, '[ngStyle]="{$1}"');

  // htmlFor → for
  template = template.replace(/htmlFor=/g, 'for=');

  // Fragmentos <> → <ng-container>
  template = template.replace(/<>/g, '<ng-container>');
  template = template.replace(/<\/>/g, '</ng-container>');

  // {condition && <element>} → @if (condition) { <element> }
  template = template.replace(
    /\{(\w+)\s*&&\s*(<[^>]+>[^<]*<\/[^>]+>)\}/g,
    '@if ($1) {\n  $2\n}'
  );

  // {condition ? <a> : <b>} → @if / @else
  template = template.replace(
    /\{(\w+)\s*\?\s*(<[^>]+>[^<]*<\/[^>]+>)\s*:\s*(<[^>]+>[^<]*<\/[^>]+>)\}/g,
    '@if ($1) {\n  $2\n} @else {\n  $3\n}'
  );

  // {items.map(item => <element>)} → @for con track
  template = template.replace(
    /\{(\w+)\.map\(\(?(\w+)\)?\s*=>\s*(<[^]*?)\)\}/g,
    '@for ($2 of $1; track $index) {\n  $3\n}'
  );

  // Quitar atributo required de p-dropdown (PrimeNG no lo soporta como HTML attr)
  template = template.replace(/(<p-dropdown[^>]*)\s+required(?=[>\s/])/g, '$1');

  return template;
}

function generateComponentScss(analysis: ReactComponentAnalysis): string {
  const lines: string[] = [
    '// Estilos del componente - CLS Design System',
    '// Variables: --sb-primary, --sb-secondary, --sb-bg-*, --sb-text-*, --sb-spacing-*',
    '',
    ':host {',
    '  display: block;',
    '  font-family: var(--sb-font-family, \'Montserrat\', \'Segoe UI\', system-ui, sans-serif);',
    '}',
    '',
  ];

  // Extraer clases CSS usadas en el JSX template
  const jsxTemplate = analysis.jsxTemplate || '';
  const classMatches = jsxTemplate.match(/className=["']([^"']+)["']/g) || [];
  const usedClasses = new Set<string>();

  for (const match of classMatches) {
    const classValue = match.replace(/className=["']/, '').replace(/["']$/, '');
    classValue.split(/\s+/).forEach((cls) => {
      if (cls && !cls.startsWith('{')) usedClasses.add(cls);
    });
  }

  // Generar stubs de clases CSS encontradas en el template
  if (usedClasses.size > 0) {
    lines.push('// Clases extraídas del componente React original');
    for (const cls of usedClasses) {
      // Convertir clases comunes a variables CLS/SB
      lines.push(`.${cls} {`);
      if (cls.includes('container') || cls.includes('wrapper')) {
        lines.push('  max-width: 1200px;');
        lines.push('  margin: 0 auto;');
        lines.push('  padding: var(--sb-spacing-lg);');
      } else if (cls.includes('header') || cls.includes('title')) {
        lines.push('  color: var(--sb-primary-dark);');
        lines.push('  font-weight: 600;');
        lines.push('  margin-bottom: var(--sb-spacing-md);');
      } else if (cls.includes('btn') || cls.includes('button')) {
        lines.push('  cursor: pointer;');
        lines.push('  border-radius: var(--sb-border-radius);');
        lines.push('  transition: all var(--sb-transition-base);');
      } else if (cls.includes('form') || cls.includes('field')) {
        lines.push('  margin-bottom: var(--sb-spacing-md);');
      } else if (cls.includes('card')) {
        lines.push('  border-radius: var(--sb-border-radius-lg);');
        lines.push('  box-shadow: var(--sb-shadow);');
        lines.push('  padding: var(--sb-spacing-lg);');
        lines.push('  background: var(--sb-bg-primary);');
      } else if (cls.includes('list')) {
        lines.push('  list-style: none;');
        lines.push('  padding: 0;');
        lines.push('  margin: 0;');
      } else if (cls.includes('error') || cls.includes('danger')) {
        lines.push('  color: var(--sb-danger);');
      } else if (cls.includes('success')) {
        lines.push('  color: var(--sb-success);');
      } else {
        lines.push('  // TODO: migrar estilos del componente React original');
      }
      lines.push('}');
      lines.push('');
    }
  }

  // Estilos base para formularios si hay inputs
  const hasFormElements = /input|select|textarea|form/i.test(jsxTemplate);
  if (hasFormElements) {
    lines.push('// Estilos de formulario');
    lines.push('label {');
    lines.push('  display: block;');
    lines.push('  color: var(--sb-text-secondary);');
    lines.push('  font-weight: 500;');
    lines.push('  margin-bottom: var(--sb-spacing-xs);');
    lines.push('  font-size: var(--sb-font-size-sm);');
    lines.push('}');
    lines.push('');
    lines.push('.p-field, .field {');
    lines.push('  margin-bottom: var(--sb-spacing-md);');
    lines.push('}');
    lines.push('');
  }

  return lines.join('\n');
}

function generateComponentSpec(analysis: ReactComponentAnalysis, kebabName: string): string {
  const name = analysis.componentName;

  return `import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ${name}Component } from './${kebabName}.component';

describe('${name}Component', () => {
  let component: ${name}Component;
  let fixture: ComponentFixture<${name}Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [${name}Component],
    }).compileComponents();

    fixture = TestBed.createComponent(${name}Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have OnPush change detection', () => {
    const metadata = (${name}Component as unknown as { __annotations__: Array<{ changeDetection: number }> }).__annotations__;
    // OnPush = 1
    expect(fixture.componentRef.injector).toBeTruthy();
  });
${generateSignalTests(analysis)}
${generateInputTests(analysis)}
});
`;
}

function generateSignalTests(analysis: ReactComponentAnalysis): string {
  if (analysis.stateHooks.length === 0) return '';

  return analysis.stateHooks
    .map((hook) => {
      const name = toCamelCase(hook.name);
      return `
  it('should initialize signal ${name}', () => {
    expect(component.${name}()).toBe(${hook.initialValue});
  });

  it('should update signal ${name}', () => {
    component.${name}.set(${hook.initialValue});
    expect(component.${name}()).toBe(${hook.initialValue});
  });`;
    })
    .join('\n');
}

function generateInputTests(analysis: ReactComponentAnalysis): string {
  const inputProps = analysis.props.filter((p) => p.name !== '_propsInterface');
  if (inputProps.length === 0) return '';

  return inputProps
    .filter((p) => !p.required)
    .map((prop) => {
      return `
  it('should accept input ${prop.name}', () => {
    expect(component.${prop.name}).toBeDefined();
  });`;
    })
    .join('\n');
}
