/**
 * Generators for React hook declarations used in property-based testing.
 *
 * Exports arbitraries for: useState, useEffect, useMemo, useCallback, useRef, useContext.
 * Uses types from src/types.ts where applicable.
 */
import * as fc from 'fast-check';
import type {
  StateDefinition,
  EffectDefinition,
  MemoDefinition,
  CallbackDefinition,
  RefDefinition,
  ContextDefinition,
  CustomHookDefinition,
} from '../../../src/types.js';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Valid TypeScript identifier (lowercase, 3-8 chars). */
export const identifierArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
  { minLength: 3, maxLength: 8 },
);

/** Simple TypeScript types. */
export const tsTypeArb = fc.constantFrom('string', 'number', 'boolean');

/** Extended TS types including 'any'. */
export const tsTypeExtendedArb = fc.constantFrom('string', 'number', 'boolean', 'any');

/** Return an initial value literal matching a TS type. */
export function initialValueForType(t: string): string {
  switch (t) {
    case 'string': return "''";
    case 'number': return '0';
    case 'boolean': return 'false';
    default: return 'null';
  }
}

// ---------------------------------------------------------------------------
// Hook definition arbitraries (IR-level objects)
// ---------------------------------------------------------------------------

/** Arbitrary for StateDefinition (useState). */
export const stateDefArb: fc.Arbitrary<StateDefinition> = fc.record({
  variableName: identifierArb,
  setterName: identifierArb.map((n) => 'set' + n.charAt(0).toUpperCase() + n.slice(1)),
  type: tsTypeExtendedArb,
  initialValue: tsTypeExtendedArb.chain((t) => fc.constant(initialValueForType(t))),
});

/** Arbitrary for EffectDefinition (useEffect). */
export const effectDefArb: fc.Arbitrary<EffectDefinition> = fc.record({
  body: identifierArb.map((n) => `console.log(${n})`),
  dependencies: fc.array(identifierArb, { minLength: 0, maxLength: 3 }),
  cleanupFunction: fc.option(identifierArb.map((n) => `cleanup_${n}()`), { nil: undefined }),
});

/** Arbitrary for MemoDefinition (useMemo). */
export const memoDefArb: fc.Arbitrary<MemoDefinition> = fc.record({
  variableName: identifierArb,
  computeFunction: identifierArb.map((n) => `${n}.compute()`),
  dependencies: fc.array(identifierArb, { minLength: 0, maxLength: 3 }),
  type: tsTypeExtendedArb,
});

/** Arbitrary for CallbackDefinition (useCallback). */
export const callbackDefArb: fc.Arbitrary<CallbackDefinition> = fc.record({
  functionName: identifierArb,
  body: identifierArb.map((n) => `handle_${n}()`),
  parameters: fc.array(
    fc.record({ name: identifierArb, type: tsTypeExtendedArb }),
    { minLength: 0, maxLength: 2 },
  ),
  dependencies: fc.array(identifierArb, { minLength: 0, maxLength: 2 }),
});

/** Arbitrary for RefDefinition — DOM ref (isDomRef: true). */
export const domRefArb: fc.Arbitrary<RefDefinition> = fc.record({
  variableName: identifierArb,
  initialValue: fc.constant('null'),
  isDomRef: fc.constant(true as const),
  type: fc.constantFrom('HTMLInputElement', 'HTMLDivElement', 'HTMLButtonElement'),
});

/** Arbitrary for RefDefinition — value ref (isDomRef: false). */
export const valueRefArb: fc.Arbitrary<RefDefinition> = fc.record({
  variableName: identifierArb,
  initialValue: tsTypeExtendedArb.chain((t) => fc.constant(initialValueForType(t))),
  isDomRef: fc.constant(false as const),
  type: tsTypeExtendedArb,
});

/** Arbitrary for any RefDefinition (useRef). */
export const refDefArb: fc.Arbitrary<RefDefinition> = fc.oneof(domRefArb, valueRefArb);

/** Arbitrary for ContextDefinition (useContext). */
export const contextDefArb: fc.Arbitrary<ContextDefinition> = fc.record({
  variableName: identifierArb,
  contextName: identifierArb.map((n) => n.charAt(0).toUpperCase() + n.slice(1) + 'Context'),
  type: identifierArb.map((n) => n.charAt(0).toUpperCase() + n.slice(1) + 'Type'),
});

/** Arbitrary for CustomHookDefinition. */
export const customHookDefArb: fc.Arbitrary<CustomHookDefinition> = identifierArb.map((base) => {
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
// Composite hook config arbitrary (for building ComponentIR)
// ---------------------------------------------------------------------------

/** Arbitrary producing a full set of hook definitions for a component. */
export const hookConfigArb = fc.record({
  states: fc.array(stateDefArb, { minLength: 0, maxLength: 3 }),
  effects: fc.array(effectDefArb, { minLength: 0, maxLength: 2 }),
  memos: fc.array(memoDefArb, { minLength: 0, maxLength: 2 }),
  callbacks: fc.array(callbackDefArb, { minLength: 0, maxLength: 2 }),
  refs: fc.array(refDefArb, { minLength: 0, maxLength: 3 }),
  contexts: fc.array(contextDefArb, { minLength: 0, maxLength: 2 }),
  customHooks: fc.array(customHookDefArb, { minLength: 0, maxLength: 2 }),
});

// ---------------------------------------------------------------------------
// Source-code-level hook builders (for generating React source strings)
// ---------------------------------------------------------------------------

/** Build a useState line: `const [foo, setFoo] = useState<string>('');` */
export function makeUseState(name: string, type: string): string {
  const setter = 'set' + name.charAt(0).toUpperCase() + name.slice(1);
  return `  const [${name}, ${setter}] = useState<${type}>(${initialValueForType(type)});`;
}

/** Build a useEffect line. */
export function makeUseEffect(depName: string): string {
  return `  useEffect(() => { console.log(${depName}); }, [${depName}]);`;
}

/** Build a useMemo line. */
export function makeUseMemo(varName: string, depName: string, type: string): string {
  return `  const ${varName} = useMemo<${type}>(() => ${depName}, [${depName}]);`;
}

/** Build a useCallback line. */
export function makeUseCallback(fnName: string, depName: string): string {
  return `  const ${fnName} = useCallback(() => { console.log(${depName}); }, [${depName}]);`;
}

/** Build a useRef line. */
export function makeUseRef(varName: string): string {
  return `  const ${varName} = useRef<number>(0);`;
}

/** Build a useContext line. */
export function makeUseContext(varName: string): string {
  return `  const ${varName} = useContext(SomeContext);`;
}
