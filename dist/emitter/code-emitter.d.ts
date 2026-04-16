import { ComponentIR, AngularArtifact } from '../types.js';
/**
 * Generates the final Angular artifact files from a fully-transformed ComponentIR.
 *
 * Takes a ComponentIR that has been processed through the full pipeline
 * (AST_Parser → State_Mapper → Template_Generator → PrimeNG_Mapper) and
 * produces string content for each output file.
 */
export declare function emitAngularArtifact(ir: ComponentIR): AngularArtifact;
//# sourceMappingURL=code-emitter.d.ts.map