import type { ScannedProject, TransformedComponent, MigrationOptions, StyleExtractionResult } from './pipeline-types.js';
/**
 * Aggregates styles from the React project into Angular .component.scss files.
 *
 * 1. For each component, find CSS/SCSS/LESS files imported by the React source
 * 2. Read those style files from scannedProject.styles
 * 3. Scope rules under `:host` and merge into the component's .scss
 * 4. Handle CSS Modules: convert `styles.className` refs to plain `.className`
 * 5. Preserve layout (flexbox, grid), media queries, animations verbatim
 * 6. Generate global `src/styles.scss` importing PrimeNG theme + SB theme
 * 7. Generate SB PrimeNG theme file
 */
export declare function aggregateStyles(scannedProject: ScannedProject, transformedComponents: ReadonlyMap<string, TransformedComponent>, options?: MigrationOptions): StyleExtractionResult;
//# sourceMappingURL=style-aggregator.d.ts.map