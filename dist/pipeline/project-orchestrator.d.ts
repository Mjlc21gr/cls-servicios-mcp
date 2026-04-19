import type { MigrateFullProjectParams, FullMigrationResult } from './pipeline-types.js';
/**
 * Migrates an entire React project to a complete Angular 20 + PrimeNG 19 project.
 *
 * Pipeline execution order:
 * 1. Validate sourceDir exists
 * 2. Scan project
 * 3. Topologically sort components
 * 4. Transform each component through the pipeline
 * 5. Aggregate styles
 * 6. Scaffold project
 * 7. Generate routes
 * 8. Fix signals
 * 9. Sanitize PrimeNG
 * 10. Assemble files and write to outputDir
 * 11. Copy static assets
 * 12. Validate output
 * 13. Return result
 */
export declare function migrateFullProject(params: MigrateFullProjectParams): Promise<FullMigrationResult>;
//# sourceMappingURL=project-orchestrator.d.ts.map