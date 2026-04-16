import { ComponentIR } from '../types.js';
/**
 * Maps React state patterns to Angular 19+ equivalents.
 *
 * Takes a ComponentIR (already populated by AST_Parser) and returns a new
 * ComponentIR with the Angular-side fields populated. Does NOT mutate the input.
 */
export declare function mapStateToAngular(ir: ComponentIR): ComponentIR;
//# sourceMappingURL=state-mapper.d.ts.map