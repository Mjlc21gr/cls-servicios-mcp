#!/usr/bin/env node
/**
 * Minimal stdio MCP server wrapper.
 * Handles the protocol handshake manually to be compatible with any VS Code version.
 */
import { createServer } from './server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

async function main(): Promise<void> {
  try {
    const server = createServer();
    const transport = new StdioServerTransport();

    // Handle transport errors gracefully
    transport.onerror = (err) => {
      process.stderr.write(`Transport error: ${err.message}\n`);
    };

    await server.connect(transport);
    process.stderr.write('MCP server connected via stdio\n');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`MCP server failed: ${msg}\n`);
    process.exit(1);
  }
}

main();
