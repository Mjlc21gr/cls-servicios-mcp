/**
 * Modelos de mapeo UI/UX para PrimeNG + Seguros Bolívar Design System.
 * Define la correspondencia entre componentes React UI y PrimeNG,
 * junto con las variables del tema corporativo.
 */

export interface PrimeNgComponentMapping {
  readonly reactComponent: string;
  readonly primeNgComponent: string;
  readonly primeNgModule: string;
  readonly importPath: string;
  readonly selector: string;
  readonly templateExample: string;
  readonly requiredInputs: readonly string[];
}

export interface BolivarThemeToken {
  readonly token: string;
  readonly value: string;
  readonly category: 'color' | 'spacing' | 'typography' | 'border' | 'shadow' | 'motion';
  readonly description: string;
}

export interface UiMigrationResult {
  readonly html: string;
  readonly scss: string;
  readonly primeNgImports: readonly string[];
  readonly primeNgModules: readonly string[];
  readonly componentImportStatements: readonly string[];
  readonly warnings: readonly string[];
  readonly bolivarTokensApplied: readonly string[];
}

export interface IconMapping {
  readonly reactIcon: string;
  readonly primeIcon: string;
}

export interface LayoutPattern {
  readonly name: string;
  readonly description: string;
  readonly primeNgStructure: string;
  readonly bolivarVariant: string;
}
