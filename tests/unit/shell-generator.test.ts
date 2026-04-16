import { describe, it, expect } from 'vitest';
import { generateShellApp } from '../../src/generators/shell-generator.js';
import type { ShellConfig } from '../../src/types.js';

describe('Shell Generator', () => {
  const baseConfig: ShellConfig = {
    appName: 'my-shell',
    remotes: [
      {
        name: 'dashboard',
        path: 'dashboard',
        remoteEntry: 'http://localhost:4201/remoteEntry.js',
        exposedModule: './DashboardComponent',
      },
      {
        name: 'settings',
        path: 'settings',
        remoteEntry: 'http://localhost:4202/remoteEntry.js',
        exposedModule: './SettingsComponent',
      },
    ],
  };

  describe('lazy routes with loadRemoteModule', () => {
    it('should generate lazy routes for each remote', () => {
      const artifact = generateShellApp(baseConfig);

      expect(artifact.appRoutes).toContain('loadRemoteModule');
      expect(artifact.appRoutes).toContain("path: 'dashboard'");
      expect(artifact.appRoutes).toContain("remoteEntry: 'http://localhost:4201/remoteEntry.js'");
      expect(artifact.appRoutes).toContain("exposedModule: './DashboardComponent'");
      expect(artifact.appRoutes).toContain("path: 'settings'");
      expect(artifact.appRoutes).toContain("remoteEntry: 'http://localhost:4202/remoteEntry.js'");
      expect(artifact.appRoutes).toContain("exposedModule: './SettingsComponent'");
    });

    it('should import loadRemoteModule from @angular-architects/native-federation', () => {
      const artifact = generateShellApp(baseConfig);
      expect(artifact.appRoutes).toContain("import { loadRemoteModule } from '@angular-architects/native-federation'");
    });
  });

  describe('federation.config.js', () => {
    it('should declare all remotes', () => {
      const artifact = generateShellApp(baseConfig);

      expect(artifact.federationConfig).toContain("name: 'shell'");
      expect(artifact.federationConfig).toContain('remotes');
      expect(artifact.federationConfig).toContain("'dashboard': 'http://localhost:4201/remoteEntry.js'");
      expect(artifact.federationConfig).toContain("'settings': 'http://localhost:4202/remoteEntry.js'");
    });

    it('should use withNativeFederation', () => {
      const artifact = generateShellApp(baseConfig);
      expect(artifact.federationConfig).toContain('withNativeFederation');
    });
  });

  describe('empty remotes list', () => {
    it('should generate base structure with no remotes', () => {
      const emptyConfig: ShellConfig = { appName: 'empty-shell', remotes: [] };
      const artifact = generateShellApp(emptyConfig);

      // All fields should still be non-empty
      expect(artifact.appConfig.length).toBeGreaterThan(0);
      expect(artifact.appRoutes.length).toBeGreaterThan(0);
      expect(artifact.federationConfig.length).toBeGreaterThan(0);
      expect(artifact.tailwindConfig.length).toBeGreaterThan(0);
      expect(artifact.appComponent.length).toBeGreaterThan(0);
      expect(artifact.cspMeta.length).toBeGreaterThan(0);
    });

    it('should not import loadRemoteModule when no remotes', () => {
      const emptyConfig: ShellConfig = { appName: 'empty-shell', remotes: [] };
      const artifact = generateShellApp(emptyConfig);

      expect(artifact.appRoutes).not.toContain('loadRemoteModule');
    });

    it('should have empty remotes object in federation config', () => {
      const emptyConfig: ShellConfig = { appName: 'empty-shell', remotes: [] };
      const artifact = generateShellApp(emptyConfig);

      expect(artifact.federationConfig).toContain('remotes');
    });
  });

  describe('Tailwind config', () => {
    it('should include tailwindcss-primeui plugin', () => {
      const artifact = generateShellApp(baseConfig);
      expect(artifact.tailwindConfig).toContain('tailwindcss-primeui');
    });

    it('should scan html and ts files', () => {
      const artifact = generateShellApp(baseConfig);
      expect(artifact.tailwindConfig).toContain('*.{html,ts}');
    });
  });

  describe('CSP configuration', () => {
    it('should include Content-Security-Policy meta tag', () => {
      const artifact = generateShellApp(baseConfig);
      expect(artifact.cspMeta).toContain('Content-Security-Policy');
    });

    it('should include remote origins in script-src', () => {
      const artifact = generateShellApp(baseConfig);
      expect(artifact.cspMeta).toContain('http://localhost:4201');
      expect(artifact.cspMeta).toContain('http://localhost:4202');
    });

    it('should include self directive', () => {
      const artifact = generateShellApp(baseConfig);
      expect(artifact.cspMeta).toContain("'self'");
    });
  });

  describe('app.config.ts', () => {
    it('should include provideRouter', () => {
      const artifact = generateShellApp(baseConfig);
      expect(artifact.appConfig).toContain('provideRouter');
    });
  });

  describe('app.component.ts', () => {
    it('should include router-outlet', () => {
      const artifact = generateShellApp(baseConfig);
      expect(artifact.appComponent).toContain('router-outlet');
    });

    it('should include app name as title', () => {
      const artifact = generateShellApp(baseConfig);
      expect(artifact.appComponent).toContain("title = 'my-shell'");
    });

    it('should be a standalone component', () => {
      const artifact = generateShellApp(baseConfig);
      expect(artifact.appComponent).toContain('standalone: true');
    });
  });
});
