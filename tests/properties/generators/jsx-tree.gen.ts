/**
 * Generators for JSX tree structures used in property-based testing.
 *
 * Exports arbitraries for JSXNode, JSXAttribute, JSXExpression, and
 * various sub-generators for control flow, events, and dynamic attributes.
 */
import * as fc from 'fast-check';
import type { JSXNode, JSXAttribute, JSXExpression } from '../../../src/types.js';
import { identifierArb } from './hooks.gen.js';

// ---------------------------------------------------------------------------
// Tag generators
// ---------------------------------------------------------------------------

/** Common HTML tags. */
export const htmlTagArb = fc.constantFrom(
  'div', 'span', 'p', 'section', 'article', 'ul', 'li', 'h1', 'h2', 'form',
);

/** Tailwind CSS class names. */
export const tailwindClassArb = fc.constantFrom(
  'flex', 'items-center', 'gap-4', 'p-2', 'mt-4', 'text-lg', 'bg-blue-500',
  'rounded', 'shadow-md', 'w-full', 'h-screen', 'border', 'font-bold',
);

/** Space-separated list of unique Tailwind classes. */
export const tailwindClassListArb = fc.array(tailwindClassArb, { minLength: 1, maxLength: 5 })
  .map((classes) => [...new Set(classes)].join(' '));

// ---------------------------------------------------------------------------
// JSXExpression generators
// ---------------------------------------------------------------------------

/** Conditional expression: `{name && <span>name</span>}` */
export const conditionalExprArb: fc.Arbitrary<JSXExpression> = identifierArb.map((name) => ({
  type: 'conditional' as const,
  expression: name,
  children: [{ tag: 'span', attributes: [], children: [name], isComponent: false }],
}));

/** Ternary expression: `{name ? <span>true</span> : <span>false</span>}` */
export const ternaryExprArb: fc.Arbitrary<JSXExpression> = identifierArb.map((name) => ({
  type: 'ternary' as const,
  expression: name,
  children: [{ tag: 'span', attributes: [], children: ['true'], isComponent: false }],
  alternate: [{ tag: 'span', attributes: [], children: ['false'], isComponent: false }],
}));

/** Map expression: `{name.map(item => <li>item</li>)}` */
export const mapExprArb: fc.Arbitrary<JSXExpression> = identifierArb.map((name) => ({
  type: 'map' as const,
  expression: name,
  children: [{ tag: 'li', attributes: [], children: ['item'], isComponent: false }],
}));

/** Switch expression with random case count. */
export const switchExprArb: fc.Arbitrary<JSXExpression> = fc.tuple(
  identifierArb,
  fc.integer({ min: 2, max: 4 }),
).map(([name, count]) => ({
  type: 'switch' as const,
  expression: name,
  children: Array.from({ length: count }, (_, i) => ({
    tag: 'span',
    attributes: [],
    children: [`case${i}`],
    isComponent: false,
  })),
}));

/** Interpolation expression: `{name}` */
export const interpolationExprArb: fc.Arbitrary<JSXExpression> = identifierArb.map((name) => ({
  type: 'interpolation' as const,
  expression: name,
}));

/** Any control flow expression (conditional, ternary, map, switch). */
export const controlFlowExprArb = fc.oneof(
  conditionalExprArb,
  ternaryExprArb,
  mapExprArb,
  switchExprArb,
);

// ---------------------------------------------------------------------------
// JSXAttribute generators
// ---------------------------------------------------------------------------

/** React event handler names. */
export const eventNameArb = fc.constantFrom(
  'onClick', 'onChange', 'onSubmit', 'onInput', 'onFocus',
  'onBlur', 'onKeyDown', 'onKeyUp', 'onMouseEnter', 'onMouseLeave',
);

/** Map from React event names to Angular event names. */
export const angularEventMap: Record<string, string> = {
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

/** Event handler attribute. */
export const eventAttrArb: fc.Arbitrary<JSXAttribute> = fc.tuple(eventNameArb, identifierArb).map(
  ([eventName, handler]) => ({
    name: eventName,
    value: handler,
    isEventHandler: true,
    isDynamic: true,
  }),
);

/** Dynamic className attribute. */
export const dynamicClassAttrArb: fc.Arbitrary<JSXAttribute> = identifierArb.map((expr) => ({
  name: 'className',
  value: expr,
  isEventHandler: false,
  isDynamic: true,
}));

/** Dynamic style attribute. */
export const dynamicStyleAttrArb: fc.Arbitrary<JSXAttribute> = identifierArb.map((expr) => ({
  name: 'style',
  value: expr,
  isEventHandler: false,
  isDynamic: true,
}));

/** Dynamic disabled attribute. */
export const dynamicDisabledAttrArb: fc.Arbitrary<JSXAttribute> = identifierArb.map((expr) => ({
  name: 'disabled',
  value: expr,
  isEventHandler: false,
  isDynamic: true,
}));

/** Any dynamic attribute (className, style, or disabled). */
export const dynamicAttrArb = fc.oneof(
  dynamicClassAttrArb,
  dynamicStyleAttrArb,
  dynamicDisabledAttrArb,
);

/** Static className attribute with Tailwind classes. */
export const staticTailwindAttrArb: fc.Arbitrary<JSXAttribute> = tailwindClassListArb.map(
  (classList) => ({
    name: 'className',
    value: classList,
    isEventHandler: false,
    isDynamic: false,
  }),
);

// ---------------------------------------------------------------------------
// JSXNode generators
// ---------------------------------------------------------------------------

/** Simple leaf JSXNode with text content. */
export const leafNodeArb: fc.Arbitrary<JSXNode> = fc.tuple(htmlTagArb, identifierArb).map(
  ([tag, text]) => ({
    tag,
    attributes: [],
    children: [text],
    isComponent: false,
  }),
);

/** JSXNode wrapping children in a container tag. */
export const containerNodeArb: fc.Arbitrary<JSXNode> = fc.tuple(
  htmlTagArb,
  fc.array(leafNodeArb, { minLength: 1, maxLength: 4 }),
).map(([tag, children]) => ({
  tag,
  attributes: [],
  children,
  isComponent: false,
}));

/** Empty JSXNode (useful as a base for IR construction). */
export function makeEmptyJSXNode(): JSXNode {
  return { tag: 'div', attributes: [], children: [], isComponent: false };
}
