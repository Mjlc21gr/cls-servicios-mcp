import type { ScannedProject } from './pipeline-types.js';
/**
 * Scan a React project directory and return a fully classified `ScannedProject`.
 *
 * @throws {Error} if `sourceDir` does not exist or contains zero scannable files.
 */
export declare function scanProject(sourceDir: string): Promise<ScannedProject>;
//# sourceMappingURL=project-scanner.d.ts.map