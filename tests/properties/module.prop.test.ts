import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { generateRemoteApp } from '../../src/generators/module-generator.js';
import type { ModuleConfig, ExposedComponent } from '../../src/types.js';

/**
 * Feature: react-to-angular-mcp
 * Property 13: Completitud de Remote_App con federación
 *
 * For any module config with a name and list of components to expose, the
 * Remote_App SHALL contain a federation.config.js with exposes for each
 * component.
 *
 * **Validates: Requirements 8.1, 8.2**
 */
describe('Property 13: Completitud de Remote_App con federación', () => {
  // Generator for valid exposed components
  const exposedComponentArb: fc.Arbitrary<ExposedComponent> = fc.record({
    name: fc.string({ minLength: 1, maxLength: 20 })
      .map(s => {
        const cleaned = s.replace(/[^a-zA-Z]/g, '');
        if (cleaned.length === 0) return 'Widget';
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }),
    path: fc.string({ minLength: 1, maxLength: 40 })
      .map(s => './src/app/' + (s.replace(/[^a-zA-Z0-9/.-]/g, '') || 'component') + '.component.ts'),
  });

  // Generator for module configs with at least one component
  const moduleConfigArb: fc.Arbitrary<ModuleConfig> = fc.record({
    moduleName: fc.string({ minLength: 1, maxLength: 30 })
      .map(s => s.replace(/[^a-zA-Z0-9-]/g, '') || 'remote-module'),
    components: fc.array(exposedComponentArb, { minLength: 1, maxLength: 8 }),
  });

  it('should contain federation.config.js with exposes for each component', () => {
    fc.assert(
      fc.property(moduleConfigArb, (config) => {
        const artifact = generateRemoteApp(config);

        // 1. federationConfig must contain exposes section
        expect(artifact.federationConfig).toContain('exposes');

        // 2. Each component must appear in the exposes section
        for (const comp of config.components) {
          expect(artifact.federationConfig).toContain(comp.name);
          expect(artifact.federationConfig).toContain(comp.path);
        }

        // 3. Module name must appear in federation config
        expect(artifact.federationConfig).toContain(config.moduleName);

        // 4. Must generate a component entry for each exposed component
        expect(artifact.components.length).toBe(config.components.length);

        // 5. appConfig must be non-empty
        expect(artifact.appConfig.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});
