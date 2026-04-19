import { describe, it, expect } from 'vitest';
import { emitAngularArtifact } from '../../src/emitter/code-emitter.js';
import { ComponentIR, JSXNode } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helper: create a minimal ComponentIR with sensible defaults
// ---------------------------------------------------------------------------

function makeEmptyJSXNode(): JSXNode {
  return { tag: 'div', attributes: [], children: [], isComponent: false };
}

function makeBaseIR(overrides: Partial<ComponentIR> = {}): ComponentIR {
  return {
    componentName: 'TestComponent',
    fileName: 'test-component',
    props: [],
    state: [],
    effects: [],
    memos: [],
    callbacks: [],
    refs: [],
    contexts: [],
    customHooks: [],
    methods: [],
    childComponents: [],
    jsxTree: makeEmptyJSXNode(),
    typeInterfaces: [],
    angularSignals: [],
    angularEffects: [],
    angularComputed: [],
    angularInjections: [],
    angularServices: [],
    angularViewChildren: [],
    classProperties: [],
    componentMethods: [],
    angularTemplate: '<div>Hello</div>',
    isInlineTemplate: true,
    templateBindings: [],
    primeNgImports: [],
    securityWarnings: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Code Emitter - emitAngularArtifact', () => {
  // -----------------------------------------------------------------------
  // Component file generation (.component.ts)
  // -----------------------------------------------------------------------

  describe('.component.ts generation', () => {
    it('should generate a standalone component with @Component decorator', () => {
      const ir = makeBaseIR();
      const result = emitAngularArtifact(ir);
      expect(result.componentFile).toContain('@Component({');
      expect(result.componentFile).toContain('standalone: true');
      expect(result.componentFile).toContain("selector: 'app-test-component'");
      expect(result.componentFile).toContain('export class TestComponentComponent');
    });

    it('should use inline template when isInlineTemplate is true', () => {
      const ir = makeBaseIR({ isInlineTemplate: true, angularTemplate: '<p>Hello</p>' });
      const result = emitAngularArtifact(ir);
      expect(result.componentFile).toContain('template: `<p>Hello</p>`');
      expect(result.componentFile).not.toContain('templateUrl');
    });

    it('should use templateUrl when isInlineTemplate is false', () => {
      const ir = makeBaseIR({ isInlineTemplate: false });
      const result = emitAngularArtifact(ir);
      expect(result.componentFile).toContain("templateUrl: './test-component.component.html'");
      expect(result.componentFile).not.toContain('template: `');
    });

    it('should include PrimeNG imports in @Component imports array', () => {
      const ir = makeBaseIR({
        primeNgImports: [
          { moduleName: 'ButtonModule', importPath: 'primeng/button' },
          { moduleName: 'InputTextModule', importPath: 'primeng/inputtext' },
        ],
      });
      const result = emitAngularArtifact(ir);
      expect(result.componentFile).toContain("import { ButtonModule } from 'primeng/button';");
      expect(result.componentFile).toContain("import { InputTextModule } from 'primeng/inputtext';");
      expect(result.componentFile).toContain('imports: [ButtonModule, InputTextModule]');
    });

    it('should generate signal() for angularSignals with mapping comment', () => {
      const ir = makeBaseIR({
        angularSignals: [
          { name: 'count', type: 'number', initialValue: '0', originalStateName: 'count' },
        ],
      });
      const result = emitAngularArtifact(ir);
      expect(result.componentFile).toContain('// Convertido de useState → signal()');
      expect(result.componentFile).toContain('count = signal<number>(0)');
      expect(result.componentFile).toContain("import { Component, signal } from '@angular/core'");
    });

    it('should generate effect() in constructor for angularEffects with mapping comment', () => {
      const ir = makeBaseIR({
        angularEffects: [
          { body: 'console.log("effect")', dependencies: ['count'], cleanupFunction: undefined },
        ],
      });
      const result = emitAngularArtifact(ir);
      expect(result.componentFile).toContain('// Convertido de useEffect → effect()');
      expect(result.componentFile).toContain('constructor()');
      expect(result.componentFile).toContain('effect(() => {');
      expect(result.componentFile).toContain('console.log("effect")');
    });

    it('should generate effect() with cleanup function', () => {
      const ir = makeBaseIR({
        angularEffects: [
          { body: 'subscribe()', dependencies: [], cleanupFunction: 'unsubscribe()' },
        ],
      });
      const result = emitAngularArtifact(ir);
      expect(result.componentFile).toContain('return () => { unsubscribe() };');
    });

    it('should generate computed() for angularComputed with mapping comment', () => {
      const ir = makeBaseIR({
        angularComputed: [
          { name: 'doubled', type: 'number', computeFunction: 'count() * 2', dependencies: ['count'] },
        ],
      });
      const result = emitAngularArtifact(ir);
      expect(result.componentFile).toContain('// Convertido de useMemo → computed()');
      expect(result.componentFile).toContain('doubled = computed(() => count() * 2)');
    });

    it('should generate inject() for angularInjections with mapping comment', () => {
      const ir = makeBaseIR({
        angularInjections: [
          { propertyName: 'authService', serviceName: 'AuthService', type: 'AuthService' },
        ],
      });
      const result = emitAngularArtifact(ir);
      expect(result.componentFile).toContain('// Convertido de useContext → inject()');
      expect(result.componentFile).toContain('authService = inject(AuthService)');
    });

    it('should generate viewChild() for angularViewChildren with mapping comment', () => {
      const ir = makeBaseIR({
        angularViewChildren: [
          { propertyName: 'inputRef', selector: 'inputRef', type: 'HTMLInputElement' },
        ],
      });
      const result = emitAngularArtifact(ir);
      expect(result.componentFile).toContain('// Convertido de useRef → viewChild()');
      expect(result.componentFile).toContain("inputRef = viewChild<ElementRef>('inputRef')");
    });

    it('should generate class properties for classProperties with mapping comment', () => {
      const ir = makeBaseIR({
        classProperties: [
          { name: 'intervalId', type: 'number', initialValue: '0' },
        ],
      });
      const result = emitAngularArtifact(ir);
      expect(result.componentFile).toContain('// Convertido de useRef → class property');
      expect(result.componentFile).toContain('intervalId: number = 0');
    });

    it('should generate @Input() for props', () => {
      const ir = makeBaseIR({
        props: [
          { name: 'title', type: 'string', isRequired: true },
          { name: 'count', type: 'number', defaultValue: '0', isRequired: false },
        ],
      });
      const result = emitAngularArtifact(ir);
      expect(result.componentFile).toContain('@Input() title!: string');
      expect(result.componentFile).toContain('@Input() count: number = 0');
    });

    it('should generate component methods with mapping comment', () => {
      const ir = makeBaseIR({
        componentMethods: [
          { name: 'handleClick', parameters: [{ name: 'event', type: 'Event' }], returnType: 'void', body: 'console.log(event)' },
        ],
      });
      const result = emitAngularArtifact(ir);
      expect(result.componentFile).toContain('// Convertido de useCallback → method');
      expect(result.componentFile).toContain('handleClick(event: Event): void');
    });

    it('should use DomSanitizer when dangerouslySetInnerHTML warning exists', () => {
      const ir = makeBaseIR({
        securityWarnings: [
          { line: 5, pattern: 'dangerouslySetInnerHTML', message: 'Unsafe', severity: 'warning' },
        ],
      });
      const result = emitAngularArtifact(ir);
      expect(result.componentFile).toContain("import { DomSanitizer, SafeHtml } from '@angular/platform-browser'");
      expect(result.componentFile).toContain('private sanitizer = inject(DomSanitizer)');
      expect(result.componentFile).toContain('sanitizeHtml(content: string): SafeHtml');
      expect(result.componentFile).toContain('bypassSecurityTrustHtml');
      expect(result.componentFile).toContain('// Convertido de dangerouslySetInnerHTML → DomSanitizer');
    });
  });

  // -----------------------------------------------------------------------
  // Spec file generation (.spec.ts)
  // -----------------------------------------------------------------------

  describe('.spec.ts generation', () => {
    it('should generate spec file with TestBed setup', () => {
      const ir = makeBaseIR();
      const result = emitAngularArtifact(ir);
      expect(result.specFile).toContain("import { ComponentFixture, TestBed } from '@angular/core/testing'");
      expect(result.specFile).toContain('TestBed.configureTestingModule');
      expect(result.specFile).toContain('imports: [TestComponentComponent]');
    });

    it('should include component creation test', () => {
      const ir = makeBaseIR();
      const result = emitAngularArtifact(ir);
      expect(result.specFile).toContain("it('should create the component'");
      expect(result.specFile).toContain('expect(component).toBeTruthy()');
    });

    it('should include template rendering test', () => {
      const ir = makeBaseIR();
      const result = emitAngularArtifact(ir);
      expect(result.specFile).toContain("it('should render the template'");
      expect(result.specFile).toContain('fixture.nativeElement as HTMLElement');
    });

    it('should include signal reactivity test when signals exist', () => {
      const ir = makeBaseIR({
        angularSignals: [
          { name: 'count', type: 'number', initialValue: '0', originalStateName: 'count' },
        ],
      });
      const result = emitAngularArtifact(ir);
      expect(result.specFile).toContain('should have reactive signal count');
      expect(result.specFile).toContain('component.count()');
      expect(result.specFile).toContain('component.count.set(');
    });

    it('should NOT include signal test when no signals exist', () => {
      const ir = makeBaseIR({ angularSignals: [] });
      const result = emitAngularArtifact(ir);
      expect(result.specFile).not.toContain('reactive signal');
    });

    it('should include event handling test when event bindings exist', () => {
      const ir = makeBaseIR({
        templateBindings: [
          { type: 'event', angularSyntax: '(click)', originalJSX: 'onClick' },
        ],
      });
      const result = emitAngularArtifact(ir);
      expect(result.specFile).toContain('should handle click event');
      expect(result.specFile).toContain("dispatchEvent(new Event('click'))");
    });

    it('should NOT include event test when no event bindings exist', () => {
      const ir = makeBaseIR({ templateBindings: [] });
      const result = emitAngularArtifact(ir);
      expect(result.specFile).not.toContain('should handle');
    });
  });

  // -----------------------------------------------------------------------
  // Tailwind config generation
  // -----------------------------------------------------------------------

  describe('tailwind.config.js generation', () => {
    it('should generate tailwind config with component file paths', () => {
      const ir = makeBaseIR();
      const result = emitAngularArtifact(ir);
      expect(result.tailwindConfig).toContain('./test-component.component.ts');
      expect(result.tailwindConfig).toContain('./test-component.component.html');
    });

    it('should include PrimeNG preset', () => {
      const ir = makeBaseIR();
      const result = emitAngularArtifact(ir);
      expect(result.tailwindConfig).toContain("require('primeng/resources/primeng-preset')");
      expect(result.tailwindConfig).toContain('presets:');
    });

    it('should export as module.exports', () => {
      const ir = makeBaseIR();
      const result = emitAngularArtifact(ir);
      expect(result.tailwindConfig).toContain('module.exports = {');
    });
  });

  // -----------------------------------------------------------------------
  // Template file generation (separate .component.html)
  // -----------------------------------------------------------------------

  describe('template file generation', () => {
    it('should generate separate template file when isInlineTemplate is false', () => {
      const ir = makeBaseIR({
        isInlineTemplate: false,
        angularTemplate: '<div>\n  <p>Large template</p>\n</div>',
      });
      const result = emitAngularArtifact(ir);
      expect(result.templateFile).toBeDefined();
      expect(result.templateFile).toBe('<div>\n  <p>Large template</p>\n</div>');
    });

    it('should NOT generate separate template file when isInlineTemplate is true', () => {
      const ir = makeBaseIR({ isInlineTemplate: true });
      const result = emitAngularArtifact(ir);
      expect(result.templateFile).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Service generation for custom hooks
  // -----------------------------------------------------------------------

  describe('service generation for custom hooks', () => {
    it('should generate one service file per angularService', () => {
      const ir = makeBaseIR({
        angularServices: [
          {
            serviceName: 'AuthService',
            fileName: 'auth-service',
            methods: [
              { name: 'execute', parameters: [], returnType: 'boolean', body: 'return true;' },
            ],
            injections: [],
          },
          {
            serviceName: 'DataService',
            fileName: 'data-service',
            methods: [
              { name: 'execute', parameters: [{ name: 'id', type: 'string' }], returnType: 'any', body: 'return fetch(id);' },
            ],
            injections: [],
          },
        ],
      });
      const result = emitAngularArtifact(ir);
      expect(result.services).toHaveLength(2);
      expect(result.services[0].fileName).toBe('auth-service.service.ts');
      expect(result.services[1].fileName).toBe('data-service.service.ts');
    });

    it('should generate injectable service with @Injectable decorator', () => {
      const ir = makeBaseIR({
        angularServices: [
          {
            serviceName: 'AuthService',
            fileName: 'auth-service',
            methods: [
              { name: 'execute', parameters: [], returnType: 'boolean', body: 'return true;' },
            ],
            injections: [],
          },
        ],
      });
      const result = emitAngularArtifact(ir);
      const svc = result.services[0];
      expect(svc.content).toContain("import { Injectable } from '@angular/core'");
      expect(svc.content).toContain('@Injectable({');
      expect(svc.content).toContain("providedIn: 'root'");
      expect(svc.content).toContain('export class AuthService');
    });

    it('should include mapping comment in service methods', () => {
      const ir = makeBaseIR({
        angularServices: [
          {
            serviceName: 'FetchService',
            fileName: 'fetch-service',
            methods: [
              { name: 'execute', parameters: [], returnType: 'void', body: 'fetch()' },
            ],
            injections: [],
          },
        ],
      });
      const result = emitAngularArtifact(ir);
      expect(result.services[0].content).toContain('// Convertido de custom hook → service method');
    });

    it('should return empty services array when no angularServices', () => {
      const ir = makeBaseIR({ angularServices: [] });
      const result = emitAngularArtifact(ir);
      expect(result.services).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Naming conventions
  // -----------------------------------------------------------------------

  describe('Angular naming conventions', () => {
    it('should use kebab-case for file references', () => {
      const ir = makeBaseIR({ componentName: 'UserProfile' });
      const result = emitAngularArtifact(ir);
      expect(result.componentFile).toContain("selector: 'app-user-profile'");
      expect(result.tailwindConfig).toContain('./user-profile.component.ts');
    });

    it('should use PascalCase for class names', () => {
      const ir = makeBaseIR({ componentName: 'UserProfile' });
      const result = emitAngularArtifact(ir);
      expect(result.componentFile).toContain('export class UserProfileComponent');
    });

    it('should use camelCase for methods and properties', () => {
      const ir = makeBaseIR({
        componentMethods: [
          { name: 'HandleClick', parameters: [], returnType: 'void', body: '' },
        ],
        angularSignals: [
          { name: 'ItemCount', type: 'number', initialValue: '0', originalStateName: 'ItemCount' },
        ],
      });
      const result = emitAngularArtifact(ir);
      expect(result.componentFile).toContain('handleClick()');
      expect(result.componentFile).toContain('itemCount = signal');
    });
  });

  // -----------------------------------------------------------------------
  // Mapping comments
  // -----------------------------------------------------------------------

  describe('mapping comments in generated code', () => {
    it('should include mapping comments for all converted hooks', () => {
      const ir = makeBaseIR({
        angularSignals: [{ name: 'count', type: 'number', initialValue: '0', originalStateName: 'count' }],
        angularEffects: [{ body: 'log()', dependencies: [], cleanupFunction: undefined }],
        angularComputed: [{ name: 'doubled', type: 'number', computeFunction: 'count() * 2', dependencies: ['count'] }],
        angularInjections: [{ propertyName: 'auth', serviceName: 'AuthService', type: 'AuthService' }],
        angularViewChildren: [{ propertyName: 'myRef', selector: 'myRef', type: 'HTMLElement' }],
        classProperties: [{ name: 'timer', type: 'number', initialValue: '0' }],
        componentMethods: [{ name: 'doStuff', parameters: [], returnType: 'void', body: '' }],
      });
      const result = emitAngularArtifact(ir);
      expect(result.componentFile).toContain('// Convertido de useState → signal()');
      expect(result.componentFile).toContain('// Convertido de useEffect → effect()');
      expect(result.componentFile).toContain('// Convertido de useMemo → computed()');
      expect(result.componentFile).toContain('// Convertido de useContext → inject()');
      expect(result.componentFile).toContain('// Convertido de useRef → viewChild()');
      expect(result.componentFile).toContain('// Convertido de useRef → class property');
      expect(result.componentFile).toContain('// Convertido de useCallback → method');
    });
  });

  // -----------------------------------------------------------------------
  // Security warnings passthrough
  // -----------------------------------------------------------------------

  describe('security warnings', () => {
    it('should pass through security warnings from the IR', () => {
      const ir = makeBaseIR({
        securityWarnings: [
          { line: 10, pattern: 'eval', message: 'eval detected', severity: 'error' },
          { line: 20, pattern: 'dangerouslySetInnerHTML', message: 'unsafe', severity: 'warning' },
        ],
      });
      const result = emitAngularArtifact(ir);
      expect(result.securityWarnings).toHaveLength(2);
      expect(result.securityWarnings[0].pattern).toBe('eval');
      expect(result.securityWarnings[1].pattern).toBe('dangerouslySetInnerHTML');
    });
  });

  // -----------------------------------------------------------------------
  // Artifact completeness
  // -----------------------------------------------------------------------

  describe('artifact completeness', () => {
    it('should always produce componentFile, specFile, and tailwindConfig', () => {
      const ir = makeBaseIR();
      const result = emitAngularArtifact(ir);
      expect(result.componentFile).toBeTruthy();
      expect(result.specFile).toBeTruthy();
      expect(result.tailwindConfig).toBeTruthy();
      expect(typeof result.componentFile).toBe('string');
      expect(typeof result.specFile).toBe('string');
      expect(typeof result.tailwindConfig).toBe('string');
    });

    it('should produce a complete artifact for a complex component', () => {
      const ir = makeBaseIR({
        componentName: 'Dashboard',
        angularSignals: [{ name: 'items', type: 'string[]', initialValue: '[]', originalStateName: 'items' }],
        angularEffects: [{ body: 'fetchData()', dependencies: ['items'], cleanupFunction: undefined }],
        angularComputed: [{ name: 'itemCount', type: 'number', computeFunction: 'items().length', dependencies: ['items'] }],
        angularInjections: [{ propertyName: 'api', serviceName: 'ApiService', type: 'ApiService' }],
        props: [{ name: 'title', type: 'string', isRequired: true }],
        primeNgImports: [{ moduleName: 'TableModule', importPath: 'primeng/table' }],
        componentMethods: [{ name: 'refresh', parameters: [], returnType: 'void', body: 'this.fetchData()' }],
        templateBindings: [{ type: 'event', angularSyntax: '(click)', originalJSX: 'onClick' }],
        angularServices: [{
          serviceName: 'FetchService',
          fileName: 'fetch-service',
          methods: [{ name: 'execute', parameters: [], returnType: 'void', body: '' }],
          injections: [],
        }],
      });
      const result = emitAngularArtifact(ir);

      // Component file checks
      expect(result.componentFile).toContain('export class DashboardComponent');
      expect(result.componentFile).toContain('signal<string[]>([])');
      expect(result.componentFile).toContain('computed(');
      expect(result.componentFile).toContain('inject(ApiService)');
      expect(result.componentFile).toContain('@Input()');
      expect(result.componentFile).toContain('imports: [TableModule]');

      // Spec file checks
      expect(result.specFile).toContain('DashboardComponent');
      expect(result.specFile).toContain('reactive signal');
      expect(result.specFile).toContain('handle click event');

      // Services
      expect(result.services).toHaveLength(1);
      expect(result.services[0].fileName).toBe('fetch-service.service.ts');
    });
  });
});
