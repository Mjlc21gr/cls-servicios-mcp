/**
 * Modelos del Pipeline de Migración.
 * Define los pasos, gates de validación, y estado del flujo.
 * Cada paso tiene un gate: si no pasa, el pipeline se detiene sin cambios.
 */
export type PipelineStepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
export interface PipelineGateResult {
    readonly passed: boolean;
    readonly step: string;
    readonly message: string;
    readonly errors: readonly string[];
    readonly warnings: readonly string[];
    readonly timestamp: string;
}
export interface PipelineStep {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly order: number;
    readonly status: PipelineStepStatus;
    readonly gateResult: PipelineGateResult | null;
    readonly output: Record<string, unknown> | null;
    readonly durationMs: number;
}
export interface PipelineConfig {
    readonly sourceRepo: GitHubRepoConfig;
    readonly destRepo: GitHubRepoConfig;
    readonly moduleName: string;
    readonly strictMode: boolean;
    readonly dryRun: boolean;
    readonly rules: PipelineRules;
}
export interface GitHubRepoConfig {
    readonly owner: string;
    readonly repo: string;
    readonly branch: string;
    readonly token: string;
    readonly basePath?: string;
}
export interface PipelineRules {
    readonly maxComponentComplexity: number;
    readonly requireTests: boolean;
    readonly minTestCoverage: number;
    readonly forbiddenPatterns: readonly string[];
    readonly requiredPrimeNgComponents: boolean;
    readonly requireClsTheme: boolean;
    readonly requireStrictTypes: boolean;
    readonly maxFileSizeKb: number;
    readonly allowedAngularVersions: readonly string[];
}
export interface PipelineExecution {
    readonly id: string;
    readonly config: PipelineConfig;
    readonly steps: PipelineStep[];
    readonly status: 'idle' | 'running' | 'completed' | 'failed' | 'aborted';
    readonly startedAt: string | null;
    readonly completedAt: string | null;
    readonly failedAtStep: string | null;
    readonly totalDurationMs: number;
}
export declare const DEFAULT_PIPELINE_RULES: PipelineRules;
export declare const PIPELINE_STEPS: readonly ["github_pull", "analyze_react", "validate_structure", "map_to_angular", "inject_primeng_ui", "inject_cls_theme", "generate_services", "validate_output", "lint_check", "generate_tests", "github_push"];
export type PipelineStepId = typeof PIPELINE_STEPS[number];
//# sourceMappingURL=pipeline.model.d.ts.map