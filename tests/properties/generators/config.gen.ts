/**
 * Generators for ShellConfig and ModuleConfig used in property-based testing.
 *
 * Exports arbitraries for ShellConfig, ModuleConfig, and their sub-types.
 */
import * as fc from 'fast-check';
import type {
  ShellConfig,
  RemoteRoute,
  ModuleConfig,
  ExposedComponent,
} from '../../../src/types.js';

// ---------------------------------------------------------------------------
// RemoteRoute / ShellConfig generators
// ---------------------------------------------------------------------------

/** Arbitrary for a valid remote route entry. */
export const remoteRouteArb: fc.Arbitrary<RemoteRoute> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 20 })
    .map(s => s.replace(/[^a-zA-Z0-9]/g, 'a') || 'remote'),
  path: fc.string({ minLength: 1, maxLength: 30 })
    .map(s => s.replace(/[^a-zA-Z0-9/-]/g, '') || 'route'),
  remoteEntry: fc.webUrl().map(url => `${url}/remoteEntry.js`),
  exposedModule: fc.string({ minLength: 1, maxLength: 20 })
    .map(s => './' + (s.replace(/[^a-zA-Z]/g, '') || 'Module')),
});

/** Arbitrary for ShellConfig with at least one remote. */
export const shellConfigArb: fc.Arbitrary<ShellConfig> = fc.record({
  appName: fc.string({ minLength: 1, maxLength: 30 })
    .map(s => s.replace(/[^a-zA-Z0-9-]/g, '') || 'shell-app'),
  remotes: fc.array(remoteRouteArb, { minLength: 1, maxLength: 8 }),
});

/** Arbitrary for ShellConfig that may have zero remotes. */
export const shellConfigWithEmptyRemotesArb: fc.Arbitrary<ShellConfig> = fc.record({
  appName: fc.string({ minLength: 1, maxLength: 30 })
    .map(s => s.replace(/[^a-zA-Z0-9-]/g, '') || 'shell-app'),
  remotes: fc.array(remoteRouteArb, { minLength: 0, maxLength: 8 }),
});

// ---------------------------------------------------------------------------
// ExposedComponent / ModuleConfig generators
// ---------------------------------------------------------------------------

/** Arbitrary for a valid exposed component. */
export const exposedComponentArb: fc.Arbitrary<ExposedComponent> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 20 })
    .map(s => {
      const cleaned = s.replace(/[^a-zA-Z]/g, '');
      if (cleaned.length === 0) return 'Widget';
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }),
  path: fc.string({ minLength: 1, maxLength: 40 })
    .map(s => './src/app/' + (s.replace(/[^a-zA-Z0-9/.-]/g, '') || 'component') + '.component.ts'),
});

/** Arbitrary for ModuleConfig with at least one component. */
export const moduleConfigArb: fc.Arbitrary<ModuleConfig> = fc.record({
  moduleName: fc.string({ minLength: 1, maxLength: 30 })
    .map(s => s.replace(/[^a-zA-Z0-9-]/g, '') || 'remote-module'),
  components: fc.array(exposedComponentArb, { minLength: 1, maxLength: 8 }),
});
