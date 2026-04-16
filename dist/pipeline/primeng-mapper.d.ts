import { ComponentIR } from '../types.js';
/**
 * Replaces native HTML elements in the Angular template with their PrimeNG
 * equivalents and populates the `primeNgImports` array in the IR.
 *
 * Elements without a PrimeNG equivalent are preserved without modification.
 * Does NOT mutate the input — returns a new ComponentIR.
 */
export declare function mapToPrimeNG(ir: ComponentIR): ComponentIR;
//# sourceMappingURL=primeng-mapper.d.ts.map