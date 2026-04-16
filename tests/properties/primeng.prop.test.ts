import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { mapToPrimeNG } from '../../src/pipeline/primeng-mapper.js';
import { ComponentIR, JSXNode } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
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
// Generators
// ---------------------------------------------------------------------------

/** Simple identifier for attribute values */
const identArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
  { minLength: 3, maxLength: 8 },
);

/** HTML elements that have PrimeNG equivalents */
const primeNgEligibleTemplateArb = fc.oneof(
  // <button>
  identArb.map((label) => ({
    template: `<button class="btn">${label}</button>`,
    expectedTag: 'p-button',
    expectedModule: 'ButtonModule',
    absentTag: '<button',
  })),
  // <input type="text">
  identArb.map((val) => ({
    template: `<input type="text" [value]="${val}" />`,
    expectedTag: 'pInputText',
    expectedModule: 'InputTextModule',
    absentTag: 'type="text"',
  })),
  // <select>
  identArb.map((_) => ({
    template: `<select><option>A</option></select>`,
    expectedTag: 'p-dropdown',
    expectedModule: 'DropdownModule',
    absentTag: '<select',
  })),
  // <table>
  identArb.map((_) => ({
    template: `<table><tr><td>data</td></tr></table>`,
    expectedTag: 'p-table',
    expectedModule: 'TableModule',
    absentTag: '<table',
  })),
  // <input type="checkbox">
  identArb.map((_) => ({
    template: `<input type="checkbox" />`,
    expectedTag: 'p-checkbox',
    expectedModule: 'CheckboxModule',
    absentTag: 'type="checkbox"',
  })),
  // <textarea>
  identArb.map((text) => ({
    template: `<textarea rows="4">${text}</textarea>`,
    expectedTag: 'pInputTextarea',
    expectedModule: 'InputTextareaModule',
    absentTag: null, // textarea tag is preserved, directive is added
  })),
  // <dialog>
  identArb.map((content) => ({
    template: `<dialog>${content}</dialog>`,
    expectedTag: 'p-dialog',
    expectedModule: 'DialogModule',
    absentTag: '<dialog',
  })),
);

/** HTML elements that do NOT have PrimeNG equivalents */
const nonPrimeNgTagArb = fc.constantFrom(
  'div', 'span', 'p', 'h1', 'h2', 'h3', 'section', 'article',
  'nav', 'header', 'footer', 'main', 'aside', 'ul', 'li', 'ol',
  'a', 'img', 'form', 'label', 'fieldset', 'legend',
);

const nonPrimeNgTemplateArb = fc.tuple(nonPrimeNgTagArb, identArb).map(
  ([tag, content]) => `<${tag}>${content}</${tag}>`,
);

// ---------------------------------------------------------------------------
// Property 10: Mapeo correcto de elementos HTML a PrimeNG
// ---------------------------------------------------------------------------

/**
 * Feature: react-to-angular-mcp
 * Property 10: Mapeo correcto de elementos HTML a PrimeNG
 *
 * For any template with HTML elements that have PrimeNG equivalents, the
 * mapper SHALL replace them correctly, and for elements without equivalents
 * SHALL preserve them.
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.9**
 */
describe('Property 10: Mapeo correcto de elementos HTML a PrimeNG', () => {
  it('should replace HTML elements with their PrimeNG equivalents', () => {
    fc.assert(
      fc.property(primeNgEligibleTemplateArb, ({ template, expectedTag, absentTag }) => {
        const ir = makeBaseIR({ angularTemplate: template });
        const result = mapToPrimeNG(ir);

        // The PrimeNG tag/directive must be present
        expect(result.angularTemplate).toContain(expectedTag);

        // The original HTML tag should be gone (except textarea which keeps its tag)
        if (absentTag) {
          expect(result.angularTemplate).not.toContain(absentTag);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('should preserve HTML elements without PrimeNG equivalents', () => {
    fc.assert(
      fc.property(nonPrimeNgTemplateArb, (template) => {
        const ir = makeBaseIR({ angularTemplate: template });
        const result = mapToPrimeNG(ir);

        // Template should be unchanged
        expect(result.angularTemplate).toBe(template);
      }),
      { numRuns: 100 },
    );
  });

  it('should correctly handle mixed templates with both PrimeNG-eligible and non-eligible elements', () => {
    fc.assert(
      fc.property(
        primeNgEligibleTemplateArb,
        nonPrimeNgTemplateArb,
        ({ template: primeTemplate, expectedTag }, nonPrimeTemplate) => {
          const combined = `<div>${primeTemplate}${nonPrimeTemplate}</div>`;
          const ir = makeBaseIR({ angularTemplate: combined });
          const result = mapToPrimeNG(ir);

          // PrimeNG replacement must be present
          expect(result.angularTemplate).toContain(expectedTag);

          // Non-PrimeNG content must be preserved
          expect(result.angularTemplate).toContain(nonPrimeTemplate);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 11: Consistencia de importaciones PrimeNG
// ---------------------------------------------------------------------------

/**
 * Feature: react-to-angular-mcp
 * Property 11: Consistencia de importaciones PrimeNG
 *
 * For any template with PrimeNG components, the imports array SHALL contain
 * exactly the modules for components present — no more, no less.
 *
 * **Validates: Requirements 6.8**
 */
describe('Property 11: Consistencia de importaciones PrimeNG', () => {
  /** Map from PrimeNG tag/directive to expected module name */
  const TAG_TO_MODULE: Record<string, string> = {
    'p-button': 'ButtonModule',
    'pInputText': 'InputTextModule',
    'p-dropdown': 'DropdownModule',
    'p-table': 'TableModule',
    'p-checkbox': 'CheckboxModule',
    'pInputTextarea': 'InputTextareaModule',
    'p-dialog': 'DialogModule',
  };

  /** Detection patterns matching what the mapper uses */
  const TAG_PATTERNS: Record<string, RegExp> = {
    'p-button': /<p-button[\s>\/]/,
    'pInputText': /pInputText[\s>\/]/,
    'p-dropdown': /<p-dropdown[\s>\/]/,
    'p-table': /<p-table[\s>\/]/,
    'p-checkbox': /<p-checkbox[\s>\/]/,
    'pInputTextarea': /pInputTextarea[\s>\/]/,
    'p-dialog': /<p-dialog[\s>\/]/,
  };

  it('should include exactly the modules for PrimeNG components present in the template', () => {
    fc.assert(
      fc.property(
        fc.array(primeNgEligibleTemplateArb, { minLength: 1, maxLength: 5 }),
        (entries) => {
          const combined = entries.map(e => e.template).join('\n');
          const ir = makeBaseIR({ angularTemplate: `<div>\n${combined}\n</div>` });
          const result = mapToPrimeNG(ir);

          // Determine which PrimeNG tags are actually in the output template
          const expectedModules = new Set<string>();
          for (const [tag, pattern] of Object.entries(TAG_PATTERNS)) {
            if (pattern.test(result.angularTemplate)) {
              expectedModules.add(TAG_TO_MODULE[tag]);
            }
          }

          const actualModules = new Set(result.primeNgImports.map(i => i.moduleName));

          // Exactly the right modules — no more, no less
          expect(actualModules).toEqual(expectedModules);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should return empty imports when no PrimeNG components are present', () => {
    fc.assert(
      fc.property(nonPrimeNgTemplateArb, (template) => {
        const ir = makeBaseIR({ angularTemplate: template });
        const result = mapToPrimeNG(ir);
        expect(result.primeNgImports).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });
});
