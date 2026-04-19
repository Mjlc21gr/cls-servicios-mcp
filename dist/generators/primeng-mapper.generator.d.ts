/**
 * Mapper de UI: React (MUI/Tailwind/genérico) → PrimeNG + Seguros Bolívar Design System.
 *
 * Convierte componentes de UI del prototipo React a componentes PrimeNG
 * con el tema corporativo de Seguros Bolívar (SB).
 *
 * Genera:
 *   - Imports de módulos PrimeNG necesarios
 *   - Template HTML con componentes PrimeNG
 *   - SCSS con variables del tema SB
 *   - Validación de accesibilidad básica (ARIA)
 */
export interface PrimeNgMapping {
    readonly primeComponent: string;
    readonly primeModule: string;
    readonly primeImport: string;
    readonly htmlTag: string;
    readonly defaultProps: Record<string, string>;
}
export interface PrimeNgConversionResult {
    readonly html: string;
    readonly requiredModules: readonly PrimeNgModuleImport[];
    readonly warnings: readonly string[];
    readonly componentCount: number;
}
export interface PrimeNgModuleImport {
    readonly moduleName: string;
    readonly importPath: string;
}
/**
 * Convierte template HTML con componentes MUI/genéricos a PrimeNG.
 */
export declare function convertToPrimeNg(html: string, detectedUiLibraries: readonly string[]): PrimeNgConversionResult;
/**
 * Genera los imports de PrimeNG para el .component.ts
 */
export declare function generatePrimeNgImports(modules: readonly PrimeNgModuleImport[]): string;
/**
 * Genera el SCSS con el tema Seguros Bolívar para PrimeNG.
 */
export declare function generateSbPrimeNgTheme(): string;
//# sourceMappingURL=primeng-mapper.generator.d.ts.map