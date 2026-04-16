import { ComponentIR } from '../types.js';
/**
 * Parses a React component source code and extracts a ComponentIR.
 *
 * @param sourceCode - The React JSX/TSX source code
 * @returns ComponentIR with all AST_Parser fields populated
 * @throws Error if the source code has invalid JSX syntax (with line number)
 * @throws Error if no valid React component is found
 */
export declare function parseReactComponent(sourceCode: string): ComponentIR;
//# sourceMappingURL=ast-parser.d.ts.map