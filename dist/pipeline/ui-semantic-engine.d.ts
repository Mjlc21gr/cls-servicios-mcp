/**
 * Mapping of React UI library component trees to PrimeNG equivalents.
 * Each entry maps a parent component + its children structure to a single
 * PrimeNG component with the correct API.
 */
export interface SemanticMapping {
    readonly pattern: RegExp;
    readonly replacement: (match: string) => string;
    readonly description: string;
}
export declare function collapseShadcnSelect(html: string): string;
export declare function collapseShadcnCard(html: string): string;
export declare function collapseMuiComponents(html: string): string;
export declare function collapseAntdComponents(html: string): string;
export declare function convertIconsToPI(html: string): string;
export declare function convertMotionToHtml(html: string): string;
export declare function convertToasterToToast(html: string): string;
export declare function convertBadgeToTag(html: string): string;
export declare function applySemanticUI(html: string): string;
//# sourceMappingURL=ui-semantic-engine.d.ts.map