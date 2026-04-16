import { ComponentIR } from '../types.js';
/**
 * Generates an Angular template from the JSX tree in the ComponentIR.
 *
 * Takes a ComponentIR (with jsxTree populated by AST_Parser and Angular fields
 * by State_Mapper) and returns a new ComponentIR with `angularTemplate`,
 * `isInlineTemplate`, and `templateBindings` populated.
 *
 * Does NOT mutate the input.
 */
export declare function generateAngularTemplate(ir: ComponentIR): ComponentIR;
//# sourceMappingURL=template-generator.d.ts.map