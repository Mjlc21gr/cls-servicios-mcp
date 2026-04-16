import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { mapStateToAngular } from '../../src/pipeline/state-mapper.js';
import {
  ComponentIR,
  StateDefinition,
  EffectDefinition,
  MemoDefinition,
  CallbackDefinition,
  RefDefinition,
  ContextDefinition,
  CustomHookDefinition,
  JSXNode,
} from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmptyJSXNode(): JSXNode {
  return { tag: 'div', attributes: [], children: [], isComponent: false };
}

/** Simple identifier generator */
const identArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
  { minLength: 3, maxLength: 8 },
);

/** TypeScript type generator */
const tsTypeArb = fc.constantFrom('string', 'number', 'boolean', 'any');

/** Initial value matching a TS type */
function initialValueForType(t: string): string {
  switch (t) {
    case 'string': return "''";
    case 'number': return '0';
    case 'boolean': return 'false';
    default: return 'null';
  }
}

// ---------------------------------------------------------------------------
// Generators for individual hook definitions
// ---------------------------------------------------------------------------

const stateDefArb: fc.Arbitrary<StateDefinition> = fc.record({
  variableName: identArb,
  setterName: identArb.map((n) => 'set' + n.charAt(0).toUpperCase() + n.slice(1)),
  type: tsTypeArb,
  initialValue: tsTypeArb.chain((t) => fc.constant(initialValueForType(t))),
});

const effectDefArb: fc.Arbitrary<EffectDefinition> = fc.record({
  body: identArb.map((n) => `console.log(${n})`),
  dependencies: fc.array(identArb, { minLength: 0, maxLength: 3 }),
  cleanupFunction: fc.option(identArb.map((n) => `cleanup_${n}()`), { nil: undefined }),
});

const memoDefArb: fc.Arbitrary<MemoDefinition> = fc.record({
  variableName: identArb,
  computeFunction: identArb.map((n) => `${n}.compute()`),
  dependencies: fc.array(identArb, { minLength: 0, maxLength: 3 }),
  type: tsTypeArb,
});

const callbackDefArb: fc.Arbitrary<CallbackDefinition> = fc.record({
  functionName: identArb,
  body: identArb.map((n) => `handle_${n}()`),
  parameters: fc.array(
    fc.record({ name: identArb, type: tsTypeArb }),
    { minLength: 0, maxLength: 2 },
  ),
  dependencies: fc.array(identArb, { minLength: 0, maxLength: 2 }),
});

const domRefArb: fc.Arbitrary<RefDefinition> = fc.record({
  variableName: identArb,
  initialValue: fc.constant('null'),
  isDomRef: fc.constant(true as const),
  type: fc.constantFrom('HTMLInputElement', 'HTMLDivElement', 'HTMLButtonElement'),
});

const valueRefArb: fc.Arbitrary<RefDefinition> = fc.record({
  variableName: identArb,
  initialValue: tsTypeArb.chain((t) => fc.constant(initialValueForType(t))),
  isDomRef: fc.constant(false as const),
  type: tsTypeArb,
});

const refDefArb: fc.Arbitrary<RefDefinition> = fc.oneof(domRefArb, valueRefArb);

const contextDefArb: fc.Arbitrary<ContextDefinition> = fc.record({
  variableName: identArb,
  contextName: identArb.map((n) => n.charAt(0).toUpperCase() + n.slice(1) + 'Context'),
  type: identArb.map((n) => n.charAt(0).toUpperCase() + n.slice(1) + 'Type'),
});

const customHookDefArb: fc.Arbitrary<CustomHookDefinition> = identArb.map((base) => {
  const capitalized = base.charAt(0).toUpperCase() + base.slice(1);
  return {
    hookName: `use${capitalized}`,
    serviceName: `${capitalized}Service`,
    parameters: [],
    returnType: `${capitalized}State`,
    internalHooks: ['useState'],
    body: `return {}`,
  };
});

// ---------------------------------------------------------------------------
// Composite IR generator
// ---------------------------------------------------------------------------

const hookConfigArb = fc.record({
  states: fc.array(stateDefArb, { minLength: 0, maxLength: 3 }),
  effects: fc.array(effectDefArb, { minLength: 0, maxLength: 2 }),
  memos: fc.array(memoDefArb, { minLength: 0, maxLength: 2 }),
  callbacks: fc.array(callbackDefArb, { minLength: 0, maxLength: 2 }),
  refs: fc.array(refDefArb, { minLength: 0, maxLength: 3 }),
  contexts: fc.array(contextDefArb, { minLength: 0, maxLength: 2 }),
  customHooks: fc.array(customHookDefArb, { minLength: 0, maxLength: 2 }),
});

function buildIR(cfg: {
  states: StateDefinition[];
  effects: EffectDefinition[];
  memos: MemoDefinition[];
  callbacks: CallbackDefinition[];
  refs: RefDefinition[];
  contexts: ContextDefinition[];
  customHooks: CustomHookDefinition[];
}): ComponentIR {
  return {
    componentName: 'TestComponent',
    fileName: 'test-component',
    props: [],
    state: cfg.states,
    effects: cfg.effects,
    memos: cfg.memos,
    callbacks: cfg.callbacks,
    refs: cfg.refs,
    contexts: cfg.contexts,
    customHooks: cfg.customHooks,
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
  };
}

// ---------------------------------------------------------------------------
// Property 4: Mapeo correcto de hooks React a equivalentes Angular 19+
// ---------------------------------------------------------------------------

/**
 * Feature: react-to-angular-mcp
 * Property 4: Mapeo correcto de hooks React a equivalentes Angular 19+
 *
 * For any React component containing any combination of hooks (useState,
 * useEffect, useMemo, useCallback, useRef, useContext, custom hooks), the
 * State_Mapper SHALL transform each hook to its correct Angular 19+ equivalent
 * (signal, effect, computed, method, viewChild/property, inject, injectable
 * service respectively), preserving types and initial values.
 *
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7**
 */
describe('Property 4: Mapeo correcto de hooks React a equivalentes Angular 19+', () => {
  it('should map every hook type to its correct Angular equivalent', () => {
    fc.assert(
      fc.property(hookConfigArb, (cfg) => {
        const ir = buildIR(cfg);
        const result = mapStateToAngular(ir);

        // --- 4.1: useState → signal() ---
        // Count must match
        expect(result.angularSignals).toHaveLength(cfg.states.length);
        // Each signal preserves type and initial value
        for (let i = 0; i < cfg.states.length; i++) {
          expect(result.angularSignals[i].name).toBe(cfg.states[i].variableName);
          expect(result.angularSignals[i].type).toBe(cfg.states[i].type);
          expect(result.angularSignals[i].initialValue).toBe(cfg.states[i].initialValue);
          expect(result.angularSignals[i].originalStateName).toBe(cfg.states[i].variableName);
        }

        // --- 4.2: useEffect → effect() ---
        expect(result.angularEffects).toHaveLength(cfg.effects.length);
        for (let i = 0; i < cfg.effects.length; i++) {
          expect(result.angularEffects[i].body).toBe(cfg.effects[i].body);
          expect(result.angularEffects[i].dependencies).toEqual(cfg.effects[i].dependencies);
          expect(result.angularEffects[i].cleanupFunction).toBe(cfg.effects[i].cleanupFunction);
        }

        // --- 4.3: useMemo → computed() ---
        expect(result.angularComputed).toHaveLength(cfg.memos.length);
        for (let i = 0; i < cfg.memos.length; i++) {
          expect(result.angularComputed[i].name).toBe(cfg.memos[i].variableName);
          expect(result.angularComputed[i].type).toBe(cfg.memos[i].type);
          expect(result.angularComputed[i].computeFunction).toBe(cfg.memos[i].computeFunction);
          expect(result.angularComputed[i].dependencies).toEqual(cfg.memos[i].dependencies);
        }

        // --- 4.4: useCallback → component method ---
        // Callback methods are appended after existing methods (none here)
        for (const cb of cfg.callbacks) {
          const method = result.componentMethods.find((m) => m.name === cb.functionName);
          expect(method).toBeDefined();
          expect(method!.body).toBe(cb.body);
        }

        // --- 4.5: useRef → viewChild (DOM) or class property (value) ---
        const domRefs = cfg.refs.filter((r) => r.isDomRef);
        const valueRefs = cfg.refs.filter((r) => !r.isDomRef);
        expect(result.angularViewChildren).toHaveLength(domRefs.length);
        expect(result.classProperties).toHaveLength(valueRefs.length);

        for (let i = 0; i < domRefs.length; i++) {
          expect(result.angularViewChildren[i].propertyName).toBe(domRefs[i].variableName);
          expect(result.angularViewChildren[i].type).toBe(domRefs[i].type);
        }
        for (let i = 0; i < valueRefs.length; i++) {
          expect(result.classProperties[i].name).toBe(valueRefs[i].variableName);
          expect(result.classProperties[i].type).toBe(valueRefs[i].type);
          expect(result.classProperties[i].initialValue).toBe(valueRefs[i].initialValue);
        }

        // --- 4.6: useContext → inject() ---
        // Context injections are first in the angularInjections array
        for (let i = 0; i < cfg.contexts.length; i++) {
          expect(result.angularInjections[i].propertyName).toBe(cfg.contexts[i].variableName);
          expect(result.angularInjections[i].serviceName).toBe(cfg.contexts[i].contextName + 'Service');
        }

        // --- 4.7: Custom hooks → injectable service ---
        expect(result.angularServices).toHaveLength(cfg.customHooks.length);
        for (let i = 0; i < cfg.customHooks.length; i++) {
          expect(result.angularServices[i].serviceName).toBe(cfg.customHooks[i].serviceName);
          // fileName should be kebab-case of serviceName
          expect(result.angularServices[i].fileName).toMatch(/^[a-z][a-z0-9-]*$/);
        }

        // Total injections = contexts + custom hooks
        expect(result.angularInjections).toHaveLength(
          cfg.contexts.length + cfg.customHooks.length,
        );

        // Total component methods = callbacks (no existing methods in this IR)
        expect(result.componentMethods).toHaveLength(cfg.callbacks.length);
      }),
      { numRuns: 100 },
    );
  });
});
