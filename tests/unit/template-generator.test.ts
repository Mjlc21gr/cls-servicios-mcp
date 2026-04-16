import { describe, it, expect } from 'vitest';
import { generateAngularTemplate } from '../../src/pipeline/template-generator.js';
import { ComponentIR, JSXNode, JSXExpression, JSXAttribute } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helper: create a minimal ComponentIR with sensible defaults
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
// Tests
// ---------------------------------------------------------------------------

describe('Template_Generator - generateAngularTemplate', () => {
  it('should not mutate the input IR', () => {
    const ir = makeBaseIR();
    const original = JSON.parse(JSON.stringify(ir));
    generateAngularTemplate(ir);
    expect(ir).toEqual(original);
  });

  // -----------------------------------------------------------------------
  // Control flow transformations
  // -----------------------------------------------------------------------

  describe('@if from conditional (&&)', () => {
    it('should convert conditional expression to @if block', () => {
      const ir = makeBaseIR({
        jsxTree: {
          tag: 'div',
          attributes: [],
          isComponent: false,
          children: [
            {
              type: 'conditional',
              expression: 'isVisible',
              children: [{ tag: 'span', attributes: [], children: ['Hello'], isComponent: false }],
            } as JSXExpression,
          ],
        },
      });
      const result = generateAngularTemplate(ir);
      expect(result.angularTemplate).toContain('@if (isVisible)');
      expect(result.angularTemplate).toContain('<span>');
      expect(result.angularTemplate).toContain('Hello');
    });
  });

  describe('@if/@else from ternary', () => {
    it('should convert ternary expression to @if/@else blocks', () => {
      const ir = makeBaseIR({
        jsxTree: {
          tag: 'div',
          attributes: [],
          isComponent: false,
          children: [
            {
              type: 'ternary',
              expression: 'isLoggedIn',
              children: [{ tag: 'span', attributes: [], children: ['Welcome'], isComponent: false }],
              alternate: [{ tag: 'span', attributes: [], children: ['Login'], isComponent: false }],
            } as JSXExpression,
          ],
        },
      });
      const result = generateAngularTemplate(ir);
      expect(result.angularTemplate).toContain('@if (isLoggedIn)');
      expect(result.angularTemplate).toContain('Welcome');
      expect(result.angularTemplate).toContain('@else');
      expect(result.angularTemplate).toContain('Login');
    });
  });

  describe('@for from map', () => {
    it('should convert map expression to @for with track clause', () => {
      const ir = makeBaseIR({
        jsxTree: {
          tag: 'ul',
          attributes: [],
          isComponent: false,
          children: [
            {
              type: 'map',
              expression: 'items',
              children: [{ tag: 'li', attributes: [], children: ['item'], isComponent: false }],
            } as JSXExpression,
          ],
        },
      });
      const result = generateAngularTemplate(ir);
      expect(result.angularTemplate).toContain('@for (item of items; track item)');
      expect(result.angularTemplate).toContain('<li>');
    });
  });

  describe('@switch from switch expression', () => {
    it('should convert switch expression to @switch/@case blocks', () => {
      const ir = makeBaseIR({
        jsxTree: {
          tag: 'div',
          attributes: [],
          isComponent: false,
          children: [
            {
              type: 'switch',
              expression: 'status',
              children: [
                { tag: 'span', attributes: [], children: ['Active'], isComponent: false },
                { tag: 'span', attributes: [], children: ['Inactive'], isComponent: false },
              ],
            } as JSXExpression,
          ],
        },
      });
      const result = generateAngularTemplate(ir);
      expect(result.angularTemplate).toContain('@switch (status)');
      expect(result.angularTemplate).toContain('@case (0)');
      expect(result.angularTemplate).toContain('@case (1)');
      expect(result.angularTemplate).toContain('Active');
      expect(result.angularTemplate).toContain('Inactive');
    });
  });

  // -----------------------------------------------------------------------
  // Event bindings
  // -----------------------------------------------------------------------

  describe('Event bindings', () => {
    it('should convert onClick to (click)', () => {
      const ir = makeBaseIR({
        jsxTree: {
          tag: 'button',
          attributes: [{ name: 'onClick', value: 'handleClick', isEventHandler: true, isDynamic: true }],
          children: ['Click me'],
          isComponent: false,
        },
      });
      const result = generateAngularTemplate(ir);
      expect(result.angularTemplate).toContain('(click)="handleClick($event)"');
      expect(result.templateBindings.some(b => b.type === 'event' && b.angularSyntax === '(click)')).toBe(true);
    });

    it('should convert onChange to (change)', () => {
      const ir = makeBaseIR({
        jsxTree: {
          tag: 'input',
          attributes: [{ name: 'onChange', value: 'handleChange', isEventHandler: true, isDynamic: true }],
          children: [],
          isComponent: false,
        },
      });
      const result = generateAngularTemplate(ir);
      expect(result.angularTemplate).toContain('(change)="handleChange($event)"');
    });

    it('should convert onSubmit to (submit)', () => {
      const ir = makeBaseIR({
        jsxTree: {
          tag: 'form',
          attributes: [{ name: 'onSubmit', value: 'handleSubmit', isEventHandler: true, isDynamic: true }],
          children: [],
          isComponent: false,
        },
      });
      const result = generateAngularTemplate(ir);
      expect(result.angularTemplate).toContain('(submit)="handleSubmit($event)"');
    });

    it('should preserve handler expression that already has parentheses', () => {
      const ir = makeBaseIR({
        jsxTree: {
          tag: 'button',
          attributes: [{ name: 'onClick', value: 'handleClick()', isEventHandler: true, isDynamic: true }],
          children: ['Go'],
          isComponent: false,
        },
      });
      const result = generateAngularTemplate(ir);
      expect(result.angularTemplate).toContain('(click)="handleClick()"');
    });
  });

  // -----------------------------------------------------------------------
  // Dynamic attributes
  // -----------------------------------------------------------------------

  describe('Dynamic attributes', () => {
    it('should convert dynamic className to [class]', () => {
      const ir = makeBaseIR({
        jsxTree: {
          tag: 'div',
          attributes: [{ name: 'className', value: 'dynamicClass', isEventHandler: false, isDynamic: true }],
          children: [],
          isComponent: false,
        },
      });
      const result = generateAngularTemplate(ir);
      expect(result.angularTemplate).toContain('[class]="dynamicClass"');
      expect(result.templateBindings.some(b => b.angularSyntax === '[class]')).toBe(true);
    });

    it('should convert dynamic style to [ngStyle]', () => {
      const ir = makeBaseIR({
        jsxTree: {
          tag: 'div',
          attributes: [{ name: 'style', value: 'styleObj', isEventHandler: false, isDynamic: true }],
          children: [],
          isComponent: false,
        },
      });
      const result = generateAngularTemplate(ir);
      expect(result.angularTemplate).toContain('[ngStyle]="styleObj"');
    });

    it('should convert dynamic disabled to [disabled]', () => {
      const ir = makeBaseIR({
        jsxTree: {
          tag: 'button',
          attributes: [{ name: 'disabled', value: 'isDisabled', isEventHandler: false, isDynamic: true }],
          children: ['Submit'],
          isComponent: false,
        },
      });
      const result = generateAngularTemplate(ir);
      expect(result.angularTemplate).toContain('[disabled]="isDisabled"');
    });

    it('should convert other dynamic attributes to [attrName]', () => {
      const ir = makeBaseIR({
        jsxTree: {
          tag: 'input',
          attributes: [{ name: 'placeholder', value: 'placeholderText', isEventHandler: false, isDynamic: true }],
          children: [],
          isComponent: false,
        },
      });
      const result = generateAngularTemplate(ir);
      expect(result.angularTemplate).toContain('[placeholder]="placeholderText"');
    });
  });

  // -----------------------------------------------------------------------
  // Tailwind class preservation
  // -----------------------------------------------------------------------

  describe('Tailwind class preservation', () => {
    it('should preserve static className as class attribute', () => {
      const ir = makeBaseIR({
        jsxTree: {
          tag: 'div',
          attributes: [{ name: 'className', value: 'flex items-center gap-4 p-2', isEventHandler: false, isDynamic: false }],
          children: [],
          isComponent: false,
        },
      });
      const result = generateAngularTemplate(ir);
      expect(result.angularTemplate).toContain('class="flex items-center gap-4 p-2"');
      // Should NOT use [class] binding
      expect(result.angularTemplate).not.toContain('[class]');
    });
  });

  // -----------------------------------------------------------------------
  // Inline vs separate template threshold
  // -----------------------------------------------------------------------

  describe('Inline vs separate template threshold', () => {
    it('should set isInlineTemplate=true for templates under 50 lines', () => {
      const ir = makeBaseIR({
        jsxTree: {
          tag: 'div',
          attributes: [],
          children: ['Hello'],
          isComponent: false,
        },
      });
      const result = generateAngularTemplate(ir);
      expect(result.isInlineTemplate).toBe(true);
    });

    it('should set isInlineTemplate=false for templates with 50+ lines', () => {
      // Build a tree with many children to exceed 50 lines
      const children: (JSXNode | string)[] = [];
      for (let i = 0; i < 60; i++) {
        children.push({ tag: 'p', attributes: [], children: [`Line ${i}`], isComponent: false });
      }
      const ir = makeBaseIR({
        jsxTree: {
          tag: 'div',
          attributes: [],
          children,
          isComponent: false,
        },
      });
      const result = generateAngularTemplate(ir);
      expect(result.isInlineTemplate).toBe(false);
      expect(result.angularTemplate.split('\n').length).toBeGreaterThanOrEqual(50);
    });
  });

  // -----------------------------------------------------------------------
  // Text interpolation
  // -----------------------------------------------------------------------

  describe('Text interpolation with {{ }}', () => {
    it('should render interpolation expressions with Angular {{ }}', () => {
      const ir = makeBaseIR({
        jsxTree: {
          tag: 'span',
          attributes: [],
          isComponent: false,
          children: [
            { type: 'interpolation', expression: 'userName' } as JSXExpression,
          ],
        },
      });
      const result = generateAngularTemplate(ir);
      expect(result.angularTemplate).toContain('{{ userName }}');
      expect(result.templateBindings.some(b => b.type === 'interpolation')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Fragment handling
  // -----------------------------------------------------------------------

  describe('Fragment handling', () => {
    it('should render Fragment children without a wrapper element', () => {
      const ir = makeBaseIR({
        jsxTree: {
          tag: '',
          attributes: [],
          isComponent: false,
          children: [
            { tag: 'span', attributes: [], children: ['A'], isComponent: false },
            { tag: 'span', attributes: [], children: ['B'], isComponent: false },
          ],
        },
      });
      const result = generateAngularTemplate(ir);
      expect(result.angularTemplate).not.toContain('<>');
      expect(result.angularTemplate).toContain('<span>');
    });
  });

  // -----------------------------------------------------------------------
  // Void elements
  // -----------------------------------------------------------------------

  describe('Void elements', () => {
    it('should render void elements as self-closing', () => {
      const ir = makeBaseIR({
        jsxTree: {
          tag: 'div',
          attributes: [],
          isComponent: false,
          children: [
            { tag: 'input', attributes: [], children: [], isComponent: false },
            { tag: 'br', attributes: [], children: [], isComponent: false },
            { tag: 'hr', attributes: [], children: [], isComponent: false },
            { tag: 'img', attributes: [{ name: 'src', value: 'logo.png', isEventHandler: false, isDynamic: false }], children: [], isComponent: false },
          ],
        },
      });
      const result = generateAngularTemplate(ir);
      expect(result.angularTemplate).toContain('<input />');
      expect(result.angularTemplate).toContain('<br />');
      expect(result.angularTemplate).toContain('<hr />');
      expect(result.angularTemplate).toContain('<img src="logo.png" />');
    });
  });

  // -----------------------------------------------------------------------
  // Component self-closing
  // -----------------------------------------------------------------------

  describe('Component rendering', () => {
    it('should render components with no children as self-closing', () => {
      const ir = makeBaseIR({
        jsxTree: {
          tag: 'div',
          attributes: [],
          isComponent: false,
          children: [
            { tag: 'MyComponent', attributes: [], children: [], isComponent: true },
          ],
        },
      });
      const result = generateAngularTemplate(ir);
      expect(result.angularTemplate).toContain('<MyComponent />');
    });
  });
});
