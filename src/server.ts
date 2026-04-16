// =============================================================================
// MCP Server – registers three tools and manages the conversion pipeline
// =============================================================================

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { validateInput } from './security/validator.js';
import { parseReactComponent } from './pipeline/ast-parser.js';
import { mapStateToAngular } from './pipeline/state-mapper.js';
import { generateAngularTemplate } from './pipeline/template-generator.js';
import { mapToPrimeNG } from './pipeline/primeng-mapper.js';
import { emitAngularArtifact } from './emitter/code-emitter.js';
import { generateShellApp } from './generators/shell-generator.js';
import { generateRemoteApp } from './generators/module-generator.js';

// ---------------------------------------------------------------------------
// Zod Schemas for tool parameters
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
// Timeout constant
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
// Tool handlers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Handler for convert_react_to_angular tool.
 * Runs the full pipeline: Security Validator → AST_Parser → State_Mapper →
 * Template_Generator → PrimeNG_Mapper → Code Emitter.
 */
export async function convertHandler(args: { sourceCode: string }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // Wrap pipeline in a promise that races against the abort signal
    const result = await Promise.race([
      runConvertPipeline(args.sourceCode),
      new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () =>
          reject(new Error('TIMEOUT')),
        );
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
  // 1. Security validation
  const validation = validateInput(sourceCode);
  if (!validation.isValid) {
    const firstError = validation.errors[0];
    return mcpError(
      firstError.type === 'security' ? 'security_error' : firstError.type + '_error',
      firstError.message,
      firstError.line != null ? { line: firstError.line } : undefined,
    );
  }

  // 2. AST parsing
  const ir = parseReactComponent(validation.sanitizedCode ?? sourceCode);

  // 3. State mapping
  const irWithState = mapStateToAngular(ir);

  // 4. Template generation
  const irWithTemplate = generateAngularTemplate(irWithState);

  // 5. PrimeNG mapping
  const irWithPrimeNG = mapToPrimeNG(irWithTemplate);

  // 6. Code emission
  const artifact = emitAngularArtifact(irWithPrimeNG);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          artifact,
          securityWarnings: artifact.securityWarnings,
        }),
      },
    ],
  };
}

/**
 * Handler for generate_microfrontend_shell tool.
 */
export async function shellHandler(args: {
  appName: string;
  remotes: Array<{
    name: string;
    path: string;
    remoteEntry: string;
    exposedModule: string;
  }>;
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const result = await Promise.race([
      Promise.resolve().then(() => {
        const artifact = generateShellApp({
          appName: args.appName,
          remotes: args.remotes,
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: true, artifact }),
            },
          ],
        };
      }),
      new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () =>
          reject(new Error('TIMEOUT')),
        );
      }),
    ]);
    return result;
  } catch (err: unknown) {
    return handlePipelineError(err);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Handler for generate_angular_module tool.
 */
export async function moduleHandler(args: {
  moduleName: string;
  components: Array<{ name: string; path: string }>;
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const result = await Promise.race([
      Promise.resolve().then(() => {
        const artifact = generateRemoteApp({
          moduleName: args.moduleName,
          components: args.components,
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: true, artifact }),
            },
          ],
        };
      }),
      new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () =>
          reject(new Error('TIMEOUT')),
        );
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
      return mcpError(
        'timeout',
        'Request processing exceeded the 30-second time limit',
      );
    }

    // Syntax errors from @babel/parser
    if (err.message.includes('Unexpected token') || err.message.includes('Unterminated')) {
      const lineMatch = err.message.match(/\((\d+):(\d+)\)/);
      return mcpError('syntax_error', err.message, lineMatch ? {
        line: Number(lineMatch[1]),
        column: Number(lineMatch[2]),
      } : undefined);
    }

    // Invalid component errors from AST parser
    if (err.message.includes('No valid React component found') ||
        err.message.includes('no se encontró')) {
      return mcpError('invalid_component', err.message);
    }

    // Security errors
    if (err.message.includes('security') || err.message.includes('injection')) {
      return mcpError('security_error', err.message);
    }

    return mcpError('internal_error', err.message);
  }

  return mcpError('internal_error', 'An unknown error occurred');
}

// ---------------------------------------------------------------------------
// Server factory (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Creates and returns a configured McpServer with all three tools registered.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: 'react-to-angular-mcp',
    version: '1.0.0',
  });

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

  return server;
}

// ---------------------------------------------------------------------------
// Start server (used when running as main entry point)
// ---------------------------------------------------------------------------

export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
