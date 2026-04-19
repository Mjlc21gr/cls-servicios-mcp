import { toKebabCase, toPascalCase } from '../utils/naming.utils.js';
import { mapHttpMethodFromFetchCall } from '../utils/type-mapper.utils.js';
const CLS_API_BASE = '/servicios-core/api/v1';
export function generateServiceFromAnalysis(analysis, moduleName) {
    // Buscar fetch/axios calls en effects y callbacks
    const apiCalls = extractApiCalls(analysis);
    if (apiCalls.length === 0)
        return null;
    const serviceName = `${toPascalCase(moduleName)}Service`;
    const kebabName = toKebabCase(moduleName);
    const models = extractModelsFromCalls(apiCalls, moduleName);
    const serviceCode = buildServiceCode(serviceName, kebabName, apiCalls, models);
    const serviceSpec = buildServiceSpec(serviceName, kebabName, apiCalls);
    const modelCode = buildModelCode(models);
    return { serviceCode, serviceSpec, modelCode };
}
function extractApiCalls(analysis) {
    const calls = [];
    const allBodies = [
        ...analysis.effects.map((e) => e.body),
        ...analysis.callbacks.map((c) => c.body),
    ];
    for (const body of allBodies) {
        // fetch('url', { method: ... })
        const fetchMatches = body.matchAll(/fetch\(\s*[`'"](\/[^'"`]+)[`'"]/g);
        for (const match of fetchMatches) {
            const url = match[1];
            const method = mapHttpMethodFromFetchCall(body);
            calls.push({
                url: normalizeApiUrl(url),
                method,
                bodyShape: method !== 'GET' ? 'unknown' : null,
                responseShape: 'unknown',
                functionName: urlToMethodName(url, method),
            });
        }
        // axios.get/post/put/delete('url')
        const axiosMatches = body.matchAll(/axios\.(get|post|put|delete|patch)\(\s*[`'"](\/[^'"`]+)[`'"]/g);
        for (const match of axiosMatches) {
            const method = match[1].toUpperCase();
            const url = match[2];
            calls.push({
                url: normalizeApiUrl(url),
                method,
                bodyShape: method !== 'GET' ? 'unknown' : null,
                responseShape: 'unknown',
                functionName: urlToMethodName(url, method),
            });
        }
    }
    return calls;
}
function normalizeApiUrl(url) {
    // Reemplazar base URLs comunes por la ruta CLS
    const cleaned = url
        .replace(/^https?:\/\/[^/]+/, '')
        .replace(/^\/api\/v\d+/, '')
        .replace(/^\/api/, '');
    return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
}
function urlToMethodName(url, method) {
    const segments = url.split('/').filter(Boolean);
    const resource = segments[segments.length - 1] || 'resource';
    const cleanResource = resource.replace(/[^a-zA-Z]/g, '');
    const prefixMap = {
        GET: 'get',
        POST: 'create',
        PUT: 'update',
        DELETE: 'delete',
        PATCH: 'patch',
    };
    return `${prefixMap[method] || 'get'}${toPascalCase(cleanResource)}`;
}
function extractModelsFromCalls(calls, moduleName) {
    // Genera interfaces placeholder basadas en los endpoints
    const models = [];
    const resourceNames = new Set(calls.map((c) => {
        const segments = c.url.split('/').filter(Boolean);
        return segments[segments.length - 1] || moduleName;
    }));
    for (const resource of resourceNames) {
        const interfaceName = `${toPascalCase(resource)}`;
        models.push({
            interfaceName,
            fileName: toKebabCase(resource) + '.model.ts',
            properties: [
                { name: 'id', type: 'string', required: true },
                { name: '// TODO: definir propiedades del DTO', type: 'unknown', required: false },
            ],
        });
    }
    return models;
}
function buildServiceCode(serviceName, kebabName, apiCalls, models) {
    const modelImports = models
        .map((m) => `import type { ${m.interfaceName} } from '../models/${toKebabCase(m.interfaceName)}.model';`)
        .join('\n');
    const methods = apiCalls
        .map((call) => {
        const returnType = call.method === 'DELETE' ? 'void' : 'unknown';
        const params = call.method !== 'GET' && call.method !== 'DELETE'
            ? `body: unknown`
            : '';
        const httpCall = buildHttpCall(call);
        return `
  ${call.functionName}(${params}): Observable<${returnType}> {
    return ${httpCall};
  }`;
    })
        .join('\n');
    return `import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
${modelImports}

@Injectable({
  providedIn: 'root',
})
export class ${serviceName} {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '${CLS_API_BASE}';
${methods}
}
`;
}
function buildHttpCall(call) {
    const url = `\`\${this.baseUrl}${call.url}\``;
    switch (call.method) {
        case 'GET':
            return `this.http.get<unknown>(${url})`;
        case 'POST':
            return `this.http.post<unknown>(${url}, body)`;
        case 'PUT':
            return `this.http.put<unknown>(${url}, body)`;
        case 'DELETE':
            return `this.http.delete<void>(${url})`;
        case 'PATCH':
            return `this.http.patch<unknown>(${url}, body)`;
        default:
            return `this.http.get<unknown>(${url})`;
    }
}
function buildServiceSpec(serviceName, kebabName, apiCalls) {
    const methodTests = apiCalls
        .map((call) => `
  it('should call ${call.functionName}', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    service.${call.functionName}(${call.method !== 'GET' && call.method !== 'DELETE' ? '{}' : ''}).subscribe();
    const req = httpMock.expectOne(\`${CLS_API_BASE}${call.url}\`);
    expect(req.request.method).toBe('${call.method}');
    req.flush(${call.method === 'DELETE' ? 'null' : '{}'});
  });`)
        .join('\n');
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
${methodTests}

  afterEach(() => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.verify();
  });
});
`;
}
function buildModelCode(models) {
    return models
        .map((model) => {
        const props = model.properties
            .map((p) => `  ${p.required ? '' : '// '}readonly ${p.name}: ${p.type};`)
            .join('\n');
        return `export interface ${model.interfaceName} {
${props}
}
`;
    })
        .join('\n');
}
//# sourceMappingURL=service.generator.js.map