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
// Bug 1 Fix: React component tag → Angular/PrimeNG/HTML mapping
// ---------------------------------------------------------------------------

const REACT_TAG_TO_ANGULAR: Record<string, string> = {
  // shadcn/ui and common React UI components → PrimeNG/Semantic HTML
  'Card': 'p-card', 'CardHeader': 'header', 'CardContent': 'section', 'CardTitle': 'h3', 'CardDescription': 'p',
  'Button': 'button', 'Input': 'input', 'Label': 'label', 'Textarea': 'textarea',
  'Select': 'p-select', 'SelectTrigger': 'span', 'SelectContent': 'section', 'SelectItem': 'span', 'SelectValue': 'span',
  'Badge': 'p-tag', 'Dialog': 'p-dialog', 'DialogTrigger': 'span', 'DialogContent': 'section',
  'Table': 'p-table', 'TableHeader': 'thead', 'TableBody': 'tbody', 'TableRow': 'tr', 'TableHead': 'th', 'TableCell': 'td',
  // Layout components → semantic HTML
  'Container': 'main', 'Wrapper': 'section', 'Layout': 'main',
  'Header': 'header', 'Footer': 'footer', 'Sidebar': 'aside', 'Nav': 'nav', 'Navigation': 'nav',
  'Main': 'main', 'Content': 'section', 'Section': 'section', 'Article': 'article',
  'Aside': 'aside', 'Figure': 'figure', 'FigCaption': 'figcaption',
  // Form components → semantic form elements
  'Form': 'form', 'FormGroup': 'fieldset', 'FormLabel': 'label', 'FormControl': 'fieldset',
  'FormField': 'fieldset', 'FormItem': 'fieldset', 'FormMessage': 'small',
  // Tabs → PrimeNG
  'Tabs': 'p-tabview', 'TabsList': 'nav', 'TabsTrigger': 'button', 'TabsContent': 'section',
  // Accordion → PrimeNG
  'Accordion': 'p-accordion', 'AccordionItem': 'p-accordion-tab',
  // Framer Motion → plain semantic HTML
  'AnimatePresence': 'section', 'motion.div': 'section', 'motion.span': 'span', 'motion.section': 'section',
  'motion.article': 'article', 'motion.nav': 'nav', 'motion.header': 'header', 'motion.footer': 'footer',
  'motion.main': 'main', 'motion.aside': 'aside', 'motion.ul': 'ul', 'motion.li': 'li',
  // Lucide/React icons → PrimeNG icons (use <i> with pi class)
  'ShieldCheck': 'i', 'AlertCircle': 'i', 'PlusCircle': 'i', 'History': 'i', 'Camera': 'i', 'X': 'i',
  'Car': 'i', 'Home': 'i', 'Calendar': 'i', 'Clock': 'i', 'ChevronDown': 'i', 'ChevronUp': 'i',
  'Search': 'i', 'Filter': 'i', 'Edit': 'i', 'Trash': 'i', 'Plus': 'i', 'Minus': 'i',
  'Check': 'i', 'Close': 'i', 'Menu': 'i', 'Settings': 'i', 'User': 'i', 'Mail': 'i',
  // Toast → PrimeNG toast
  'Toaster': 'p-toast', 'Toast': 'p-toast',
  // Progress → PrimeNG
  'Progress': 'p-progressbar', 'ProgressBar': 'p-progressbar',
  // Avatar → PrimeNG
  'Avatar': 'p-avatar', 'AvatarFallback': 'span', 'AvatarImage': 'img',
  // Separator/Divider → PrimeNG
  'Separator': 'p-divider', 'Divider': 'p-divider',
  // Skeleton → PrimeNG
  'Skeleton': 'p-skeleton',
  // Switch → PrimeNG ToggleSwitch
  'Switch': 'p-toggleswitch',
  // Slider → PrimeNG
  'Slider': 'p-slider',
  // Tooltip → PrimeNG
  'Tooltip': 'span', 'TooltipTrigger': 'span', 'TooltipContent': 'span',
  // Popover → PrimeNG OverlayPanel
  'Popover': 'p-overlaypanel', 'PopoverTrigger': 'span', 'PopoverContent': 'section',
  // Alert → PrimeNG Message
  'Alert': 'p-message', 'AlertTitle': 'strong', 'AlertDescription': 'span',
  // ScrollArea → native
  'ScrollArea': 'section',
};

const ICON_CLASS_MAP: Record<string, string> = {
  'ShieldCheck': 'pi pi-shield', 'AlertCircle': 'pi pi-exclamation-circle', 'PlusCircle': 'pi pi-plus-circle',
  'History': 'pi pi-history', 'Camera': 'pi pi-camera', 'X': 'pi pi-times',
  'Car': 'pi pi-car', 'Home': 'pi pi-home', 'Calendar': 'pi pi-calendar', 'Clock': 'pi pi-clock',
  'ChevronDown': 'pi pi-chevron-down', 'ChevronUp': 'pi pi-chevron-up',
  'Search': 'pi pi-search', 'Filter': 'pi pi-filter', 'Edit': 'pi pi-pencil', 'Trash': 'pi pi-trash',
  'Plus': 'pi pi-plus', 'Minus': 'pi pi-minus', 'Check': 'pi pi-check', 'Close': 'pi pi-times',
  'Menu': 'pi pi-bars', 'Settings': 'pi pi-cog', 'User': 'pi pi-user', 'Mail': 'pi pi-envelope',
};

/**
 * Convert a React component tag to its Angular/PrimeNG/HTML equivalent.
 * For icon components, returns a special `<i class="pi pi-xxx"></i>` string.
 */
function convertReactTag(tag: string): { tag: string; isIcon: boolean; iconClass?: string } {
  const iconClass = ICON_CLASS_MAP[tag];
  if (iconClass) {
    return { tag: 'i', isIcon: true, iconClass };
  }
  const mapped = REACT_TAG_TO_ANGULAR[tag];
  if (mapped) {
    return { tag: mapped, isIcon: false };
  }
  return { tag, isIcon: false };
}

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
    // ALL inner double quotes must become single quotes — the outer binding uses double quotes
    const safeValue = value.split('"').join("'");
    return {
      text: `[class]="${safeValue}"`,
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
    // Skip Framer Motion attributes that have no Angular equivalent
    const FRAMER_ATTRS = new Set(['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap', 'whileInView', 'variants', 'layout', 'layoutId']);
    if (FRAMER_ATTRS.has(attr.name)) {
      return { text: '' }; // Strip completely
    }
    // Skip React-only attributes
    if (attr.name === 'key' || attr.name === 'ref') {
      return { text: '' };
    }
    // MLFIX-QUOTES: escape double quotes inside binding values to single quotes
    const safeValue = value.split('"').join("'");
    return {
      text: `[${attr.name}]="${safeValue}"`,
      binding: {
        type: 'property',
        angularSyntax: `[${attr.name}]`,
        originalJSX: attr.name,
      },
    };
  }

  // --- Static attributes ---
  // Skip React-only and Framer Motion static attributes
  if (['key', 'ref', 'mode'].includes(attr.name)) {
    return { text: '' };
  }
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
      // expression format: "collection::paramName::indexName" or "collection::paramName" or "collection"
      const parts = expr.expression.split('::');
      const collectionExpr = parts[0];
      const loopVar = parts[1] || 'item';
      const indexVar = parts[2] || '';
      let bodyHtml = (expr.children ?? [])
        .map((c) => renderChild(c, bindings, indent + '  '))
        .join('\n');
      // Replace React index variable with Angular $index
      if (indexVar) {
        bodyHtml = bodyHtml.replace(new RegExp(`\\b${indexVar}\\b`, 'g'), '$index');
      }
      return `${indent}@for (${loopVar} of ${collectionExpr}; track ${loopVar}) {\n${bodyHtml}\n${indent}}`;
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

  // Bug 1 Fix: Convert React component tags to Angular/PrimeNG/HTML equivalents
  const converted = convertReactTag(node.tag);
  const tag = converted.tag;

  // Icon components → render as <i class="pi pi-xxx"></i>
  if (converted.isIcon && converted.iconClass) {
    return `${indent}<i class="${converted.iconClass}"></i>`;
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

  // PrimeNG self-closing components — these don't accept HTML children
  // Their children (from React) are converted to [options], [items], etc. by post-processing
  const PRIMENG_SELF_CLOSING = new Set([
    'p-select', 'p-checkbox', 'p-toggleswitch', 'p-slider', 'p-rating',
    'p-inputnumber', 'p-datepicker', 'p-autocomplete', 'p-multiselect',
    'p-radiobutton', 'p-progressbar', 'p-skeleton', 'p-divider', 'p-image',
  ]);
  if (PRIMENG_SELF_CLOSING.has(tag)) {
    if (tag === 'p-select' && node.children.length > 0) {
      const options = extractSelectOptions(node);
      if (options.length > 0) {
        const optionsJson = JSON.stringify(options);
        // Extract value binding for ngModel
        const valueAttr = node.attributes.find(a => a.name === 'value' && a.isDynamic);
        const ngModel = valueAttr
          ? ` [(ngModel)]="${typeof valueAttr.value === 'string' ? valueAttr.value : valueAttr.value.expression}"`
          : '';
        // Extract placeholder from SelectValue child
        let placeholder = 'Seleccione';
        const findPlaceholder = (children: (JSXNode | JSXExpression | string)[]) => {
          for (const c of children) {
            if (typeof c !== 'object' || !('tag' in c)) continue;
            if (c.tag === 'SelectValue') {
              const ph = c.attributes.find(a => a.name === 'placeholder');
              if (ph) placeholder = typeof ph.value === 'string' ? ph.value : ph.value.expression;
            }
            if (c.children?.length) findPlaceholder(c.children);
          }
        };
        findPlaceholder(node.children);
        return `${indent}<p-select [options]='${optionsJson}' optionLabel="label" optionValue="value"${ngModel} placeholder="${placeholder}" />`;
      }
    }
    return `${indent}<${tag}${attrStr} />`;
  }

  // Self-closing void elements
  if (VOID_ELEMENTS.has(tag.toLowerCase()) && node.children.length === 0) {
    return `${indent}<${tag}${attrStr} />`;
  }

  // No children → self-closing for components, or empty tag for HTML
  if (node.children.length === 0) {
    if (node.isComponent && !REACT_TAG_TO_ANGULAR[node.tag]) {
      return `${indent}<${tag}${attrStr} />`;
    }
    return `${indent}<${tag}${attrStr}></${tag}>`;
  }

  // With children
  const childrenHtml = node.children
    .map((c) => renderChild(c, bindings, indent + '  '))
    .join('\n');
  return `${indent}<${tag}${attrStr}>\n${childrenHtml}\n${indent}</${tag}>`;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Extract options from Select children (SelectItem nodes).
 */
function extractSelectOptions(node: JSXNode): Array<{ label: string; value: string }> {
  const options: Array<{ label: string; value: string }> = [];

  function walk(children: (JSXNode | JSXExpression | string)[]) {
    for (const child of children) {
      if (typeof child === 'string') continue;
      if ('type' in child && !('tag' in child)) continue;
      const n = child as JSXNode;

      // Match SelectItem by ORIGINAL tag name (before conversion)
      // SelectItem has tag 'SelectItem' or 'option' with value attr + text children
      if (n.tag === 'SelectItem' || n.tag === 'option') {
        const valueAttr = n.attributes.find(a => a.name === 'value');
        if (valueAttr) {
          const val = typeof valueAttr.value === 'string' ? valueAttr.value : valueAttr.value.expression;
          const label = n.children.filter(c => typeof c === 'string').join('').trim();
          if (label && val) {
            options.push({ label, value: val });
          }
        }
      }

      // Recurse into all children (SelectContent, SelectTrigger, etc.)
      if (n.children.length > 0) walk(n.children);
    }
  }

  walk(node.children);
  return options;
}

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
  let angularTemplate = renderNode(ir.jsxTree, bindings, '');

  // Post-process: fix Angular-specific patterns
  angularTemplate = postProcessTemplate(angularTemplate);

  const lineCount = angularTemplate.split('\n').length;
  const isInlineTemplate = lineCount < INLINE_TEMPLATE_THRESHOLD;

  return {
    ...ir,
    angularTemplate,
    isInlineTemplate,
    templateBindings: bindings,
  };
}

// ---------------------------------------------------------------------------
// Template post-processor — fixes React→Angular semantic patterns
// ---------------------------------------------------------------------------

function postProcessTemplate(html: string): string {
  let result = html;

  // 1. Fix htmlFor → for
  result = result.replace(/\bhtmlFor=/g, 'for=');

  // 2. Fix required="true" → required (boolean attribute)
  result = result.replace(/\brequired="true"/g, 'required');

  // 3. Convert shadcn/ui Select structure to PrimeNG p-select
  // Pattern: <p-select ...><div><span ...></span></div><div><div value="x">Label</div>...</div></p-select>
  // → <p-select [options]="[{label:'Label',value:'x'},...]" ... />
  result = convertShadcnSelectToPrimeNG(result);

  // 4. Convert React component refs to Angular selectors
  // <EvidenceUpload → <app-evidence-upload
  // <ServiceForm → <app-service-form
  // <ServiceList → <app-service-list
  // BUT skip known icon names and PrimeNG tags
  const SKIP_CONVERSION = new Set([
    ...Object.keys(REACT_TAG_TO_ANGULAR),
    ...Object.keys(ICON_CLASS_MAP),
    'Loader2', 'Save', 'AlertTriangle', 'RefreshCcw', 'CardFooter',
  ]);
  result = result.replace(/<(\/?)([A-Z][a-zA-Z0-9]+)(\s|>|\/)/g, (_match, slash, name, after) => {
    if (SKIP_CONVERSION.has(name)) return _match;
    const kebab = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    return `<${slash}app-${kebab}${after}`;
  });

  // 5. Remove [onValueChange]="..." (React prop, not Angular)
  result = result.replace(/\s*\[onValueChange\]="[^"]*"/g, '');

  // 6. Remove [value]="..." on p-select (use ngModel instead)
  result = result.replace(/(<p-select[^>]*)\s*\[value\]="([^"]*)"/g, '$1 [ngModel]="$2"');

  // 7. Fix CardFooter → div
  result = result.replace(/<CardFooter>/g, '<div class="flex justify-end mt-4">');
  result = result.replace(/<\/CardFooter>/g, '</div>');

  // 8. Remove placeholder="..." from span elements (not valid)
  result = result.replace(/<span\s+placeholder="[^"]*">/g, '<span>');

  // 9. Convert remaining Lucide icon components to PrimeIcons
  result = result.replace(/<Loader2[^>]*\/>/g, '<i class="pi pi-spin pi-spinner"></i>');
  result = result.replace(/<Loader2[^>]*>[^<]*<\/Loader2>/g, '<i class="pi pi-spin pi-spinner"></i>');
  result = result.replace(/<Save[^>]*\/>/g, '<i class="pi pi-save"></i>');
  result = result.replace(/<Save[^>]*>[^<]*<\/Save>/g, '<i class="pi pi-save"></i>');
  result = result.replace(/<AlertTriangle[^>]*\/>/g, '<i class="pi pi-exclamation-triangle"></i>');
  result = result.replace(/<RefreshCcw[^>]*\/>/g, '<i class="pi pi-refresh"></i>');

  // 10. Fix pInputTextarea → pTextarea (PrimeNG 21)
  result = result.replace(/pInputTextarea/g, 'pTextarea');

  // 11. Fix p-dropdown → p-select (PrimeNG 21)
  result = result.replace(/<p-dropdown/g, '<p-select');
  result = result.replace(/<\/p-dropdown>/g, '</p-select>');

  return result;
}

/**
 * Convert shadcn/ui Select structure to PrimeNG p-select with [options] binding.
 * Extracts <div value="x">Label</div> children and converts to options array.
 */
function convertShadcnSelectToPrimeNG(html: string): string {
  // Match p-select blocks with children that contain <div value="...">...</div>
  const selectBlockRe = /<p-select([^>]*)>([\s\S]*?)<\/p-select>/g;

  return html.replace(selectBlockRe, (_match, attrs: string, body: string) => {
    // Extract options from <div value="x">Label</div> patterns
    const optionRe = /<div\s+value="([^"]*)">\s*([^<]*?)\s*<\/div>/g;
    const options: Array<{ label: string; value: string }> = [];
    let optMatch: RegExpExecArray | null;

    while ((optMatch = optionRe.exec(body)) !== null) {
      options.push({ value: optMatch[1], label: optMatch[2].trim() });
    }

    if (options.length === 0) {
      // No options found — self-closing
      return `<p-select${attrs} />`;
    }

    // Build options array string
    const optionsStr = JSON.stringify(options);

    // Clean up attrs — remove ALL React-specific attributes
    let cleanAttrs = attrs
      .replace(/\s*\[value\]="[^"]*"/g, '')
      .replace(/\s*\[onValueChange\]="[^"]*"/g, '')
      .replace(/\s*\[ngModel\]="[^"]*"/g, '')
      .replace(/\s*value="[^"]*"/g, '')
      .replace(/\s*onValueChange="[^"]*"/g, '')
      .trim();

    // Build the clean p-select tag — self-closing
    return `<p-select [options]='${optionsStr}' optionLabel="label" optionValue="value" placeholder="Seleccione" />`;
  });
}
