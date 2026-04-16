import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { z } from 'zod';
import { convertSchema, shellSchema, moduleSchema } from '../../src/server.js';

/**
 * **Validates: Requirements 1.5**
 *
 * Property 18: For any MCP request with parameters that don't match the Zod
 * schema, the server SHALL respond with a validation error describing the
 * invalid fields.
 *
 * We test the Zod schemas directly: generate invalid inputs and verify they
 * fail validation with descriptive error messages.
 */
describe('Feature: react-to-angular-mcp, Property 18: MCP schema validation', () => {
  // Build actual Zod object schemas from the raw shapes exported by server.ts
  const convertZod = z.object(convertSchema);
  const shellZod = z.object(shellSchema);
  const moduleZod = z.object(moduleSchema);

  it('should reject invalid convert_react_to_angular params (non-string sourceCode)', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.constant(undefined),
          fc.array(fc.string()),
          fc.dictionary(fc.string(), fc.integer()),
        ),
        (badValue) => {
          const result = convertZod.safeParse({ sourceCode: badValue });
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.issues.length).toBeGreaterThan(0);
            // The error should reference the invalid field
            const fieldNames = result.error.issues.map((i) => i.path.join('.'));
            expect(fieldNames).toContain('sourceCode');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should reject convert_react_to_angular params with missing sourceCode', () => {
    const result = convertZod.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldNames = result.error.issues.map((i) => i.path.join('.'));
      expect(fieldNames).toContain('sourceCode');
    }
  });

  it('should reject invalid generate_microfrontend_shell params', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Missing appName
          fc.record({ remotes: fc.constant([]) }),
          // appName is not a string
          fc.record({
            appName: fc.integer().map((n) => n as unknown),
            remotes: fc.constant([]),
          }),
          // remotes is not an array
          fc.record({
            appName: fc.string(),
            remotes: fc.string().map((s) => s as unknown),
          }),
          // remotes array with invalid objects (missing required fields)
          fc.record({
            appName: fc.string(),
            remotes: fc.constant([{ name: 'x' }]), // missing path, remoteEntry, exposedModule
          }),
        ),
        (badParams) => {
          const result = shellZod.safeParse(badParams);
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.issues.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should reject invalid generate_angular_module params', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Missing moduleName
          fc.record({ components: fc.constant([]) }),
          // moduleName is not a string
          fc.record({
            moduleName: fc.integer().map((n) => n as unknown),
            components: fc.constant([]),
          }),
          // components is not an array
          fc.record({
            moduleName: fc.string(),
            components: fc.string().map((s) => s as unknown),
          }),
          // components array with invalid objects (missing path)
          fc.record({
            moduleName: fc.string(),
            components: fc.constant([{ name: 'Foo' }]), // missing path
          }),
        ),
        (badParams) => {
          const result = moduleZod.safeParse(badParams);
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.issues.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should accept valid convert_react_to_angular params', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (code) => {
        const result = convertZod.safeParse({ sourceCode: code });
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should accept valid generate_microfrontend_shell params', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1 }),
            path: fc.string({ minLength: 1 }),
            remoteEntry: fc.string({ minLength: 1 }),
            exposedModule: fc.string({ minLength: 1 }),
          }),
        ),
        (appName, remotes) => {
          const result = shellZod.safeParse({ appName, remotes });
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should accept valid generate_angular_module params', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1 }),
            path: fc.string({ minLength: 1 }),
          }),
        ),
        (moduleName, components) => {
          const result = moduleZod.safeParse({ moduleName, components });
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
