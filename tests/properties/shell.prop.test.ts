import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { generateShellApp } from '../../src/generators/shell-generator.js';
import type { ShellConfig, RemoteRoute } from '../../src/types.js';

/**
 * Feature: react-to-angular-mcp
 * Property 12: Completitud de Shell_App con rutas y federación
 *
 * For any shell config with a name and non-empty remote routes, the Shell_App
 * SHALL contain lazy routes for each remote and a federation.config.js declaring
 * all remotes.
 *
 * **Validates: Requirements 7.1, 7.2**
 */
describe('Property 12: Completitud de Shell_App con rutas y federación', () => {
  // Generator for valid remote route entries
  const remoteRouteArb: fc.Arbitrary<RemoteRoute> = fc.record({
    name: fc.string({ minLength: 1, maxLength: 20 }).map(s => s.replace(/[^a-zA-Z0-9]/g, 'a') || 'remote'),
    path: fc.string({ minLength: 1, maxLength: 30 }).map(s => s.replace(/[^a-zA-Z0-9/-]/g, '') || 'route'),
    remoteEntry: fc.webUrl().map(url => `${url}/remoteEntry.js`),
    exposedModule: fc.string({ minLength: 1, maxLength: 20 }).map(s => './' + (s.replace(/[^a-zA-Z]/g, '') || 'Module')),
  });

  // Generator for shell configs with at least one remote
  const shellConfigArb: fc.Arbitrary<ShellConfig> = fc.record({
    appName: fc.string({ minLength: 1, maxLength: 30 }).map(s => s.replace(/[^a-zA-Z0-9-]/g, '') || 'shell-app'),
    remotes: fc.array(remoteRouteArb, { minLength: 1, maxLength: 8 }),
  });

  it('should contain lazy routes for each remote and federation.config.js declaring all remotes', () => {
    fc.assert(
      fc.property(shellConfigArb, (config) => {
        const artifact = generateShellApp(config);

        // 1. appRoutes must contain loadRemoteModule for each remote
        expect(artifact.appRoutes).toContain('loadRemoteModule');
        for (const remote of config.remotes) {
          expect(artifact.appRoutes).toContain(remote.remoteEntry);
          expect(artifact.appRoutes).toContain(remote.exposedModule);
          expect(artifact.appRoutes).toContain(remote.path);
        }

        // 2. federationConfig must declare all remotes
        expect(artifact.federationConfig).toContain('remotes');
        for (const remote of config.remotes) {
          expect(artifact.federationConfig).toContain(remote.name);
          expect(artifact.federationConfig).toContain(remote.remoteEntry);
        }

        // 3. All required artifact fields must be non-empty strings
        expect(artifact.appConfig.length).toBeGreaterThan(0);
        expect(artifact.appRoutes.length).toBeGreaterThan(0);
        expect(artifact.federationConfig.length).toBeGreaterThan(0);
        expect(artifact.tailwindConfig.length).toBeGreaterThan(0);
        expect(artifact.appComponent.length).toBeGreaterThan(0);
        expect(artifact.cspMeta.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});
