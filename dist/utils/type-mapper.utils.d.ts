/**
 * Mapeo de tipos entre React y Angular/TypeScript.
 * Convierte tipos de props, estado y retornos de API.
 */
export declare function mapReactTypeToAngular(reactType: string): string;
export declare function inferTypeFromValue(value: string): string;
export declare function mapHttpMethodFromFetchCall(fetchBody: string): 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
//# sourceMappingURL=type-mapper.utils.d.ts.map