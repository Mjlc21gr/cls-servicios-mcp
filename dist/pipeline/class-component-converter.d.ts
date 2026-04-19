import type { ClassComponentConversion } from './pipeline-types.js';
/**
 * Converts a React class component source to a functional component equivalent.
 *
 * This is a regex-based pre-processor — not AST-based. It handles common patterns
 * to make class components parseable by the existing AST pipeline.
 */
export declare function convertClassToFunctional(source: string): ClassComponentConversion;
//# sourceMappingURL=class-component-converter.d.ts.map