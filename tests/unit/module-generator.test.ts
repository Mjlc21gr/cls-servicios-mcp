import { describe, it, expect } from 'vitest';
import { generateRemoteApp } from '../../src/generators/module-generator.js';
import type { ModuleConfig } from '../../src/types.js';

describe('Module Generator', () => {
  const baseConfig: ModuleConfig = {
    moduleName: 'dashboard-remote',
    components: [
      { name: 'UserProfile', path: './src/app/user-profile/user-profile.component.ts' },
      { name: 'Analytics', path: './src/app/analytics/analytics.component.ts' },
    ],
  };

  describe('federation.config.js', () => {
    it('should contain exposes for each component', () => {
      const artifact = generateRemoteApp(baseConfig);

      expect(artifact.federationConfig).toContain('exposes');
      expect(artifact.federationConfig).toContain("'./UserProfile'");
      expect(artifact.federationConfig).toContain("'./src/app/user-profile/user-profile.component.ts'");
      expect(artifact.federationConfig).toContain("'./Analytics'");
      expect(artifact.federationConfig).toContain("'./src/app/analytics/analytics.component.ts'");
    });

    it('should include the module name', () => {
      const artifact = generateRemoteApp(baseConfig);
      expect(artifact.federationConfig).toContain("name: 'dashboard-remote'");
    });

    it('should use withNativeFederation', () => {
      const artifact = generateRemoteApp(baseConfig);
      expect(artifact.federationConfig).toContain('withNativeFederation');
    });
  });

  describe('placeholder components', () => {
    it('should generate a placeholder component for each exposed component', () => {
      const artifact = generateRemoteApp(baseConfig);

      expect(artifact.components.length).toBe(2);
      expect(artifact.components[0].isPlaceholder).toBe(true);
      expect(artifact.components[1].isPlaceholder).toBe(true);
    });

    it('should generate standalone components', () => {
      const artifact = generateRemoteApp(baseConfig);

      for (const comp of artifact.components) {
        expect(comp.componentFile).toContain('standalone: true');
      }
    });

    it('should use kebab-case selectors', () => {
      const artifact = generateRemoteApp(baseConfig);

      expect(artifact.components[0].componentFile).toContain("selector: 'app-user-profile'");
      expect(artifact.components[1].componentFile).toContain("selector: 'app-analytics'");
    });

    it('should generate spec files for each component', () => {
      const artifact = generateRemoteApp(baseConfig);

      for (const comp of artifact.components) {
        expect(comp.specFile).toContain('TestBed');
        expect(comp.specFile).toContain('should create');
      }
    });

    it('should export components as default', () => {
      const artifact = generateRemoteApp(baseConfig);

      expect(artifact.components[0].componentFile).toContain('export default class UserProfileComponent');
      expect(artifact.components[1].componentFile).toContain('export default class AnalyticsComponent');
    });
  });

  describe('PrimeNG and Tailwind configuration', () => {
    it('should import PrimeNG modules in placeholder components', () => {
      const artifact = generateRemoteApp(baseConfig);

      for (const comp of artifact.components) {
        expect(comp.componentFile).toContain('ButtonModule');
        expect(comp.componentFile).toContain('InputTextModule');
        expect(comp.componentFile).toContain("from 'primeng/button'");
        expect(comp.componentFile).toContain("from 'primeng/inputtext'");
      }
    });

    it('should include CommonModule in imports', () => {
      const artifact = generateRemoteApp(baseConfig);

      for (const comp of artifact.components) {
        expect(comp.componentFile).toContain('CommonModule');
      }
    });
  });

  describe('app.config.ts', () => {
    it('should generate a valid app config', () => {
      const artifact = generateRemoteApp(baseConfig);

      expect(artifact.appConfig).toContain('ApplicationConfig');
      expect(artifact.appConfig).toContain('appConfig');
    });
  });

  describe('single component', () => {
    it('should work with a single component', () => {
      const singleConfig: ModuleConfig = {
        moduleName: 'single-remote',
        components: [{ name: 'Widget', path: './src/app/widget/widget.component.ts' }],
      };
      const artifact = generateRemoteApp(singleConfig);

      expect(artifact.components.length).toBe(1);
      expect(artifact.federationConfig).toContain("'./Widget'");
      expect(artifact.components[0].componentFile).toContain('WidgetComponent');
    });
  });
});
