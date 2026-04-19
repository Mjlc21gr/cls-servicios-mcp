import type { ScannedProject } from './pipeline-types.js';
export interface PreservedStyles {
    readonly globalScss: string;
    readonly componentStyles: ReadonlyMap<string, string>;
    readonly hasTailwind: boolean;
    readonly tailwindConfig: string | null;
    readonly postcssConfig: string | null;
}
/**
 * Analyze the React project's styling approach and generate
 * equivalent Angular styles that preserve the visual identity.
 */
export declare function preserveStyles(scannedProject: ScannedProject): PreservedStyles;
//# sourceMappingURL=style-preservator.d.ts.map