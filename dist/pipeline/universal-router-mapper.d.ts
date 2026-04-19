import type { ScannedProject, TransformedComponent } from './pipeline-types.js';
/**
 * Detect routing pattern and generate Angular routes.
 * Supports: React Router, Next.js, Remix, tab-based navigation, single-page.
 */
export declare function detectAndGenerateRoutes(scannedProject: ScannedProject, transformedComponents: ReadonlyMap<string, TransformedComponent>, moduleName: string): string;
//# sourceMappingURL=universal-router-mapper.d.ts.map