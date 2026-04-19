import type { MigrationOptions, ProjectMeta, ScaffoldFiles } from './pipeline-types.js';
/**
 * Generates the Angular 20 + PrimeNG 19 project skeleton.
 * Returns a map of file paths → file contents.
 */
export declare function scaffoldProject(moduleName: string, componentNames: readonly string[], options?: MigrationOptions, projectMeta?: ProjectMeta, detectedDependencies?: readonly string[]): ScaffoldFiles;
//# sourceMappingURL=project-scaffolder.d.ts.map