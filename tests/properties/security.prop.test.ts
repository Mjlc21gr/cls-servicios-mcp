import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateInput } from '../../src/security/validator.js';
import { parseReactComponent } from '../../src/pipeline/ast-parser.js';
import { mapStateToAngular } from '../../src/pipeline/state-mapper.js';
import { generateAngularTemplate } from '../../src/pipeline/template-generator.js';
import { mapToPrimeNG } from '../../src/pipeline/primeng-mapper.js';
import { emitAngularArtifact } from '../../src/emitter/code-emitter.js';

/**
 * Feature: react-to-angular-mcp
 * Property 15: Rechazo de patrones de inyección de código
 *
 * For any React source code containing injection patterns (eval, Function constructor,
 * dynamic imports from external URLs), the security validator SHALL reject the input
 * with a descriptive error.
 *
 * **Validates: Requirements 10.1**
 */
describe('Property 15: Rechazo de patrones de inyección de código', () => {
  /**
   * Generator for random code strings that contain an injection pattern.
   * Uses fc.oneof to pick one of the three injection patterns and embeds it
   * within random surrounding code.
   */
  const injectionPatternArb = fc.oneof(
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

    // Dynamic import from external URL pattern
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

  it('should reject any code containing injection patterns with security errors', () => {
    fc.assert(
      fc.property(injectionPatternArb, ({ code, patternName }) => {
        const result = validateInput(code);

        // Must be rejected
        expect(result.isValid).toBe(false);

        // Must have at least one error
        expect(result.errors.length).toBeGreaterThan(0);

        // At least one error must be of type 'security'
        const securityErrors = result.errors.filter(e => e.type === 'security');
        expect(securityErrors.length).toBeGreaterThan(0);

        // The security error message should be descriptive (non-empty)
        for (const err of securityErrors) {
          expect(err.message.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});


// ---------------------------------------------------------------------------
// Property 16: Detección y mitigación de patrones inseguros
// ---------------------------------------------------------------------------

/**
 * Feature: react-to-angular-mcp
 * Property 16: Detección y mitigación de patrones inseguros
 *
 * For any React source code containing unsafe patterns (dangerouslySetInnerHTML,
 * eval in rendering context, document.write), the AST_Parser SHALL emit a
 * security warning and the generated Angular code SHALL use [innerHTML] with
 * DomSanitizer.
 *
 * **Validates: Requirements 10.7**
 */
describe('Property 16: Detección y mitigación de patrones inseguros', () => {
  /**
   * Generator for React components containing dangerouslySetInnerHTML.
   * This is the primary unsafe pattern that gets converted to [innerHTML] + DomSanitizer.
   */
  const unsafeComponentArb = fc.record({
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

  it('should emit security warnings for dangerouslySetInnerHTML and use DomSanitizer in output', () => {
    fc.assert(
      fc.property(unsafeComponentArb, (source) => {
        // 1. The AST_Parser should detect the unsafe pattern and emit warnings
        const ir1 = parseReactComponent(source);
        expect(ir1.securityWarnings.length).toBeGreaterThan(0);
        expect(ir1.securityWarnings.some(w => w.pattern === 'dangerouslySetInnerHTML')).toBe(true);

        // 2. Run the full pipeline
        const ir2 = mapStateToAngular(ir1);
        const ir3 = generateAngularTemplate(ir2);
        const ir4 = mapToPrimeNG(ir3);
        const artifact = emitAngularArtifact(ir4);

        // 3. The generated Angular code should use DomSanitizer
        expect(artifact.componentFile).toContain('DomSanitizer');
        expect(artifact.componentFile).toContain('sanitizer');

        // 4. Security warnings should be propagated to the artifact
        expect(artifact.securityWarnings.length).toBeGreaterThan(0);
        expect(artifact.securityWarnings.some(w => w.pattern === 'dangerouslySetInnerHTML')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
