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
 *
 * Handles:
 * - Plain CSS/SCSS/LESS imports → component SCSS
 * - CSS Modules → scoped SCSS
 * - styled-components → extracted SCSS
 * - emotion css`` → extracted SCSS
 * - Tailwind classes → preserved in templates (no conversion needed)
 * - CSS variables → preserved in global :root
 * - Inline style objects → converted to Tailwind or SCSS
 */
export declare function preserveStyles(scannedProject: ScannedProject): PreservedStyles;
//# sourceMappingURL=style-preservator.d.ts.map