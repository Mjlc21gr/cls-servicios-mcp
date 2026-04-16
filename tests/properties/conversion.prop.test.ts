import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parse } from '@babel/parser';
import { parseReactComponent } from '../../src/pipeline/ast-parser.js';
import { mapStateToAngular } from '../../src/pipeline/state-mapper.js';
import { generateAngularTemplate } from '../../src/pipeline/template-generator.js';
import { mapToPrimeNG } from '../../src/pipeline/primeng-mapper.js';
import { emitAngularArtifact } from '../../src/emitter/code-emitter.js';

// ---------------------------------------------------------------------------
// Helpers: generators for building valid React component source code
// ---------------------------------------------------------------------------

const tsTypeArb = fc.constantFrom('string', 'number', 'boolean');

function initialValueForType(t: string): string {
  switch (t) {
    case 'string': return "''";
    case 'number': return '0';
    case 'boolean': return 'false';
    default: return 'null';
  }
}

function makeUseState(name: string, type: string): string {
  const setter = 'set' + name.charAt(0).toUpperCase() + name.slice(1);
  return `  const [${name}, ${setter}] = useState<${type}>(${initialValueForType(type)});`;
}

function makeUseEffect(depName: string): string {
  return `  useEffect(() => { console.log(${depName}); }, [${depName}]);`;
}

function makeUseMemo(varName: string, depName: string, type: string): string {
  return `  const ${varName} = useMemo<${type}>(() => ${depName}, [${depName}]);`;
}

function makeUseCallback(fnName: string, depName: string): string {
  return `  const ${fnName} = useCallback(() => { console.log(${depName}); }, [${depName}]);`;
}

/**
 * Arbitrary that describes a random React component configuration.
 */
const componentConfigArb = fc.record({
  useStateCount: fc.integer({ min: 0, max: 3 }),
  useEffectCount: fc.integer({ min: 0, max: 2 }),
  useMemoCount: fc.integer({ min: 0, max: 2 }),
  useCallbackCount: fc.integer({ min: 0, max: 2 }),
  stateTypes: fc.array(tsTypeArb, { minLength: 3, maxLength: 3 }),
  memoTypes: fc.array(tsTypeArb, { minLength: 2, maxLength: 2 }),
  hasClickHandler: fc.boolean(),
  hasConditional: fc.boolean(),
});

/** Build full React component source from a config. */
function buildComponentSource(cfg: {
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

  const depForEffect = stateNames.length > 0 ? stateNames[0] : "'dep'";
  for (let i = 0; i < cfg.useEffectCount; i++) {
    lines.push(makeUseEffect(depForEffect));
  }

  const depForMemo = stateNames.length > 0 ? stateNames[0] : "'dep'";
  for (let i = 0; i < cfg.useMemoCount; i++) {
    lines.push(makeUseMemo(`memoVar${i}`, depForMemo, cfg.memoTypes[i]));
  }

  const depForCb = stateNames.length > 0 ? stateNames[0] : "'dep'";
  for (let i = 0; i < cfg.useCallbackCount; i++) {
    lines.push(makeUseCallback(`cbFunc${i}`, depForCb));
  }

  // Build JSX with optional interactive elements
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

/** Run the full pipeline on source code and return the artifact. */
function runFullPipeline(source: string) {
  const ir1 = parseReactComponent(source);
  const ir2 = mapStateToAngular(ir1);
  const ir3 = generateAngularTemplate(ir2);
  const ir4 = mapToPrimeNG(ir3);
  const artifact = emitAngularArtifact(ir4);
  return { artifact, ir4 };
}

// ---------------------------------------------------------------------------
// Property 1: Completitud del artefacto de conversión
// ---------------------------------------------------------------------------

/**
 * Feature: react-to-angular-mcp
 * Property 1: Completitud del artefacto de conversión
 *
 * For any valid React source code (functional component that exports JSX),
 * convert_react_to_angular SHALL produce an artifact containing exactly three
 * files: a .component.ts (standalone component), a .spec.ts (unit tests with
 * TestBed), and a tailwind.config.js.
 *
 * **Validates: Requirements 2.1, 9.1, 11.1**
 */
describe('Property 1: Completitud del artefacto de conversión', () => {
  it('should produce an artifact with three non-empty files for any valid React component', () => {
    fc.assert(
      fc.property(componentConfigArb, (cfg) => {
        const source = buildComponentSource(cfg);
        const { artifact } = runFullPipeline(source);

        // componentFile (.component.ts) must be a non-empty string
        expect(typeof artifact.componentFile).toBe('string');
        expect(artifact.componentFile.length).toBeGreaterThan(0);

        // specFile (.spec.ts) must be a non-empty string
        expect(typeof artifact.specFile).toBe('string');
        expect(artifact.specFile.length).toBeGreaterThan(0);

        // tailwindConfig (tailwind.config.js) must be a non-empty string
        expect(typeof artifact.tailwindConfig).toBe('string');
        expect(artifact.tailwindConfig.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9: Equivalencia estructural de ida y vuelta
// ---------------------------------------------------------------------------

/**
 * Feature: react-to-angular-mcp
 * Property 9: Equivalencia estructural de ida y vuelta
 *
 * For any valid React source code, the Angular artifact SHALL contain the same
 * count of interactive elements, data bindings, and control structures.
 *
 * **Validates: Requirements 5.8**
 */
describe('Property 9: Equivalencia estructural de ida y vuelta', () => {
  /** Count event bindings (onClick, onChange, etc.) in React source. */
  function countReactEventHandlers(source: string): number {
    const eventPattern = /\bon(Click|Change|Submit|Input|Focus|Blur|KeyDown|KeyUp|MouseEnter|MouseLeave)\s*=/g;
    const matches = source.match(eventPattern);
    return matches ? matches.length : 0;
  }

  /** Count Angular event bindings in the generated template. */
  function countAngularEventBindings(template: string): number {
    const eventPattern = /\((?:click|change|submit|input|focus|blur|keydown|keyup|mouseenter|mouseleave)\)="/g;
    const matches = template.match(eventPattern);
    return matches ? matches.length : 0;
  }

  /** Count control flow structures in React source (&&, ternary in JSX, .map). */
  function countReactControlFlow(source: string): number {
    // Count .map( patterns (iterations)
    const mapPattern = /\.map\s*\(/g;
    const mapMatches = source.match(mapPattern);
    const mapCount = mapMatches ? mapMatches.length : 0;

    // Count JSX conditionals: {expr && <...>} patterns
    const conditionalPattern = /\{[^}]*&&\s*</g;
    const condMatches = source.match(conditionalPattern);
    const condCount = condMatches ? condMatches.length : 0;

    return mapCount + condCount;
  }

  /** Count Angular control flow structures (@if, @for, @switch). */
  function countAngularControlFlow(template: string): number {
    const ifPattern = /@if\s*\(/g;
    const forPattern = /@for\s*\(/g;
    const switchPattern = /@switch\s*\(/g;
    const ifMatches = template.match(ifPattern);
    const forMatches = template.match(forPattern);
    const switchMatches = template.match(switchPattern);
    return (ifMatches?.length ?? 0) + (forMatches?.length ?? 0) + (switchMatches?.length ?? 0);
  }

  it('should preserve the same count of event bindings and control flow structures', () => {
    fc.assert(
      fc.property(componentConfigArb, (cfg) => {
        const source = buildComponentSource(cfg);
        const { artifact, ir4 } = runFullPipeline(source);

        const reactEvents = countReactEventHandlers(source);
        const angularEvents = countAngularEventBindings(ir4.angularTemplate);

        // Event binding counts should match
        expect(angularEvents).toBe(reactEvents);

        const reactControlFlow = countReactControlFlow(source);
        const angularControlFlow = countAngularControlFlow(ir4.angularTemplate);

        // Control flow structure counts should match
        expect(angularControlFlow).toBe(reactControlFlow);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 21: Validez sintáctica del TypeScript generado
// ---------------------------------------------------------------------------

/**
 * Feature: react-to-angular-mcp
 * Property 21: Validez sintáctica del TypeScript generado
 *
 * For any valid React source code, the generated Angular artifact SHALL be
 * syntactically valid TypeScript that can be parsed without errors by the
 * TypeScript parser.
 *
 * **Validates: Requirements 12.4**
 */
describe('Property 21: Validez sintáctica del TypeScript generado', () => {
  it('should generate syntactically valid TypeScript for any valid React component', () => {
    fc.assert(
      fc.property(componentConfigArb, (cfg) => {
        const source = buildComponentSource(cfg);
        const { artifact } = runFullPipeline(source);

        // Parse the generated .component.ts with @babel/parser in TypeScript mode
        // If it throws, the test fails — the generated code is not valid TypeScript
        expect(() => {
          parse(artifact.componentFile, {
            sourceType: 'module',
            plugins: ['typescript', 'decorators-legacy'],
            errorRecovery: false,
          });
        }).not.toThrow();
      }),
      { numRuns: 100 },
    );
  });
});
