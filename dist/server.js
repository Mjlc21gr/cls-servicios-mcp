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
import { injectClsThemeToScss, injectClsThemeToHtml, generateClsThemeVariables, } from './generators/theme-injector.generator.js';
import { convertToPrimeNg, generatePrimeNgImports, generateSbPrimeNgTheme, } from './generators/primeng-mapper.generator.js';
import { PipelineEngine } from './pipeline/pipeline-engine.js';
import { DEFAULT_PIPELINE_RULES } from './models/pipeline.model.js';
import { toKebabCase, buildModulePaths, toPascalCase } from './utils/naming.utils.js';
import { buildSourceRepoConfig, buildDestRepoConfig, getEnvBool, getEnvNumber, getEnvStatus, ENV_KEYS, } from './utils/env.utils.js';
// --- Pipeline completo de proyecto ---
import { migrateFullProject } from './pipeline/project-orchestrator.js';
// --- Apps Script → Angular ---
import { analyzeAppScript } from './analyzers/appscript.analyzer.js';
import { generateAngularFromAppScript } from './generators/appscript-component.generator.js';
import { generateServiceFromAppScript } from './generators/appscript-service.generator.js';
// --- Apps Script API Client (GCP Service Account) ---
import { readAppScriptProject, projectToFileMap } from './google/appscript-client.js';
// --- Detector inteligente de fuente ---
import { detectSourceType, detectFromFileMap, isScriptId } from './pipeline/source-detector.js';
// --- Project scaffolder (para generar proyecto Angular completo) ---
import { scaffoldProject } from './pipeline/project-scaffolder.js';
// ---------------------------------------------------------------------------
// Zod Schemas – Pipeline original
// ---------------------------------------------------------------------------
export const convertSchema = {
    sourceCode: z.string(),
};
export const shellSchema = {
    appName: z.string(),
    remotes: z.array(z.object({
        name: z.string(),
        path: z.string(),
        remoteEntry: z.string(),
        exposedModule: z.string(),
    })),
};
export const moduleSchema = {
    moduleName: z.string(),
    components: z.array(z.object({
        name: z.string(),
        path: z.string(),
    })),
};
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const REQUEST_TIMEOUT_MS = 30_000;
// ---------------------------------------------------------------------------
// Error formatting helper
// ---------------------------------------------------------------------------
function mcpError(type, message, details) {
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    success: false,
                    error: { type, message, ...(details ? { details } : {}) },
                }),
            },
        ],
        isError: true,
    };
}
// ---------------------------------------------------------------------------
// Tool handlers – Pipeline original (exported for testing)
// ---------------------------------------------------------------------------
export async function convertHandler(args) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const result = await Promise.race([
            runConvertPipeline(args.sourceCode),
            new Promise((_resolve, reject) => {
                controller.signal.addEventListener('abort', () => reject(new Error('TIMEOUT')));
            }),
        ]);
        return result;
    }
    catch (err) {
        return handlePipelineError(err);
    }
    finally {
        clearTimeout(timer);
    }
}
async function runConvertPipeline(sourceCode) {
    const validation = validateInput(sourceCode);
    if (!validation.isValid) {
        const firstError = validation.errors[0];
        return mcpError(firstError.type === 'security' ? 'security_error' : firstError.type + '_error', firstError.message, firstError.line != null ? { line: firstError.line } : undefined);
    }
    const ir = parseReactComponent(validation.sanitizedCode ?? sourceCode);
    const irWithState = mapStateToAngular(ir);
    const irWithTemplate = generateAngularTemplate(irWithState);
    const irWithPrimeNG = mapToPrimeNG(irWithTemplate);
    const artifact = emitAngularArtifact(irWithPrimeNG);
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({ success: true, artifact, securityWarnings: artifact.securityWarnings }),
            },
        ],
    };
}
export async function shellHandler(args) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const result = await Promise.race([
            Promise.resolve().then(() => {
                const artifact = generateShellApp({ appName: args.appName, remotes: args.remotes });
                return { content: [{ type: 'text', text: JSON.stringify({ success: true, artifact }) }] };
            }),
            new Promise((_resolve, reject) => {
                controller.signal.addEventListener('abort', () => reject(new Error('TIMEOUT')));
            }),
        ]);
        return result;
    }
    catch (err) {
        return handlePipelineError(err);
    }
    finally {
        clearTimeout(timer);
    }
}
export async function moduleHandler(args) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const result = await Promise.race([
            Promise.resolve().then(() => {
                const artifact = generateRemoteApp({ moduleName: args.moduleName, components: args.components });
                return { content: [{ type: 'text', text: JSON.stringify({ success: true, artifact }) }] };
            }),
            new Promise((_resolve, reject) => {
                controller.signal.addEventListener('abort', () => reject(new Error('TIMEOUT')));
            }),
        ]);
        return result;
    }
    catch (err) {
        return handlePipelineError(err);
    }
    finally {
        clearTimeout(timer);
    }
}
// ---------------------------------------------------------------------------
// Shared error handler
// ---------------------------------------------------------------------------
function handlePipelineError(err) {
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
function buildMigrationNotes(analysis) {
    const notes = [];
    if (analysis.stateHooks.length > 0)
        notes.push(`${analysis.stateHooks.length} useState → signal()`);
    for (const eff of analysis.effects) {
        if (eff.isOnMount && !eff.hasCleanup)
            notes.push('useEffect(fn, []) → ngOnInit()');
        else if (eff.isOnMount && eff.hasCleanup)
            notes.push('useEffect(fn + cleanup, []) → ngOnInit() + ngOnDestroy()');
        else if (eff.dependencies.length > 0)
            notes.push(`useEffect con deps → effect() en constructor`);
        else
            notes.push('useEffect sin deps → effect()');
    }
    if (analysis.memos.length > 0)
        notes.push(`${analysis.memos.length} useMemo → computed()`);
    if (analysis.contexts.length > 0)
        notes.push(`${analysis.contexts.length} useContext → inject()`);
    if (analysis.customHooks.length > 0)
        notes.push(`Custom hooks: ${analysis.customHooks.join(', ')}`);
    if (analysis.uiLibraries.length > 0)
        notes.push(`UI Libraries: ${analysis.uiLibraries.map((u) => u.library).join(', ')}`);
    return notes;
}
// ---------------------------------------------------------------------------
// Server factory – Registra TODAS las tools (pipeline + flujo CLS)
// ---------------------------------------------------------------------------
export function createServer() {
    const server = new McpServer({
        name: 'cls-front-migrate',
        version: '1.0.0',
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // TOOLS DEL PIPELINE ORIGINAL
    // ═══════════════════════════════════════════════════════════════════════════
    server.tool('convert_react_to_angular', 'Converts React JSX/TSX source code to Angular 19+ standalone component with PrimeNG and Tailwind CSS', convertSchema, async (args) => convertHandler(args));
    server.tool('generate_microfrontend_shell', 'Generates an Angular Shell application with Native Federation for micro frontends', shellSchema, async (args) => shellHandler(args));
    server.tool('generate_angular_module', 'Generates an Angular Remote application with Native Federation exposing specified components', moduleSchema, async (args) => moduleHandler(args));
    // ═══════════════════════════════════════════════════════════════════════════
    // TOOLS DEL FLUJO CLS
    // ═══════════════════════════════════════════════════════════════════════════
    // --- Tool: analyze_react_component ---
    server.tool('analyze_react_component', `Analiza un componente React (JSX/TSX) y extrae su estructura completa:
    - Estado (useState) → Signals
    - Efectos (useEffect) → ngOnInit/effect()
    - Props → input()/output()
    - Callbacks, Memos, Refs, Librerías UI, Template JSX`, {
        sourceCode: z.string().describe('Código fuente completo del componente React (.tsx/.jsx)'),
        fileName: z.string().describe('Nombre del archivo (ej: UserProfile.tsx)'),
    }, async ({ sourceCode, fileName }) => {
        try {
            const analysis = analyzeReactComponent(sourceCode, fileName);
            return {
                content: [{
                        type: 'text',
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
        }
        catch (error) {
            return {
                content: [{ type: 'text', text: JSON.stringify({ status: 'error', message: `Error al analizar componente: ${error instanceof Error ? error.message : String(error)}` }) }],
                isError: true,
            };
        }
    });
    // --- Tool: map_to_angular_standalone ---
    server.tool('map_to_angular_standalone', `Convierte un componente React analizado a Angular Standalone Component CLS.
    Genera: .component.ts, .component.html, .component.scss, .component.spec.ts
    Reglas: useState→signal(), useEffect→ngOnInit/effect(), useMemo→computed(), OnPush, standalone`, {
        sourceCode: z.string().describe('Código fuente del componente React'),
        fileName: z.string().describe('Nombre del archivo React'),
        moduleName: z.string().describe('Nombre del módulo/feature CLS destino'),
    }, async ({ sourceCode, fileName, moduleName }) => {
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
                        type: 'text',
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
        }
        catch (error) {
            return {
                content: [{ type: 'text', text: JSON.stringify({ status: 'error', message: `Error en conversión: ${error instanceof Error ? error.message : String(error)}` }) }],
                isError: true,
            };
        }
    });
    // --- Tool: inject_cls_theme ---
    server.tool('inject_cls_theme', `Sustituye estilos genéricos del prototipo React por el Sistema de Diseño CLS.
    Reemplaza colores hardcoded por variables CSS (--cls-*), convierte MUI/Tailwind a clases CLS.`, {
        html: z.string().describe('Template HTML/Angular a tematizar'),
        scss: z.string().describe('Estilos SCSS a tematizar'),
        uiLibraries: z.array(z.string()).describe('Librerías UI detectadas'),
        generateThemeFile: z.boolean().optional().describe('Si true, genera archivo de variables CSS del tema CLS'),
    }, async ({ html, scss, uiLibraries, generateThemeFile }) => {
        const themedHtml = injectClsThemeToHtml(html, uiLibraries);
        const themedScss = injectClsThemeToScss(scss);
        const result = {
            status: 'success', themedHtml, themedScss,
            replacements: { htmlChanges: html !== themedHtml, scssChanges: scss !== themedScss },
        };
        if (generateThemeFile) {
            result['themeVariables'] = generateClsThemeVariables();
            result['themeFilePath'] = 'src/styles/_cls-theme-variables.scss';
        }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    });
    // --- Tool: generate_api_services ---
    server.tool('generate_api_services', `Genera servicios Angular (.service.ts) a partir de llamadas API detectadas en el componente React.
    Usa HttpClient con inject(), base URL: /servicios-core/api/v1/, prohibido 'any'.`, {
        sourceCode: z.string().describe('Código fuente del componente React con llamadas API'),
        fileName: z.string().describe('Nombre del archivo React'),
        moduleName: z.string().describe('Nombre del módulo CLS destino'),
    }, async ({ sourceCode, fileName, moduleName }) => {
        try {
            const analysis = analyzeReactComponent(sourceCode, fileName);
            const serviceResult = generateServiceFromAnalysis(analysis, moduleName);
            if (!serviceResult) {
                return { content: [{ type: 'text', text: JSON.stringify({ status: 'info', message: 'No se detectaron llamadas API en el componente.' }) }] };
            }
            const paths = buildModulePaths(moduleName);
            const kebabName = toKebabCase(moduleName);
            const outputFiles = {
                [`${paths.services}/${kebabName}.service.ts`]: serviceResult.serviceCode,
                [`${paths.services}/${kebabName}.service.spec.ts`]: serviceResult.serviceSpec,
                [`${paths.models}/${kebabName}.model.ts`]: serviceResult.modelCode,
            };
            return { content: [{ type: 'text', text: JSON.stringify({ status: 'success', serviceName: `${moduleName}Service`, baseUrl: '/servicios-core/api/v1', outputFiles }, null, 2) }] };
        }
        catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({ status: 'error', message: `Error generando servicio: ${error instanceof Error ? error.message : String(error)}` }) }], isError: true };
        }
    });
    // --- Tool: inject_primeng_ui ---
    server.tool('inject_primeng_ui', `Convierte componentes de UI del prototipo React a PrimeNG con tema Seguros Bolívar.
    MUI → PrimeNG equivalente, genera imports, aplica clases SB, valida accesibilidad.`, {
        html: z.string().describe('Template HTML a convertir'),
        uiLibraries: z.array(z.string()).describe('Librerías UI detectadas'),
        generateThemeFile: z.boolean().optional().describe('Si true, genera SCSS del tema Seguros Bolívar'),
    }, async ({ html, uiLibraries, generateThemeFile }) => {
        const result = convertToPrimeNg(html, uiLibraries);
        const output = {
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
        return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
    });
    // --- Tool: run_migration_pipeline ---
    server.tool('run_migration_pipeline', `Ejecuta el pipeline completo de migración React → Angular CLS con gates de validación.
    Flujo: github_pull → analyze → validate → map_to_angular → primeng → cls_theme → services → validate_output → lint → tests → github_push`, {
        moduleName: z.string().describe('Nombre del módulo/feature CLS'),
        sourceOwner: z.string().optional(), sourceRepo: z.string().optional(),
        sourceBranch: z.string().optional(), sourceToken: z.string().optional(),
        sourceBasePath: z.string().optional(),
        destOwner: z.string().optional(), destRepo: z.string().optional(),
        destBranch: z.string().optional(), destToken: z.string().optional(),
        strictMode: z.boolean().optional(), dryRun: z.boolean().optional(),
        maxComplexity: z.number().optional(), requireTests: z.boolean().optional(),
    }, async (params) => {
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
            const config = {
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
                        type: 'text',
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
        }
        catch (error) {
            return {
                content: [{ type: 'text', text: JSON.stringify({ status: 'error', message: error instanceof Error ? error.message : String(error), envStatus: getEnvStatus() }, null, 2) }],
                isError: true,
            };
        }
    });
    // --- Tool: validate_pipeline_config ---
    server.tool('validate_pipeline_config', `Valida la configuración del pipeline antes de ejecutarlo. Verifica conexión a ambos repos y permisos.`, {
        sourceOwner: z.string().optional(), sourceRepo: z.string().optional(),
        sourceBranch: z.string().optional(), sourceToken: z.string().optional(),
        destOwner: z.string().optional(), destRepo: z.string().optional(),
        destBranch: z.string().optional(), destToken: z.string().optional(),
    }, async (params) => {
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
            return { content: [{ type: 'text', text: JSON.stringify(checks, null, 2) }] };
        }
        catch (error) {
            return { content: [{ type: 'text', text: JSON.stringify({ status: 'error', message: error instanceof Error ? error.message : String(error), envStatus: getEnvStatus() }, null, 2) }], isError: true };
        }
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // TOOL PRINCIPAL: MIGRACIÓN COMPLETA DE PROYECTO
    // ═══════════════════════════════════════════════════════════════════════════
    server.tool('migrate_full_project', `Migra un proyecto React completo a un proyecto Angular 20 + PrimeNG 19 listo para ejecutar.
    Escanea todos los componentes, servicios, estilos y configuración del proyecto React,
    los transforma al equivalente Angular, y genera un proyecto completo con package.json,
    angular.json, tsconfig.json, rutas, tema Seguros Bolívar, y todos los archivos necesarios.
    El proyecto generado está listo para npm install && ng serve sin intervención manual.`, {
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
    }, async (args) => {
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
                        type: 'text',
                        text: JSON.stringify(summary, null, 2),
                    }],
                isError: result.status === 'error',
            };
        }
        catch (error) {
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            status: 'error',
                            message: error instanceof Error ? error.message : String(error),
                        }),
                    }],
                isError: true,
            };
        }
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // TOOLS DE APPS SCRIPT → ANGULAR
    // ═══════════════════════════════════════════════════════════════════════════
    // --- Tool: analyze_appscript ---
    server.tool('analyze_appscript', `Analiza un proyecto Google Apps Script y extrae su estructura completa:
    - Funciones globales (doGet, doPost, onOpen, onEdit, etc.)
    - Llamadas google.script.run (client → server)
    - Servicios Google (SpreadsheetApp, DriveApp, etc.)
    - HTML templates (HtmlService) con scriptlets
    - PropertiesService (estado persistente)
    - UrlFetchApp (llamadas HTTP externas)
    - Formularios HTML y elementos de UI`, {
        files: z.record(z.string(), z.string()).describe('Map de fileName → sourceCode (ej: {"Code.gs": "function doGet()...", "Index.html": "<html>..."})'),
        projectName: z.string().describe('Nombre del proyecto Apps Script'),
    }, async ({ files, projectName }) => {
        try {
            const analysis = analyzeAppScript(files, projectName);
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            status: 'success',
                            analysis,
                            summary: {
                                project: analysis.projectName,
                                totalFiles: analysis.files.length,
                                totalFunctions: analysis.totalFunctions,
                                entryPoints: analysis.entryPoints.map((e) => e.name),
                                serverCallable: analysis.serverCallableFunctions.map((f) => f.name),
                                googleServices: [...new Set(analysis.googleServiceCalls.map((c) => c.service))],
                                htmlTemplates: analysis.htmlTemplates.map((t) => t.fileName),
                                externalApiCalls: analysis.externalApiCalls.length,
                                propertyKeys: [...new Set(analysis.propertyAccesses.map((p) => p.key))],
                                migrationNotes: analysis.migrationNotes,
                            },
                        }, null, 2),
                    }],
            };
        }
        catch (error) {
            return {
                content: [{ type: 'text', text: JSON.stringify({ status: 'error', message: `Error al analizar Apps Script: ${error instanceof Error ? error.message : String(error)}` }) }],
                isError: true,
            };
        }
    });
    // --- Tool: convert_appscript_to_angular ---
    server.tool('convert_appscript_to_angular', `Convierte un proyecto Apps Script analizado a componentes Angular Standalone CLS.
    Genera: .component.ts, .component.html, .component.scss, .component.spec.ts por cada HTML template.
    Mapeos: google.script.run → HttpClient service, scriptlets → interpolación Angular,
    formularios HTML → PrimeNG + Reactive Forms, PropertiesService → localStorage/backend.`, {
        files: z.record(z.string(), z.string()).describe('Map de fileName → sourceCode del proyecto Apps Script'),
        projectName: z.string().describe('Nombre del proyecto Apps Script'),
        moduleName: z.string().describe('Nombre del módulo/feature CLS destino'),
    }, async ({ files, projectName, moduleName }) => {
        try {
            const analysis = analyzeAppScript(files, projectName);
            const components = generateAngularFromAppScript(analysis, moduleName);
            const paths = buildModulePaths(moduleName);
            const outputFiles = {};
            for (const [compName, compFiles] of Object.entries(components)) {
                const kebabName = toKebabCase(compName);
                const basePath = `${paths.components}/${kebabName}`;
                outputFiles[`${basePath}/${kebabName}.component.ts`] = compFiles.componentTs;
                outputFiles[`${basePath}/${kebabName}.component.html`] = compFiles.componentHtml;
                outputFiles[`${basePath}/${kebabName}.component.scss`] = compFiles.componentScss;
                outputFiles[`${basePath}/${kebabName}.component.spec.ts`] = compFiles.componentSpec;
            }
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            status: 'success',
                            componentsGenerated: Object.keys(components),
                            outputPath: paths.components,
                            files: outputFiles,
                            conversionLog: {
                                htmlTemplatesMigrated: analysis.htmlTemplates.length,
                                scriptRunCallsMigrated: analysis.htmlTemplates.reduce((sum, t) => sum + t.scriptRunCalls.length, 0),
                                formElementsMigrated: analysis.htmlTemplates.reduce((sum, t) => sum + t.formElements.length, 0),
                            },
                        }, null, 2),
                    }],
            };
        }
        catch (error) {
            return {
                content: [{ type: 'text', text: JSON.stringify({ status: 'error', message: `Error en conversión Apps Script: ${error instanceof Error ? error.message : String(error)}` }) }],
                isError: true,
            };
        }
    });
    // --- Tool: generate_appscript_services ---
    server.tool('generate_appscript_services', `Genera servicios Angular (.service.ts) a partir de funciones server-side de Apps Script.
    Convierte google.script.run → HttpClient, UrlFetchApp → HttpClient, PropertiesService → localStorage.
    Usa inject(), base URL: /servicios-core/api/v1/, prohibido 'any'.`, {
        files: z.record(z.string(), z.string()).describe('Map de fileName → sourceCode del proyecto Apps Script'),
        projectName: z.string().describe('Nombre del proyecto Apps Script'),
        moduleName: z.string().describe('Nombre del módulo CLS destino'),
    }, async ({ files, projectName, moduleName }) => {
        try {
            const analysis = analyzeAppScript(files, projectName);
            const serviceResult = generateServiceFromAppScript(analysis, moduleName);
            if (!serviceResult) {
                return { content: [{ type: 'text', text: JSON.stringify({ status: 'info', message: 'No se detectaron funciones server-side, llamadas externas ni PropertiesService.' }) }] };
            }
            const paths = buildModulePaths(moduleName);
            const kebabName = toKebabCase(moduleName);
            const outputFiles = {
                [`${paths.services}/${kebabName}.service.ts`]: serviceResult.serviceCode,
                [`${paths.services}/${kebabName}.service.spec.ts`]: serviceResult.serviceSpec,
                [`${paths.models}/${kebabName}.model.ts`]: serviceResult.modelCode,
            };
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            status: 'success',
                            serviceName: `${toPascalCase(moduleName)}Service`,
                            baseUrl: '/servicios-core/api/v1',
                            outputFiles,
                            migrationLog: {
                                serverCallableMethods: analysis.serverCallableFunctions.length,
                                externalApiMethods: analysis.externalApiCalls.length,
                                propertyMethods: [...new Set(analysis.propertyAccesses.map((p) => p.key))].length,
                            },
                        }, null, 2),
                    }],
            };
        }
        catch (error) {
            return {
                content: [{ type: 'text', text: JSON.stringify({ status: 'error', message: `Error generando servicio: ${error instanceof Error ? error.message : String(error)}` }) }],
                isError: true,
            };
        }
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // TOOL: LEER APPS SCRIPT DESDE GCP (Service Account)
    // ═══════════════════════════════════════════════════════════════════════════
    server.tool('read_appscript_from_gcp', `Lee un proyecto Google Apps Script completo usando una cuenta de servicio de GCP.
    Requiere: Apps Script API habilitada, script compartido con la cuenta de servicio.
    Credenciales via env: GOOGLE_SERVICE_ACCOUNT_KEY (JSON string) o GOOGLE_SERVICE_ACCOUNT_JSON (ruta archivo).
    Retorna todos los archivos (.gs, .html, .json) listos para analizar o convertir.`, {
        scriptId: z.string().describe('ID del proyecto Apps Script (ej: 18hR_xREcu3r4YNWkZqCDDTBtnHsXg4Ri_02cjVbzjIjTlmQ7DQrKw-KH)'),
    }, async ({ scriptId }) => {
        try {
            const project = await readAppScriptProject(scriptId);
            const fileMap = projectToFileMap(project);
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            status: 'success',
                            project: {
                                scriptId: project.scriptId,
                                title: project.title,
                                totalFiles: project.files.length,
                                files: project.files.map((f) => ({
                                    name: f.name,
                                    type: f.type,
                                    lines: f.source.split('\n').length,
                                })),
                            },
                            fileMap,
                        }, null, 2),
                    }],
            };
        }
        catch (error) {
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            status: 'error',
                            message: error instanceof Error ? error.message : String(error),
                            hint: 'Verifica: 1) Apps Script API habilitada en GCP, 2) Script compartido con la cuenta de servicio, 3) GOOGLE_SERVICE_ACCOUNT_KEY definida en env del MCP',
                        }),
                    }],
                isError: true,
            };
        }
    });
    // --- Tool: migrate_appscript_from_gcp ---
    server.tool('migrate_appscript_from_gcp', `Lee un proyecto Apps Script desde GCP por script ID y lo migra completo a Angular CLS.
    Combina read_appscript_from_gcp + analyze + convert + generate services en un solo paso.
    Requiere: GOOGLE_SERVICE_ACCOUNT_KEY en env del MCP.`, {
        scriptId: z.string().describe('ID del proyecto Apps Script'),
        moduleName: z.string().describe('Nombre del módulo/feature CLS destino'),
    }, async ({ scriptId, moduleName }) => {
        try {
            // 1. Leer proyecto desde GCP
            const project = await readAppScriptProject(scriptId);
            const fileMap = projectToFileMap(project);
            // 2. Analizar
            const analysis = analyzeAppScript(fileMap, project.title);
            // 3. Generar componentes Angular
            const components = generateAngularFromAppScript(analysis, moduleName);
            const paths = buildModulePaths(moduleName);
            const outputFiles = {};
            for (const [compName, compFiles] of Object.entries(components)) {
                const kebabName = toKebabCase(compName);
                const basePath = `${paths.components}/${kebabName}`;
                outputFiles[`${basePath}/${kebabName}.component.ts`] = compFiles.componentTs;
                outputFiles[`${basePath}/${kebabName}.component.html`] = compFiles.componentHtml;
                outputFiles[`${basePath}/${kebabName}.component.scss`] = compFiles.componentScss;
                outputFiles[`${basePath}/${kebabName}.component.spec.ts`] = compFiles.componentSpec;
            }
            // 4. Generar servicios
            const serviceResult = generateServiceFromAppScript(analysis, moduleName);
            if (serviceResult) {
                const kebabName = toKebabCase(moduleName);
                outputFiles[`${paths.services}/${kebabName}.service.ts`] = serviceResult.serviceCode;
                outputFiles[`${paths.services}/${kebabName}.service.spec.ts`] = serviceResult.serviceSpec;
                outputFiles[`${paths.models}/${kebabName}.model.ts`] = serviceResult.modelCode;
            }
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            status: 'success',
                            source: {
                                scriptId: project.scriptId,
                                title: project.title,
                                filesRead: project.files.length,
                            },
                            analysis: {
                                totalFunctions: analysis.totalFunctions,
                                entryPoints: analysis.entryPoints.map((e) => e.name),
                                htmlTemplates: analysis.htmlTemplates.length,
                                googleServices: [...new Set(analysis.googleServiceCalls.map((c) => c.service))],
                                migrationNotes: analysis.migrationNotes,
                            },
                            output: {
                                componentsGenerated: Object.keys(components),
                                hasService: !!serviceResult,
                                totalFiles: Object.keys(outputFiles).length,
                            },
                            files: outputFiles,
                        }, null, 2),
                    }],
            };
        }
        catch (error) {
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            status: 'error',
                            message: error instanceof Error ? error.message : String(error),
                            hint: 'Verifica: 1) Apps Script API habilitada, 2) Script compartido con la cuenta de servicio, 3) GOOGLE_SERVICE_ACCOUNT_KEY en env',
                        }),
                    }],
                isError: true,
            };
        }
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // TOOL: MIGRACIÓN COMPLETA APPS SCRIPT → PROYECTO ANGULAR
    // ═══════════════════════════════════════════════════════════════════════════
    server.tool('migrate_appscript_full_project', `Migra un proyecto Apps Script completo a un proyecto Angular 20 + PrimeNG 19 listo para ejecutar.
    Lee desde GCP usando cuenta de servicio, analiza, convierte, y genera un proyecto completo con:
    package.json, angular.json, tsconfig.json, rutas, tema Seguros Bolívar, componentes, servicios, y todos los archivos necesarios.
    El proyecto generado está listo para npm install && ng serve sin intervención manual.
    Requiere: GOOGLE_SERVICE_ACCOUNT_KEY en env del MCP.`, {
        scriptId: z.string().describe('ID del proyecto Apps Script en GCP'),
        moduleName: z.string().describe('Nombre del módulo/feature Angular'),
        outputDir: z.string().describe('Ruta para el proyecto Angular de salida'),
        options: z.object({
            angularVersion: z.string().optional().describe('Versión de Angular (default: 20)'),
            primeNgVersion: z.string().optional().describe('Versión de PrimeNG (default: 19)'),
            strictMode: z.boolean().optional().describe('Modo estricto (default: true)'),
            baseApiUrl: z.string().optional().describe('URL base de API (default: /servicios-core/api/v1/)'),
        }).optional(),
    }, async ({ scriptId, moduleName, outputDir, options }) => {
        try {
            const startTime = Date.now();
            // 1. Leer proyecto desde GCP
            const project = await readAppScriptProject(scriptId);
            const fileMap = projectToFileMap(project);
            // 2. Analizar
            const analysis = analyzeAppScript(fileMap, project.title);
            // 3. Generar componentes Angular
            const components = generateAngularFromAppScript(analysis, moduleName);
            const paths = buildModulePaths(moduleName);
            const moduleKebab = toKebabCase(moduleName);
            // 4. Generar servicios
            const serviceResult = generateServiceFromAppScript(analysis, moduleName);
            // 5. Scaffold del proyecto completo
            const componentNames = Object.keys(components);
            const scaffold = scaffoldProject(moduleName, componentNames, options);
            // 6. Ensamblar todos los archivos
            const allFiles = {};
            // Archivos de scaffold (package.json, angular.json, etc.)
            for (const [filePath, content] of scaffold.files) {
                allFiles[filePath] = content;
            }
            // Componentes
            for (const [compName, compFiles] of Object.entries(components)) {
                const kebabName = toKebabCase(compName);
                const compDir = `src/app/features/${moduleKebab}/components/${kebabName}`;
                allFiles[`${compDir}/${kebabName}.component.ts`] = compFiles.componentTs;
                allFiles[`${compDir}/${kebabName}.component.html`] = compFiles.componentHtml;
                allFiles[`${compDir}/${kebabName}.component.scss`] = compFiles.componentScss;
                allFiles[`${compDir}/${kebabName}.component.spec.ts`] = compFiles.componentSpec;
            }
            // Servicios
            if (serviceResult) {
                const kebabName = toKebabCase(moduleName);
                allFiles[`${paths.services}/${kebabName}.service.ts`] = serviceResult.serviceCode;
                allFiles[`${paths.services}/${kebabName}.service.spec.ts`] = serviceResult.serviceSpec;
                allFiles[`${paths.models}/${kebabName}.model.ts`] = serviceResult.modelCode;
            }
            // Rutas (lazy loading por componente)
            const routeEntries = componentNames.map((name) => {
                const kebab = toKebabCase(name);
                return `  {\n    path: '${kebab}',\n    loadComponent: () => import('./features/${moduleKebab}/components/${kebab}/${kebab}.component').then(m => m.${name}Component),\n  }`;
            });
            const defaultRoute = componentNames.length > 0
                ? `  { path: '', redirectTo: '${toKebabCase(componentNames[0])}', pathMatch: 'full' }`
                : `  { path: '', redirectTo: '', pathMatch: 'full' }`;
            const routesFile = `import { Routes } from '@angular/router';\n\nexport const routes: Routes = [\n${defaultRoute},\n${routeEntries.join(',\n')},\n];\n`;
            allFiles['src/app/app.routes.ts'] = routesFile;
            // Tema Seguros Bolívar
            allFiles['src/styles/_sb-primeng-theme.scss'] = `// Tema Seguros Bolívar para PrimeNG\n// Generado automáticamente desde Apps Script: ${project.title}\n\n:root {\n  --sb-primary: #0a6c45;\n  --sb-secondary: #f5a623;\n  --sb-font-family: 'Montserrat', 'Segoe UI', system-ui, sans-serif;\n  --sb-spacing-sm: 0.5rem;\n  --sb-spacing-md: 1rem;\n  --sb-spacing-lg: 1.5rem;\n  --sb-spacing-xl: 2rem;\n}\n`;
            // 7. Escribir archivos en disco
            const { mkdirSync, writeFileSync } = await import('fs');
            const { join, dirname } = await import('path');
            for (const [filePath, content] of Object.entries(allFiles)) {
                const fullPath = join(outputDir, filePath);
                mkdirSync(dirname(fullPath), { recursive: true });
                writeFileSync(fullPath, content, 'utf-8');
            }
            const duration = Date.now() - startTime;
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            status: 'success',
                            source: {
                                scriptId: project.scriptId,
                                title: project.title,
                                filesRead: project.files.length,
                            },
                            analysis: {
                                totalFunctions: analysis.totalFunctions,
                                entryPoints: analysis.entryPoints.map((e) => e.name),
                                htmlTemplates: analysis.htmlTemplates.length,
                                googleServices: [...new Set(analysis.googleServiceCalls.map((c) => c.service))],
                            },
                            output: {
                                outputDir,
                                totalFiles: Object.keys(allFiles).length,
                                componentsGenerated: componentNames,
                                hasService: !!serviceResult,
                                routesGenerated: componentNames.length,
                            },
                            migrationSummary: {
                                componentsTotal: analysis.htmlTemplates.length || 1,
                                componentsMigrated: componentNames.length,
                                servicesGenerated: serviceResult ? 1 : 0,
                                routesGenerated: componentNames.length,
                                formElementsMigrated: analysis.htmlTemplates.reduce((sum, t) => sum + t.formElements.length, 0),
                                scriptRunCallsMigrated: analysis.htmlTemplates.reduce((sum, t) => sum + t.scriptRunCalls.length, 0),
                            },
                            duration: duration + 'ms',
                            nextStep: `cd ${outputDir} && npm install && ng serve`,
                        }, null, 2),
                    }],
            };
        }
        catch (error) {
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            status: 'error',
                            message: error instanceof Error ? error.message : String(error),
                            hint: 'Verifica: 1) Apps Script API habilitada, 2) Script compartido con la cuenta de servicio, 3) GOOGLE_SERVICE_ACCOUNT_KEY en env',
                        }),
                    }],
                isError: true,
            };
        }
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // TOOL UNIFICADO: SMART MIGRATE (detección automática)
    // ═══════════════════════════════════════════════════════════════════════════
    server.tool('smart_migrate', `Tool unificado de migración a Angular CLS con detección automática del tipo de fuente.
    Detecta si el input es React, Apps Script, o un script ID de GCP y enruta al pipeline correcto.
    
    Modos de uso:
    - scriptId → Lee desde GCP con cuenta de servicio y migra Apps Script → Angular
    - sourceCode → Detecta si es React o Apps Script por patrones en el código
    - files (Record<fileName, sourceCode>) → Detecta por extensiones (.gs/.html vs .tsx/.jsx)
    
    Solo necesitas pasar UNO de los tres: scriptId, sourceCode, o files.`, {
        moduleName: z.string().describe('Nombre del módulo/feature CLS destino'),
        scriptId: z.string().optional().describe('ID del proyecto Apps Script en GCP (si se pasa, ignora sourceCode y files)'),
        sourceCode: z.string().optional().describe('Código fuente de un componente (React TSX/JSX o Apps Script .gs)'),
        fileName: z.string().optional().describe('Nombre del archivo (ayuda a la detección, ej: App.tsx o Code.gs)'),
        files: z.record(z.string(), z.string()).optional().describe('Map de fileName → sourceCode para proyectos multi-archivo'),
    }, async ({ moduleName, scriptId, sourceCode, fileName, files }) => {
        try {
            // ─── CASO 1: Script ID → GCP Apps Script ───
            if (scriptId && isScriptId(scriptId)) {
                const project = await readAppScriptProject(scriptId);
                const fileMap = projectToFileMap(project);
                const analysis = analyzeAppScript(fileMap, project.title);
                const components = generateAngularFromAppScript(analysis, moduleName);
                const paths = buildModulePaths(moduleName);
                const outputFiles = {};
                for (const [compName, compFiles] of Object.entries(components)) {
                    const kebabName = toKebabCase(compName);
                    const basePath = `${paths.components}/${kebabName}`;
                    outputFiles[`${basePath}/${kebabName}.component.ts`] = compFiles.componentTs;
                    outputFiles[`${basePath}/${kebabName}.component.html`] = compFiles.componentHtml;
                    outputFiles[`${basePath}/${kebabName}.component.scss`] = compFiles.componentScss;
                    outputFiles[`${basePath}/${kebabName}.component.spec.ts`] = compFiles.componentSpec;
                }
                const serviceResult = generateServiceFromAppScript(analysis, moduleName);
                if (serviceResult) {
                    const kebabName = toKebabCase(moduleName);
                    outputFiles[`${paths.services}/${kebabName}.service.ts`] = serviceResult.serviceCode;
                    outputFiles[`${paths.services}/${kebabName}.service.spec.ts`] = serviceResult.serviceSpec;
                    outputFiles[`${paths.models}/${kebabName}.model.ts`] = serviceResult.modelCode;
                }
                return {
                    content: [{
                            type: 'text',
                            text: JSON.stringify({
                                status: 'success',
                                detectedType: 'appscript-gcp',
                                confidence: 100,
                                signals: ['scriptId provided → GCP Apps Script API'],
                                source: { scriptId: project.scriptId, title: project.title, filesRead: project.files.length },
                                analysis: {
                                    totalFunctions: analysis.totalFunctions,
                                    entryPoints: analysis.entryPoints.map((e) => e.name),
                                    htmlTemplates: analysis.htmlTemplates.length,
                                    googleServices: [...new Set(analysis.googleServiceCalls.map((c) => c.service))],
                                    migrationNotes: analysis.migrationNotes,
                                },
                                output: {
                                    componentsGenerated: Object.keys(components),
                                    hasService: !!serviceResult,
                                    totalFiles: Object.keys(outputFiles).length,
                                },
                                files: outputFiles,
                            }, null, 2),
                        }],
                };
            }
            // ─── CASO 2: files (multi-archivo) ───
            if (files && Object.keys(files).length > 0) {
                const detection = detectFromFileMap(files);
                if (detection.type === 'appscript') {
                    const projectName = moduleName;
                    const analysis = analyzeAppScript(files, projectName);
                    const components = generateAngularFromAppScript(analysis, moduleName);
                    const paths = buildModulePaths(moduleName);
                    const outputFiles = {};
                    for (const [compName, compFiles] of Object.entries(components)) {
                        const kebabName = toKebabCase(compName);
                        const basePath = `${paths.components}/${kebabName}`;
                        outputFiles[`${basePath}/${kebabName}.component.ts`] = compFiles.componentTs;
                        outputFiles[`${basePath}/${kebabName}.component.html`] = compFiles.componentHtml;
                        outputFiles[`${basePath}/${kebabName}.component.scss`] = compFiles.componentScss;
                        outputFiles[`${basePath}/${kebabName}.component.spec.ts`] = compFiles.componentSpec;
                    }
                    const serviceResult = generateServiceFromAppScript(analysis, moduleName);
                    if (serviceResult) {
                        const kebabName = toKebabCase(moduleName);
                        outputFiles[`${paths.services}/${kebabName}.service.ts`] = serviceResult.serviceCode;
                        outputFiles[`${paths.services}/${kebabName}.service.spec.ts`] = serviceResult.serviceSpec;
                        outputFiles[`${paths.models}/${kebabName}.model.ts`] = serviceResult.modelCode;
                    }
                    return {
                        content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    status: 'success',
                                    detectedType: detection.type,
                                    confidence: detection.confidence,
                                    signals: detection.signals,
                                    output: { componentsGenerated: Object.keys(components), hasService: !!serviceResult, totalFiles: Object.keys(outputFiles).length },
                                    files: outputFiles,
                                }, null, 2),
                            }],
                    };
                }
                if (detection.type === 'react') {
                    // Para React multi-archivo, procesar cada archivo
                    const allOutputFiles = {};
                    const componentNames = [];
                    for (const [fName, fCode] of Object.entries(files)) {
                        if (!/\.(tsx|jsx)$/.test(fName))
                            continue;
                        try {
                            const analysis = analyzeReactComponent(fCode, fName);
                            const angularFiles = generateAngularComponent(analysis, moduleName);
                            const paths = buildModulePaths(moduleName);
                            const kebabName = toKebabCase(analysis.componentName);
                            allOutputFiles[`${paths.components}/${kebabName}/${kebabName}.component.ts`] = angularFiles.componentTs;
                            allOutputFiles[`${paths.components}/${kebabName}/${kebabName}.component.html`] = angularFiles.componentHtml;
                            allOutputFiles[`${paths.components}/${kebabName}/${kebabName}.component.scss`] = angularFiles.componentScss;
                            allOutputFiles[`${paths.components}/${kebabName}/${kebabName}.component.spec.ts`] = angularFiles.componentSpec;
                            componentNames.push(analysis.componentName);
                        }
                        catch {
                            // Skip archivos que no son componentes válidos
                        }
                    }
                    return {
                        content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    status: 'success',
                                    detectedType: detection.type,
                                    confidence: detection.confidence,
                                    signals: detection.signals,
                                    output: { componentsGenerated: componentNames, totalFiles: Object.keys(allOutputFiles).length },
                                    files: allOutputFiles,
                                }, null, 2),
                            }],
                    };
                }
                return {
                    content: [{ type: 'text', text: JSON.stringify({ status: 'error', detectedType: 'unknown', confidence: detection.confidence, signals: detection.signals, message: 'No se pudo determinar el tipo de fuente. Usa scriptId para Apps Script de GCP, o asegúrate de que los archivos tengan extensiones .tsx/.jsx (React) o .gs/.html (Apps Script).' }) }],
                    isError: true,
                };
            }
            // ─── CASO 3: sourceCode (archivo único) ───
            if (sourceCode) {
                // Ayuda extra del fileName si viene
                let detection = detectSourceType(sourceCode);
                if (detection.type === 'unknown' && fileName) {
                    if (/\.(tsx|jsx)$/.test(fileName)) {
                        detection = { type: 'react', confidence: 70, signals: [`fileName ${fileName} indica React`] };
                    }
                    else if (/\.(gs|gas)$/.test(fileName)) {
                        detection = { type: 'appscript', confidence: 70, signals: [`fileName ${fileName} indica Apps Script`] };
                    }
                }
                if (detection.type === 'react') {
                    const fName = fileName || 'Component.tsx';
                    const analysis = analyzeReactComponent(sourceCode, fName);
                    const angularFiles = generateAngularComponent(analysis, moduleName);
                    const paths = buildModulePaths(moduleName);
                    const kebabName = toKebabCase(analysis.componentName);
                    const outputFiles = {
                        [`${paths.components}/${kebabName}/${kebabName}.component.ts`]: angularFiles.componentTs,
                        [`${paths.components}/${kebabName}/${kebabName}.component.html`]: angularFiles.componentHtml,
                        [`${paths.components}/${kebabName}/${kebabName}.component.scss`]: angularFiles.componentScss,
                        [`${paths.components}/${kebabName}/${kebabName}.component.spec.ts`]: angularFiles.componentSpec,
                    };
                    return {
                        content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    status: 'success',
                                    detectedType: detection.type,
                                    confidence: detection.confidence,
                                    signals: detection.signals,
                                    output: { componentName: analysis.componentName, totalFiles: Object.keys(outputFiles).length },
                                    files: outputFiles,
                                }, null, 2),
                            }],
                    };
                }
                if (detection.type === 'appscript') {
                    const fName = fileName || 'Code.gs';
                    const fileMap = { [fName]: sourceCode };
                    const analysis = analyzeAppScript(fileMap, moduleName);
                    const components = generateAngularFromAppScript(analysis, moduleName);
                    const paths = buildModulePaths(moduleName);
                    const outputFiles = {};
                    for (const [compName, compFiles] of Object.entries(components)) {
                        const kName = toKebabCase(compName);
                        const basePath = `${paths.components}/${kName}`;
                        outputFiles[`${basePath}/${kName}.component.ts`] = compFiles.componentTs;
                        outputFiles[`${basePath}/${kName}.component.html`] = compFiles.componentHtml;
                        outputFiles[`${basePath}/${kName}.component.scss`] = compFiles.componentScss;
                        outputFiles[`${basePath}/${kName}.component.spec.ts`] = compFiles.componentSpec;
                    }
                    return {
                        content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    status: 'success',
                                    detectedType: detection.type,
                                    confidence: detection.confidence,
                                    signals: detection.signals,
                                    output: { componentsGenerated: Object.keys(components), totalFiles: Object.keys(outputFiles).length },
                                    files: outputFiles,
                                }, null, 2),
                            }],
                    };
                }
                // También verificar si el sourceCode es en realidad un script ID
                if (isScriptId(sourceCode.trim())) {
                    return {
                        content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    status: 'info',
                                    message: `"${sourceCode.trim()}" parece un script ID de Apps Script. Reintentando como scriptId...`,
                                    hint: 'Usa el parámetro scriptId en vez de sourceCode para leer desde GCP.',
                                }),
                            }],
                    };
                }
                return {
                    content: [{ type: 'text', text: JSON.stringify({ status: 'error', detectedType: 'unknown', confidence: detection.confidence, signals: detection.signals, message: 'No se pudo determinar si el código es React o Apps Script. Incluye el fileName para ayudar a la detección.' }) }],
                    isError: true,
                };
            }
            // ─── Ningún input proporcionado ───
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            status: 'error',
                            message: 'Debes proporcionar al menos uno: scriptId (para leer desde GCP), sourceCode (código de un archivo), o files (mapa de archivos).',
                            examples: {
                                gcp: '{ "scriptId": "18hR_xREcu...", "moduleName": "mi-modulo" }',
                                react: '{ "sourceCode": "import React...", "moduleName": "mi-modulo" }',
                                appscript: '{ "files": {"Code.gs": "function doGet()..."}, "moduleName": "mi-modulo" }',
                            },
                        }),
                    }],
                isError: true,
            };
        }
        catch (error) {
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            status: 'error',
                            message: error instanceof Error ? error.message : String(error),
                        }),
                    }],
                isError: true,
            };
        }
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // PROMPTS DE ORQUESTACIÓN
    // ═══════════════════════════════════════════════════════════════════════════
    server.prompt('migrate_react_to_angular', `Prompt de orquestación para migrar un componente React completo a Angular CLS.`, {
        sourceCode: z.string().describe('Código React a migrar'),
        moduleName: z.string().describe('Nombre del módulo destino'),
    }, ({ sourceCode, moduleName }) => ({
        messages: [{
                role: 'user',
                content: {
                    type: 'text',
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
    }));
    server.prompt('run_full_pipeline', `Prompt de orquestación para ejecutar el pipeline completo de migración.`, {
        sourceOwner: z.string(), sourceRepo: z.string(), sourceBranch: z.string(),
        destOwner: z.string(), destRepo: z.string(), destBranch: z.string(),
        moduleName: z.string(),
    }, (params) => ({
        messages: [{
                role: 'user',
                content: {
                    type: 'text',
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
    }));
    server.prompt('migrate_appscript_to_angular', `Prompt de orquestación para migrar un proyecto Apps Script completo a Angular CLS.`, {
        projectName: z.string().describe('Nombre del proyecto Apps Script'),
        moduleName: z.string().describe('Nombre del módulo destino'),
    }, ({ projectName, moduleName }) => ({
        messages: [{
                role: 'user',
                content: {
                    type: 'text',
                    text: `Migra el proyecto Apps Script "${projectName}" a Angular CLS.

## Reglas de Migración Apps Script → Angular
- google.script.run.fn() → HttpClient.post() en un servicio Angular
- HTML templates (HtmlService) → componentes Angular standalone con PrimeNG
- Scriptlets (<? ?>, <?= ?>) → interpolación Angular {{ }} / @if / @for
- PropertiesService → localStorage o backend endpoint
- UrlFetchApp.fetch() → HttpClient
- Formularios HTML → Reactive Forms con PrimeNG
- Standalone Components, OnPush, archivos separados, kebab-case, prohibido 'any'

## Pasos
1. Usa analyze_appscript para descomponer el proyecto
2. Usa convert_appscript_to_angular para generar los componentes Angular
3. Usa generate_appscript_services para generar los servicios
4. Usa inject_cls_theme para aplicar el tema CLS
5. Usa inject_primeng_ui para convertir formularios a PrimeNG

Módulo destino: ${moduleName}`,
                },
            }],
    }));
    return server;
}
// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
export async function startServer() {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
//# sourceMappingURL=server.js.map