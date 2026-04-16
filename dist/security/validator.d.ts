import { ValidationResult } from '../types.js';
/**
 * Validates React source code before processing through the conversion pipeline.
 *
 * Validation order:
 * 1. Size check (> 500 KB → reject)
 * 2. Injection pattern check (eval, Function constructor, external dynamic imports → reject)
 * 3. Warning pattern detection (dangerouslySetInnerHTML, document.write → warn)
 * 4. Return sanitizedCode if valid
 */
export declare function validateInput(sourceCode: string): ValidationResult;
//# sourceMappingURL=validator.d.ts.map