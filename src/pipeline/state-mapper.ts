import {
  ComponentIR,
  StateDefinition,
  EffectDefinition,
  MemoDefinition,
  CallbackDefinition,
  RefDefinition,
  ContextDefinition,
  CustomHookDefinition,
  SignalDefinition,
  AngularEffectDefinition,
  ComputedDefinition,
  InjectionDefinition,
  ServiceDefinition,
  ViewChildDefinition,
  ClassPropertyDefinition,
  AngularMethodDefinition,
} from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a PascalCase or camelCase name to kebab-case for Angular file names.
 */
function toKebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Individual mappers
// ---------------------------------------------------------------------------

/**
 * useState → signal()
 * Creates a SignalDefinition preserving type and initial value.
 */
function mapUseState(states: StateDefinition[]): SignalDefinition[] {
  return states.map((s) => ({
    name: s.variableName,
    type: s.type,
    initialValue: s.initialValue,
    originalStateName: s.variableName,
  }));
}

/**
 * useEffect → effect()
 * Creates an AngularEffectDefinition preserving body, dependencies, and cleanup.
 */
function mapUseEffect(effects: EffectDefinition[]): AngularEffectDefinition[] {
  return effects.map((e) => ({
    body: e.body,
    dependencies: [...e.dependencies],
    cleanupFunction: e.cleanupFunction,
  }));
}

/**
 * useMemo → computed()
 * Creates a ComputedDefinition preserving name, type, compute function, and dependencies.
 */
function mapUseMemo(memos: MemoDefinition[]): ComputedDefinition[] {
  return memos.map((m) => ({
    name: m.variableName,
    type: m.type,
    computeFunction: m.computeFunction,
    dependencies: [...m.dependencies],
  }));
}

/**
 * useCallback → Angular component method
 * Creates an AngularMethodDefinition from each callback.
 */
function mapUseCallback(callbacks: CallbackDefinition[]): AngularMethodDefinition[] {
  return callbacks.map((cb) => ({
    name: cb.functionName,
    parameters: cb.parameters.map((p) => ({ ...p })),
    returnType: 'void',
    body: cb.body,
  }));
}

/**
 * useRef (isDomRef=true) → viewChild()
 * Creates a ViewChildDefinition for DOM refs.
 */
function mapDomRefs(refs: RefDefinition[]): ViewChildDefinition[] {
  return refs
    .filter((r) => r.isDomRef)
    .map((r) => ({
      propertyName: r.variableName,
      selector: r.variableName,
      type: r.type,
    }));
}

/**
 * useRef (isDomRef=false) → class property
 * Creates a ClassPropertyDefinition for value refs.
 */
function mapValueRefs(refs: RefDefinition[]): ClassPropertyDefinition[] {
  return refs
    .filter((r) => !r.isDomRef)
    .map((r) => ({
      name: r.variableName,
      type: r.type,
      initialValue: r.initialValue,
    }));
}

/**
 * useContext → inject() with corresponding Angular service
 * Creates an InjectionDefinition with serviceName = contextName + 'Service'.
 */
function mapUseContext(contexts: ContextDefinition[]): InjectionDefinition[] {
  return contexts.map((c) => ({
    propertyName: c.variableName,
    serviceName: c.contextName + 'Service',
    type: c.type,
  }));
}

/**
 * Custom hooks (useX) → injectable service XService
 * Creates a ServiceDefinition for each custom hook.
 */
function mapCustomHooks(hooks: CustomHookDefinition[]): ServiceDefinition[] {
  return hooks.map((h) => ({
    serviceName: h.serviceName,
    fileName: toKebabCase(h.serviceName),
    methods: [
      {
        name: 'execute',
        parameters: h.parameters.map((p) => ({ ...p })),
        returnType: h.returnType,
        body: h.body,
      },
    ],
    injections: [],
  }));
}

/**
 * Build InjectionDefinitions for custom hook services so they can be injected
 * into the component via inject().
 */
function mapCustomHookInjections(hooks: CustomHookDefinition[]): InjectionDefinition[] {
  return hooks.map((h) => ({
    propertyName: h.hookName.replace(/^use/, '').charAt(0).toLowerCase() +
      h.hookName.replace(/^use/, '').slice(1),
    serviceName: h.serviceName,
    type: h.returnType,
  }));
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Maps React state patterns to Angular 19+ equivalents.
 *
 * Takes a ComponentIR (already populated by AST_Parser) and returns a new
 * ComponentIR with the Angular-side fields populated. Does NOT mutate the input.
 */
export function mapStateToAngular(ir: ComponentIR): ComponentIR {
  const angularSignals = mapUseState(ir.state);
  const angularEffects = mapUseEffect(ir.effects);
  const angularComputed = mapUseMemo(ir.memos);
  const callbackMethods = mapUseCallback(ir.callbacks);
  const angularViewChildren = mapDomRefs(ir.refs);
  const valueRefProperties = mapValueRefs(ir.refs);
  const contextInjections = mapUseContext(ir.contexts);
  const angularServices = mapCustomHooks(ir.customHooks);
  const hookInjections = mapCustomHookInjections(ir.customHooks);

  // Merge context injections and custom hook injections
  const angularInjections = [...contextInjections, ...hookInjections];

  // Merge callback-derived methods with existing component methods
  const existingMethods: AngularMethodDefinition[] = ir.methods.map((m) => ({
    name: m.name,
    parameters: m.parameters.map((p) => ({ ...p })),
    returnType: m.returnType,
    body: m.body,
  }));
  const componentMethods = [...existingMethods, ...callbackMethods];

  return {
    ...ir,
    angularSignals,
    angularEffects,
    angularComputed,
    angularInjections,
    angularServices,
    angularViewChildren,
    classProperties: valueRefProperties,
    componentMethods,
  };
}
