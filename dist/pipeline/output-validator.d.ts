import type { ValidationIssue } from './pipeline-types.js';
/**
 * Validates the generated Angular project for structural completeness.
 *
 * Rules:
 * 1. Every .component.ts has matching .component.html, .component.scss, .component.spec.ts
 * 2. package.json contains @angular/core, @angular/common, @angular/router, primeng
 * 3. app.routes.ts references only components that exist in the files map
 * 4. No .ts file (except .spec.ts) contains `: any` — must use `unknown`
 * 5. All components have `standalone: true`
 * 6. No PrimeNG component has `required` attribute
 * 7. No empty files (< 10 chars)
 */
export declare function validateOutput(files: ReadonlyMap<string, string>): readonly ValidationIssue[];
//# sourceMappingURL=output-validator.d.ts.map