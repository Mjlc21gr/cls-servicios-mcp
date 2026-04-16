import { describe, it, expect } from 'vitest';
import { mapStateToAngular } from '../../src/pipeline/state-mapper.js';
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
    angularTemplate: '',
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

describe('State_Mapper - mapStateToAngular', () => {
  it('should not mutate the input IR', () => {
    const ir = makeBaseIR({
      state: [{ variableName: 'count', setterName: 'setCount', type: 'number', initialValue: '0' }],
    });
    const original = JSON.parse(JSON.stringify(ir));
    mapStateToAngular(ir);
    expect(ir).toEqual(original);
  });

  describe('useState → signal()', () => {
    it('should convert a single useState to a signal preserving type and initial value', () => {
      const ir = makeBaseIR({
        state: [{ variableName: 'count', setterName: 'setCount', type: 'number', initialValue: '0' }],
      });
      const result = mapStateToAngular(ir);
      expect(result.angularSignals).toHaveLength(1);
      expect(result.angularSignals[0]).toEqual({
        name: 'count',
        type: 'number',
        initialValue: '0',
        originalStateName: 'count',
      });
    });

    it('should convert multiple useState hooks to signals', () => {
      const ir = makeBaseIR({
        state: [
          { variableName: 'name', setterName: 'setName', type: 'string', initialValue: "''" },
          { variableName: 'active', setterName: 'setActive', type: 'boolean', initialValue: 'false' },
        ],
      });
      const result = mapStateToAngular(ir);
      expect(result.angularSignals).toHaveLength(2);
      expect(result.angularSignals[0].name).toBe('name');
      expect(result.angularSignals[0].type).toBe('string');
      expect(result.angularSignals[1].name).toBe('active');
      expect(result.angularSignals[1].type).toBe('boolean');
    });
  });

  describe('useEffect → effect()', () => {
    it('should convert useEffect with dependencies to an Angular effect', () => {
      const ir = makeBaseIR({
        effects: [{
          body: 'console.log(count)',
          dependencies: ['count'],
          cleanupFunction: undefined,
        }],
      });
      const result = mapStateToAngular(ir);
      expect(result.angularEffects).toHaveLength(1);
      expect(result.angularEffects[0]).toEqual({
        body: 'console.log(count)',
        dependencies: ['count'],
        cleanupFunction: undefined,
      });
    });

    it('should preserve cleanup function in effect', () => {
      const ir = makeBaseIR({
        effects: [{
          body: 'window.addEventListener("resize", handler)',
          dependencies: [],
          cleanupFunction: 'window.removeEventListener("resize", handler)',
        }],
      });
      const result = mapStateToAngular(ir);
      expect(result.angularEffects[0].cleanupFunction).toBe('window.removeEventListener("resize", handler)');
    });
  });

  describe('useMemo → computed()', () => {
    it('should convert useMemo to computed preserving all fields', () => {
      const ir = makeBaseIR({
        memos: [{
          variableName: 'total',
          computeFunction: 'items.reduce((a, b) => a + b, 0)',
          dependencies: ['items'],
          type: 'number',
        }],
      });
      const result = mapStateToAngular(ir);
      expect(result.angularComputed).toHaveLength(1);
      expect(result.angularComputed[0]).toEqual({
        name: 'total',
        type: 'number',
        computeFunction: 'items.reduce((a, b) => a + b, 0)',
        dependencies: ['items'],
      });
    });
  });

  describe('useCallback → component method', () => {
    it('should convert useCallback to an Angular method', () => {
      const ir = makeBaseIR({
        callbacks: [{
          functionName: 'handleClick',
          body: 'setCount(prev => prev + 1)',
          parameters: [{ name: 'amount', type: 'number' }],
          dependencies: [],
        }],
      });
      const result = mapStateToAngular(ir);
      // Callback methods are appended after existing methods
      const method = result.componentMethods.find(m => m.name === 'handleClick');
      expect(method).toBeDefined();
      expect(method!.parameters).toEqual([{ name: 'amount', type: 'number' }]);
      expect(method!.body).toBe('setCount(prev => prev + 1)');
      expect(method!.returnType).toBe('void');
    });
  });

  describe('useRef (DOM) → viewChild()', () => {
    it('should convert DOM ref to viewChild', () => {
      const ir = makeBaseIR({
        refs: [{
          variableName: 'inputRef',
          initialValue: 'null',
          isDomRef: true,
          type: 'HTMLInputElement',
        }],
      });
      const result = mapStateToAngular(ir);
      expect(result.angularViewChildren).toHaveLength(1);
      expect(result.angularViewChildren[0]).toEqual({
        propertyName: 'inputRef',
        selector: 'inputRef',
        type: 'HTMLInputElement',
      });
      expect(result.classProperties).toHaveLength(0);
    });
  });

  describe('useRef (value) → class property', () => {
    it('should convert value ref to class property', () => {
      const ir = makeBaseIR({
        refs: [{
          variableName: 'intervalRef',
          initialValue: '0',
          isDomRef: false,
          type: 'number',
        }],
      });
      const result = mapStateToAngular(ir);
      expect(result.classProperties).toHaveLength(1);
      expect(result.classProperties[0]).toEqual({
        name: 'intervalRef',
        type: 'number',
        initialValue: '0',
      });
      expect(result.angularViewChildren).toHaveLength(0);
    });
  });

  describe('useRef mixed DOM and value', () => {
    it('should split refs into viewChildren and classProperties', () => {
      const ir = makeBaseIR({
        refs: [
          { variableName: 'inputRef', initialValue: 'null', isDomRef: true, type: 'HTMLInputElement' },
          { variableName: 'timerRef', initialValue: '0', isDomRef: false, type: 'number' },
        ],
      });
      const result = mapStateToAngular(ir);
      expect(result.angularViewChildren).toHaveLength(1);
      expect(result.angularViewChildren[0].propertyName).toBe('inputRef');
      expect(result.classProperties).toHaveLength(1);
      expect(result.classProperties[0].name).toBe('timerRef');
    });
  });

  describe('useContext → inject()', () => {
    it('should convert useContext to injection with service name', () => {
      const ir = makeBaseIR({
        contexts: [{
          variableName: 'theme',
          contextName: 'ThemeContext',
          type: 'ThemeType',
        }],
      });
      const result = mapStateToAngular(ir);
      expect(result.angularInjections).toHaveLength(1);
      expect(result.angularInjections[0]).toEqual({
        propertyName: 'theme',
        serviceName: 'ThemeContextService',
        type: 'ThemeType',
      });
    });
  });

  describe('Custom hooks → injectable service', () => {
    it('should convert custom hook to a service and an injection', () => {
      const ir = makeBaseIR({
        customHooks: [{
          hookName: 'useAuth',
          serviceName: 'AuthService',
          parameters: [],
          returnType: 'AuthState',
          internalHooks: ['useState'],
          body: 'const [user, setUser] = useState(null); return { user };',
        }],
      });
      const result = mapStateToAngular(ir);

      // Service
      expect(result.angularServices).toHaveLength(1);
      expect(result.angularServices[0].serviceName).toBe('AuthService');
      expect(result.angularServices[0].fileName).toBe('auth-service');
      expect(result.angularServices[0].methods).toHaveLength(1);
      expect(result.angularServices[0].methods[0].name).toBe('execute');

      // Injection for the custom hook service
      const hookInjection = result.angularInjections.find(i => i.serviceName === 'AuthService');
      expect(hookInjection).toBeDefined();
      expect(hookInjection!.propertyName).toBe('auth');
    });
  });

  describe('Existing methods are preserved', () => {
    it('should include existing methods alongside callback-derived methods', () => {
      const ir = makeBaseIR({
        methods: [{
          name: 'handleSubmit',
          parameters: [{ name: 'e', type: 'Event' }],
          returnType: 'void',
          body: 'e.preventDefault()',
        }],
        callbacks: [{
          functionName: 'increment',
          body: 'setCount(c => c + 1)',
          parameters: [],
          dependencies: [],
        }],
      });
      const result = mapStateToAngular(ir);
      expect(result.componentMethods).toHaveLength(2);
      expect(result.componentMethods[0].name).toBe('handleSubmit');
      expect(result.componentMethods[1].name).toBe('increment');
    });
  });

  describe('Empty component', () => {
    it('should return empty Angular fields for a component with no hooks', () => {
      const ir = makeBaseIR();
      const result = mapStateToAngular(ir);
      expect(result.angularSignals).toEqual([]);
      expect(result.angularEffects).toEqual([]);
      expect(result.angularComputed).toEqual([]);
      expect(result.angularInjections).toEqual([]);
      expect(result.angularServices).toEqual([]);
      expect(result.angularViewChildren).toEqual([]);
      expect(result.classProperties).toEqual([]);
      expect(result.componentMethods).toEqual([]);
    });
  });

  describe('Complex component with all hook types', () => {
    it('should correctly map all hooks simultaneously', () => {
      const ir = makeBaseIR({
        state: [
          { variableName: 'items', setterName: 'setItems', type: 'string[]', initialValue: '[]' },
          { variableName: 'filter', setterName: 'setFilter', type: 'string', initialValue: "''" },
        ],
        effects: [{ body: 'console.log(items)', dependencies: ['items'] }],
        memos: [{ variableName: 'filtered', computeFunction: 'items.filter(i => i)', dependencies: ['items'], type: 'string[]' }],
        callbacks: [{ functionName: 'addItem', body: 'setItems([...items, text])', parameters: [{ name: 'text', type: 'string' }], dependencies: ['items'] }],
        refs: [
          { variableName: 'inputRef', initialValue: 'null', isDomRef: true, type: 'HTMLInputElement' },
          { variableName: 'countRef', initialValue: '0', isDomRef: false, type: 'number' },
        ],
        contexts: [{ variableName: 'theme', contextName: 'ThemeContext', type: 'Theme' }],
        customHooks: [{ hookName: 'useAuth', serviceName: 'AuthService', parameters: [], returnType: 'Auth', internalHooks: ['useState'], body: 'return {}' }],
        methods: [{ name: 'handleSubmit', parameters: [], returnType: 'void', body: 'submit()' }],
      });

      const result = mapStateToAngular(ir);

      expect(result.angularSignals).toHaveLength(2);
      expect(result.angularEffects).toHaveLength(1);
      expect(result.angularComputed).toHaveLength(1);
      expect(result.angularViewChildren).toHaveLength(1);
      expect(result.classProperties).toHaveLength(1);
      // 1 context injection + 1 custom hook injection
      expect(result.angularInjections).toHaveLength(2);
      expect(result.angularServices).toHaveLength(1);
      // 1 existing method + 1 callback method
      expect(result.componentMethods).toHaveLength(2);
    });
  });
});
