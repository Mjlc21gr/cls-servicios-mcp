#!/usr/bin/env node
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from './server.js';
const PORT = Number(process.env.MCP_PORT) || 3200;
async function handleMcp(req, res) {
    // Crear transport stateless (una instancia por request POST, sesiones para GET/DELETE)
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
    });
    // Crear un server MCP fresco para cada sesión
    const server = createServer();
    await server.connect(transport);
    await transport.handleRequest(req, res);
}
async function main() {
    const httpServer = createHttpServer(async (req, res) => {
        // CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id');
        res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
        if (url.pathname === '/mcp') {
            try {
                await handleMcp(req, res);
            }
            catch (err) {
                console.error('MCP error:', err);
                if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Internal server error' }));
                }
            }
        }
        else if (url.pathname === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', server: 'cls-front-migrate', version: '1.0.0' }));
        }
        else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found. Use /mcp or /health' }));
        }
    });
    httpServer.listen(PORT, () => {
        console.log(`\n🚀 CLS Front-End Migration MCP Server`);
        console.log(`   URL:    http://localhost:${PORT}/mcp`);
        console.log(`   Health: http://localhost:${PORT}/health`);
        console.log(`\n   Para consumir en VS Code / Kiro, agrega en mcp.json:`);
        console.log(`   {`);
        console.log(`     "mcpServers": {`);
        console.log(`       "cls-front-migrate": {`);
        console.log(`         "url": "http://localhost:${PORT}/mcp"`);
        console.log(`       }`);
        console.log(`     }`);
        console.log(`   }\n`);
    });
}
main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=http-server.js.map