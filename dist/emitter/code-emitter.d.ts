import { ComponentIR, AngularArtifact } from '../types.js';
/**
 * Generates the final Angular artifact files from a fully-transformed ComponentIR.
 *
 * Takes a ComponentIR that has been processed through the full pipeline
 * (AST_Parser → State_Mapper → Template_Generator → PrimeNG_Mapper) and
 * produces string content for each output file.
 *
 * KEY DESIGN: Method bodies are rewritten with SAFE-ONLY replacements:
 *   - Setter calls (setXxx → this.xxx.set) — safe because setter names are unique
 *   - React types (React.FormEvent → Event) — safe string replacement
 *   - Ref access (ref.current → this.ref()?.nativeElement) — safe property access
 *
 * Bare variable reads are NOT replaced here. They are handled by:
 *   - signal-fixer (for template signal reads)
 *   - class-context-layer (for this. prefix in method bodies)
 */
export declare function emitAngularArtifact(ir: ComponentIR): AngularArtifact;
//# sourceMappingURL=code-emitter.d.ts.map