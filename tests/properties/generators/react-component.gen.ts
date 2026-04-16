/**
 * Generators for valid React component source code strings,
 * invalid code, and code with unsafe patterns.
 *
 * Consolidates the inline component builders used across property test files.
 */
import * as fc from 'fast-check';
import type { ComponentIR } from '../../../src/types.js';
import {
  identifierArb,
  tsTypeArb,
  initialValueForType,
  makeUseState,
  makeUseEffect,
  makeUseMemo,
  makeUseCallback,
  makeUseRef,
  makeUseContext,
} from './hooks.gen.js';
import { makeEmptyJSXNode } from './jsx-tree.gen.js';

// ---------------------------------------------------------------------------
// Component configuration arbitraries
// ---------------------------------------------------------------------------

/** Base component config with all hook counts. */
export const componentConfigArb = fc.record({
  useStateCount: fc.integer({ min: 0, max: 3 }),
  useEffectCount: fc.integer({ min: 0, max: 2 }),
  useMemoCount: fc.integer({ min: 0, max: 2 }),
  useCallbackCount: fc.integer({ min: 0, max: 2 }),
  useRefCount: fc.integer({ min: 0, max: 1 }),
  useContextCount: fc.integer({ min: 0, max: 1 }),
  stateTypes: fc.array(tsTypeArb, { minLength: 3, maxLength: 3 }),
  memoTypes: fc.array(tsTypeArb, { minLength: 2, maxLength: 2 }),
});

/** Extended config that also includes JSX features (click handler, conditional). */
export const componentConfigWithJSXArb = fc.record({
  useStateCount: fc.integer({ min: 0, max: 3 }),
  useEffectCount: fc.integer({ min: 0, max: 2 }),
  useMemoCount: fc.integer({ min: 0, max: 2 }),
  useCallbackCount: fc.integer({ min: 0, max: 2 }),
  stateTypes: fc.array(tsTypeArb, { minLength: 3, maxLength: 3 }),
  memoTypes: fc.array(tsTypeArb, { minLength: 2, maxLength: 2 }),
  hasClickHandler: fc.boolean(),
  hasConditional: fc.boolean(),
});

/** Config with a named component and hooks (for naming/mapping tests). */
export const namedComponentConfigArb = fc.record({
  componentName: fc.constantFrom(
    'UserProfile', 'TodoList', 'DataTable', 'SearchBar',
    'NavMenu', 'LoginForm', 'ChatWidget', 'FileUploader',
  ),
  useStateCount: fc.integer({ min: 0, max: 3 }),
  stateTypes: fc.array(tsTypeArb, { minLength: 3, maxLength: 3 }),
  useEffectCount: fc.integer({ min: 0, max: 2 }),
  useMemoCount: fc.integer({ min: 0, max: 2 }),
  useCallbackCount: fc.integer({ min: 0, max: 2 }),
  memoTypes: fc.array(tsTypeArb, { minLength: 2, maxLength: 2 }),
});

/** Config for spec-gen tests (signals + event handlers). */
export const specGenConfigArb = fc.record({
  useStateCount: fc.integer({ min: 0, max: 3 }),
  stateTypes: fc.array(tsTypeArb, { minLength: 3, maxLength: 3 }),
  hasClickHandler: fc.boolean(),
  hasChangeHandler: fc.boolean(),
});

// ---------------------------------------------------------------------------
// Source code builders
// ---------------------------------------------------------------------------

/**
 * Build a full React component source from a base config.
 * Supports all hook types: useState, useEffect, useMemo, useCallback, useRef, useContext.
 */
export function buildComponentSource(cfg: {
  useStateCount: number;
  useEffectCount: number;
  useMemoCount: number;
  useCallbackCount: number;
  useRefCount?: number;
  useContextCount?: number;
  stateTypes: string[];
  memoTypes: string[];
}): string {
  const hookImports: string[] = [];
  if (cfg.useStateCount > 0) hookImports.push('useState');
  if (cfg.useEffectCount > 0) hookImports.push('useEffect');
  if (cfg.useMemoCount > 0) hookImports.push('useMemo');
  if (cfg.useCallbackCount > 0) hookImports.push('useCallback');
  if ((cfg.useRefCount ?? 0) > 0) hookImports.push('useRef');
  if ((cfg.useContextCount ?? 0) > 0) hookImports.push('useContext');

  const lines: string[] = [];
  lines.push(`import React${hookImports.length ? ', { ' + hookImports.join(', ') + ' }' : ''} from 'react';`);
  lines.push('');
  lines.push('export default function TestComponent() {');

  const stateNames: string[] = [];
  for (let i = 0; i < cfg.useStateCount; i++) {
    const name = `stateVar${i}`;
    stateNames.push(name);
    lines.push(makeUseState(name, cfg.stateTypes[i]));
  }

  for (let i = 0; i < (cfg.useRefCount ?? 0); i++) {
    lines.push(makeUseRef(`refVar${i}`));
  }

  for (let i = 0; i < (cfg.useContextCount ?? 0); i++) {
    lines.push(makeUseContext(`ctxVar${i}`));
  }

  const dep = stateNames.length > 0 ? stateNames[0] : "'dep'";
  for (let i = 0; i < cfg.useEffectCount; i++) {
    lines.push(makeUseEffect(dep));
  }
  for (let i = 0; i < cfg.useMemoCount; i++) {
    lines.push(makeUseMemo(`memoVar${i}`, dep, cfg.memoTypes[i]));
  }
  for (let i = 0; i < cfg.useCallbackCount; i++) {
    lines.push(makeUseCallback(`cbFunc${i}`, dep));
  }

  lines.push('  return <div>Test</div>;');
  lines.push('}');

  return lines.join('\n');
}

/**
 * Build a React component with optional interactive JSX elements.
 * Used by conversion and spec-gen property tests.
 */
export function buildComponentSourceWithJSX(cfg: {
  useStateCount: number;
  useEffectCount: number;
  useMemoCount: number;
  useCallbackCount: number;
  stateTypes: string[];
  memoTypes: string[];
  hasClickHandler: boolean;
  hasConditional: boolean;
}): string {
  const hookImports: string[] = [];
  if (cfg.useStateCount > 0) hookImports.push('useState');
  if (cfg.useEffectCount > 0) hookImports.push('useEffect');
  if (cfg.useMemoCount > 0) hookImports.push('useMemo');
  if (cfg.useCallbackCount > 0) hookImports.push('useCallback');

  const lines: string[] = [];
  lines.push(`import React${hookImports.length ? ', { ' + hookImports.join(', ') + ' }' : ''} from 'react';`);
  lines.push('');
  lines.push('export default function TestComponent() {');

  const stateNames: string[] = [];
  for (let i = 0; i < cfg.useStateCount; i++) {
    const name = `stateVar${i}`;
    stateNames.push(name);
    lines.push(makeUseState(name, cfg.stateTypes[i]));
  }

  const dep = stateNames.length > 0 ? stateNames[0] : "'dep'";
  for (let i = 0; i < cfg.useEffectCount; i++) {
    lines.push(makeUseEffect(dep));
  }
  for (let i = 0; i < cfg.useMemoCount; i++) {
    lines.push(makeUseMemo(`memoVar${i}`, dep, cfg.memoTypes[i]));
  }
  for (let i = 0; i < cfg.useCallbackCount; i++) {
    lines.push(makeUseCallback(`cbFunc${i}`, dep));
  }

  const jsxParts: string[] = [];
  if (cfg.hasClickHandler) {
    jsxParts.push('      <button onClick={() => console.log("click")}>Click</button>');
  }
  if (cfg.hasConditional && stateNames.length > 0) {
    jsxParts.push(`      {${stateNames[0]} && <span>Conditional</span>}`);
  }
  jsxParts.push('      <p>Hello</p>');

  lines.push('  return (');
  lines.push('    <div>');
  lines.push(jsxParts.join('\n'));
  lines.push('    </div>');
  lines.push('  );');
  lines.push('}');

  return lines.join('\n');
}

/**
 * Build a named React component (for naming convention tests).
 */
export function buildNamedComponentSource(cfg: {
  componentName: string;
  useStateCount: number;
  stateTypes: string[];
  useEffectCount: number;
  useMemoCount: number;
  useCallbackCount: number;
  memoTypes: string[];
}): string {
  const hookImports: string[] = [];
  if (cfg.useStateCount > 0) hookImports.push('useState');
  if (cfg.useEffectCount > 0) hookImports.push('useEffect');
  if (cfg.useMemoCount > 0) hookImports.push('useMemo');
  if (cfg.useCallbackCount > 0) hookImports.push('useCallback');

  const lines: string[] = [];
  lines.push(`import React${hookImports.length ? ', { ' + hookImports.join(', ') + ' }' : ''} from 'react';`);
  lines.push('');
  lines.push(`export default function ${cfg.componentName}() {`);

  const stateNames: string[] = [];
  for (let i = 0; i < cfg.useStateCount; i++) {
    const name = `stateVar${i}`;
    stateNames.push(name);
    const setter = 'set' + name.charAt(0).toUpperCase() + name.slice(1);
    lines.push(`  const [${name}, ${setter}] = useState<${cfg.stateTypes[i]}>(${initialValueForType(cfg.stateTypes[i])});`);
  }

  const dep = stateNames.length > 0 ? stateNames[0] : "'dep'";
  for (let i = 0; i < cfg.useEffectCount; i++) {
    lines.push(`  useEffect(() => { console.log(${dep}); }, [${dep}]);`);
  }
  for (let i = 0; i < cfg.useMemoCount; i++) {
    lines.push(`  const memoVar${i} = useMemo<${cfg.memoTypes[i]}>(() => ${dep}, [${dep}]);`);
  }
  for (let i = 0; i < cfg.useCallbackCount; i++) {
    lines.push(`  const cbFunc${i} = useCallback(() => { console.log(${dep}); }, [${dep}]);`);
  }

  lines.push('  return <div>Hello</div>;');
  lines.push('}');

  return lines.join('\n');
}

/**
 * Build a React component for spec-gen tests (with optional event handlers).
 */
export function buildSpecGenComponentSource(cfg: {
  useStateCount: number;
  stateTypes: string[];
  hasClickHandler: boolean;
  hasChangeHandler: boolean;
}): string {
  const hookImports: string[] = [];
  if (cfg.useStateCount > 0) hookImports.push('useState');

  const lines: string[] = [];
  lines.push(`import React${hookImports.length ? ', { ' + hookImports.join(', ') + ' }' : ''} from 'react';`);
  lines.push('');
  lines.push('export default function TestComponent() {');

  for (let i = 0; i < cfg.useStateCount; i++) {
    const name = `stateVar${i}`;
    const setter = 'set' + name.charAt(0).toUpperCase() + name.slice(1);
    lines.push(`  const [${name}, ${setter}] = useState<${cfg.stateTypes[i]}>(${initialValueForType(cfg.stateTypes[i])});`);
  }

  const jsxParts: string[] = [];
  if (cfg.hasClickHandler) {
    jsxParts.push('      <button onClick={() => console.log("click")}>Click</button>');
  }
  if (cfg.hasChangeHandler) {
    jsxParts.push('      <input onChange={(e) => console.log(e)} />');
  }
  jsxParts.push('      <p>Hello</p>');

  lines.push('  return (');
  lines.push('    <div>');
  lines.push(jsxParts.join('\n'));
  lines.push('    </div>');
  lines.push('  );');
  lines.push('}');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Invalid code generators
// ---------------------------------------------------------------------------

/**
 * Generator for valid TypeScript code that does NOT export a function
 * returning JSX (no valid React component).
 */
export const nonComponentCodeArb = fc.oneof(
  // Plain value export
  fc.record({
    varName: identifierArb,
    value: fc.oneof(
      fc.integer().map(String),
      fc.constant("'hello'"),
      fc.constant('true'),
      fc.constant('null'),
    ),
  }).map(({ varName, value }) =>
    `const ${varName} = ${value};\nexport default ${varName};`
  ),

  // Pure function export (no JSX)
  fc.record({
    fnName: identifierArb,
    paramA: identifierArb,
    paramB: identifierArb,
  }).map(({ fnName, paramA, paramB }) =>
    `export function ${fnName}(${paramA}: number, ${paramB}: number): number {\n  return ${paramA} + ${paramB};\n}`
  ),

  // Class export (no JSX)
  fc.record({
    className: identifierArb.map(n => n.charAt(0).toUpperCase() + n.slice(1)),
    propName: identifierArb,
  }).map(({ className, propName }) =>
    `export class ${className} {\n  ${propName}: string = '';\n}`
  ),

  // Interface-only export
  fc.record({
    ifaceName: identifierArb.map(n => n.charAt(0).toUpperCase() + n.slice(1)),
    fieldName: identifierArb,
  }).map(({ ifaceName, fieldName }) =>
    `export interface ${ifaceName} {\n  ${fieldName}: number;\n}`
  ),

  // Arrow function that returns a non-JSX value
  fc.record({
    fnName: identifierArb,
  }).map(({ fnName }) =>
    `export const ${fnName} = (x: number) => x * 2;`
  ),
);

/**
 * Generator for React component code with intentionally broken JSX.
 */
export const invalidJSXCodeArb = fc.oneof(
  // Mismatched closing tag
  fc.record({
    outerTag: fc.constantFrom('div', 'section', 'main', 'article'),
    innerTag: fc.constantFrom('span', 'p', 'h1', 'strong', 'em'),
  }).map(({ outerTag, innerTag }) =>
    `import React from 'react';\nexport default function Broken() {\n  return <${outerTag}><${innerTag}></${outerTag}>;\n}`
  ),

  // Unclosed non-void element
  fc.record({
    tag: fc.constantFrom('div', 'span', 'p', 'ul'),
  }).map(({ tag }) =>
    `import React from 'react';\nexport default function Broken() {\n  return <${tag}>hello;\n}`
  ),

  // Extra closing tag
  fc.record({
    tag: fc.constantFrom('div', 'span', 'p'),
  }).map(({ tag }) =>
    `import React from 'react';\nexport default function Broken() {\n  return <${tag}>text</${tag}></${tag}>;\n}`
  ),
);

// ---------------------------------------------------------------------------
// Unsafe pattern generators
// ---------------------------------------------------------------------------

/**
 * Generator for code strings containing injection patterns (eval, new Function, dynamic import).
 */
export const injectionPatternArb = fc.oneof(
  // eval() pattern
  fc.record({
    prefix: fc.string({ minLength: 0, maxLength: 200 }),
    arg: fc.string({ minLength: 0, maxLength: 50 }),
    suffix: fc.string({ minLength: 0, maxLength: 200 }),
  }).map(({ prefix, arg, suffix }) => ({
    code: `${prefix}\neval(${JSON.stringify(arg)});\n${suffix}`,
    patternName: 'eval',
  })),

  // new Function() pattern
  fc.record({
    prefix: fc.string({ minLength: 0, maxLength: 200 }),
    arg: fc.string({ minLength: 0, maxLength: 50 }),
    suffix: fc.string({ minLength: 0, maxLength: 200 }),
  }).map(({ prefix, arg, suffix }) => ({
    code: `${prefix}\nnew Function(${JSON.stringify(arg)});\n${suffix}`,
    patternName: 'Function constructor',
  })),

  // Dynamic import from external URL
  fc.record({
    prefix: fc.string({ minLength: 0, maxLength: 200 }),
    domain: fc.webUrl(),
    path: fc.string({ minLength: 0, maxLength: 30 }).map(s => s.replace(/['"` \n\r]/g, '')),
    suffix: fc.string({ minLength: 0, maxLength: 200 }),
  }).map(({ prefix, domain, path, suffix }) => ({
    code: `${prefix}\nimport("${domain}/${path}");\n${suffix}`,
    patternName: 'Dynamic imports',
  })),
);

/**
 * Generator for React components containing dangerouslySetInnerHTML.
 */
export const unsafeComponentArb = fc.record({
  varName: fc.constantFrom('content', 'htmlStr', 'markup', 'rawHtml'),
}).map(({ varName }) => {
  return [
    `import React from 'react';`,
    ``,
    `export default function UnsafeComponent() {`,
    `  const ${varName} = '<b>bold</b>';`,
    `  return <div dangerouslySetInnerHTML={{ __html: ${varName} }} />;`,
    `}`,
  ].join('\n');
});

// ---------------------------------------------------------------------------
// Helper: build a base ComponentIR (for tests that work at the IR level)
// ---------------------------------------------------------------------------

/** Create a base ComponentIR with sensible defaults, overridable. */
export function makeBaseIR(overrides: Partial<ComponentIR> = {}): ComponentIR {
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
