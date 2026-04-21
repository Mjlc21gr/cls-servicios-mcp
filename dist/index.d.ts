#!/usr/bin/env node
/**
 * @cls-bolivar/mcp-front-migrate
 *
 * MCP Server para migración de micro-frontends React → Angular CLS.
 *
 * Entry points:
 *   - stdio-server.ts  → MCP via stdio (para VS Code, Kiro, Claude Desktop)
 *   - http-server.ts   → MCP via HTTP StreamableHTTP
 *   - cli.ts           → CLI interactivo
 *
 * Este archivo re-exporta la API pública para uso programático.
 */
export { createServer, startServer } from './server.js';
export { parseReactComponent } from './pipeline/ast-parser.js';
export { mapStateToAngular } from './pipeline/state-mapper.js';
export { generateAngularTemplate } from './pipeline/template-generator.js';
export { mapToPrimeNG } from './pipeline/primeng-mapper.js';
export { emitAngularArtifact } from './emitter/code-emitter.js';
export { migrateFullProject } from './pipeline/project-orchestrator.js';
export { analyzeReactComponent } from './analyzers/react-component.analyzer.js';
export { analyzeAppScript } from './analyzers/appscript.analyzer.js';
export { generateAngularComponent } from './generators/component.generator.js';
export { generateAngularFromAppScript } from './generators/appscript-component.generator.js';
export { generateServiceFromAnalysis } from './generators/service.generator.js';
export { generateServiceFromAppScript } from './generators/appscript-service.generator.js';
export { generateShellApp } from './generators/shell-generator.js';
export { generateRemoteApp } from './generators/module-generator.js';
export { validateInput } from './security/validator.js';
export type * from './types.js';
export type * from './models/appscript-analysis.model.js';
//# sourceMappingURL=index.d.ts.map