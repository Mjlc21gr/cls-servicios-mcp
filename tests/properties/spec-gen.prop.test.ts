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

/**
 * Arbitrary for component configurations with varying signals and event handlers.
 */
const specConfigArb = fc.record({
  useStateCount: fc.integer({ min: 0, max: 3 }),
  stateTypes: fc.array(tsTypeArb, { minLength: 3, maxLength: 3 }),
  hasClickHandler: fc.boolean(),
  hasChangeHandler: fc.boolean(),
});

/** Build a React component with optional signals and event handlers. */
function buildComponentSource(cfg: {
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

  const stateNames: string[] = [];
  for (let i = 0; i < cfg.useStateCount; i++) {
    const name = `stateVar${i}`;
    stateNames.push(name);
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

/** Run the full pipeline. */
function runFullPipeline(source: string) {
  const ir1 = parseReactComponent(source);
  const ir2 = mapStateToAngular(ir1);
  const ir3 = generateAngularTemplate(ir2);
  const ir4 = mapToPrimeNG(ir3);
  const artifact = emitAngularArtifact(ir4);
  return { artifact, ir4 };
}

// ---------------------------------------------------------------------------
// Property 14: Cobertura de pruebas generadas según contenido del componente
// ---------------------------------------------------------------------------

/**
 * Feature: react-to-angular-mcp
 * Property 14: Cobertura de pruebas generadas según contenido del componente
 *
 * For any converted Angular component, the .spec.ts SHALL include creation and
 * rendering tests, plus signal tests if signals exist, plus event tests if
 * event handlers exist.
 *
 * **Validates: Requirements 9.2, 9.3, 9.4**
 */
describe('Property 14: Cobertura de pruebas generadas según contenido del componente', () => {
  it('should include creation, rendering, signal, and event tests as appropriate', () => {
    fc.assert(
      fc.property(specConfigArb, (cfg) => {
        const source = buildComponentSource(cfg);
        const { artifact, ir4 } = runFullPipeline(source);
        const spec = artifact.specFile;

        // 9.2: Always include creation test
        expect(spec).toContain('should create the component');

        // 9.2: Always include rendering test
        expect(spec).toContain('should render the template');

        // 9.3: If signals exist, include signal reactivity test
        if (ir4.angularSignals.length > 0) {
          expect(spec).toContain('signal');
        }

        // 9.4: If event handlers exist, include event test
        const hasEventBindings = ir4.templateBindings.some(b => b.type === 'event');
        if (hasEventBindings) {
          expect(spec).toContain('event');
        }
      }),
      { numRuns: 100 },
    );
  });
});
