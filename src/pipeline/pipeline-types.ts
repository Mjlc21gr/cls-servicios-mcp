// =============================================================================
// Pipeline-wide interfaces for the Full Project Migration Pipeline
// =============================================================================

import type { ComponentIR, ServiceFile } from '../types.js';

// -----------------------------------------------------------------------------
// Pipeline Orchestrator Types
// -----------------------------------------------------------------------------

export interface MigrateFullProjectParams {
  readonly sourceDir: string;
  readonly outputDir: string;
  readonly moduleName: string;
  readonly options?: MigrationOptions;
}

export interface MigrationOptions {
  readonly angularVersion?: string;       // default "20"
  readonly primeNgVersion?: string;       // default "19"
  readonly strictMode?: boolean;          // default true
  readonly baseApiUrl?: string;           // default "/servicios-core/api/v1/"
  readonly convertTailwind?: boolean;     // default false
}

export interface FullMigrationResult {
  readonly status: 'success' | 'error';
  readonly outputDir: string;
  readonly filesGenerated: readonly string[];
  readonly migrationSummary: MigrationSummary;
  readonly validationReport: readonly ValidationIssue[];
  readonly duration: number;
  readonly errors?: readonly PipelineError[];
  /** Compilation result after generating the Angular project */
  readonly compilation?: CompilationResult;
}

export interface CompilationResult {
  readonly success: boolean;
  readonly errorCount: number;
  readonly errors: readonly CompilationError[];
  /** Whether errors were saved to the remote API database */
  readonly savedToDb: boolean;
  /** Intento ID in the database (for tracking) */
  readonly intentoId?: number;
}

export interface CompilationError {
  readonly code: string;
  readonly message: string;
  readonly file?: string;
  readonly line?: number;
  readonly category?: string;
  readonly mcpLayer?: string;
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

// -----------------------------------------------------------------------------
// Project Scanner Types
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Component Transformer Types
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Route Generator Types
// -----------------------------------------------------------------------------

export interface GeneratedRoute {
  readonly path: string;
  readonly componentName: string;
  readonly componentPath: string;
  readonly isLazy: boolean;
}

// -----------------------------------------------------------------------------
// Project Scaffolder Types
// -----------------------------------------------------------------------------

export interface ScaffoldFiles {
  readonly files: ReadonlyMap<string, string>;
}

// -----------------------------------------------------------------------------
// Style Aggregator Types
// -----------------------------------------------------------------------------

export interface StyleExtractionResult {
  readonly componentStyles: ReadonlyMap<string, string>;
  readonly globalStyles: string;
  readonly themeFile: string;
}

// -----------------------------------------------------------------------------
// Output Validator Types
// -----------------------------------------------------------------------------

export interface ValidationIssue {
  readonly severity: 'error' | 'warning';
  readonly file: string;
  readonly message: string;
  readonly rule: string;
}

// -----------------------------------------------------------------------------
// Class Component Converter Types
// -----------------------------------------------------------------------------

export interface ClassComponentConversion {
  readonly originalSource: string;
  readonly convertedSource: string;
  readonly wasClassComponent: boolean;
  readonly conversionNotes: readonly string[];
}

// -----------------------------------------------------------------------------
// CSS-in-JS Extraction Types
// -----------------------------------------------------------------------------

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
