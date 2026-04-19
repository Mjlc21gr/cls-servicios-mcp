import type { ComponentIR, ServiceFile } from '../types.js';
export interface MigrateFullProjectParams {
    readonly sourceDir: string;
    readonly outputDir: string;
    readonly moduleName: string;
    readonly options?: MigrationOptions;
}
export interface MigrationOptions {
    readonly angularVersion?: string;
    readonly primeNgVersion?: string;
    readonly strictMode?: boolean;
    readonly baseApiUrl?: string;
    readonly convertTailwind?: boolean;
}
export interface FullMigrationResult {
    readonly status: 'success' | 'error';
    readonly outputDir: string;
    readonly filesGenerated: readonly string[];
    readonly migrationSummary: MigrationSummary;
    readonly validationReport: readonly ValidationIssue[];
    readonly duration: number;
    readonly errors?: readonly PipelineError[];
}
export interface MigrationSummary {
    readonly componentsTotal: number;
    readonly componentsMigrated: number;
    readonly componentsFailed: number;
    readonly servicesGenerated: number;
    readonly routesGenerated: number;
    readonly stylesGenerated: number;
    readonly staticAssetsCopied: number;
}
export interface PipelineError {
    readonly stage: string;
    readonly file: string;
    readonly message: string;
    readonly details?: string;
}
export interface ScannedProject {
    readonly rootDir: string;
    readonly components: readonly ScannedFile[];
    readonly services: readonly ScannedFile[];
    readonly styles: readonly ScannedFile[];
    readonly configs: readonly ScannedFile[];
    readonly assets: readonly ScannedFile[];
    readonly dependencyGraph: ReadonlyMap<string, readonly string[]>;
    readonly projectMeta: ProjectMeta;
}
export interface ScannedFile {
    readonly path: string;
    readonly absolutePath: string;
    readonly content: string;
    readonly category: FileCategory;
}
export type FileCategory = 'component' | 'service' | 'style' | 'config' | 'asset';
export interface ProjectMeta {
    readonly packageManager: 'npm' | 'yarn' | 'pnpm';
    readonly buildTool: 'cra' | 'vite' | 'nextjs' | 'remix' | 'webpack-custom' | 'unknown';
    readonly hasTypeScript: boolean;
    readonly hasRouter: boolean;
    readonly uiLibraries: readonly string[];
    readonly stateManagement: readonly string[];
    readonly srcDir: string;
}
export interface TransformedComponent {
    readonly originalPath: string;
    readonly componentName: string;
    readonly kebabName: string;
    readonly componentTs: string;
    readonly componentHtml: string;
    readonly componentScss: string;
    readonly componentSpec: string;
    readonly services: readonly ServiceFile[];
    readonly ir: ComponentIR;
}
export interface GeneratedRoute {
    readonly path: string;
    readonly componentName: string;
    readonly componentPath: string;
    readonly isLazy: boolean;
}
export interface ScaffoldFiles {
    readonly files: ReadonlyMap<string, string>;
}
export interface StyleExtractionResult {
    readonly componentStyles: ReadonlyMap<string, string>;
    readonly globalStyles: string;
    readonly themeFile: string;
}
export interface ValidationIssue {
    readonly severity: 'error' | 'warning';
    readonly file: string;
    readonly message: string;
    readonly rule: string;
}
export interface ClassComponentConversion {
    readonly originalSource: string;
    readonly convertedSource: string;
    readonly wasClassComponent: boolean;
    readonly conversionNotes: readonly string[];
}
export interface CSSInJSExtraction {
    readonly componentName: string;
    readonly extractedRules: readonly ExtractedCSSRule[];
    readonly warnings: readonly string[];
}
export interface ExtractedCSSRule {
    readonly selector: string;
    readonly properties: string;
    readonly mediaQuery?: string;
}
//# sourceMappingURL=pipeline-types.d.ts.map