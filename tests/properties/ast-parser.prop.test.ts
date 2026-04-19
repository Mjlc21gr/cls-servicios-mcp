import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseReactComponent } from '../../src/pipeline/ast-parser.js';

// ---------------------------------------------------------------------------
// Helpers: generators for building valid React component source code
// ---------------------------------------------------------------------------

/** Generate a valid TypeScript identifier for use as a variable name. */
const identifierArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
  { minLength: 3, maxLength: 8 },
);

/** Simple TS types for useState generics. */
const tsTypeArb = fc.constantFrom('string', 'number', 'boolean');

/** Initial values matching the TS type. */
function initialValueForType(t: string): string {
  switch (t) {
    case 'string': return "''";
    case 'number': return '0';
    case 'boolean': return 'false';
    default: return 'null';
  }
}

/** Build a useState line: `const [foo, setFoo] = useState<string>('');` */
function makeUseState(name: string, type: string): string {
  const setter = 'set' + name.charAt(0).toUpperCase() + name.slice(1);
  return `  const [${name}, ${setter}] = useState<${type}>(${initialValueForType(type)});`;
}

/** Build a useEffect line. */
function makeUseEffect(depName: string): string {
  return `  useEffect(() => { console.log(${depName}); }, [${depName}]);`;
}

/** Build a useMemo line. */
function makeUseMemo(varName: string, depName: string, type: string): string {
  return `  const ${varName} = useMemo<${type}>(() => ${depName}, [${depName}]);`;
}

/** Build a useCallback line. */
function makeUseCallback(fnName: string, depName: string): string {
  return `  const ${fnName} = useCallback(() => { console.log(${depName}); }, [${depName}]);`;
}

/** Build a useRef line. */
function makeUseRef(varName: string): string {
  return `  const ${varName} = useRef<number>(0);`;
}

/** Build a useContext line. */
function makeUseContext(varName: string): string {
  return `  const ${varName} = useContext(SomeContext);`;
}

/**
 * Arbitrary that describes a random React component configuration.
 * Counts of each hook type are generated, then unique names are derived
 * deterministically so we can verify the IR afterwards.
 */
const componentConfigArb = fc.record({
  useStateCount: fc.integer({ min: 0, max: 3 }),
  useEffectCount: fc.integer({ min: 0, max: 2 }),
  useMemoCount: fc.integer({ min: 0, max: 2 }),
  useCallbackCount: fc.integer({ min: 0, max: 2 }),
  useRefCount: fc.integer({ min: 0, max: 1 }),
  useContextCount: fc.integer({ min: 0, max: 1 }),
  stateTypes: fc.array(tsTypeArb, { minLength: 3, maxLength: 3 }),
  memoTypes: fc.array(tsTypeArb, { minLength: 2, maxLength: 2 }),
});

/** Build full React component source from a config. */
function buildComponentSource(cfg: {
  useStateCount: number;
  useEffectCount: number;
  useMemoCount: number;
  useCallbackCount: number;
  useRefCount: number;
  useContextCount: number;
  stateTypes: string[];
  memoTypes: string[];
}): string {
  const imports = ['React'];
  const hookImports: string[] = [];
  if (cfg.useStateCount > 0) hookImports.push('useState');
  if (cfg.useEffectCount > 0) hookImports.push('useEffect');
  if (cfg.useMemoCount > 0) hookImports.push('useMemo');
  if (cfg.useCallbackCount > 0) hookImports.push('useCallback');
  if (cfg.useRefCount > 0) hookImports.push('useRef');
  if (cfg.useContextCount > 0) hookImports.push('useContext');

  const lines: string[] = [];
  lines.push(`import React${hookImports.length ? ', { ' + hookImports.join(', ') + ' }' : ''} from 'react';`);
  lines.push('');
  lines.push('export default function TestComponent() {');

  // useState
  const stateNames: string[] = [];
  for (let i = 0; i < cfg.useStateCount; i++) {
    const name = `stateVar${i}`;
    stateNames.push(name);
    lines.push(makeUseState(name, cfg.stateTypes[i]));
  }

  // useRef
  const refNames: string[] = [];
  for (let i = 0; i < cfg.useRefCount; i++) {
    const name = `refVar${i}`;
    refNames.push(name);
    lines.push(makeUseRef(name));
  }

  // useContext
  for (let i = 0; i < cfg.useContextCount; i++) {
    lines.push(makeUseContext(`ctxVar${i}`));
  }

  // useEffect — depend on first state var if available, else use a literal
  const depForEffect = stateNames.length > 0 ? stateNames[0] : "'dep'";
  for (let i = 0; i < cfg.useEffectCount; i++) {
    lines.push(makeUseEffect(depForEffect));
  }

  // useMemo
  const memoNames: string[] = [];
  const depForMemo = stateNames.length > 0 ? stateNames[0] : "'dep'";
  for (let i = 0; i < cfg.useMemoCount; i++) {
    const name = `memoVar${i}`;
    memoNames.push(name);
    lines.push(makeUseMemo(name, depForMemo, cfg.memoTypes[i]));
  }

  // useCallback
  const cbNames: string[] = [];
  const depForCb = stateNames.length > 0 ? stateNames[0] : "'dep'";
  for (let i = 0; i < cfg.useCallbackCount; i++) {
    const name = `cbFunc${i}`;
    cbNames.push(name);
    lines.push(makeUseCallback(name, depForCb));
  }

  lines.push('  return <div>Test</div>;');
  lines.push('}');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Property 2: Extracción completa del AST con preservación de tipos
// ---------------------------------------------------------------------------

/**
 * Feature: react-to-angular-mcp
 * Property 2: Extracción completa del AST con preservación de tipos
 *
 * For any React functional component with TypeScript containing any combination
 * of props, useState, useEffect, useMemo, useCallback, useRef, useContext,
 * methods, and child component imports, the AST_Parser SHALL extract all elements
 * present in the source code and preserve all TypeScript type annotations.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3**
 */
describe('Property 2: Extracción completa del AST con preservación de tipos', () => {
  it('should extract the correct count of each hook type and preserve TS types', () => {
    fc.assert(
      fc.property(componentConfigArb, (cfg) => {
        const source = buildComponentSource(cfg);
        const ir = parseReactComponent(source);

        // Correct component name
        expect(ir.componentName).toBe('TestComponent');

        // useState count matches
        expect(ir.state).toHaveLength(cfg.useStateCount);
        // Each state entry preserves its TypeScript type
        for (let i = 0; i < cfg.useStateCount; i++) {
          expect(ir.state[i].type).toBe(cfg.stateTypes[i]);
        }

        // useEffect count matches
        expect(ir.effects).toHaveLength(cfg.useEffectCount);

        // useMemo count matches
        expect(ir.memos).toHaveLength(cfg.useMemoCount);
        for (let i = 0; i < cfg.useMemoCount; i++) {
          expect(ir.memos[i].type).toBe(cfg.memoTypes[i]);
        }

        // useCallback count matches
        expect(ir.callbacks).toHaveLength(cfg.useCallbackCount);

        // useRef count matches
        expect(ir.refs).toHaveLength(cfg.useRefCount);
        for (let i = 0; i < cfg.useRefCount; i++) {
          expect(ir.refs[i].type).toBe('number');
        }

        // useContext count matches
        expect(ir.contexts).toHaveLength(cfg.useContextCount);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Rechazo de código sin componente React válido
// ---------------------------------------------------------------------------

/**
 * Feature: react-to-angular-mcp
 * Property 3: Rechazo de código sin componente React válido
 *
 * For any TypeScript code that does NOT contain an export of a function that
 * returns JSX, the AST_Parser SHALL return an error indicating no valid React
 * component was found.
 *
 * **Validates: Requirements 3.4**
 */
describe('Property 3: Rechazo de código sin componente React válido', () => {
  /**
   * Generator for valid TypeScript code that does NOT export a function
   * returning JSX. Produces things like plain exports of values, classes,
   * or pure functions.
   */
  const nonComponentCodeArb = fc.oneof(
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

  it('should throw an error for any TS code without a JSX-returning export', () => {
    fc.assert(
      fc.property(nonComponentCodeArb, (code) => {
        expect(() => parseReactComponent(code)).toThrow(/No valid React component found|Syntax error/);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 22: Error descriptivo para JSX inválido
// ---------------------------------------------------------------------------

/**
 * Feature: react-to-angular-mcp
 * Property 22: Error descriptivo para JSX inválido
 *
 * For any source code with invalid JSX syntax, the AST_Parser SHALL return
 * an error that includes the line and type of syntax error.
 *
 * **Validates: Requirements 2.2**
 */
describe('Property 22: Error descriptivo para JSX inválido', () => {
  /**
   * Generator for React component code with intentionally broken JSX.
   * We produce a valid-looking component wrapper but inject a mismatched
   * or unclosed JSX tag inside the return statement.
   */
  const invalidJSXCodeArb = fc.oneof(
    // Mismatched closing tag: <div><span></div>
    fc.record({
      outerTag: fc.constantFrom('div', 'section', 'main', 'article'),
      innerTag: fc.constantFrom('span', 'p', 'h1', 'strong', 'em'),
    }).map(({ outerTag, innerTag }) =>
      `import React from 'react';\nexport default function Broken() {\n  return <${outerTag}><${innerTag}></${outerTag}>;\n}`
    ),

    // Unclosed self-closing tag missing slash: <input>  (without closing)
    // Actually, <input> is valid HTML-like JSX. Use a non-void element unclosed.
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

  it('should throw an error containing line info for invalid JSX', () => {
    fc.assert(
      fc.property(invalidJSXCodeArb, (code) => {
        try {
          parseReactComponent(code);
          // If it doesn't throw, the property fails
          expect.unreachable('Expected parseReactComponent to throw for invalid JSX');
        } catch (err: any) {
          // Error message must mention "line" (case-insensitive)
          expect(err.message).toMatch(/line/i);
          // Error message must include a line number (at least one digit)
          expect(err.message).toMatch(/\d+/);
        }
      }),
      { numRuns: 100 },
    );
  });
});
