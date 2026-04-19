import type { TransformedComponent } from './pipeline-types.js';
/**
 * Sanitizes PrimeNG usage in generated Angular components:
 *
 * 1. Remove `required` attribute from PrimeNG components that don't support it
 * 2. Replace old PrimeNG import paths with PrimeNG 19 equivalents
 * 3. Replace old PrimeNG tag names (p-dropdown → p-select) in templates
 * 4. Ensure standalone component API imports
 */
export declare function sanitizePrimeNG(components: ReadonlyMap<string, TransformedComponent>): Map<string, TransformedComponent>;
//# sourceMappingURL=primeng-sanitizer.d.ts.map