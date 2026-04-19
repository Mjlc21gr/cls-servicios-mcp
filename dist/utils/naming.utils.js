/**
 * Utilidades de nomenclatura CLS.
 * Convierte nombres entre convenciones (PascalCase, kebab-case, camelCase).
 */
export function toKebabCase(str) {
    return str
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .toLowerCase();
}
export function toPascalCase(str) {
    return str
        .split(/[-_\s]+/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
}
export function toCamelCase(str) {
    const pascal = toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
export function toAngularSelector(componentName, prefix = 'cls') {
    return `${prefix}-${toKebabCase(componentName)}`;
}
export function toAngularFileName(componentName, suffix) {
    return `${toKebabCase(componentName)}.${suffix}`;
}
export function toFeaturePath(moduleName) {
    return `src/app/features/${toKebabCase(moduleName)}`;
}
export function buildModulePaths(moduleName) {
    const base = toFeaturePath(moduleName);
    return {
        components: `${base}/components`,
        services: `${base}/services`,
        models: `${base}/models`,
    };
}
//# sourceMappingURL=naming.utils.js.map