/**
 * Utilidades de nomenclatura CLS.
 * Convierte nombres entre convenciones (PascalCase, kebab-case, camelCase).
 */
export declare function toKebabCase(str: string): string;
export declare function toPascalCase(str: string): string;
export declare function toCamelCase(str: string): string;
export declare function toAngularSelector(componentName: string, prefix?: string): string;
export declare function toAngularFileName(componentName: string, suffix: string): string;
export declare function toFeaturePath(moduleName: string): string;
export declare function buildModulePaths(moduleName: string): {
    readonly components: string;
    readonly services: string;
    readonly models: string;
};
//# sourceMappingURL=naming.utils.d.ts.map