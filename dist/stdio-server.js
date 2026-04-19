#!/usr/bin/env node
/**
 * MCP Server entry point — stdio transport.
 * This is the main binary for MCP clients (VS Code, Kiro, Claude Desktop, etc.)
 *
 * Usage in mcp.json:
 *   { "mcpServers": { "cls-front-migrate": { "command": "npx", "args": ["-y", "@cls-bolivar/mcp-front-migrate"] } } }
 *
 * Or if installed globally:
 *   { "mcpServers": { "cls-front-migrate": { "command": "cls-front-migrate" } } }
 */
import { createServer } from './server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
async function main() {
    try {
        const server = createServer();
        const transport = new StdioServerTransport();
        // Handle transport errors gracefully
        transport.onerror = (err) => {
            process.stderr.write(`[cls-front-migrate] Transport error: ${err.message}\n`);
        };
        await server.connect(transport);
        process.stderr.write('[cls-front-migrate] MCP server connected via stdio\n');
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[cls-front-migrate] MCP server failed: ${msg}\n`);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=stdio-server.js.map