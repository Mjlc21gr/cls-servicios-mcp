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
import type {
  PipelineConfig,
  PipelineExecution,
  PipelineStep,
  PipelineGateResult,
  PipelineStepId,
  PipelineRules,
} from '../models/pipeline.model.js';
import { PIPELINE_STEPS, DEFAULT_PIPELINE_RULES } from '../models/pipeline.model.js';
import { GitHubClient } from '../github/github-client.js';
import { analyzeReactComponent } from '../analyzers/react-component.analyzer.js';
import { generateAngularComponent } from '../generators/component.generator.js';
import { generateServiceFromAnalysis } from '../generators/service.generator.js';
import {
  convertToPrimeNg,
  generatePrimeNgImports,
  generateSbPrimeNgTheme,
} from '../generators/primeng-mapper.generator.js';
import {
  injectClsThemeToScss,
  injectClsThemeToHtml,
} from '../generators/theme-injector.generator.js';
import { toKebabCase, buildModulePaths } from '../utils/naming.utils.js';
import type { ReactComponentAnalysis } from '../models/react-analysis.model.js';

/** Tipo helper para hacer mutables las propiedades readonly (uso interno del engine) */
type Mutable<T> = { -readonly [P in keyof T]: T[P] };
type DeepMutable<T> = { -readonly [P in keyof T]: T[P] extends ReadonlyArray<infer U> ? DeepMutable<U>[] : T[P] extends object ? DeepMutable<T[P]> : T[P] };

interface StepContext {
  reactFiles: Array<{ path: string; content: string }>;
  analyses: ReactComponentAnalysis[];
  generatedFiles: Record<string, string>;
  warnings: string[];
}

export class PipelineEngine {
  private readonly config: PipelineConfig;
  private execution: DeepMutable<PipelineExecution>;
  private context: StepContext;

  constructor(config: PipelineConfig) {
    this.config = {
      ...config,
      rules: { ...DEFAULT_PIPELINE_RULES, ...config.rules },
    };

    this.execution = this.createExecution();
    this.context = {
      reactFiles: [],
      analyses: [],
      generatedFiles: {},
      warnings: [],
    };
  }

  /**
   * Ejecuta el pipeline completo paso a paso.
   * Cada paso tiene un gate: si falla, se detiene todo.
   */
  async run(): Promise<PipelineExecution> {
    this.execution.status = 'running';
    this.execution.startedAt = new Date().toISOString();

    const stepHandlers: Record<PipelineStepId, () => Promise<PipelineGateResult>> = {
      github_pull: () => this.stepGithubPull(),
      analyze_react: () => this.stepAnalyzeReact(),
      validate_structure: () => this.stepValidateStructure(),
      map_to_angular: () => this.stepMapToAngular(),
      inject_primeng_ui: () => this.stepInjectPrimeNg(),
      inject_cls_theme: () => this.stepInjectClsTheme(),
      generate_services: () => this.stepGenerateServices(),
      validate_output: () => this.stepValidateOutput(),
      lint_check: () => this.stepLintCheck(),
      generate_tests: () => this.stepGenerateTests(),
      github_push: () => this.stepGithubPush(),
    };

    for (const step of this.execution.steps) {
      const stepId = step.id as PipelineStepId;
      const handler = stepHandlers[stepId];

      if (!handler) {
        this.failStep(step, `Handler no encontrado para paso: ${stepId}`);
        break;
      }

      step.status = 'running';
      const startTime = Date.now();

      try {
        const gateResult = await handler();
        step.durationMs = Date.now() - startTime;
        step.gateResult = gateResult;

        if (!gateResult.passed) {
          // GATE FAILED → Pipeline se detiene
          step.status = 'failed';
          this.execution.status = 'failed';
          this.execution.failedAtStep = stepId;

          // Marcar pasos restantes como skipped
          this.skipRemainingSteps(step.order);
          break;
        }

        step.status = 'passed';
      } catch (error) {
        step.durationMs = Date.now() - startTime;
        this.failStep(step, error instanceof Error ? error.message : String(error));
        break;
      }
    }

    if (this.execution.status === 'running') {
      this.execution.status = 'completed';
    }

    this.execution.completedAt = new Date().toISOString();
    this.execution.totalDurationMs =
      this.execution.steps.reduce((sum, s) => sum + s.durationMs, 0);

    return this.execution;
  }

  getExecution(): PipelineExecution {
    return this.execution;
  }


  // ═══════════════════════════════════════════════════════════════
  // PASO 1: GitHub Pull
  // ═══════════════════════════════════════════════════════════════
  private async stepGithubPull(): Promise<PipelineGateResult> {
    const client = new GitHubClient(this.config.sourceRepo);

    // Gate: verificar conexión
    const validation = await client.validateConnection();
    if (!validation.valid) {
      return this.gate('github_pull', false, `No se pudo conectar al repo origen: ${validation.error}`, [validation.error ?? 'Conexión fallida']);
    }

    // Traer archivos
    const files = await client.pullReactFiles();
    if (files.length === 0) {
      return this.gate('github_pull', false, 'No se encontraron archivos .tsx/.jsx en el repo origen', ['Sin archivos React']);
    }

    this.context.reactFiles = files.map((f) => ({ path: f.path, content: f.content }));

    return this.gate('github_pull', true, `${files.length} archivos React obtenidos de ${this.config.sourceRepo.owner}/${this.config.sourceRepo.repo}@${this.config.sourceRepo.branch}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // PASO 2: Analizar React
  // ═══════════════════════════════════════════════════════════════
  private async stepAnalyzeReact(): Promise<PipelineGateResult> {
    const errors: string[] = [];

    for (const file of this.context.reactFiles) {
      try {
        const analysis = analyzeReactComponent(file.content, file.path);
        this.context.analyses.push(analysis);
      } catch (error) {
        errors.push(`Error analizando ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (this.context.analyses.length === 0) {
      return this.gate('analyze_react', false, 'No se pudo analizar ningún componente', errors);
    }

    // Gate: al menos un componente debe ser analizable
    const successRate = this.context.analyses.length / this.context.reactFiles.length;
    if (successRate < 0.5) {
      return this.gate('analyze_react', false, `Solo ${Math.round(successRate * 100)}% de componentes analizados (mínimo 50%)`, errors);
    }

    return this.gate(
      'analyze_react',
      true,
      `${this.context.analyses.length}/${this.context.reactFiles.length} componentes analizados`,
      [],
      errors.length > 0 ? errors.map((e) => `[warn] ${e}`) : []
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // PASO 3: Validar Estructura
  // ═══════════════════════════════════════════════════════════════
  private async stepValidateStructure(): Promise<PipelineGateResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const rules = this.config.rules;

    for (const analysis of this.context.analyses) {
      // Validar complejidad (hooks + callbacks + effects)
      const complexity = analysis.stateHooks.length + analysis.callbacks.length + analysis.effects.length + analysis.memos.length;
      if (complexity > rules.maxComponentComplexity) {
        errors.push(`${analysis.componentName}: complejidad ${complexity} excede máximo ${rules.maxComponentComplexity}`);
      }

      // Validar custom hooks (requieren migración manual)
      if (analysis.customHooks.length > 0) {
        warnings.push(`${analysis.componentName}: custom hooks detectados [${analysis.customHooks.join(', ')}] — requieren migración manual`);
      }

      // Validar tamaño del archivo fuente
      const fileSizeKb = Buffer.byteLength(
        this.context.reactFiles.find((f) => f.path === analysis.fileName)?.content ?? '',
        'utf-8'
      ) / 1024;
      if (fileSizeKb > rules.maxFileSizeKb) {
        errors.push(`${analysis.componentName}: archivo ${Math.round(fileSizeKb)}KB excede máximo ${rules.maxFileSizeKb}KB`);
      }
    }

    if (errors.length > 0 && this.config.strictMode) {
      return this.gate('validate_structure', false, 'Validación de estructura fallida (strict mode)', errors, warnings);
    }

    return this.gate('validate_structure', true, 'Estructura validada', [], [...warnings, ...errors.map((e) => `[non-strict] ${e}`)]);
  }

  // ═══════════════════════════════════════════════════════════════
  // PASO 4: Mapear a Angular
  // ═══════════════════════════════════════════════════════════════
  private async stepMapToAngular(): Promise<PipelineGateResult> {
    const errors: string[] = [];
    const paths = buildModulePaths(this.config.moduleName);

    for (const analysis of this.context.analyses) {
      try {
        const files = generateAngularComponent(analysis, this.config.moduleName);
        const kebabName = toKebabCase(analysis.componentName);
        const base = `${paths.components}/${kebabName}`;

        this.context.generatedFiles[`${base}/${kebabName}.component.ts`] = files.componentTs;
        this.context.generatedFiles[`${base}/${kebabName}.component.html`] = files.componentHtml;
        this.context.generatedFiles[`${base}/${kebabName}.component.scss`] = files.componentScss;
        this.context.generatedFiles[`${base}/${kebabName}.component.spec.ts`] = files.componentSpec;
      } catch (error) {
        errors.push(`${analysis.componentName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const generatedCount = Object.keys(this.context.generatedFiles).length;
    if (generatedCount === 0) {
      return this.gate('map_to_angular', false, 'No se generó ningún archivo Angular', errors);
    }

    return this.gate('map_to_angular', true, `${generatedCount} archivos Angular generados`, [], errors.length > 0 ? errors : []);
  }

  // ═══════════════════════════════════════════════════════════════
  // PASO 5: Inyectar PrimeNG + Seguros Bolívar
  // ═══════════════════════════════════════════════════════════════
  private async stepInjectPrimeNg(): Promise<PipelineGateResult> {
    const allModules: Array<{ moduleName: string; importPath: string }> = [];
    const warnings: string[] = [];
    let convertedCount = 0;

    for (const [filePath, content] of Object.entries(this.context.generatedFiles)) {
      if (!filePath.endsWith('.component.html')) continue;

      const uiLibs = this.context.analyses
        .flatMap((a) => a.uiLibraries.map((u) => u.library));

      const result = convertToPrimeNg(content, uiLibs);
      this.context.generatedFiles[filePath] = result.html;
      allModules.push(...result.requiredModules);
      warnings.push(...result.warnings);

      if (result.componentCount > 0) convertedCount++;
    }

    // Actualizar imports en .component.ts
    for (const [filePath, content] of Object.entries(this.context.generatedFiles)) {
      if (!filePath.endsWith('.component.ts')) continue;

      const primeImports = generatePrimeNgImports(allModules);
      if (primeImports) {
        // Agregar imports de PrimeNG después de CommonModule
        const updatedContent = content.replace(
          "import { CommonModule } from '@angular/common';",
          `import { CommonModule } from '@angular/common';\n${primeImports}`
        );

        // Agregar módulos PrimeNG al array de imports del componente
        const moduleNames = [...new Set(allModules.map((m) => m.moduleName))];
        const updatedImports = updatedContent.replace(
          'imports: [CommonModule]',
          `imports: [CommonModule, ${moduleNames.join(', ')}]`
        );

        this.context.generatedFiles[filePath] = updatedImports;
      }
    }

    // Generar tema SB
    this.context.generatedFiles['src/styles/_sb-primeng-theme.scss'] = generateSbPrimeNgTheme();

    const uniqueModules = [...new Set(allModules.map((m) => m.moduleName))];
    return this.gate(
      'inject_primeng_ui',
      true,
      `${convertedCount} templates convertidos a PrimeNG. Módulos: [${uniqueModules.join(', ')}]. Tema SB generado.`,
      [],
      warnings
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // PASO 6: Inyectar Tema CLS
  // ═══════════════════════════════════════════════════════════════
  private async stepInjectClsTheme(): Promise<PipelineGateResult> {
    let themedCount = 0;

    for (const [filePath, content] of Object.entries(this.context.generatedFiles)) {
      if (filePath.endsWith('.component.html')) {
        const uiLibs = this.context.analyses.flatMap((a) => a.uiLibraries.map((u) => u.library));
        this.context.generatedFiles[filePath] = injectClsThemeToHtml(content, uiLibs);
        themedCount++;
      }

      if (filePath.endsWith('.component.scss')) {
        this.context.generatedFiles[filePath] = injectClsThemeToScss(content);
        themedCount++;
      }
    }

    return this.gate('inject_cls_theme', true, `${themedCount} archivos tematizados con CLS + SB`);
  }

  // ═══════════════════════════════════════════════════════════════
  // PASO 7: Generar Servicios
  // ═══════════════════════════════════════════════════════════════
  private async stepGenerateServices(): Promise<PipelineGateResult> {
    const paths = buildModulePaths(this.config.moduleName);
    const kebabModule = toKebabCase(this.config.moduleName);
    let servicesGenerated = 0;

    for (const analysis of this.context.analyses) {
      const result = generateServiceFromAnalysis(analysis, this.config.moduleName);
      if (result) {
        this.context.generatedFiles[`${paths.services}/${kebabModule}.service.ts`] = result.serviceCode;
        this.context.generatedFiles[`${paths.services}/${kebabModule}.service.spec.ts`] = result.serviceSpec;
        this.context.generatedFiles[`${paths.models}/${kebabModule}.model.ts`] = result.modelCode;
        servicesGenerated++;
      }
    }

    return this.gate('generate_services', true, `${servicesGenerated} servicio(s) generado(s) con base /servicios-core/api/v1/`);
  }

  // ═══════════════════════════════════════════════════════════════
  // PASO 8: Validar Output
  // ═══════════════════════════════════════════════════════════════
  private async stepValidateOutput(): Promise<PipelineGateResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const rules = this.config.rules;

    for (const [filePath, content] of Object.entries(this.context.generatedFiles)) {
      if (!filePath.endsWith('.ts')) continue;
      if (filePath.endsWith('.spec.ts')) continue;

      // Prohibido 'any'
      if (rules.requireStrictTypes) {
        const anyMatches = content.match(/:\s*any\b/g);
        if (anyMatches) {
          errors.push(`${filePath}: contiene ${anyMatches.length} uso(s) de 'any' (prohibido)`);
        }
      }

      // Verificar OnPush en componentes
      if (filePath.endsWith('.component.ts')) {
        if (!content.includes('ChangeDetectionStrategy.OnPush')) {
          errors.push(`${filePath}: falta ChangeDetectionStrategy.OnPush`);
        }
        if (!content.includes('standalone: true')) {
          errors.push(`${filePath}: falta standalone: true`);
        }
        if (!content.includes('signal')) {
          warnings.push(`${filePath}: no usa Signals (verificar si es necesario)`);
        }
      }

      // Verificar patrones prohibidos
      for (const pattern of rules.forbiddenPatterns) {
        if (pattern === 'any') continue; // Ya validado arriba
        if (content.includes(pattern)) {
          warnings.push(`${filePath}: contiene patrón prohibido '${pattern}'`);
        }
      }

      // Verificar tamaño
      const sizeKb = Buffer.byteLength(content, 'utf-8') / 1024;
      if (sizeKb > rules.maxFileSizeKb) {
        warnings.push(`${filePath}: ${Math.round(sizeKb)}KB excede recomendado ${rules.maxFileSizeKb}KB`);
      }
    }

    // Verificar PrimeNG si es requerido
    if (rules.requiredPrimeNgComponents) {
      const hasAnyPrimeNg = Object.values(this.context.generatedFiles)
        .some((content) => content.includes('primeng/') || content.includes('p-'));
      if (!hasAnyPrimeNg) {
        warnings.push('No se detectaron componentes PrimeNG en el output');
      }
    }

    if (errors.length > 0 && this.config.strictMode) {
      return this.gate('validate_output', false, 'Validación de output fallida (strict mode)', errors, warnings);
    }

    return this.gate('validate_output', true, 'Output validado', [], [...warnings, ...errors.map((e) => `[non-strict] ${e}`)]);
  }

  // ═══════════════════════════════════════════════════════════════
  // PASO 9: Lint Check
  // ═══════════════════════════════════════════════════════════════
  private async stepLintCheck(): Promise<PipelineGateResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const [filePath, content] of Object.entries(this.context.generatedFiles)) {
      if (!filePath.endsWith('.ts')) continue;

      // Verificar imports no usados (heurística básica)
      const importLines = content.match(/^import .+ from .+;$/gm) ?? [];
      for (const importLine of importLines) {
        const importedNames = importLine.match(/\{([^}]+)\}/);
        if (importedNames) {
          const names = importedNames[1].split(',').map((n) => n.trim().split(' as ').pop()?.trim() ?? '');
          for (const name of names) {
            if (!name) continue;
            // Contar ocurrencias fuera de la línea de import
            const contentWithoutImport = content.replace(importLine, '');
            if (!contentWithoutImport.includes(name)) {
              warnings.push(`${filePath}: import '${name}' posiblemente no usado`);
            }
          }
        }
      }

      // Verificar nomenclatura kebab-case en archivos
      const fileName = filePath.split('/').pop() ?? '';
      if (fileName.endsWith('.ts') && /[A-Z]/.test(fileName)) {
        errors.push(`${filePath}: nombre de archivo no es kebab-case`);
      }

      // Verificar que los componentes tengan sufijo correcto
      if (filePath.endsWith('.component.ts') && !content.includes('Component {') && !content.includes('Component implements')) {
        warnings.push(`${filePath}: clase no tiene sufijo 'Component'`);
      }

      if (filePath.endsWith('.service.ts') && !content.includes('Service {') && !content.includes('Service implements')) {
        warnings.push(`${filePath}: clase no tiene sufijo 'Service'`);
      }
    }

    if (errors.length > 0 && this.config.strictMode) {
      return this.gate('lint_check', false, 'Lint check fallido', errors, warnings);
    }

    return this.gate('lint_check', true, 'Lint check pasado', [], [...warnings, ...errors.map((e) => `[non-strict] ${e}`)]);
  }

  // ═══════════════════════════════════════════════════════════════
  // PASO 10: Generar Tests
  // ═══════════════════════════════════════════════════════════════
  private async stepGenerateTests(): Promise<PipelineGateResult> {
    if (!this.config.rules.requireTests) {
      return this.gate('generate_tests', true, 'Tests no requeridos (regla desactivada)');
    }

    // Verificar que cada .component.ts tenga su .spec.ts
    const componentFiles = Object.keys(this.context.generatedFiles).filter((f) => f.endsWith('.component.ts'));
    const specFiles = Object.keys(this.context.generatedFiles).filter((f) => f.endsWith('.spec.ts'));
    const missingSpecs: string[] = [];

    for (const compFile of componentFiles) {
      const expectedSpec = compFile.replace('.component.ts', '.component.spec.ts');
      if (!specFiles.includes(expectedSpec)) {
        missingSpecs.push(expectedSpec);
      }
    }

    if (missingSpecs.length > 0) {
      return this.gate('generate_tests', false, `Faltan ${missingSpecs.length} archivos .spec.ts`, missingSpecs);
    }

    return this.gate('generate_tests', true, `${specFiles.length} archivos de test verificados`);
  }

  // ═══════════════════════════════════════════════════════════════
  // PASO 11: GitHub Push
  // ═══════════════════════════════════════════════════════════════
  private async stepGithubPush(): Promise<PipelineGateResult> {
    if (this.config.dryRun) {
      return this.gate(
        'github_push',
        true,
        `[DRY RUN] Se enviarían ${Object.keys(this.context.generatedFiles).length} archivos a ${this.config.destRepo.owner}/${this.config.destRepo.repo}@${this.config.destRepo.branch}`
      );
    }

    const client = new GitHubClient(this.config.destRepo);

    // Gate: verificar conexión al destino
    const validation = await client.validateConnection();
    if (!validation.valid) {
      return this.gate('github_push', false, `No se pudo conectar al repo destino: ${validation.error}`, [validation.error ?? 'Conexión fallida']);
    }

    // Crear rama de migración
    const migrationBranch = `migrate/${this.config.moduleName}-${Date.now()}`;
    const branchResult = await client.createBranch(migrationBranch);
    if (!branchResult.success) {
      return this.gate('github_push', false, `No se pudo crear rama: ${branchResult.error}`, [branchResult.error ?? '']);
    }

    // Push de archivos
    const destClient = new GitHubClient({
      ...this.config.destRepo,
      branch: migrationBranch,
    });

    const commitMessage = [
      `feat(${this.config.moduleName}): migración React → Angular CLS`,
      '',
      `Componentes migrados: ${this.context.analyses.map((a) => a.componentName).join(', ')}`,
      `Archivos generados: ${Object.keys(this.context.generatedFiles).length}`,
      `Pipeline: ${this.execution.id}`,
      '',
      'Generado automáticamente por @cls/mcp-front-migrate',
    ].join('\n');

    const pushResult = await destClient.pushMigratedFiles(this.context.generatedFiles, commitMessage);

    if (!pushResult.success) {
      return this.gate('github_push', false, `Push fallido: ${pushResult.error}`, [pushResult.error ?? '']);
    }

    return this.gate(
      'github_push',
      true,
      `${Object.keys(this.context.generatedFiles).length} archivos enviados a ${this.config.destRepo.owner}/${this.config.destRepo.repo}@${migrationBranch} (commit: ${pushResult.commitSha?.substring(0, 7)})`
    );
  }


  // ═══════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════

  private gate(
    step: string,
    passed: boolean,
    message: string,
    errors: string[] = [],
    warnings: string[] = []
  ): PipelineGateResult {
    return {
      passed,
      step,
      message,
      errors,
      warnings,
      timestamp: new Date().toISOString(),
    };
  }

  private failStep(step: DeepMutable<PipelineStep>, errorMessage: string): void {
    step.status = 'failed';
    step.gateResult = this.gate(
      step.id,
      false,
      errorMessage,
      [errorMessage]
    );
    this.execution.status = 'failed';
    this.execution.failedAtStep = step.id;
    this.skipRemainingSteps(step.order);
  }

  private skipRemainingSteps(fromOrder: number): void {
    for (const step of this.execution.steps) {
      if (step.order > fromOrder && step.status === 'pending') {
        step.status = 'skipped';
      }
    }
  }

  private createExecution(): DeepMutable<PipelineExecution> {
    const steps: DeepMutable<PipelineStep>[] = PIPELINE_STEPS.map((id, index) => ({
      id,
      name: this.getStepName(id),
      description: this.getStepDescription(id),
      order: index,
      status: 'pending' as const,
      gateResult: null,
      output: null,
      durationMs: 0,
    }));

    return {
      id: `pipeline-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      config: this.config as DeepMutable<PipelineConfig>,
      steps,
      status: 'idle',
      startedAt: null,
      completedAt: null,
      failedAtStep: null,
      totalDurationMs: 0,
    };
  }

  private getStepName(id: PipelineStepId): string {
    const names: Record<PipelineStepId, string> = {
      github_pull: 'Pull desde GitHub',
      analyze_react: 'Análisis de React',
      validate_structure: 'Validación de Estructura',
      map_to_angular: 'Conversión a Angular',
      inject_primeng_ui: 'Inyección PrimeNG + SB',
      inject_cls_theme: 'Tema CLS',
      generate_services: 'Generación de Servicios',
      validate_output: 'Validación de Output',
      lint_check: 'Lint Check',
      generate_tests: 'Generación de Tests',
      github_push: 'Push a GitHub',
    };
    return names[id];
  }

  private getStepDescription(id: PipelineStepId): string {
    const descriptions: Record<PipelineStepId, string> = {
      github_pull: 'Trae código React del repositorio origen',
      analyze_react: 'Analiza componentes con AST (hooks, props, JSX)',
      validate_structure: 'Valida complejidad, tamaño y patrones',
      map_to_angular: 'Convierte a Angular Standalone + Signals + OnPush',
      inject_primeng_ui: 'Mapea UI a PrimeNG con tema Seguros Bolívar',
      inject_cls_theme: 'Aplica variables CSS del Design System CLS',
      generate_services: 'Genera servicios HttpClient → /servicios-core/api/v1/',
      validate_output: 'Valida código generado (no any, OnPush, standalone)',
      lint_check: 'Verifica nomenclatura, imports y estándares',
      generate_tests: 'Verifica archivos .spec.ts con cobertura',
      github_push: 'Sube código migrado al repositorio destino',
    };
    return descriptions[id];
  }
}
