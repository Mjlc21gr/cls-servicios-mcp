/**
 * Generador de Angular Standalone Components desde análisis de Apps Script.
 * Convierte HTML templates de HtmlService a componentes Angular con PrimeNG.
 * Convierte funciones server-side a servicios Angular.
 *
 * Mapeos principales:
 * - HTML template → .component.html (Angular template syntax)
 * - Scriptlets (<? ?>) → interpolación / @if / @for
 * - google.script.run → service.method() con HttpClient
 * - PropertiesService → localStorage / backend service
 * - Formularios HTML → Reactive Forms con PrimeNG
 */
import type { AppScriptAnalysis, HtmlTemplate, AppScriptFunction, HtmlFormElement } from '../models/appscript-analysis.model.js';
import type { AngularGeneratedFiles } from '../models/angular-output.model.js';
import {
  toKebabCase,
  toAngularSelector,
  toPascalCase,
  toCamelCase,
} from '../utils/naming.utils.js';

// ---------------------------------------------------------------------------
// Generador principal
// ---------------------------------------------------------------------------

export function generateAngularFromAppScript(
  analysis: AppScriptAnalysis,
  moduleName: string,
): Record<string, AngularGeneratedFiles> {
  const results: Record<string, AngularGeneratedFiles> = {};

  // Generar un componente por cada HTML template
  for (const template of analysis.htmlTemplates) {
    const componentName = deriveComponentName(template.fileName);
    const kebabName = toKebabCase(componentName);
    const selector = toAngularSelector(componentName);

    // Encontrar funciones server-side referenciadas por este template
    const referencedFunctions = analysis.serverCallableFunctions.filter((fn) =>
      template.scriptRunCalls.some((call) => call.serverFunction === fn.name),
    );

    const componentTs = generateComponentTs(
      componentName, selector, kebabName, template,
      referencedFunctions, moduleName,
    );
    const componentHtml = generateComponentHtml(template);
    const componentScss = generateComponentScss(template);
    const componentSpec = generateComponentSpec(componentName, kebabName);

    results[componentName] = {
      componentTs,
      componentHtml,
      componentScss,
      componentSpec,
    };
  }

  // Si no hay HTML templates pero hay funciones, generar un componente principal
  if (analysis.htmlTemplates.length === 0 && analysis.totalFunctions > 0) {
    const componentName = toPascalCase(moduleName);
    const kebabName = toKebabCase(componentName);
    const selector = toAngularSelector(componentName);

    const componentTs = generateMainComponentTs(
      componentName, selector, kebabName, analysis, moduleName,
    );

    results[componentName] = {
      componentTs,
      componentHtml: `<div class="cls-${kebabName}">\n  <h2>${componentName}</h2>\n  <!-- TODO: diseñar UI para las funciones migradas -->\n</div>`,
      componentScss: generateBaseScss(kebabName),
      componentSpec: generateComponentSpec(componentName, kebabName),
    };
  }

  return results;
}


// ---------------------------------------------------------------------------
// Generación de .component.ts
// ---------------------------------------------------------------------------

function generateComponentTs(
  componentName: string,
  selector: string,
  kebabName: string,
  template: HtmlTemplate,
  referencedFunctions: readonly AppScriptFunction[],
  moduleName: string,
): string {
  const serviceName = `${toPascalCase(moduleName)}Service`;
  const serviceFile = toKebabCase(moduleName);
  const hasService = referencedFunctions.length > 0;
  const hasForms = template.formElements.length > 0;

  const angularImports = buildAngularImports(template, hasService);
  const componentImports = buildComponentImports(hasForms);

  const signals = buildSignalsFromTemplate(template);
  const methods = buildMethodsFromScriptRun(template, referencedFunctions);
  const formSetup = hasForms ? buildFormSetup(template) : '';

  const serviceImport = hasService
    ? `import { ${serviceName} } from '../services/${serviceFile}.service';\n`
    : '';
  const serviceInjection = hasService
    ? `  private readonly ${toCamelCase(moduleName)}Service = inject(${serviceName});\n`
    : '';

  return `${angularImports}
${serviceImport}
@Component({
  selector: '${selector}',
  standalone: true,
  imports: [${componentImports}],
  templateUrl: './${kebabName}.component.html',
  styleUrls: ['./${kebabName}.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ${componentName}Component {
${serviceInjection}${signals}${formSetup}${methods}
}
`;
}

function generateMainComponentTs(
  componentName: string,
  selector: string,
  kebabName: string,
  analysis: AppScriptAnalysis,
  moduleName: string,
): string {
  const serviceName = `${toPascalCase(moduleName)}Service`;
  const serviceFile = toKebabCase(moduleName);
  const hasService = analysis.serverCallableFunctions.length > 0 ||
    analysis.externalApiCalls.length > 0;

  const serviceImport = hasService
    ? `import { ${serviceName} } from '../services/${serviceFile}.service';\n`
    : '';
  const serviceInjection = hasService
    ? `  private readonly ${toCamelCase(moduleName)}Service = inject(${serviceName});\n`
    : '';

  return `import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
${serviceImport}
@Component({
  selector: '${selector}',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './${kebabName}.component.html',
  styleUrls: ['./${kebabName}.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ${componentName}Component implements OnInit {
${serviceInjection}
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    // TODO: inicializar datos desde el servicio
  }
}
`;
}

// ---------------------------------------------------------------------------
// Helpers de imports
// ---------------------------------------------------------------------------

function buildAngularImports(template: HtmlTemplate, hasService: boolean): string {
  const imports = new Set(['Component', 'ChangeDetectionStrategy', 'signal']);

  if (hasService) imports.add('inject');
  if (template.formElements.length > 0) imports.add('OnInit');
  if (template.scriptRunCalls.length > 0) imports.add('inject');

  const lines: string[] = [];
  lines.push(`import { ${[...imports].join(', ')} } from '@angular/core';`);
  lines.push(`import { CommonModule } from '@angular/common';`);

  if (template.formElements.length > 0) {
    lines.push(`import { FormsModule, ReactiveFormsModule } from '@angular/forms';`);
  }

  return lines.join('\n');
}

function buildComponentImports(hasForms: boolean): string {
  const imports = ['CommonModule'];
  if (hasForms) imports.push('FormsModule', 'ReactiveFormsModule');
  return imports.join(', ');
}

// ---------------------------------------------------------------------------
// Signals desde template
// ---------------------------------------------------------------------------

function buildSignalsFromTemplate(template: HtmlTemplate): string {
  const lines: string[] = [];

  // Signals para variables de scriptlets
  for (const varName of template.scriptletVariables) {
    lines.push(`  readonly ${toCamelCase(varName)} = signal<unknown>(null);`);
  }

  // Signal de loading y error para llamadas async
  if (template.scriptRunCalls.length > 0) {
    lines.push(`  readonly loading = signal(false);`);
    lines.push(`  readonly error = signal<string | null>(null);`);
  }

  return lines.length > 0 ? '\n' + lines.join('\n') + '\n' : '';
}

// ---------------------------------------------------------------------------
// Form setup
// ---------------------------------------------------------------------------

function buildFormSetup(template: HtmlTemplate): string {
  const lines: string[] = ['\n  // Form signals'];

  for (const el of template.formElements) {
    const name = el.name || el.id || `field_${template.formElements.indexOf(el)}`;
    const type = inferFormFieldType(el.type);
    const initial = type === 'boolean' ? 'false' : type === 'number' ? '0' : "''";
    lines.push(`  readonly ${toCamelCase(name)} = signal<${type}>(${initial});`);
  }

  return lines.join('\n') + '\n';
}

function inferFormFieldType(htmlType: string | null): string {
  switch (htmlType) {
    case 'number':
    case 'range':
      return 'number';
    case 'checkbox':
      return 'boolean';
    case 'date':
    case 'datetime-local':
      return 'string'; // Se maneja como string ISO
    default:
      return 'string';
  }
}

// ---------------------------------------------------------------------------
// Métodos desde google.script.run
// ---------------------------------------------------------------------------

function buildMethodsFromScriptRun(
  template: HtmlTemplate,
  referencedFunctions: readonly AppScriptFunction[],
): string {
  if (template.scriptRunCalls.length === 0) return '';

  const methods: string[] = [];

  for (const call of template.scriptRunCalls) {
    const fn = referencedFunctions.find((f) => f.name === call.serverFunction);
    const methodName = toCamelCase(call.serverFunction);
    const params = fn?.params.map((p) => `${p.name}: ${p.type}`).join(', ') || '';

    methods.push(`
  ${methodName}(${params}): void {
    this.loading.set(true);
    this.error.set(null);
    this.${toCamelCase(template.fileName.replace('.html', ''))}Service.${methodName}(${fn?.params.map((p) => p.name).join(', ') || ''}).subscribe({
      next: (result) => {
        this.loading.set(false);
        // TODO: procesar resultado
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.message ?? 'Error desconocido');
      },
    });
  }`);
  }

  return methods.join('\n');
}

// ---------------------------------------------------------------------------
// Generación de .component.html
// ---------------------------------------------------------------------------

function generateComponentHtml(template: HtmlTemplate): string {
  // Si no hay contenido HTML significativo, generar placeholder
  return `<!-- Migrado desde Apps Script: ${template.fileName} -->
<!-- TODO: Revisar y ajustar template migrado -->

${buildLoadingWrapper(template)}`;
}

function buildLoadingWrapper(template: HtmlTemplate): string {
  const hasAsync = template.scriptRunCalls.length > 0;

  let html = '';

  if (hasAsync) {
    html += `@if (loading()) {\n  <div class="cls-loading">\n    <p-progressSpinner />\n  </div>\n}\n\n`;
    html += `@if (error()) {\n  <p-message severity="error" [text]="error()!" />\n}\n\n`;
  }

  // Generar formulario si hay form elements
  if (template.formElements.length > 0) {
    html += `<form class="cls-form" (ngSubmit)="onSubmit()">\n`;
    for (const el of template.formElements) {
      html += generatePrimeNgFormField(el);
    }
    html += `  <div class="cls-form-actions">\n`;
    html += `    <p-button label="Enviar" type="submit" [loading]="loading()" />\n`;
    html += `  </div>\n`;
    html += `</form>\n`;
  }

  return html;
}

function generatePrimeNgFormField(el: HtmlFormElement): string {
  const name = el.name || el.id || 'field';
  const camelName = toCamelCase(name);
  const label = toPascalCase(name).replace(/([A-Z])/g, ' $1').trim();

  switch (el.tag) {
    case 'select':
      return `  <div class="p-field">\n    <label for="${name}">${label}</label>\n    <p-dropdown [options]="[]" [ngModel]="${camelName}()" (ngModelChange)="${camelName}.set($event)" placeholder="Seleccione..." />\n  </div>\n`;
    case 'textarea':
      return `  <div class="p-field">\n    <label for="${name}">${label}</label>\n    <textarea pInputTextarea [ngModel]="${camelName}()" (ngModelChange)="${camelName}.set($event)" id="${name}"></textarea>\n  </div>\n`;
    case 'button':
      return ''; // Se maneja aparte
    default:
      if (el.type === 'checkbox') {
        return `  <div class="p-field-checkbox">\n    <p-checkbox [ngModel]="${camelName}()" (ngModelChange)="${camelName}.set($event)" [binary]="true" inputId="${name}" />\n    <label for="${name}">${label}</label>\n  </div>\n`;
      }
      if (el.type === 'date' || el.type === 'datetime-local') {
        return `  <div class="p-field">\n    <label for="${name}">${label}</label>\n    <p-calendar [ngModel]="${camelName}()" (ngModelChange)="${camelName}.set($event)" inputId="${name}" />\n  </div>\n`;
      }
      if (el.type === 'number') {
        return `  <div class="p-field">\n    <label for="${name}">${label}</label>\n    <p-inputNumber [ngModel]="${camelName}()" (ngModelChange)="${camelName}.set($event)" inputId="${name}" />\n  </div>\n`;
      }
      return `  <div class="p-field">\n    <label for="${name}">${label}</label>\n    <input pInputText [ngModel]="${camelName}()" (ngModelChange)="${camelName}.set($event)" id="${name}" />\n  </div>\n`;
  }
}

// ---------------------------------------------------------------------------
// Generación de .component.scss
// ---------------------------------------------------------------------------

function generateComponentScss(template: HtmlTemplate): string {
  const lines: string[] = [
    '// Estilos del componente - CLS Design System',
    '// Migrado desde Apps Script HTML template',
    '',
    ':host {',
    '  display: block;',
    "  font-family: var(--sb-font-family, 'Montserrat', 'Segoe UI', system-ui, sans-serif);",
    '}',
    '',
    '.cls-loading {',
    '  display: flex;',
    '  justify-content: center;',
    '  padding: var(--sb-spacing-xl);',
    '}',
    '',
    '.cls-form {',
    '  max-width: 600px;',
    '  margin: 0 auto;',
    '  padding: var(--sb-spacing-lg);',
    '}',
    '',
    '.cls-form-actions {',
    '  display: flex;',
    '  justify-content: flex-end;',
    '  gap: var(--sb-spacing-md);',
    '  margin-top: var(--sb-spacing-lg);',
    '}',
    '',
  ];

  // Generar stubs para clases CSS del template original
  for (const cls of template.cssClasses) {
    lines.push(`.${cls} {`);
    lines.push('  // TODO: migrar estilos del template Apps Script original');
    lines.push('}');
    lines.push('');
  }

  return lines.join('\n');
}

function generateBaseScss(kebabName: string): string {
  return `:host {
  display: block;
  font-family: var(--sb-font-family, 'Montserrat', 'Segoe UI', system-ui, sans-serif);
}

.cls-${kebabName} {
  padding: var(--sb-spacing-lg);
}
`;
}

// ---------------------------------------------------------------------------
// Generación de .component.spec.ts
// ---------------------------------------------------------------------------

function generateComponentSpec(componentName: string, kebabName: string): string {
  return `import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ${componentName}Component } from './${kebabName}.component';

describe('${componentName}Component', () => {
  let component: ${componentName}Component;
  let fixture: ComponentFixture<${componentName}Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [${componentName}Component],
    }).compileComponents();

    fixture = TestBed.createComponent(${componentName}Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveComponentName(fileName: string): string {
  const base = fileName
    .replace(/\.html$/, '')
    .replace(/\.gs$/, '')
    .replace(/[^a-zA-Z0-9-_]/g, '-');
  return toPascalCase(base);
}
