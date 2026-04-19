#!/usr/bin/env node
/**
 * MCP Server — Raw stdio implementation.
 * Handles JSON-RPC over stdin/stdout directly without SDK transport dependency.
 */
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { migrateFullProject } from './pipeline/project-orchestrator.js';
import { validateInput } from './security/validator.js';
import { parseReactComponent } from './pipeline/ast-parser.js';
import { mapStateToAngular } from './pipeline/state-mapper.js';
import { generateAngularTemplate } from './pipeline/template-generator.js';
import { mapToPrimeNG } from './pipeline/primeng-mapper.js';
import { emitAngularArtifact } from './emitter/code-emitter.js';
const SERVER_INFO = { name: 'cls-front-migrate', version: '1.0.0' };
// Catch ALL errors
process.on('uncaughtException', (err) => {
    process.stderr.write(`[MCP] UNCAUGHT: ${err.message}\n${err.stack}\n`);
});
process.on('unhandledRejection', (reason) => {
    process.stderr.write(`[MCP] REJECTION: ${String(reason)}\n`);
});
process.stderr.write('[MCP] Server starting...\n');
// ─── stdin buffer ───
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.resume(); // Keep process alive
process.stdin.on('data', (chunk) => {
    process.stderr.write(`[MCP] Received ${chunk.length} bytes\n`);
    buffer += chunk;
    drainBuffer();
});
// Do NOT exit on stdin end — VS Code may reopen stdin
process.stdin.on('end', () => {
    process.stderr.write('[MCP] stdin ended - staying alive\n');
});
process.stdin.on('error', (err) => {
    process.stderr.write(`[MCP] stdin error: ${err.message}\n`);
});
// ─── Message parsing ───
function drainBuffer() {
    while (true) {
        // Try Content-Length header format
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
            const header = buffer.substring(0, headerEnd);
            const match = header.match(/Content-Length:\s*(\d+)/i);
            if (match) {
                const len = parseInt(match[1], 10);
                const bodyStart = headerEnd + 4;
                if (buffer.length >= bodyStart + len) {
                    const body = buffer.substring(bodyStart, bodyStart + len);
                    buffer = buffer.substring(bodyStart + len);
                    handleMessage(body);
                    continue;
                }
                return; // Wait for more data
            }
        }
        // Try newline-delimited JSON
        const nl = buffer.indexOf('\n');
        if (nl !== -1) {
            const line = buffer.substring(0, nl).trim();
            buffer = buffer.substring(nl + 1);
            if (line.startsWith('{')) {
                handleMessage(line);
                continue;
            }
            continue; // Skip non-JSON lines
        }
        return; // No complete message yet
    }
}
// ─── JSON-RPC handling ───
function handleMessage(raw) {
    let msg;
    try {
        msg = JSON.parse(raw);
    }
    catch {
        return;
    }
    const method = msg.method ?? '';
    const id = msg.id;
    const params = msg.params ?? {};
    switch (method) {
        case 'initialize':
            respond(id, {
                protocolVersion: params.protocolVersion ?? '2024-11-05',
                capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
                serverInfo: SERVER_INFO,
            });
            break;
        case 'initialized':
        case 'notifications/initialized':
        case 'notifications/cancelled':
            break; // No response needed
        case 'ping':
            respond(id, {});
            break;
        case 'tools/list':
            respond(id, { tools: TOOL_DEFS });
            break;
        case 'tools/call':
            void callTool(id, params);
            break;
        case 'prompts/list':
            respond(id, { prompts: [] });
            break;
        default:
            if (id !== undefined) {
                respondError(id, -32601, `Method not found: ${method}`);
            }
    }
}
function respond(id, result) {
    if (id === undefined)
        return;
    const body = JSON.stringify({ jsonrpc: '2.0', id, result });
    process.stderr.write(`[MCP] Responding to id=${id}, ${body.length} bytes\n`);
    process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}
function respondError(id, code, message) {
    if (id === undefined)
        return;
    const body = JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
    process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}
// ─── Tool definitions ───
const TOOL_DEFS = [
    {
        name: 'migrate_full_project',
        description: 'Migrates an entire React project to a complete Angular 20 + PrimeNG 19 project ready to run.',
        inputSchema: zodToJsonSchema(z.object({
            sourceDir: z.string().describe('Path to the React project directory'),
            outputDir: z.string().describe('Path for the Angular output directory'),
            moduleName: z.string().describe('Name of the Angular module/feature'),
        })),
    },
    {
        name: 'convert_react_to_angular',
        description: 'Converts a single React JSX/TSX component to Angular.',
        inputSchema: zodToJsonSchema(z.object({
            sourceCode: z.string().describe('React component source code'),
        })),
    },
    {
        name: 'analyze_react_component',
        description: 'Analyzes a React component structure (hooks, props, state).',
        inputSchema: zodToJsonSchema(z.object({
            sourceCode: z.string().describe('React component source code'),
            fileName: z.string().describe('File name'),
        })),
    },
];
// ─── Tool execution ───
async function callTool(id, params) {
    const args = params.arguments ?? {};
    try {
        let text;
        switch (params.name) {
            case 'migrate_full_project': {
                const result = await migrateFullProject({
                    sourceDir: args.sourceDir,
                    outputDir: args.outputDir,
                    moduleName: args.moduleName,
                });
                text = JSON.stringify({
                    status: result.status,
                    outputDir: result.outputDir,
                    files: result.filesGenerated.length,
                    summary: result.migrationSummary,
                    errors: result.errors?.length ?? 0,
                    duration: result.duration + 'ms',
                });
                break;
            }
            case 'convert_react_to_angular': {
                const v = validateInput(args.sourceCode);
                if (!v.isValid) {
                    text = JSON.stringify({ error: v.errors });
                    break;
                }
                const ir = parseReactComponent(v.sanitizedCode ?? args.sourceCode);
                const artifact = emitAngularArtifact(mapToPrimeNG(generateAngularTemplate(mapStateToAngular(ir))));
                text = JSON.stringify({ success: true, files: Object.keys(artifact) });
                break;
            }
            case 'analyze_react_component': {
                const ir = parseReactComponent(args.sourceCode);
                text = JSON.stringify({ component: ir.componentName, props: ir.props.length, state: ir.state.length, effects: ir.effects.length });
                break;
            }
            default:
                respondError(id, -32601, `Unknown tool: ${params.name}`);
                return;
        }
        respond(id, { content: [{ type: 'text', text }] });
    }
    catch (err) {
        respond(id, { content: [{ type: 'text', text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) }], isError: true });
    }
}
//# sourceMappingURL=index.js.map