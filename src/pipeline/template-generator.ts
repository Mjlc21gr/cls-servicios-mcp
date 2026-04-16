import {
  ComponentIR,
  JSXNode,
  JSXAttribute,
  JSXExpression,
  BindingDefinition,
} from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Threshold: templates with fewer lines are inline, otherwise separate file */
const INLINE_TEMPLATE_THRESHOLD = 50;

/** HTML void elements that use self-closing syntax */
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** React event name → Angular event binding name */
const EVENT_MAP: Record<string, string> = {
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

// ---------------------------------------------------------------------------
// Attribute rendering helpers
// ---------------------------------------------------------------------------

/**
 * Render a single JSXAttribute to its Angular template equivalent.
 * Returns the attribute string and optionally a BindingDefinition.
 */
function renderAttribute(attr: JSXAttribute): { text: string; binding?: BindingDefinition } {
  const value = typeof attr.value === 'string' ? attr.value : attr.value.expression;

  // --- Event handlers ---
  if (attr.isEventHandler) {
    const angularEvent = EVENT_MAP[attr.name];
    if (angularEvent) {
      const handlerExpr = value.endsWith(')')
        ? value
        : `${value}($event)`;
      const angularSyntax = `(${angularEvent})="${handlerExpr}"`;
      return {
        text: angularSyntax,
        binding: {
          type: 'event',
          angularSyntax: `(${angularEvent})`,
          originalJSX: attr.name,
        },
      };
    }
  }

  // --- className (static string) → class="value" ---
  if (attr.name === 'className' && !attr.isDynamic) {
    return { text: `class="${value}"` };
  }

  // --- className (dynamic) → [class]="expr" ---
  if (attr.name === 'className' && attr.isDynamic) {
    return {
      text: `[class]="${value}"`,
      binding: {
        type: 'property',
        angularSyntax: '[class]',
        originalJSX: 'className',
      },
    };
  }

  // --- style (dynamic) → [ngStyle]="expr" ---
  if (attr.name === 'style' && attr.isDynamic) {
    return {
      text: `[ngStyle]="${value}"`,
      binding: {
        type: 'property',
        angularSyntax: '[ngStyle]',
        originalJSX: 'style',
      },
    };
  }

  // --- disabled (dynamic) → [disabled]="expr" ---
  if (attr.name === 'disabled' && attr.isDynamic) {
    return {
      text: `[disabled]="${value}"`,
      binding: {
        type: 'property',
        angularSyntax: '[disabled]',
        originalJSX: 'disabled',
      },
    };
  }

  // --- Other dynamic attributes → [attrName]="expr" ---
  if (attr.isDynamic) {
    return {
      text: `[${attr.name}]="${value}"`,
      binding: {
        type: 'property',
        angularSyntax: `[${attr.name}]`,
        originalJSX: attr.name,
      },
    };
  }

  // --- Static attributes ---
  return { text: `${attr.name}="${value}"` };
}

// ---------------------------------------------------------------------------
// JSX tree → Angular template
// ---------------------------------------------------------------------------

/**
 * Recursively render a JSX child (node, expression, or text string) to
 * Angular template HTML. Collects BindingDefinitions along the way.
 */
function renderChild(
  child: JSXNode | JSXExpression | string,
  bindings: BindingDefinition[],
  indent: string,
): string {
  if (typeof child === 'string') {
    return `${indent}${child}`;
  }
  if (isJSXExpression(child)) {
    return renderExpression(child, bindings, indent);
  }
  return renderNode(child, bindings, indent);
}

/**
 * Type guard: distinguish JSXExpression from JSXNode.
 */
function isJSXExpression(child: JSXNode | JSXExpression | string): child is JSXExpression {
  return typeof child === 'object' && 'type' in child && !('tag' in child);
}

/**
 * Render a JSXExpression to Angular control-flow syntax.
 */
function renderExpression(
  expr: JSXExpression,
  bindings: BindingDefinition[],
  indent: string,
): string {
  switch (expr.type) {
    case 'conditional': {
      // {cond && <X/>} → @if (cond) { <X/> }
      const childrenHtml = (expr.children ?? [])
        .map((c) => renderChild(c, bindings, indent + '  '))
        .join('\n');
      return `${indent}@if (${expr.expression}) {\n${childrenHtml}\n${indent}}`;
    }

    case 'ternary': {
      // {cond ? <A/> : <B/>} → @if (cond) { <A/> } @else { <B/> }
      const trueHtml = (expr.children ?? [])
        .map((c) => renderChild(c, bindings, indent + '  '))
        .join('\n');
      const falseHtml = (expr.alternate ?? [])
        .map((c) => renderChild(c, bindings, indent + '  '))
        .join('\n');
      return `${indent}@if (${expr.expression}) {\n${trueHtml}\n${indent}} @else {\n${falseHtml}\n${indent}}`;
    }

    case 'map': {
      // {arr.map(x => <X/>)} → @for (item of expr; track item) { <X/> }
      const bodyHtml = (expr.children ?? [])
        .map((c) => renderChild(c, bindings, indent + '  '))
        .join('\n');
      return `${indent}@for (item of ${expr.expression}; track item) {\n${bodyHtml}\n${indent}}`;
    }

    case 'switch': {
      // switch/multiple conditions → @switch (expr) { @case ... }
      const cases = (expr.children ?? []).map((c, i) => {
        const caseHtml = renderChild(c, bindings, indent + '    ');
        return `${indent}  @case (${i}) {\n${caseHtml}\n${indent}  }`;
      });
      return `${indent}@switch (${expr.expression}) {\n${cases.join('\n')}\n${indent}}`;
    }

    case 'interpolation': {
      // text interpolation → {{ expr }}
      bindings.push({
        type: 'interpolation',
        angularSyntax: `{{ ${expr.expression} }}`,
        originalJSX: expr.expression,
      });
      return `${indent}{{ ${expr.expression} }}`;
    }

    default:
      return '';
  }
}

/**
 * Render a JSXNode to Angular template HTML.
 */
function renderNode(
  node: JSXNode,
  bindings: BindingDefinition[],
  indent: string,
): string {
  // Fragment → render children without wrapper
  if (node.tag === '' || node.tag === 'Fragment' || node.tag === 'React.Fragment') {
    return node.children
      .map((c) => renderChild(c, bindings, indent))
      .join('\n');
  }

  // Build attribute string
  const attrParts: string[] = [];
  for (const attr of node.attributes) {
    const { text, binding } = renderAttribute(attr);
    attrParts.push(text);
    if (binding) {
      bindings.push(binding);
    }
  }
  const attrStr = attrParts.length > 0 ? ' ' + attrParts.join(' ') : '';

  // Self-closing void elements
  if (VOID_ELEMENTS.has(node.tag.toLowerCase()) && node.children.length === 0) {
    return `${indent}<${node.tag}${attrStr} />`;
  }

  // No children → self-closing for components, or empty tag for HTML
  if (node.children.length === 0) {
    if (node.isComponent) {
      return `${indent}<${node.tag}${attrStr} />`;
    }
    return `${indent}<${node.tag}${attrStr}></${node.tag}>`;
  }

  // With children
  const childrenHtml = node.children
    .map((c) => renderChild(c, bindings, indent + '  '))
    .join('\n');
  return `${indent}<${node.tag}${attrStr}>\n${childrenHtml}\n${indent}</${node.tag}>`;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Generates an Angular template from the JSX tree in the ComponentIR.
 *
 * Takes a ComponentIR (with jsxTree populated by AST_Parser and Angular fields
 * by State_Mapper) and returns a new ComponentIR with `angularTemplate`,
 * `isInlineTemplate`, and `templateBindings` populated.
 *
 * Does NOT mutate the input.
 */
export function generateAngularTemplate(ir: ComponentIR): ComponentIR {
  const bindings: BindingDefinition[] = [];
  const angularTemplate = renderNode(ir.jsxTree, bindings, '');
  const lineCount = angularTemplate.split('\n').length;
  const isInlineTemplate = lineCount < INLINE_TEMPLATE_THRESHOLD;

  return {
    ...ir,
    angularTemplate,
    isInlineTemplate,
    templateBindings: bindings,
  };
}
