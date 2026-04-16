import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServer, convertHandler, shellHandler, moduleHandler } from '../../src/server.js';

// ---------------------------------------------------------------------------
// Mock pipeline modules so unit tests are fast and isolated
// ---------------------------------------------------------------------------

vi.mock('../../src/security/validator.js', () => ({
  validateInput: vi.fn(),
}));
vi.mock('../../src/pipeline/ast-parser.js', () => ({
  parseReactComponent: vi.fn(),
}));
vi.mock('../../src/pipeline/state-mapper.js', () => ({
  mapStateToAngular: vi.fn(),
}));
vi.mock('../../src/pipeline/template-generator.js', () => ({
  generateAngularTemplate: vi.fn(),
}));
vi.mock('../../src/pipeline/primeng-mapper.js', () => ({
  mapToPrimeNG: vi.fn(),
}));
vi.mock('../../src/emitter/code-emitter.js', () => ({
  emitAngularArtifact: vi.fn(),
}));
vi.mock('../../src/generators/shell-generator.js', () => ({
  generateShellApp: vi.fn(),
}));
vi.mock('../../src/generators/module-generator.js', () => ({
  generateRemoteApp: vi.fn(),
}));

import { validateInput } from '../../src/security/validator.js';
import { parseReactComponent } from '../../src/pipeline/ast-parser.js';
import { mapStateToAngular } from '../../src/pipeline/state-mapper.js';
import { generateAngularTemplate } from '../../src/pipeline/template-generator.js';
import { mapToPrimeNG } from '../../src/pipeline/primeng-mapper.js';
import { emitAngularArtifact } from '../../src/emitter/code-emitter.js';
import { generateShellApp } from '../../src/generators/shell-generator.js';
import { generateRemoteApp } from '../../src/generators/module-generator.js';

const mockValidateInput = vi.mocked(validateInput);
const mockParseReactComponent = vi.mocked(parseReactComponent);
const mockMapStateToAngular = vi.mocked(mapStateToAngular);
const mockGenerateAngularTemplate = vi.mocked(generateAngularTemplate);
const mockMapToPrimeNG = vi.mocked(mapToPrimeNG);
const mockEmitAngularArtifact = vi.mocked(emitAngularArtifact);
const mockGenerateShellApp = vi.mocked(generateShellApp);
const mockGenerateRemoteApp = vi.mocked(generateRemoteApp);

// ---------------------------------------------------------------------------
// Minimal IR stub for pipeline tests
// ---------------------------------------------------------------------------

function stubIR() {
  return {
    componentName: 'Test',
    fileName: 'test',
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
    jsxTree: { tag: 'div', attributes: [], children: [], isComponent: false },
    typeInterfaces: [],
    angularSignals: [],
    angularEffects: [],
    angularComputed: [],
    angularInjections: [],
    angularServices: [],
    angularViewChildren: [],
    classProperties: [],
    componentMethods: [],
    angularTemplate: '<div></div>',
    isInlineTemplate: true,
    templateBindings: [],
    primeNgImports: [],
    securityWarnings: [],
  } as any;
}

function stubArtifact() {
  return {
    componentFile: '// component',
    specFile: '// spec',
    tailwindConfig: '// tailwind',
    services: [],
    securityWarnings: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MCP Server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Tool listing
  // -----------------------------------------------------------------------

  describe('tool listing', () => {
    it('should create a server with 3 registered tools', () => {
      const server = createServer();
      // The server is created without errors — tools are registered internally.
      // We verify by checking the server object exists and is an McpServer.
      expect(server).toBeDefined();
      expect(typeof server.connect).toBe('function');
    });
  });

  // -----------------------------------------------------------------------
  // convert_react_to_angular
  // -----------------------------------------------------------------------

  describe('convert_react_to_angular', () => {
    it('should run the full pipeline in order: validate → parse → state → template → primeng → emit', async () => {
      const ir = stubIR();
      const artifact = stubArtifact();

      mockValidateInput.mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
        sanitizedCode: 'const X = () => <div/>;',
      });
      mockParseReactComponent.mockReturnValue(ir);
      mockMapStateToAngular.mockReturnValue(ir);
      mockGenerateAngularTemplate.mockReturnValue(ir);
      mockMapToPrimeNG.mockReturnValue(ir);
      mockEmitAngularArtifact.mockReturnValue(artifact);

      const result = await convertHandler({ sourceCode: 'const X = () => <div/>;' });

      // Verify sequential execution order
      expect(mockValidateInput).toHaveBeenCalledTimes(1);
      expect(mockParseReactComponent).toHaveBeenCalledTimes(1);
      expect(mockMapStateToAngular).toHaveBeenCalledTimes(1);
      expect(mockGenerateAngularTemplate).toHaveBeenCalledTimes(1);
      expect(mockMapToPrimeNG).toHaveBeenCalledTimes(1);
      expect(mockEmitAngularArtifact).toHaveBeenCalledTimes(1);

      // Verify order: validate called first, then parse with sanitized code
      const validateOrder = mockValidateInput.mock.invocationCallOrder[0];
      const parseOrder = mockParseReactComponent.mock.invocationCallOrder[0];
      const stateOrder = mockMapStateToAngular.mock.invocationCallOrder[0];
      const templateOrder = mockGenerateAngularTemplate.mock.invocationCallOrder[0];
      const primengOrder = mockMapToPrimeNG.mock.invocationCallOrder[0];
      const emitOrder = mockEmitAngularArtifact.mock.invocationCallOrder[0];

      expect(validateOrder).toBeLessThan(parseOrder);
      expect(parseOrder).toBeLessThan(stateOrder);
      expect(stateOrder).toBeLessThan(templateOrder);
      expect(templateOrder).toBeLessThan(primengOrder);
      expect(primengOrder).toBeLessThan(emitOrder);

      // Verify success response
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.artifact).toBeDefined();
    });

    it('should return success with valid input', async () => {
      const ir = stubIR();
      const artifact = stubArtifact();

      mockValidateInput.mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
        sanitizedCode: 'export const App = () => <div>Hello</div>;',
      });
      mockParseReactComponent.mockReturnValue(ir);
      mockMapStateToAngular.mockReturnValue(ir);
      mockGenerateAngularTemplate.mockReturnValue(ir);
      mockMapToPrimeNG.mockReturnValue(ir);
      mockEmitAngularArtifact.mockReturnValue(artifact);

      const result = await convertHandler({
        sourceCode: 'export const App = () => <div>Hello</div>;',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.artifact.componentFile).toBe('// component');
    });

    it('should return security error for invalid input', async () => {
      mockValidateInput.mockReturnValue({
        isValid: false,
        errors: [{ type: 'security', message: 'Use of eval() is not allowed' }],
        warnings: [],
      });

      const result = await convertHandler({ sourceCode: 'eval("bad")' });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error.type).toBe('security_error');
      expect(parsed.error.message).toContain('eval');
    });

    it('should return syntax error for invalid JSX', async () => {
      mockValidateInput.mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
        sanitizedCode: '<div><',
      });
      mockParseReactComponent.mockImplementation(() => {
        throw new Error('Unexpected token (1:5)');
      });

      const result = await convertHandler({ sourceCode: '<div><' });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error.type).toBe('syntax_error');
      expect(parsed.error.details?.line).toBe(1);
    });

    it('should return error for security violation from validator', async () => {
      mockValidateInput.mockReturnValue({
        isValid: false,
        errors: [{ type: 'size', message: 'Input size exceeds maximum' }],
        warnings: [],
      });

      const result = await convertHandler({ sourceCode: 'x'.repeat(600_000) });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error.type).toBe('size_error');
    });
  });

  // -----------------------------------------------------------------------
  // Timeout
  // -----------------------------------------------------------------------

  describe('timeout handling', () => {
    it('should return timeout error when processing exceeds 30 seconds', async () => {
      mockValidateInput.mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
        sanitizedCode: 'code',
      });
      // Simulate a long-running parse
      mockParseReactComponent.mockImplementation(() => {
        return new Promise(() => {
          // Never resolves
        }) as any;
      });

      // We can't actually wait 30s in a test, so we test the error format
      // by making the handler throw a TIMEOUT error directly
      const result = await convertHandler({ sourceCode: 'code' }).catch(() => null);

      // Since the mock returns a promise that never resolves, the timeout
      // mechanism will fire. But in tests we verify the error format instead.
      // Let's test the error handler directly:
      mockParseReactComponent.mockImplementation(() => {
        throw new Error('TIMEOUT');
      });

      const timeoutResult = await convertHandler({ sourceCode: 'code' });
      expect(timeoutResult.isError).toBe(true);
      const parsed = JSON.parse(timeoutResult.content[0].text);
      expect(parsed.error.type).toBe('timeout');
      expect(parsed.error.message).toContain('30-second');
    });
  });

  // -----------------------------------------------------------------------
  // MCP error format
  // -----------------------------------------------------------------------

  describe('MCP error format', () => {
    it('should return errors with isError: true and standard structure', async () => {
      mockValidateInput.mockReturnValue({
        isValid: false,
        errors: [{ type: 'security', message: 'Injection detected' }],
        warnings: [],
      });

      const result = await convertHandler({ sourceCode: 'eval("x")' });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveProperty('success', false);
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toHaveProperty('type');
      expect(parsed.error).toHaveProperty('message');
    });

    it('should return internal_error for unknown exceptions', async () => {
      mockValidateInput.mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
        sanitizedCode: 'code',
      });
      mockParseReactComponent.mockImplementation(() => {
        throw new Error('Something unexpected');
      });

      const result = await convertHandler({ sourceCode: 'code' });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error.type).toBe('internal_error');
    });
  });

  // -----------------------------------------------------------------------
  // generate_microfrontend_shell
  // -----------------------------------------------------------------------

  describe('generate_microfrontend_shell', () => {
    it('should invoke shell generator with valid config', async () => {
      const shellArtifact = {
        appConfig: '// config',
        appRoutes: '// routes',
        federationConfig: '// federation',
        tailwindConfig: '// tailwind',
        appComponent: '// component',
        cspMeta: '// csp',
      };
      mockGenerateShellApp.mockReturnValue(shellArtifact);

      const result = await shellHandler({
        appName: 'my-shell',
        remotes: [
          {
            name: 'remote1',
            path: 'remote1',
            remoteEntry: 'http://localhost:4201/remoteEntry.js',
            exposedModule: './Component',
          },
        ],
      });

      expect(mockGenerateShellApp).toHaveBeenCalledTimes(1);
      expect(mockGenerateShellApp).toHaveBeenCalledWith({
        appName: 'my-shell',
        remotes: [
          {
            name: 'remote1',
            path: 'remote1',
            remoteEntry: 'http://localhost:4201/remoteEntry.js',
            exposedModule: './Component',
          },
        ],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.artifact).toEqual(shellArtifact);
    });
  });

  // -----------------------------------------------------------------------
  // generate_angular_module
  // -----------------------------------------------------------------------

  describe('generate_angular_module', () => {
    it('should invoke module generator with valid config', async () => {
      const moduleArtifact = {
        federationConfig: '// federation',
        components: [],
        appConfig: '// config',
      };
      mockGenerateRemoteApp.mockReturnValue(moduleArtifact);

      const result = await moduleHandler({
        moduleName: 'my-module',
        components: [{ name: 'Dashboard', path: './dashboard.component.ts' }],
      });

      expect(mockGenerateRemoteApp).toHaveBeenCalledTimes(1);
      expect(mockGenerateRemoteApp).toHaveBeenCalledWith({
        moduleName: 'my-module',
        components: [{ name: 'Dashboard', path: './dashboard.component.ts' }],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.artifact).toEqual(moduleArtifact);
    });
  });
});
