/**
 * Motor del Pipeline de Migración.
 *
 * Ejecuta pasos secuenciales con gates de validación.
 * Si un gate falla → el pipeline se detiene sin hacer cambios.
 * Si todos pasan → push al repo destino.
 *
 * Flujo:
 *   1. github_pull        → Trae código React del repo origen
 *   2. analyze_react      → Analiza componentes con AST
 *   3. validate_structure  → Valida que cumpla reglas CLS
 *   4. map_to_angular     → Convierte a Angular Standalone + Signals
 *   5. inject_primeng_ui  → Mapea UI a PrimeNG + tema SB
 *   6. inject_cls_theme   → Aplica variables CSS del tema
 *   7. generate_services  → Genera servicios HttpClient
 *   8. validate_output    → Valida código generado (no any, OnPush, etc.)
 *   9. lint_check         → Verifica lint y tipos
 *  10. generate_tests     → Genera .spec.ts
 *  11. github_push        → Sube al repo destino
 */
import type { PipelineConfig, PipelineExecution } from '../models/pipeline.model.js';
export declare class PipelineEngine {
    private readonly config;
    private execution;
    private context;
    constructor(config: PipelineConfig);
    /**
     * Ejecuta el pipeline completo paso a paso.
     * Cada paso tiene un gate: si falla, se detiene todo.
     */
    run(): Promise<PipelineExecution>;
    getExecution(): PipelineExecution;
    private stepGithubPull;
    private stepAnalyzeReact;
    private stepValidateStructure;
    private stepMapToAngular;
    private stepInjectPrimeNg;
    private stepInjectClsTheme;
    private stepGenerateServices;
    private stepValidateOutput;
    private stepLintCheck;
    private stepGenerateTests;
    private stepGithubPush;
    private gate;
    private failStep;
    private skipRemainingSteps;
    private createExecution;
    private getStepName;
    private getStepDescription;
}
//# sourceMappingURL=pipeline-engine.d.ts.map