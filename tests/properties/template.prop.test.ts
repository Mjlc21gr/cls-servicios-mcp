import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { generateAngularTemplate } from '../../src/pipeline/template-generator.js';
import {
  ComponentIR,
  JSXNode,
  JSXExpression,
  JSXAttribute,
} from '../../src/types.js';

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

const identArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
  { minLength: 3, maxLength: 8 },
);

const htmlTagArb = fc.constantFrom('div', 'span', 'p', 'section', 'article', 'ul', 'li', 'h1', 'h2', 'form');

const tailwindClassArb = fc.constantFrom(
  'flex', 'items-center', 'gap-4', 'p-2', 'mt-4', 'text-lg', 'bg-blue-500',
  'rounded', 'shadow-md', 'w-full', 'h-screen', 'border', 'font-bold',
);

const tailwindClassListArb = fc.array(tailwindClassArb, { minLength: 1, maxLength: 5 })
  .map((classes) => [...new Set(classes)].join(' '));

// --- JSXExpression generators ---

const conditionalExprArb: fc.Arbitrary<JSXExpression> = identArb.map((name) => ({
  type: 'conditional' as const,
  expression: name,
  children: [{ tag: 'span', attributes: [], children: [name], isComponent: false }],
}));

const ternaryExprArb: fc.Arbitrary<JSXExpression> = identArb.map((name) => ({
  type: 'ternary' as const,
  expression: name,
  children: [{ tag: 'span', attributes: [], children: ['true'], isComponent: false }],
  alternate: [{ tag: 'span', attributes: [], children: ['false'], isComponent: false }],
}));

const mapExprArb: fc.Arbitrary<JSXExpression> = identArb.map((name) => ({
  type: 'map' as const,
  expression: name,
  children: [{ tag: 'li', attributes: [], children: ['item'], isComponent: false }],
}));

const switchExprArb: fc.Arbitrary<JSXExpression> = fc.tuple(identArb, fc.integer({ min: 2, max: 4 }))
  .map(([name, count]) => ({
    type: 'switch' as const,
    expression: name,
    children: Array.from({ length: count }, (_, i) => ({
      tag: 'span',
      attributes: [],
      children: [`case${i}`],
      isComponent: false,
    })),
  }));

const interpolationExprArb: fc.Arbitrary<JSXExpression> = identArb.map((name) => ({
  type: 'interpolation' as const,
  expression: name,
}));

const controlFlowExprArb = fc.oneof(
  conditionalExprArb,
  ternaryExprArb,
  mapExprArb,
  switchExprArb,
);

// --- Event handler attribute generators ---

const eventNameArb = fc.constantFrom(
  'onClick', 'onChange', 'onSubmit', 'onInput', 'onFocus',
  'onBlur', 'onKeyDown', 'onKeyUp', 'onMouseEnter', 'onMouseLeave',
);

const eventAttrArb: fc.Arbitrary<JSXAttribute> = fc.tuple(eventNameArb, identArb).map(
  ([eventName, handler]) => ({
    name: eventName,
    value: handler,
    isEventHandler: true,
    isDynamic: true,
  }),
);

const angularEventMap: Record<string, string> = {
  onClick: 'click',
  onChange: 'change',
  onSubmit: 'submit',
  onInput: 'input',
  onFocus: 'focus',
  onBlur: 'blur',
  onKeyDown: 'keydown',
  onKeyUp: 'keyup',
  onMouseEnter: 'mouseenter',
  onMouseLeave: 'mouseleave',
};

// --- Dynamic attribute generators ---

const dynamicClassAttrArb: fc.Arbitrary<JSXAttribute> = identArb.map((expr) => ({
  name: 'className',
  value: expr,
  isEventHandler: false,
  isDynamic: true,
}));

const dynamicStyleAttrArb: fc.Arbitrary<JSXAttribute> = identArb.map((expr) => ({
  name: 'style',
  value: expr,
  isEventHandler: false,
  isDynamic: true,
}));

const dynamicDisabledAttrArb: fc.Arbitrary<JSXAttribute> = identArb.map((expr) => ({
  name: 'disabled',
  value: expr,
  isEventHandler: false,
  isDynamic: true,
}));

const dynamicAttrArb = fc.oneof(dynamicClassAttrArb, dynamicStyleAttrArb, dynamicDisabledAttrArb);

// ---------------------------------------------------------------------------
// Property 5: Transformación correcta de estructuras de control JSX
// ---------------------------------------------------------------------------

/**
 * Feature: react-to-angular-mcp
 * Property 5: Transformación correcta de estructuras de control JSX
 *
 * For any JSX template containing conditional expressions (ternaries, &&),
 * iterations (.map()), or switch expressions, the Template_Generator SHALL
 * produce the equivalent Angular control flow blocks (@if/@else, @for with
 * track, @switch/@case).
 *
 * **Validates: Requirements 5.1, 5.2, 5.3**
 */
describe('Property 5: Transformación correcta de estructuras de control JSX', () => {
  it('should transform all control flow expressions to Angular equivalents', () => {
    fc.assert(
      fc.property(
        fc.array(controlFlowExprArb, { minLength: 1, maxLength: 4 }),
        (expressions) => {
          const ir = makeBaseIR({
            jsxTree: {
              tag: 'div',
              attributes: [],
              isComponent: false,
              children: expressions,
            },
          });
          const result = generateAngularTemplate(ir);

          for (const expr of expressions) {
            switch (expr.type) {
              case 'conditional':
                expect(result.angularTemplate).toContain(`@if (${expr.expression})`);
                break;
              case 'ternary':
                expect(result.angularTemplate).toContain(`@if (${expr.expression})`);
                expect(result.angularTemplate).toContain('@else');
                break;
              case 'map':
                expect(result.angularTemplate).toContain(`@for (item of ${expr.expression}; track item)`);
                break;
              case 'switch':
                expect(result.angularTemplate).toContain(`@switch (${expr.expression})`);
                expect(result.angularTemplate).toContain('@case');
                break;
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Transformación correcta de atributos y event bindings JSX
// ---------------------------------------------------------------------------

/**
 * Feature: react-to-angular-mcp
 * Property 6: Transformación correcta de atributos y event bindings JSX
 *
 * For any JSX element with event handlers (onClick, onChange, onSubmit) or
 * dynamic attributes (className={expr}, style={obj}, disabled={bool}), the
 * Template_Generator SHALL produce the Angular event bindings ((click),
 * (change), (submit)) and property bindings ([class], [ngStyle], [disabled]).
 *
 * **Validates: Requirements 5.4, 5.5**
 */
describe('Property 6: Transformación correcta de atributos y event bindings JSX', () => {
  it('should transform event handlers to Angular event bindings', () => {
    fc.assert(
      fc.property(eventAttrArb, (attr) => {
        const ir = makeBaseIR({
          jsxTree: {
            tag: 'button',
            attributes: [attr],
            children: ['Click'],
            isComponent: false,
          },
        });
        const result = generateAngularTemplate(ir);
        const expectedEvent = angularEventMap[attr.name];
        expect(result.angularTemplate).toContain(`(${expectedEvent})="`);
        expect(result.templateBindings.some(b => b.type === 'event' && b.angularSyntax === `(${expectedEvent})`)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should transform dynamic attributes to Angular property bindings', () => {
    fc.assert(
      fc.property(dynamicAttrArb, (attr) => {
        const ir = makeBaseIR({
          jsxTree: {
            tag: 'div',
            attributes: [attr],
            children: [],
            isComponent: false,
          },
        });
        const result = generateAngularTemplate(ir);

        if (attr.name === 'className') {
          expect(result.angularTemplate).toContain('[class]=');
        } else if (attr.name === 'style') {
          expect(result.angularTemplate).toContain('[ngStyle]=');
        } else if (attr.name === 'disabled') {
          expect(result.angularTemplate).toContain('[disabled]=');
        }

        expect(result.templateBindings.some(b => b.type === 'property')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: Preservación de clases Tailwind CSS
// ---------------------------------------------------------------------------

/**
 * Feature: react-to-angular-mcp
 * Property 7: Preservación de clases Tailwind CSS
 *
 * For any JSX element with className containing Tailwind CSS classes, the
 * Template_Generator SHALL preserve all Tailwind classes in the class
 * attribute of the generated Angular element without loss or modification.
 *
 * **Validates: Requirements 5.6**
 */
describe('Property 7: Preservación de clases Tailwind CSS', () => {
  it('should preserve all Tailwind classes in the class attribute', () => {
    fc.assert(
      fc.property(tailwindClassListArb, (classList) => {
        const ir = makeBaseIR({
          jsxTree: {
            tag: 'div',
            attributes: [{
              name: 'className',
              value: classList,
              isEventHandler: false,
              isDynamic: false,
            }],
            children: [],
            isComponent: false,
          },
        });
        const result = generateAngularTemplate(ir);

        // All original classes must appear in the output
        expect(result.angularTemplate).toContain(`class="${classList}"`);
        // Should NOT use property binding
        expect(result.angularTemplate).not.toContain('[class]');
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: Umbral de plantilla inline vs archivo separado
// ---------------------------------------------------------------------------

/**
 * Feature: react-to-angular-mcp
 * Property 8: Umbral de plantilla inline vs archivo separado
 *
 * For any generated Angular template, if it has fewer than 50 lines it SHALL
 * be inline within the @Component decorator, and if it has 50 lines or more
 * it SHALL be generated as a separate .component.html file.
 *
 * **Validates: Requirements 5.7**
 */
describe('Property 8: Umbral de plantilla inline vs archivo separado', () => {
  it('should set isInlineTemplate based on the 50-line threshold', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 80 }),
        (childCount) => {
          const children: JSXNode[] = Array.from({ length: childCount }, (_, i) => ({
            tag: 'p',
            attributes: [],
            children: [`Line ${i}`],
            isComponent: false,
          }));
          const ir = makeBaseIR({
            jsxTree: {
              tag: 'div',
              attributes: [],
              children,
              isComponent: false,
            },
          });
          const result = generateAngularTemplate(ir);
          const lineCount = result.angularTemplate.split('\n').length;

          if (lineCount < 50) {
            expect(result.isInlineTemplate).toBe(true);
          } else {
            expect(result.isInlineTemplate).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 17: Interpolaciones seguras en plantillas
// ---------------------------------------------------------------------------

/**
 * Feature: react-to-angular-mcp
 * Property 17: Interpolaciones seguras en plantillas
 *
 * For any text interpolation in the generated Angular template, the
 * Template_Generator SHALL use Angular's standard interpolation {{ }}
 * which applies automatic sanitization.
 *
 * **Validates: Requirements 10.3**
 */
describe('Property 17: Interpolaciones seguras en plantillas', () => {
  it('should use Angular {{ }} for all interpolation expressions', () => {
    fc.assert(
      fc.property(
        fc.array(interpolationExprArb, { minLength: 1, maxLength: 5 }),
        (interpolations) => {
          const ir = makeBaseIR({
            jsxTree: {
              tag: 'div',
              attributes: [],
              isComponent: false,
              children: interpolations,
            },
          });
          const result = generateAngularTemplate(ir);

          for (const interp of interpolations) {
            // Each interpolation must use Angular {{ }} syntax
            expect(result.angularTemplate).toContain(`{{ ${interp.expression} }}`);
          }

          // Every interpolation should be tracked in templateBindings
          const interpBindings = result.templateBindings.filter(b => b.type === 'interpolation');
          expect(interpBindings.length).toBe(interpolations.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
