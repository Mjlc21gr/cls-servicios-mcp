/**
 * Generador de Angular Services desde funciones server-side de Apps Script.
 *
 * Mapeos:
 * - google.script.run.functionName() → HttpClient.post('/api/functionName')
 * - UrlFetchApp.fetch(url) → HttpClient.get/post(url)
 * - PropertiesService → localStorage / backend endpoint
 * - SpreadsheetApp → backend endpoint que expone datos
 */
import type {
  AppScriptAnalysis,
  AppScriptFunction,
  ExternalApiCall,
  PropertyAccess,
} from '../models/appscript-analysis.model.js';
import { toKebabCase, toPascalCase, toCamelCase } from '../utils/naming.utils.js';

const CLS_API_BASE = '/servicios-core/api/v1';

// ---------------------------------------------------------------------------
// Generador principal
// ---------------------------------------------------------------------------

export function generateServiceFromAppScript(
  analysis: AppScriptAnalysis,
  moduleName: string,
): { serviceCode: string; serviceSpec: string; modelCode: string } | null {
  const hasServerFunctions = analysis.serverCallableFunctions.length > 0;
  const hasExternalCalls = analysis.externalApiCalls.length > 0;
  const hasProperties = analysis.propertyAccesses.length > 0;

  if (!hasServerFunctions && !hasExternalCalls && !hasProperties) {
    return null;
  }

  const serviceName = `${toPascalCase(moduleName)}Service`;
  const kebabName = toKebabCase(moduleName);

  const serviceCode = buildServiceCode(
    serviceName, kebabName, moduleName, analysis,
  );
  const serviceSpec = buildServiceSpec(serviceName, kebabName, analysis);
  const modelCode = buildModelCode(analysis, moduleName);

  return { serviceCode, serviceSpec, modelCode };
}

// ---------------------------------------------------------------------------
// Service code generation
// ---------------------------------------------------------------------------

function buildServiceCode(
  serviceName: string,
  kebabName: string,
  moduleName: string,
  analysis: AppScriptAnalysis,
): string {
  const methods: string[] = [];

  // Métodos desde funciones server-callable (google.script.run)
  for (const fn of analysis.serverCallableFunctions) {
    methods.push(buildServerCallableMethod(fn, moduleName));
  }

  // Métodos desde UrlFetchApp calls
  const uniqueExternalCalls = deduplicateExternalCalls(analysis.externalApiCalls);
  for (const call of uniqueExternalCalls) {
    methods.push(buildExternalCallMethod(call));
  }

  // Métodos para PropertiesService
  const uniqueProperties = deduplicateProperties(analysis.propertyAccesses);
  if (uniqueProperties.length > 0) {
    methods.push(buildPropertyMethods(uniqueProperties));
  }

  const modelImport = `import type { ${toPascalCase(moduleName)}Model } from '../models/${kebabName}.model';\n`;

  return `import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
${modelImport}
@Injectable({
  providedIn: 'root',
})
export class ${serviceName} {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '${CLS_API_BASE}';
${methods.join('\n')}
}
`;
}

function buildServerCallableMethod(fn: AppScriptFunction, moduleName: string): string {
  const methodName = toCamelCase(fn.name);
  const params = fn.params.map((p) => `${p.name}: ${p.type}`).join(', ');
  const paramNames = fn.params.map((p) => p.name);
  const hasParams = fn.params.length > 0;

  const bodyArg = hasParams
    ? `, { ${paramNames.join(', ')} }`
    : '';

  return `
  /**
   * Migrado desde google.script.run.${fn.name}()
   * ${fn.jsdoc ? '(JSDoc original preservado en servidor)' : ''}
   */
  ${methodName}(${params}): Observable<unknown> {
    return this.http.post<unknown>(\`\${this.baseUrl}/${toKebabCase(moduleName)}/${toKebabCase(fn.name)}\`${bodyArg});
  }`;
}

function buildExternalCallMethod(call: ExternalApiCall): string {
  const methodName = urlToMethodName(call.url, call.method);
  const isUrlDynamic = call.url === 'dynamic_url';
  const urlParam = isUrlDynamic ? 'url: string' : '';
  const urlValue = isUrlDynamic ? 'url' : `'${call.url}'`;

  if (call.method === 'GET') {
    return `
  /**
   * Migrado desde UrlFetchApp.fetch() en ${call.context}
   */
  ${methodName}(${urlParam}): Observable<unknown> {
    return this.http.get<unknown>(${urlValue});
  }`;
  }

  const bodyParam = call.hasPayload ? `${urlParam ? ', ' : ''}body: unknown` : '';
  const bodyArg = call.hasPayload ? ', body' : '';

  return `
  /**
   * Migrado desde UrlFetchApp.fetch() en ${call.context}
   */
  ${methodName}(${urlParam}${bodyParam}): Observable<unknown> {
    return this.http.${call.method.toLowerCase()}<unknown>(${urlValue}${bodyArg});
  }`;
}

function buildPropertyMethods(properties: PropertyAccess[]): string {
  const lines: string[] = [
    '',
    '  // --- Migrado desde PropertiesService ---',
    '  // Nota: En producción, considerar mover a un backend endpoint',
    '',
  ];

  const keys = new Set(properties.map((p) => p.key));

  for (const key of keys) {
    const camelKey = toCamelCase(key);
    const pascalKey = toPascalCase(key);

    lines.push(`  get${pascalKey}(): string | null {`);
    lines.push(`    return localStorage.getItem('${key}');`);
    lines.push(`  }`);
    lines.push('');
    lines.push(`  set${pascalKey}(value: string): void {`);
    lines.push(`    localStorage.setItem('${key}', value);`);
    lines.push(`  }`);
    lines.push('');
    lines.push(`  remove${pascalKey}(): void {`);
    lines.push(`    localStorage.removeItem('${key}');`);
    lines.push(`  }`);
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Service spec generation
// ---------------------------------------------------------------------------

function buildServiceSpec(
  serviceName: string,
  kebabName: string,
  analysis: AppScriptAnalysis,
): string {
  const methodTests: string[] = [];

  for (const fn of analysis.serverCallableFunctions) {
    const methodName = toCamelCase(fn.name);
    const endpoint = `${CLS_API_BASE}/${kebabName}/${toKebabCase(fn.name)}`;
    methodTests.push(`
  it('should call ${methodName}', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    service.${methodName}(${fn.params.length > 0 ? fn.params.map(() => '{}').join(', ') : ''}).subscribe();
    const req = httpMock.expectOne('${endpoint}');
    expect(req.request.method).toBe('POST');
    req.flush({});
  });`);
  }

  return `import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ${serviceName} } from './${kebabName}.service';

describe('${serviceName}', () => {
  let service: ${serviceName};

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(${serviceName});
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
${methodTests.join('\n')}

  afterEach(() => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.verify();
  });
});
`;
}

// ---------------------------------------------------------------------------
// Model code generation
// ---------------------------------------------------------------------------

function buildModelCode(analysis: AppScriptAnalysis, moduleName: string): string {
  const pascalName = toPascalCase(moduleName);

  const lines: string[] = [
    `/**`,
    ` * Modelos para ${moduleName} - Migrado desde Apps Script`,
    ` * TODO: Definir interfaces basadas en la estructura de datos real`,
    ` */`,
    '',
    `export interface ${pascalName}Model {`,
    `  readonly id: string;`,
    `  // TODO: definir propiedades del modelo`,
    `}`,
    '',
  ];

  // Generar interfaces para funciones con parámetros
  for (const fn of analysis.serverCallableFunctions) {
    if (fn.params.length > 0) {
      const interfaceName = `${toPascalCase(fn.name)}Request`;
      lines.push(`export interface ${interfaceName} {`);
      for (const param of fn.params) {
        lines.push(`  readonly ${param.name}: ${param.type};`);
      }
      lines.push(`}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function urlToMethodName(url: string, method: string): string {
  const segments = url.split('/').filter(Boolean);
  const resource = segments[segments.length - 1] || 'resource';
  const cleanResource = resource.replace(/[^a-zA-Z]/g, '');

  const prefixMap: Record<string, string> = {
    GET: 'fetch',
    POST: 'send',
    PUT: 'update',
    DELETE: 'remove',
    PATCH: 'patch',
  };

  return `${prefixMap[method] || 'fetch'}${toPascalCase(cleanResource)}`;
}

function deduplicateExternalCalls(calls: readonly ExternalApiCall[]): ExternalApiCall[] {
  const seen = new Set<string>();
  return calls.filter((call) => {
    const key = `${call.method}:${call.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deduplicateProperties(accesses: readonly PropertyAccess[]): PropertyAccess[] {
  const seen = new Set<string>();
  return accesses.filter((access) => {
    const key = `${access.store}:${access.key}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
