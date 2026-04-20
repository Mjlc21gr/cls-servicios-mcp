// =============================================================================
// MCP Server – CLS Front-End Migration
// Unifica el pipeline de conversión React → Angular y el flujo CLS completo
// =============================================================================

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// --- Pipeline original (conversión directa) ---
import { validateInput } from './security/validator.js';
import { parseReactComponent } from './pipeline/ast-parser.js';
import { mapStateToAngular } from './pipeline/state-mapper.js';
import { generateAngularTemplate } from './pipeline/template-generator.js';
import { mapToPrimeNG } from './pipeline/primeng-mapper.js';
import { emitAngularArtifact } from './emitter/code-emitter.js';
import { generateShellApp } from './generators/shell-generator.js';
import { generateRemoteApp } from './generators/module-generator.js';

// --- Flujo CLS (análisis, generación CLS, tema, servicios, pipeline) ---
import { analyzeReactComponent } from './analyzers/react-component.analyzer.js';
import { generateAngularComponent } from './generators/component.generator.js';
import { generateServiceFromAnalysis } from './generators/service.generator.js';
import {
  injectClsThemeToScss,
  injectClsThemeToHtml,
  generateClsThemeVariables,
} from './generators/theme-injector.generator.js';
import {
  convertToPrimeNg,
  generatePrimeNgImports,
  generateSbPrimeNgTheme,
} from './generators/primeng-mapper.generator.js';
import { PipelineEngine } from './pipeline/pipeline-engine.js';
import type { PipelineConfig } from './models/pipeline.model.js';
import { DEFAULT_PIPELINE_RULES } from './models/pipeline.model.js';
import { toKebabCase, buildModulePaths } from './utils/naming.utils.js';
import {
  buildSourceRepoConfig,
  buildDestRepoConfig,
  getEnvBool,
  getEnvNumber,
  getEnvStatus,
  ENV_KEYS,
} from './utils/env.utils.js';

// --- Pipeline completo de proyecto ---
import { migrateFullProject } from './pipeline/project-orchestrator.js';

// --- 4 Capas de Reingeniería Estructural ---
import { applySemanticUI } from './pipeline/ui-semantic-engine.js';
import { detectAndGenerateRoutes } from './pipeline/universal-router-mapper.js';
import { convertHookToService } from './pipeline/logic-service-converter.js';
import { preserveStyles } from './pipeline/style-preservator.js';

// ---------------------------------------------------------------------------
// Zod Schemas – Pipeline original
// ---------------------------------------------------------------------------

export const convertSchema = {
  sourceCode: z.string(),
};

export const shellSchema = {
  appName: z.string(),
  remotes: z.array(
    z.object({
      name: z.string(),
      path: z.string(),
      remoteEntry: z.string(),
      exposedModule: z.string(),
    }),
  ),
};

export const moduleSchema = {
  moduleName: z.string(),
  components: z.array(
    z.object({
      name: z.string(),
      path: z.string(),
    }),
  ),
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REQUEST_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Error formatting helper
// ---------------------------------------------------------------------------

function mcpError(
  type: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          success: false,
          error: { type, message, ...(details ? { details } : {}) },
        }),
      },
    ],
    isError: true as const,
  };
}

// ---------------------------------------------------------------------------
// Tool handlers – Pipeline original (exported for testing)
// ---------------------------------------------------------------------------

export async function convertHandler(args: { sourceCode: string }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const result = await Promise.race([
      runConvertPipeline(args.sourceCode),
      new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error('TIMEOUT')));
      }),
    ]);
    return result;
  } catch (err: unknown) {
    return handlePipelineError(err);
  } finally {
    clearTimeout(timer);
  }
}

async function runConvertPipeline(sourceCode: string) {
  const validation = validateInput(sourceCode);
  if (!validation.isValid) {
    const firstError = validation.errors[0];
    return mcpError(
      firstError.type === 'security' ? 'security_error' : firstError.type + '_error',
      firstError.message,
      firstError.line != null ? { line: firstError.line } : undefined,
    );
  }
  const ir = parseReactComponent(validation.sanitizedCode ?? sourceCode);
  const irWithState = mapStateToAngular(ir);
  const irWithTemplate = generateAngularTemplate(irWithState);
  const irWithPrimeNG = mapToPrimeNG(irWithTemplate);
  const artifact = emitAngularArtifact(irWithPrimeNG);
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ success: true, artifact, securityWarnings: artifact.securityWarnings }),
      },
    ],
  };
}

export async function shellHandler(args: {
  appName: string;
  remotes: Array<{ name: string; path: string; remoteEntry: string; exposedModule: string }>;
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => {
        const artifact = generateShellApp({ appName: args.appName, remotes: args.remotes });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, artifact }) }] };
      }),
      new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error('TIMEOUT')));
      }),
    ]);
    return result;
  } catch (err: unknown) {
    return handlePipelineError(err);
  } finally {
    clearTimeout(timer);
  }
}

export async function moduleHandler(args: {
  moduleName: string;
  components: Array<{ name: string; path: string }>;
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => {
        const artifact = generateRemoteApp({ moduleName: args.moduleName, components: args.components });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, artifact }) }] };
      }),
      new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error('TIMEOUT')));
      }),
    ]);
    return result;
  } catch (err: unknown) {
    return handlePipelineError(err);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Shared error handler
// ---------------------------------------------------------------------------

function handlePipelineError(err: unknown) {
  if (err instanceof Error) {
    if (err.message === 'TIMEOUT') {
      return mcpError('timeout', 'Request processing exceeded the 30-second time limit');
    }
    if (err.message.includes('Unexpected token') || err.message.includes('Unterminated')) {
      const lineMatch = err.message.match(/\((\d+):(\d+)\)/);
      return mcpError('syntax_error', err.message, lineMatch ? { line: Number(lineMatch[1]), column: Number(lineMatch[2]) } : undefined);
    }
    if (err.message.includes('No valid React component found') || err.message.includes('no se encontró')) {
      return mcpError('invalid_component', err.message);
    }
    if (err.message.includes('security') || err.message.includes('injection')) {
      return mcpError('security_error', err.message);
    }
    return mcpError('internal_error', err.message);
  }
  return mcpError('internal_error', 'An unknown error occurred');
}

// ---------------------------------------------------------------------------
// Helper – Notas de migración
// ---------------------------------------------------------------------------

function buildMigrationNotes(analysis: ReturnType<typeof analyzeReactComponent>): string[] {
  const notes: string[] = [];
  if (analysis.stateHooks.length > 0) notes.push(`${analysis.stateHooks.length} useState → signal()`);
  for (const eff of analysis.effects) {
    if (eff.isOnMount && !eff.hasCleanup) notes.push('useEffect(fn, []) → ngOnInit()');
    else if (eff.isOnMount && eff.hasCleanup) notes.push('useEffect(fn + cleanup, []) → ngOnInit() + ngOnDestroy()');
    else if (eff.dependencies.length > 0) notes.push(`useEffect con deps → effect() en constructor`);
    else notes.push('useEffect sin deps → effect()');
  }
  if (analysis.memos.length > 0) notes.push(`${analysis.memos.length} useMemo → computed()`);
  if (analysis.contexts.length > 0) notes.push(`${analysis.contexts.length} useContext → inject()`);
  if (analysis.customHooks.length > 0) notes.push(`Custom hooks: ${analysis.customHooks.join(', ')}`);
  if (analysis.uiLibraries.length > 0) notes.push(`UI Libraries: ${analysis.uiLibraries.map((u) => u.library).join(', ')}`);
  return notes;
}

// ---------------------------------------------------------------------------
// Server factory – Registra TODAS las tools (pipeline + flujo CLS)
// ---------------------------------------------------------------------------

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'cls-front-migrate',
    version: '1.0.0',
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOLS DEL PIPELINE ORIGINAL
  // ═══════════════════════════════════════════════════════════════════════════

  server.tool(
    'convert_react_to_angular',
    'Converts React JSX/TSX source code to Angular 19+ standalone component with PrimeNG and Tailwind CSS',
    convertSchema,
    async (args) => convertHandler(args),
  );

  server.tool(
    'generate_microfrontend_shell',
    'Generates an Angular Shell application with Native Federation for micro frontends',
    shellSchema,
    async (args) => shellHandler(args),
  );

  server.tool(
    'generate_angular_module',
    'Generates an Angular Remote application with Native Federation exposing specified components',
    moduleSchema,
    async (args) => moduleHandler(args),
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOLS DEL FLUJO CLS
  // ═══════════════════════════════════════════════════════════════════════════

  // --- Tool: analyze_react_component ---
  server.tool(
    'analyze_react_component',
    `Analiza un componente React (JSX/TSX) y extrae su estructura completa:
    - Estado (useState) → Signals
    - Efectos (useEffect) → ngOnInit/effect()
    - Props → input()/output()
    - Callbacks, Memos, Refs, Librerías UI, Template JSX`,
    {
      sourceCode: z.string().describe('Código fuente completo del componente React (.tsx/.jsx)'),
      fileName: z.string().describe('Nombre del archivo (ej: UserProfile.tsx)'),
    },
    async ({ sourceCode, fileName }) => {
      try {
        const analysis = analyzeReactComponent(sourceCode, fileName);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'success',
              analysis,
              summary: {
                component: analysis.componentName,
                stateCount: analysis.stateHooks.length,
                effectCount: analysis.effects.length,
                propsCount: analysis.props.length,
                callbackCount: analysis.callbacks.length,
                memoCount: analysis.memos.length,
                refCount: analysis.refs.length,
                uiLibraries: analysis.uiLibraries.map((u) => u.library),
                customHooks: analysis.customHooks,
                migrationNotes: buildMigrationNotes(analysis),
              },
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ status: 'error', message: `Error al analizar componente: ${error instanceof Error ? error.message : String(error)}` }) }],
          isError: true,
        };
      }
    },
  );

  // --- Tool: map_to_angular_standalone ---
  server.tool(
    'map_to_angular_standalone',
    `Convierte un componente React analizado a Angular Standalone Component CLS.
    Genera: .component.ts, .component.html, .component.scss, .component.spec.ts
    Reglas: useState→signal(), useEffect→ngOnInit/effect(), useMemo→computed(), OnPush, standalone`,
    {
      sourceCode: z.string().describe('Código fuente del componente React'),
      fileName: z.string().describe('Nombre del archivo React'),
      moduleName: z.string().describe('Nombre del módulo/feature CLS destino'),
    },
    async ({ sourceCode, fileName, moduleName }) => {
      try {
        const analysis = analyzeReactComponent(sourceCode, fileName);
        const files = generateAngularComponent(analysis, moduleName);
        const paths = buildModulePaths(moduleName);
        const kebabName = toKebabCase(analysis.componentName);
        const outputFiles = {
          [`${paths.components}/${kebabName}/${kebabName}.component.ts`]: files.componentTs,
          [`${paths.components}/${kebabName}/${kebabName}.component.html`]: files.componentHtml,
          [`${paths.components}/${kebabName}/${kebabName}.component.scss`]: files.componentScss,
          [`${paths.components}/${kebabName}/${kebabName}.component.spec.ts`]: files.componentSpec,
        };
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'success',
              componentName: analysis.componentName,
              angularSelector: `cls-${kebabName}`,
              outputPath: `${paths.components}/${kebabName}/`,
              files: outputFiles,
              conversionLog: {
                signalsCreated: analysis.stateHooks.length,
                inputsCreated: analysis.props.filter((p) => p.name !== '_propsInterface').length,
                effectsMigrated: analysis.effects.length,
                computedCreated: analysis.memos.length,
                methodsCreated: analysis.callbacks.length,
              },
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ status: 'error', message: `Error en conversión: ${error instanceof Error ? error.message : String(error)}` }) }],
          isError: true,
        };
      }
    },
  );

  // --- Tool: inject_cls_theme ---
  server.tool(
    'inject_cls_theme',
    `Sustituye estilos genéricos del prototipo React por el Sistema de Diseño CLS.
    Reemplaza colores hardcoded por variables CSS (--cls-*), convierte MUI/Tailwind a clases CLS.`,
    {
      html: z.string().describe('Template HTML/Angular a tematizar'),
      scss: z.string().describe('Estilos SCSS a tematizar'),
      uiLibraries: z.array(z.string()).describe('Librerías UI detectadas'),
      generateThemeFile: z.boolean().optional().describe('Si true, genera archivo de variables CSS del tema CLS'),
    },
    async ({ html, scss, uiLibraries, generateThemeFile }) => {
      const themedHtml = injectClsThemeToHtml(html, uiLibraries);
      const themedScss = injectClsThemeToScss(scss);
      const result: Record<string, unknown> = {
        status: 'success', themedHtml, themedScss,
        replacements: { htmlChanges: html !== themedHtml, scssChanges: scss !== themedScss },
      };
      if (generateThemeFile) {
        result['themeVariables'] = generateClsThemeVariables();
        result['themeFilePath'] = 'src/styles/_cls-theme-variables.scss';
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // --- Tool: generate_api_services ---
  server.tool(
    'generate_api_services',
    `Genera servicios Angular (.service.ts) a partir de llamadas API detectadas en el componente React.
    Usa HttpClient con inject(), base URL: /servicios-core/api/v1/, prohibido 'any'.`,
    {
      sourceCode: z.string().describe('Código fuente del componente React con llamadas API'),
      fileName: z.string().describe('Nombre del archivo React'),
      moduleName: z.string().describe('Nombre del módulo CLS destino'),
    },
    async ({ sourceCode, fileName, moduleName }) => {
      try {
        const analysis = analyzeReactComponent(sourceCode, fileName);
        const serviceResult = generateServiceFromAnalysis(analysis, moduleName);
        if (!serviceResult) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'info', message: 'No se detectaron llamadas API en el componente.' }) }] };
        }
        const paths = buildModulePaths(moduleName);
        const kebabName = toKebabCase(moduleName);
        const outputFiles = {
          [`${paths.services}/${kebabName}.service.ts`]: serviceResult.serviceCode,
          [`${paths.services}/${kebabName}.service.spec.ts`]: serviceResult.serviceSpec,
          [`${paths.models}/${kebabName}.model.ts`]: serviceResult.modelCode,
        };
        return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'success', serviceName: `${moduleName}Service`, baseUrl: '/servicios-core/api/v1', outputFiles }, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'error', message: `Error generando servicio: ${error instanceof Error ? error.message : String(error)}` }) }], isError: true };
      }
    },
  );

  // --- Tool: inject_primeng_ui ---
  server.tool(
    'inject_primeng_ui',
    `Convierte componentes de UI del prototipo React a PrimeNG con tema Seguros Bolívar.
    MUI → PrimeNG equivalente, genera imports, aplica clases SB, valida accesibilidad.`,
    {
      html: z.string().describe('Template HTML a convertir'),
      uiLibraries: z.array(z.string()).describe('Librerías UI detectadas'),
      generateThemeFile: z.boolean().optional().describe('Si true, genera SCSS del tema Seguros Bolívar'),
    },
    async ({ html, uiLibraries, generateThemeFile }) => {
      const result = convertToPrimeNg(html, uiLibraries);
      const output: Record<string, unknown> = {
        status: 'success',
        convertedHtml: result.html,
        requiredModules: result.requiredModules,
        primeNgImports: generatePrimeNgImports(result.requiredModules),
        componentCount: result.componentCount,
        a11yWarnings: result.warnings,
      };
      if (generateThemeFile) {
        output['sbThemeScss'] = generateSbPrimeNgTheme();
        output['themeFilePath'] = 'src/styles/_sb-primeng-theme.scss';
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
    },
  );

  // --- Tool: run_migration_pipeline ---
  server.tool(
    'run_migration_pipeline',
    `Ejecuta el pipeline completo de migración React → Angular CLS con gates de validación.
    Flujo: github_pull → analyze → validate → map_to_angular → primeng → cls_theme → services → validate_output → lint → tests → github_push`,
    {
      moduleName: z.string().describe('Nombre del módulo/feature CLS'),
      sourceOwner: z.string().optional(), sourceRepo: z.string().optional(),
      sourceBranch: z.string().optional(), sourceToken: z.string().optional(),
      sourceBasePath: z.string().optional(),
      destOwner: z.string().optional(), destRepo: z.string().optional(),
      destBranch: z.string().optional(), destToken: z.string().optional(),
      strictMode: z.boolean().optional(), dryRun: z.boolean().optional(),
      maxComplexity: z.number().optional(), requireTests: z.boolean().optional(),
    },
    async (params) => {
      try {
        const sourceRepo = buildSourceRepoConfig({
          owner: params.sourceOwner, repo: params.sourceRepo,
          branch: params.sourceBranch, token: params.sourceToken,
          basePath: params.sourceBasePath,
        });
        const destRepo = buildDestRepoConfig({
          owner: params.destOwner, repo: params.destRepo,
          branch: params.destBranch, token: params.destToken,
        });
        const config: PipelineConfig = {
          sourceRepo, destRepo, moduleName: params.moduleName,
          strictMode: params.strictMode ?? getEnvBool(ENV_KEYS.STRICT_MODE),
          dryRun: params.dryRun ?? getEnvBool(ENV_KEYS.DRY_RUN),
          rules: {
            ...DEFAULT_PIPELINE_RULES,
            maxComponentComplexity: params.maxComplexity ?? (getEnvNumber(ENV_KEYS.MAX_COMPLEXITY) || DEFAULT_PIPELINE_RULES.maxComponentComplexity),
            requireTests: params.requireTests ?? getEnvBool(ENV_KEYS.REQUIRE_TESTS),
            maxFileSizeKb: getEnvNumber(ENV_KEYS.MAX_FILE_SIZE_KB) || DEFAULT_PIPELINE_RULES.maxFileSizeKb,
            minTestCoverage: getEnvNumber(ENV_KEYS.MIN_TEST_COVERAGE) || DEFAULT_PIPELINE_RULES.minTestCoverage,
          },
        };
        const engine = new PipelineEngine(config);
        const execution = await engine.run();
        const stepResults = execution.steps.map((step) => ({
          step: step.name, status: step.status, duration: `${step.durationMs}ms`,
          message: step.gateResult?.message ?? '-',
          errors: step.gateResult?.errors ?? [], warnings: step.gateResult?.warnings ?? [],
        }));
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              pipelineId: execution.id, status: execution.status,
              failedAtStep: execution.failedAtStep, totalDuration: `${execution.totalDurationMs}ms`,
              steps: stepResults,
              summary: execution.status === 'completed'
                ? `✅ Pipeline completado. Código migrado enviado.`
                : `❌ Pipeline detenido en paso "${execution.failedAtStep}".`,
            }, null, 2),
          }],
          isError: execution.status === 'failed',
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ status: 'error', message: error instanceof Error ? error.message : String(error), envStatus: getEnvStatus() }, null, 2) }],
          isError: true,
        };
      }
    },
  );

  // --- Tool: validate_pipeline_config ---
  server.tool(
    'validate_pipeline_config',
    `Valida la configuración del pipeline antes de ejecutarlo. Verifica conexión a ambos repos y permisos.`,
    {
      sourceOwner: z.string().optional(), sourceRepo: z.string().optional(),
      sourceBranch: z.string().optional(), sourceToken: z.string().optional(),
      destOwner: z.string().optional(), destRepo: z.string().optional(),
      destBranch: z.string().optional(), destToken: z.string().optional(),
    },
    async (params) => {
      try {
        const { GitHubClient } = await import('./github/github-client.js');
        const sourceConfig = buildSourceRepoConfig({ owner: params.sourceOwner, repo: params.sourceRepo, branch: params.sourceBranch, token: params.sourceToken });
        const destConfig = buildDestRepoConfig({ owner: params.destOwner, repo: params.destRepo, branch: params.destBranch, token: params.destToken });
        const sourceClient = new GitHubClient(sourceConfig);
        const destClient = new GitHubClient(destConfig);
        const [sourceCheck, destCheck] = await Promise.all([sourceClient.validateConnection(), destClient.validateConnection()]);
        const checks = {
          sourceRepo: { valid: sourceCheck.valid, detail: sourceCheck.valid ? `✅ ${sourceConfig.owner}/${sourceConfig.repo}@${sourceConfig.branch} accesible` : `❌ ${sourceCheck.error}` },
          destRepo: { valid: destCheck.valid, detail: destCheck.valid ? `✅ ${destConfig.owner}/${destConfig.repo}@${destConfig.branch} accesible` : `❌ ${destCheck.error}` },
          allValid: sourceCheck.valid && destCheck.valid,
          envStatus: getEnvStatus(),
        };
        return { content: [{ type: 'text' as const, text: JSON.stringify(checks, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'error', message: error instanceof Error ? error.message : String(error), envStatus: getEnvStatus() }, null, 2) }], isError: true };
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOL PRINCIPAL: MIGRACIÓN COMPLETA DE PROYECTO
  // ═══════════════════════════════════════════════════════════════════════════

  server.tool(
    'migrate_full_project',
    `Migra un proyecto React completo a un proyecto Angular 20 + PrimeNG 19 listo para ejecutar.
    Escanea todos los componentes, servicios, estilos y configuración del proyecto React,
    los transforma al equivalente Angular, y genera un proyecto completo con package.json,
    angular.json, tsconfig.json, rutas, tema Seguros Bolívar, y todos los archivos necesarios.
    El proyecto generado está listo para npm install && ng serve sin intervención manual.`,
    {
      sourceDir: z.string().describe('Ruta al directorio del proyecto React'),
      outputDir: z.string().describe('Ruta para el proyecto Angular de salida'),
      moduleName: z.string().describe('Nombre del módulo/feature Angular'),
      options: z.object({
        angularVersion: z.string().optional().describe('Versión de Angular (default: 20)'),
        primeNgVersion: z.string().optional().describe('Versión de PrimeNG (default: 19)'),
        strictMode: z.boolean().optional().describe('Modo estricto (default: true)'),
        baseApiUrl: z.string().optional().describe('URL base de API (default: /servicios-core/api/v1/)'),
        convertTailwind: z.boolean().optional().describe('Convertir Tailwind a SCSS (default: false)'),
      }).optional(),
    },
    async (args) => {
      try {
        const result = await migrateFullProject({
          sourceDir: args.sourceDir,
          outputDir: args.outputDir,
          moduleName: args.moduleName,
          options: args.options,
        });
        // Return compact summary (not full file list) to avoid timeout
        const summary = {
          status: result.status,
          outputDir: result.outputDir,
          totalFiles: result.filesGenerated.length,
          migrationSummary: result.migrationSummary,
          validationIssues: result.validationReport.length,
          errors: result.errors?.length ?? 0,
          duration: result.duration + 'ms',
          nextStep: result.status === 'success'
            ? `cd ${result.outputDir} && npm install && ng serve`
            : 'Check errors above',
        };
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(summary, null, 2),
          }],
          isError: result.status === 'error',
        };
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'error',
              message: error instanceof Error ? error.message : String(error),
            }),
          }],
          isError: true,
        };
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOLS ML — Base de datos, clasificador, optimizer
  // ═══════════════════════════════════════════════════════════════════════════

  server.tool(
    'ml_db_query',
    `Consulta la base de datos del ML optimizer. Permite ver intentos, errores, patches y seguimiento.`,
    {
      table: z.enum(['intentos', 'errores', 'patches', 'ml-seguimiento']).describe('Tabla a consultar'),
      limit: z.number().optional().describe('Máximo de registros (default: 50)'),
    },
    async ({ table, limit }) => {
      try {
        const { isDbConfigured, getAllErrors, getPendientes, getIntentos, getPatches } = await import('./ml/db-client.js');
        if (!isDbConfigured()) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'error', message: 'DB no configurada. Usa ml_db_configure primero con clientId y clientSecret.' }) }], isError: true };
        }
        let data: unknown[];
        switch (table) {
          case 'intentos': data = await getIntentos(); break;
          case 'errores': data = await getAllErrors(); break;
          case 'patches': data = await getPatches(); break;
          case 'ml-seguimiento': data = await getPendientes(); break;
          default: data = [];
        }
        const rows = Array.isArray(data) ? data.slice(0, limit ?? 50) : [data];
        return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'success', table, count: rows.length, rows }, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'error', message: error instanceof Error ? error.message : String(error) }) }], isError: true };
      }
    },
  );

  server.tool(
    'ml_db_status',
    `Muestra el resumen del estado del ML: errores pendientes, patches aplicados, tasa de éxito.`,
    {},
    async () => {
      try {
        const { isDbConfigured, getResumen, getPendientes } = await import('./ml/db-client.js');
        if (!isDbConfigured()) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'not_configured', message: 'DB no configurada. Usa ml_db_configure primero.' }) }] };
        }
        const [resumen, pendientes] = await Promise.all([getResumen(), getPendientes()]);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'success', resumen, pendientesCount: pendientes.length, pendientes: pendientes.slice(0, 10) }, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'error', message: error instanceof Error ? error.message : String(error) }) }], isError: true };
      }
    },
  );

  server.tool(
    'ml_db_configure',
    `Configura la conexión a la base de datos del ML optimizer.`,
    {
      clientId: z.string().describe('Client ID para autenticación'),
      clientSecret: z.string().describe('Client Secret para autenticación'),
    },
    async ({ clientId, clientSecret }) => {
      const { configureDb } = await import('./ml/db-client.js');
      configureDb({ clientId, clientSecret });
      return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'success', message: 'DB configurada correctamente.' }) }] };
    },
  );

  server.tool(
    'ml_classify_error',
    `Clasifica un error de compilación TypeScript/Angular y determina qué capa del MCP necesita ser parcheada.`,
    {
      errorCode: z.string().describe('Código de error (ej: TS2663, NG8001)'),
      errorMessage: z.string().optional().describe('Mensaje del error'),
    },
    async ({ errorCode, errorMessage }) => {
      const { classify } = await import('./ml/classifier.js');
      const result = classify(errorCode, errorMessage ?? '');
      return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'success', ...result }, null, 2) }] };
    },
  );

  server.tool(
    'ml_optimize',
    `Ejecuta el ciclo ML optimizer: transforma React→Angular, compila, detecta errores, parchea el MCP automáticamente, y repite hasta que compile. Guarda todo en la base de datos.`,
    {
      mcpRoot: z.string().describe('Ruta raíz del proyecto MCP (donde está src/ y dist/)'),
      reactSource: z.string().describe('Ruta al proyecto React fuente'),
      angularOutput: z.string().describe('Ruta donde se genera el proyecto Angular'),
      moduleName: z.string().describe('Nombre del módulo Angular'),
      maxIterations: z.number().optional().describe('Máximo de iteraciones (default: 5)'),
      dbClientId: z.string().describe('Client ID para la base de datos'),
      dbClientSecret: z.string().describe('Client Secret para la base de datos'),
    },
    async (args) => {
      try {
        const { runOptimizer } = await import('./ml/optimizer.js');
        const llmConfig = process.env['GEMINI_API_KEY']
          ? { url: 'https://generativelanguage.googleapis.com/v1beta/models', model: 'gemini-2.0-flash', apiKey: process.env['GEMINI_API_KEY'], type: 'gemini' as const }
          : undefined;
        const result = await runOptimizer({
          mcpRoot: args.mcpRoot,
          reactSource: args.reactSource,
          angularOutput: args.angularOutput,
          moduleName: args.moduleName,
          maxIterations: args.maxIterations,
          db: { clientId: args.dbClientId, clientSecret: args.dbClientSecret },
          llm: llmConfig,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: !result.success };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'error', message: error instanceof Error ? error.message : String(error) }) }], isError: true };
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PROMPTS DE ORQUESTACIÓN
  // ═══════════════════════════════════════════════════════════════════════════

  server.prompt(
    'migrate_react_to_angular',
    `Prompt de orquestación para migrar un componente React completo a Angular CLS.`,
    {
      sourceCode: z.string().describe('Código React a migrar'),
      moduleName: z.string().describe('Nombre del módulo destino'),
    },
    ({ sourceCode, moduleName }) => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Migra el siguiente componente React a Angular CLS.

## Reglas de Migración
- useState → signal(), useMemo → computed(), useCallback → método, useRef → viewChild()
- useEffect(fn, []) → ngOnInit(), useEffect con deps → effect() en constructor
- Props entrada → input(), Callbacks props → output()
- Standalone Components, OnPush, archivos separados, kebab-case, prohibido 'any'

## Pasos
1. Usa analyze_react_component para descomponer el código
2. Usa map_to_angular_standalone para generar el componente Angular
3. Usa inject_cls_theme para aplicar el tema CLS
4. Usa generate_api_services si hay llamadas API

## Código React:
\`\`\`tsx
${sourceCode}
\`\`\`

Módulo destino: ${moduleName}`,
        },
      }],
    }),
  );

  server.prompt(
    'run_full_pipeline',
    `Prompt de orquestación para ejecutar el pipeline completo de migración.`,
    {
      sourceOwner: z.string(), sourceRepo: z.string(), sourceBranch: z.string(),
      destOwner: z.string(), destRepo: z.string(), destBranch: z.string(),
      moduleName: z.string(),
    },
    (params) => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Ejecuta el pipeline completo de migración React → Angular CLS.

## Configuración
- Repo origen: ${params.sourceOwner}/${params.sourceRepo}@${params.sourceBranch}
- Repo destino: ${params.destOwner}/${params.destRepo}@${params.destBranch}
- Módulo: ${params.moduleName}

## Instrucciones
1. Usa validate_pipeline_config para verificar acceso a ambos repos
2. Si pasa, ejecuta run_migration_pipeline con strictMode=true
3. Si falla, reporta exactamente qué falló y por qué`,
        },
      }],
    }),
  );

  return server;
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
