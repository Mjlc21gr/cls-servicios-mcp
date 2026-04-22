// =============================================================================
// Template Integrity Layer — Validates HTML structure before writing .html files
// =============================================================================

import type { TransformedComponent } from './pipeline-types.js';

/**
 * Validates and fixes template HTML integrity.
 * 
 * Rules:
 * 1. All tags must be properly closed
 * 2. Angular binding syntax must be valid: [prop]="expr", (event)="handler()"
 * 3. No React-specific attributes (className, htmlFor, etc.)
 * 4. No React component tags (PascalCase that aren't PrimeNG)
 * 5. PrimeNG components must use correct API
 */
export function validateTemplateIntegrity(
  components: ReadonlyMap<string, TransformedComponent>,
): Map<string, TransformedComponent> {
  const result = new Map<string, TransformedComponent>();

  for (const [key, component] of components) {
    let html = component.componentHtml;

    // Fix 1: className → class
    html = html.replace(/\bclassName=/g, 'class=');

    // Fix 2: htmlFor → for
    html = html.replace(/\bhtmlFor=/g, 'for=');

    // Fix 3: required="true" → required
    html = html.replace(/\brequired="true"/g, 'required');

    // Fix 4: Remove React-specific event props that leaked through
    html = html.replace(/\s*\[onValueChange\]="[^"]*"/g, '');
    html = html.replace(/\s*onValueChange=\{[^}]*\}/g, '');
    html = html.replace(/\s*onChange=\{[^}]*\}/g, '');

    // Fix 5: Remove [ref]="..." (React ref, not Angular) — convert to template ref
    html = html.replace(/\s*\[ref\]="(\w+)"/g, ' #$1');
    html = html.replace(/\s*ref=\{[^}]*\}/g, '');

    // Fix 6: Fix malformed p-select tags (missing space after tag name)
    html = html.replace(/<p-select(?=[^\s>])/g, '<p-select ');

    // Fix 7: Replace date-fns format() calls with simple date display
    // {{ format(new Date(x), 'dd MMM yyyy', { locale: es }) }} → {{ x }}
    html = html.replace(
      /\{\{\s*format\(new Date\(([^)]+)\),\s*'[^']*'(?:,\s*\{[^}]*\})?\s*\)\s*\}\}/g,
      '{{ $1 }}',
    );

    // Fix 8: Replace [variant]="..." with [severity]="..." for p-tag (PrimeNG 19)
    html = html.replace(/\[variant\]=/g, '[severity]=');

    // MLFIX-OUTPUTBIND: convert callback prop bindings to output event bindings
    // [onSuccess]="handleSave" -> (onSave)="handleSave($event)"
    html = html.replace(/\[onSuccess\]="(\w+)"/g, '(onSave)="$1($event)"');
    // [onChange]="xxx" on app-evidence -> (onChange)="xxx($event)" (matches the output name)
    html = html.replace(/(<app-evidence[^>]*)\[onChange\]="(\w+)"/g, '$1(onChange)="$2($event)"');
    html = html.replace(/\[onChange\]="(\w+)\.bind\(this\)"/g, '(onChange)="$1($event)"');

    // Fix 9: viewChild().current → viewChild()?.nativeElement
    html = html.replace(/(\w+)\.current\b/g, '$1()?.nativeElement');

    // Fix 10: (change)="setXxx($event)" on custom components → (onChange)
    html = html.replace(
      /(<app-evidence[^>]*)\(change\)="(\w+)\(\$event\)"/g,
      '$1(onChange)="$2($event)"',
    );
    html = html.replace(
      /(<app-evidence[^>]*)\(evidenciasChange\)="(\w+)\(\$event\)"/g,
      '$1(onChange)="$2($event)"',
    );
    html = html.replace(
      /(<app-\w+[^>]*)\(set\w+\)="(\w+)\(\$event\)"/g,
      '$1(onChange)="$2($event)"',
    );

    // Fix 7: Remove key={...} attributes (React-specific)
    html = html.replace(/\s*key=\{[^}]*\}/g, '');
    html = html.replace(/\s*\[key\]="[^"]*"/g, '');

    // Fix 8: Ensure self-closing tags are valid
    html = fixSelfClosingTags(html);

    // Fix 9: Remove empty attribute values
    html = html.replace(/\s+class=""/g, '');

    // Fix 10: Balance mismatched HTML tags (NG5002 prevention)
    html = balanceHtmlTags(html);

    // Fix 11: PrimeNG severity — "destructive" → "danger" (React shadcn → PrimeNG)
    html = html.replace(/severity="destructive"/g, 'severity="danger"');
    html = html.replace(/\[severity\]="'destructive'"/g, '[severity]="\'danger\'"');
    // Fix ternary severity bindings: 'destructive' → 'danger' (inside single quotes within bindings)
    html = html.replace(/'destructive'/g, "'danger'");

    // Fix 12: Fix unterminated quotes in bindings (e.g. [ngModel]="tipoServicio'...)
    html = fixUnterminatedQuotes(html);

    // Fix 13: Fix malformed p-select — ensure proper closing and attributes
    html = html.replace(/<p-select\s+\[ngModel\]="([^"]*)"[^>]*>\s*<\/p-select>/g,
      '<p-select [ngModel]="$1()" (ngModelChange)="$1.set($$event)" placeholder="Seleccione"></p-select>');

    result.set(key, { ...component, componentHtml: html });
  }

  return result;
}

/**
 * Fix unterminated quotes in Angular template bindings.
 * Detects patterns like [ngModel]="tipoServicio'space-y-2"> which have
 * a single quote inside a double-quoted attribute, causing NG5002.
 */
function fixUnterminatedQuotes(html: string): string {
  // Only fix cases where a binding value clearly leaked into the next element
  // Pattern: [attr]="value'followed-by-tag-content"> where the ' is NOT part of a valid expression
  // We detect this by checking if after the ' there's a tag-like pattern (e.g. space-y-2">)
  let result = html.replace(
    /(\[[\w.]+\]="[^"]*?)'(?=[a-z]+-[a-z])/g,
    '$1"',
  );

  return result;
}

/**
 * Fix self-closing tags that should have closing tags in Angular.
 * PrimeNG components like <p-select /> need to be <p-select></p-select>
 */
function fixSelfClosingTags(html: string): string {
  const primeNgSelfClosing = ['p-select', 'p-toast', 'p-tag', 'p-checkbox', 'p-datepicker'];

  let result = html;
  for (const tag of primeNgSelfClosing) {
    // <p-select ... /> → <p-select ...></p-select>
    result = result.replace(
      new RegExp(`<${tag}([^>]*?)\\s*/>`, 'g'),
      `<${tag}$1></${tag}>`,
    );
  }

  return result;
}


// ---------------------------------------------------------------------------
// HTML Tag Balancer — fixes mismatched open/close tags (NG5002 prevention)
// ---------------------------------------------------------------------------

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/**
 * Balance mismatched HTML tags by tracking the open/close stack.
 * If a closing tag doesn't match the current open tag, fix it.
 *
 * This prevents NG5002 "Unexpected closing tag" errors.
 */
function balanceHtmlTags(html: string): string {
  // Tokenize: split into tags and text
  const tokens: string[] = [];
  let pos = 0;
  const tagRe = /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?\s*\/?>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(html)) !== null) {
    if (match.index > pos) {
      tokens.push(html.slice(pos, match.index));
    }
    tokens.push(match[0]);
    pos = match.index + match[0].length;
  }
  if (pos < html.length) {
    tokens.push(html.slice(pos));
  }

  // Track open tag stack
  const stack: string[] = [];
  const output: string[] = [];

  for (const token of tokens) {
    // Skip non-tag tokens (text, Angular control flow, etc.)
    if (!token.startsWith('<')) {
      output.push(token);
      continue;
    }

    // Self-closing tag
    if (token.endsWith('/>')) {
      output.push(token);
      continue;
    }

    // Closing tag
    const closeMatch = token.match(/^<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>/);
    if (closeMatch) {
      const tagName = closeMatch[1].toLowerCase();

      // Find matching open tag in stack
      const idx = stack.lastIndexOf(tagName);
      if (idx === stack.length - 1) {
        // Perfect match — pop and emit
        stack.pop();
        output.push(token);
      } else if (idx >= 0) {
        // Mismatched — close intermediate tags first
        while (stack.length > idx + 1) {
          const unclosed = stack.pop()!;
          output.push(`</${unclosed}>`);
        }
        stack.pop();
        output.push(token);
      } else {
        // No matching open tag — skip this closing tag (it's orphaned)
        // This prevents NG5002
      }
      continue;
    }

    // Opening tag
    const openMatch = token.match(/^<([a-zA-Z][a-zA-Z0-9-]*)/);
    if (openMatch) {
      const tagName = openMatch[1].toLowerCase();
      // Skip void elements (they don't need closing)
      if (!VOID_ELEMENTS.has(tagName)) {
        stack.push(tagName);
      }
      output.push(token);
      continue;
    }

    // Anything else (comments, Angular syntax, etc.)
    output.push(token);
  }

  // Close any remaining unclosed tags
  while (stack.length > 0) {
    const unclosed = stack.pop()!;
    output.push(`</${unclosed}>`);
  }

  return output.join('');
}
