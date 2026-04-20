#!/usr/bin/env node
/**
 * MCP Server entry point — stdio transport.
 * Usage: { "mcpServers": { "cls-front-migrate": { "command": "npx", "args": ["-y", "-p", "@cls-bolivar/mcp-front-migrate", "cls-front-migrate"] } } }
 */
import { createServer } from './server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
async function main() {
    try {
        const server = createServer();
        const transport = new StdioServerTransport();
        transport.onerror = (err) => { process.stderr.write('[cls-front-migrate] Transport error: ' + err.message + '\n'); };
        await server.connect(transport);
        process.stderr.write('[cls-front-migrate] MCP server connected via stdio\n');
    }
    catch (err) {
        process.stderr.write('[cls-front-migrate] Failed: ' + (err instanceof Error ? err.message : String(err)) + '\n');
        process.exit(1);
    }
}
main();
//# sourceMappingURL=stdio-server.js.map