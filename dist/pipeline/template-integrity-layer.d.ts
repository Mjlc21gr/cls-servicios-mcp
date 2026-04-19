import type { TransformedComponent } from './pipeline-types.js';
/**
 * Validates and fixes template HTML integrity.
 *
 * Rules:
 * 1. All tags must be properly closed
 * 2. Angular binding syntax must be valid: [prop]="expr", (event)="handler()"
 * 3. No React-specific attributes (className, htmlFor, etc.)
 * 4. No React component tags (PascalCase that aren't PrimeNG)
 * 5. PrimeNG components must use correct API
 */
export declare function validateTemplateIntegrity(components: ReadonlyMap<string, TransformedComponent>): Map<string, TransformedComponent>;
//# sourceMappingURL=template-integrity-layer.d.ts.map