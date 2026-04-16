// =============================================================================
// Integration tests – MCP protocol handler-level testing
// =============================================================================
// Since stdio communication is hard to test in vitest, we test the MCP server
// at the handler level using the exported functions from src/server.ts.

import { describe, it, expect } from 'vitest';
import { convertHandler, shellHandler, moduleHandler } from '../../src/server.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse the JSON text payload from an MCP-style handler response. */
function parseResponse(result: { content: { type: string; text: string }[]; isError?: boolean }) {
  return JSON.parse(result.content[0].text);
}

// ---------------------------------------------------------------------------
// convert_react_to_angular – full pipeline end-to-end
// ---------------------------------------------------------------------------

describe('convertHandler – full pipeline', () => {
  it('converts a valid React component through the entire pipeline', async () => {
    const source = `
      import React, { useState } from 'react';

      export default function Counter() {
        const [count, setCount] = useState<number>(0);
        return (
          <div className="p-4">
            <p>{count}</p>
            <button onClick={() => setCount(count + 1)}>Increment</button>
          </div>
        );
      }
    `;

    const result = await convertHandler({ sourceCode: source });

    expect(result.isError).toBeUndefined();
    const body = parseResponse(result as any);
    expect(body.success).toBe(true);
    expect(body.artifact).toBeDefined();
    expect(body.artifact.componentFile).toContain('Component');
    expect(body.artifact.specFile).toBeDefined();
    expect(body.artifact.tailwindConfig).toBeDefined();
  });

  it('returns a security error for code with eval()', async () => {
    const source = `
      export default function Bad() {
        eval('alert(1)');
        return <div />;
      }
    `;

    const result = await convertHandler({ sourceCode: source });

    expect((result as any).isError).toBe(true);
    const body = parseResponse(result as any);
    expect(body.success).toBe(false);
    expect(body.error.type).toBe('security_error');
  });

  it('returns a syntax error for invalid JSX', async () => {
    const source = `
      export default function Broken() {
        return <div><span></div>;
      }
    `;

    const result = await convertHandler({ sourceCode: source });

    expect((result as any).isError).toBe(true);
    const body = parseResponse(result as any);
    expect(body.success).toBe(false);
    // Should be a syntax or internal error
    expect(['syntax_error', 'internal_error']).toContain(body.error.type);
  });
});

// ---------------------------------------------------------------------------
// shellHandler – generate_microfrontend_shell
// ---------------------------------------------------------------------------

describe('shellHandler – generate_microfrontend_shell', () => {
  it('generates a shell app with valid config', async () => {
    const result = await shellHandler({
      appName: 'my-shell',
      remotes: [
        {
          name: 'dashboard',
          path: '/dashboard',
          remoteEntry: 'http://localhost:4201/remoteEntry.js',
          exposedModule: './DashboardModule',
        },
      ],
    });

    expect(result.isError).toBeUndefined();
    const body = parseResponse(result as any);
    expect(body.success).toBe(true);
    expect(body.artifact).toBeDefined();
    expect(body.artifact.appRoutes).toContain('dashboard');
    expect(body.artifact.federationConfig).toBeDefined();
    expect(body.artifact.tailwindConfig).toBeDefined();
    expect(body.artifact.appComponent).toBeDefined();
    expect(body.artifact.cspMeta).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// moduleHandler – generate_angular_module
// ---------------------------------------------------------------------------

describe('moduleHandler – generate_angular_module', () => {
  it('generates a remote app with valid config', async () => {
    const result = await moduleHandler({
      moduleName: 'feature-one',
      components: [
        { name: 'UserProfile', path: './user-profile/user-profile.component' },
      ],
    });

    expect(result.isError).toBeUndefined();
    const body = parseResponse(result as any);
    expect(body.success).toBe(true);
    expect(body.artifact).toBeDefined();
    expect(body.artifact.federationConfig).toContain('UserProfile');
    expect(body.artifact.components).toBeDefined();
    expect(body.artifact.appConfig).toBeDefined();
  });
});
