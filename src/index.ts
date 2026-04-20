#!/usr/bin/env node
/**
 * @cls-bolivar/mcp-front-migrate — Public API.
 *
 * MCP Server for React → Angular migration with ML-powered auto-fix.
 */

// ─── Server ──────────────────────────────────────────────────────────────────
export { createServer, startServer } from './server.js';

// ─── Pipeline ────────────────────────────────────────────────────────────────
export { parseReactComponent } from './pipeline/ast-parser.js';
export { mapStateToAngular } from './pipeline/state-mapper.js';
export { generateAngularTemplate } from './pipeline/template-generator.js';
export { mapToPrimeNG } from './pipeline/primeng-mapper.js';
export { emitAngularArtifact } from './emitter/code-emitter.js';
export { migrateFullProject } from './pipeline/project-orchestrator.js';

// ─── Generators ──────────────────────────────────────────────────────────────
export { analyzeReactComponent } from './analyzers/react-component.analyzer.js';
export { generateAngularComponent } from './generators/component.generator.js';
export { generateServiceFromAnalysis } from './generators/service.generator.js';
export { generateShellApp } from './generators/shell-generator.js';
export { generateRemoteApp } from './generators/module-generator.js';

// ─── Security ────────────────────────────────────────────────────────────────
export { validateInput } from './security/validator.js';

// ─── Types ───────────────────────────────────────────────────────────────────
export type * from './types.js';

// ─── ML Optimizer ────────────────────────────────────────────────────────────
export { runOptimizer } from './ml/optimizer.js';
export type { OptimizerConfig, OptimizerResult } from './ml/optimizer.js';
export { classify, train } from './ml/classifier.js';
export type { ClassifyResult } from './ml/classifier.js';

// ─── ML Database ─────────────────────────────────────────────────────────────
export {
  configureDb,
  isDbConfigured,
  crearIntento,
  insertError,
  getErrors,
  getAllErrors,
  logPatch,
  registrarSeguimiento,
  marcarSolucionado,
  marcarNoSolucionado,
  getPendientes,
  incrementarExito,
  getResumen,
} from './ml/db-client.js';
export type { DbConfig, DbError, DbIntento, DbPatch, DbSeguimiento } from './ml/db-client.js';

// ─── ML LLM ──────────────────────────────────────────────────────────────────
export { configureLlm, isLlmConfigured, isAvailable as isLlmAvailable, sugerirFix } from './ml/llm-client.js';
export type { LlmConfig, LlmFix } from './ml/llm-client.js';

// ─── ML Defaults ─────────────────────────────────────────────────────────────
export { GEMINI_DEFAULT, OLLAMA_DEFAULT } from './ml/defaults.js';
