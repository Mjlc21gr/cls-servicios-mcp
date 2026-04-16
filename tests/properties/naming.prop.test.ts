import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseReactComponent } from '../../src/pipeline/ast-parser.js';
import { mapStateToAngular } from '../../src/pipeline/state-mapper.js';
import { generateAngularTemplate } from '../../src/pipeline/template-generator.js';
import { mapToPrimeNG } from '../../src/pipeline/primeng-mapper.js';
import { emitAngularArtifact } from '../../src/emitter/code-emitter.js';

// ---------------------------------------------------------------------------
// Helpers
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

/** Generator for PascalCase component names. */
const componentNameArb = fc.constantFrom(
  'UserProfile', 'TodoList', 'DataTable', 'SearchBar',
  'NavMenu', 'LoginForm', 'ChatWidget', 'FileUploader',
);

/**
 * Arbitrary for component configurations with varying hooks and a random name.
 */
const namingConfigArb = fc.record({
  componentName: componentNameArb,
  useStateCount: fc.integer({ min: 0, max: 3 }),
  stateTypes: fc.array(tsTypeArb, { minLength: 3, maxLength: 3 }),
  useEffectCount: fc.integer({ min: 0, max: 2 }),
  useMemoCount: fc.integer({ min: 0, max: 2 }),
  useCallbackCount: fc.integer({ min: 0, max: 2 }),
  memoTypes: fc.array(tsTypeArb, { minLength: 2, maxLength: 2 }),
});

/** Build a React component with a given name and hooks. */
function buildComponentSource(cfg: {
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

/** Run the full pipeline. */
function runFullPipeline(source: string) {
  const ir1 = parseReactComponent(source);
  const ir2 = mapStateToAngular(ir1);
  const ir3 = generateAngularTemplate(ir2);
  const ir4 = mapToPrimeNG(ir3);
  const artifact = emitAngularArtifact(ir4);
  return { artifact, ir1, ir4 };
}

/** Convert PascalCase to kebab-case. */
function toKebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Property 19: Convenciones de naming de Angular en código generado
// ---------------------------------------------------------------------------

/**
 * Feature: react-to-angular-mcp
 * Property 19: Convenciones de naming de Angular en código generado
 *
 * For any converted React component, the generated Angular code SHALL follow
 * Angular naming conventions: kebab-case for file names, PascalCase for class
 * names, camelCase for methods and properties.
 *
 * **Validates: Requirements 12.1**
 */
describe('Property 19: Convenciones de naming de Angular en código generado', () => {
  it('should follow Angular naming conventions in generated code', () => {
    fc.assert(
      fc.property(namingConfigArb, (cfg) => {
        const source = buildComponentSource(cfg);
        const { artifact, ir4 } = runFullPipeline(source);
        const code = artifact.componentFile;

        // File name in IR should be kebab-case
        const expectedKebab = toKebabCase(cfg.componentName);
        expect(ir4.fileName).toBe(expectedKebab);

        // Class name should be PascalCase ending with Component
        const classNameRegex = /export class ([A-Z][a-zA-Z0-9]*)Component/;
        const classMatch = code.match(classNameRegex);
        expect(classMatch).not.toBeNull();
        // The class name should start with uppercase (PascalCase)
        expect(classMatch![1][0]).toBe(classMatch![1][0].toUpperCase());

        // Selector should be kebab-case with 'app-' prefix
        const selectorRegex = /selector:\s*'app-([a-z][a-z0-9-]*)'/;
        const selectorMatch = code.match(selectorRegex);
        expect(selectorMatch).not.toBeNull();

        // All signal declarations should use camelCase names
        for (const sig of ir4.angularSignals) {
          // camelCase: starts with lowercase
          expect(sig.name[0]).toBe(sig.name[0].toLowerCase());
          // Should appear in the code
          expect(code).toContain(`${sig.name} = signal<`);
        }

        // All component methods should use camelCase names
        for (const method of ir4.componentMethods) {
          expect(method.name[0]).toBe(method.name[0].toLowerCase());
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 20: Comentarios de mapeo en código generado
// ---------------------------------------------------------------------------

/**
 * Feature: react-to-angular-mcp
 * Property 20: Comentarios de mapeo en código generado
 *
 * For any conversion that transforms React hooks to Angular equivalents, the
 * generated code SHALL include comments indicating the mapping performed
 * (e.g., `// Convertido de useState → signal()`).
 *
 * **Validates: Requirements 12.3**
 */
describe('Property 20: Comentarios de mapeo en código generado', () => {
  it('should include mapping comments for every converted hook', () => {
    fc.assert(
      fc.property(namingConfigArb, (cfg) => {
        const source = buildComponentSource(cfg);
        const { artifact, ir4 } = runFullPipeline(source);
        const code = artifact.componentFile;

        // For each signal (from useState), there should be a mapping comment
        if (ir4.angularSignals.length > 0) {
          const signalCommentCount = (code.match(/\/\/ Convertido de useState → signal\(\)/g) || []).length;
          expect(signalCommentCount).toBe(ir4.angularSignals.length);
        }

        // For each effect (from useEffect), there should be a mapping comment
        if (ir4.angularEffects.length > 0) {
          const effectCommentCount = (code.match(/\/\/ Convertido de useEffect → effect\(\)/g) || []).length;
          expect(effectCommentCount).toBe(ir4.angularEffects.length);
        }

        // For each computed (from useMemo), there should be a mapping comment
        if (ir4.angularComputed.length > 0) {
          const computedCommentCount = (code.match(/\/\/ Convertido de useMemo → computed\(\)/g) || []).length;
          expect(computedCommentCount).toBe(ir4.angularComputed.length);
        }

        // For each component method (from useCallback), there should be a mapping comment
        if (ir4.componentMethods.length > 0) {
          const methodCommentCount = (code.match(/\/\/ Convertido de useCallback → method/g) || []).length;
          expect(methodCommentCount).toBe(ir4.componentMethods.length);
        }
      }),
      { numRuns: 100 },
    );
  });
});
