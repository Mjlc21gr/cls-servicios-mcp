// =============================================================================
// Syntax Validator — Pre-compilation check for generated Angular templates & TS
// =============================================================================

import type { TransformedComponent } from './pipeline-types.js';

// ---------------------------------------------------------------------------
// CORE FIX: Sanitize all Angular bindings — fix quotes that break HTML parsing
// ---------------------------------------------------------------------------

/**
 * The #1 cause of NG5002 "Opening tag not terminated" is a double quote
 * inside a binding like [class]="expr ? "value" : 'other'".
 * The inner " closes the attribute prematurely.
 *
 * This function walks the template character by character, tracks whether
 * we're inside a binding value (after [xxx]=" or (xxx)="), and converts
 * any inner " to ' so the HTML parser sees a single unbroken attribute.
 */
function sanitizeBindingQuotes(html: string): string {
  const chars = [...html];
  const out: string[] = [];
  let i = 0;

  while (i < chars.length) {
    // Detect start of Angular binding: [xxx]=" or (xxx)="
    if ((chars[i] === '[' || chars[i] === '(') && i + 1 < chars.length) {
      let j = i;
      while (j < chars.length && chars[j] !== '=') { out.push(chars[j]); j++; }
      if (j < chars.length && chars[j] === '=' && j + 1 < chars.length && chars[j + 1] === '"') {
        out.push('=', '"');
        j += 2;
        // Inside binding value — track paren depth to find the REAL closing "
        let depth = 0;
        while (j < chars.length) {
          const ch = chars[j];
          if (ch === '(') depth++;
          if (ch === ')') depth--;

          if (ch === '"') {
            if (depth <= 0) {
              // Potential closing quote — verify by checking what follows
              const next = j + 1 < chars.length ? chars[j + 1] : '';
              if (next === '' || next === ' ' || next === '>' || next === '/' || next === '\n' || next === '\r' || next === ')') {
                out.push('"'); // real closing quote
                j++;
                break;
              }
            }
            // Inner " (either inside parens or followed by text) → convert to '
            out.push("'");
            j++;
            continue;
          }
          out.push(ch);
          j++;
        }
        i = j;
        continue;
      }
      i = j;
      continue;
    }
    out.push(chars[i]);
    i++;
  }

  return out.join('');
}


// ---------------------------------------------------------------------------
// HTML Template Validation & Auto-fix
// ---------------------------------------------------------------------------

function validateAndFixTemplate(html: string, componentName: string): { html: string; issues: string[] } {
  const issues: string[] = [];

  // STEP 0: Sanitize ALL binding quotes (the root cause of NG5002)
  let fixed = sanitizeBindingQuotes(html);
  if (fixed !== html) {
    issues.push(`[${componentName}] Fixed inner quotes in Angular bindings`);
  }

  // 1. Fix severity values
  fixed = fixed.replace(/'destructive'/g, "'danger'");
  fixed = fixed.replace(/severity="destructive"/g, 'severity="danger"');
  fixed = fixed.replace(/'outline'/g, "'secondary'");
  fixed = fixed.replace(/'ghost'/g, "'secondary'");

  // 2. Fix empty bindings
  fixed = fixed.replace(/\s*\[[\w.]+\]=""\s*/g, ' ');
  fixed = fixed.replace(/\s*\([\w.]+\)=""\s*/g, ' ');

  // 3. Balance HTML tags
  fixed = balanceTags(fixed, componentName, issues);

  return { html: fixed, issues };
}

// ---------------------------------------------------------------------------
// HTML Tag Balancer
// ---------------------------------------------------------------------------

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

function balanceTags(html: string, componentName: string, issues: string[]): string {
  const stack: string[] = [];
  const output: string[] = [];
  const tagRe = /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?\s*\/?>/g;
  let pos = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(html)) !== null) {
    if (match.index > pos) output.push(html.slice(pos, match.index));
    pos = match.index + match[0].length;
    const token = match[0];

    if (token.endsWith('/>')) { output.push(token); continue; }

    const closeMatch = token.match(/^<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>/);
    if (closeMatch) {
      const tag = closeMatch[1].toLowerCase();
      const idx = stack.lastIndexOf(tag);
      if (idx === stack.length - 1) {
        stack.pop();
        output.push(token);
      } else if (idx >= 0) {
        while (stack.length > idx + 1) {
          const unclosed = stack.pop()!;
          output.push(`</${unclosed}>`);
          issues.push(`[${componentName}] Auto-closed <${unclosed}>`);
        }
        stack.pop();
        output.push(token);
      } else {
        issues.push(`[${componentName}] Removed orphan </${tag}>`);
      }
      continue;
    }

    const openMatch = token.match(/^<([a-zA-Z][a-zA-Z0-9-]*)/);
    if (openMatch) {
      const tag = openMatch[1].toLowerCase();
      if (!VOID_ELEMENTS.has(tag)) stack.push(tag);
      output.push(token);
    } else {
      output.push(token);
    }
  }

  if (pos < html.length) output.push(html.slice(pos));
  while (stack.length > 0) {
    const unclosed = stack.pop()!;
    output.push(`</${unclosed}>`);
    issues.push(`[${componentName}] Auto-closed <${unclosed}> at end`);
  }

  return output.join('');
}

// ---------------------------------------------------------------------------
// TypeScript Validation
// ---------------------------------------------------------------------------

function validateAndFixTs(ts: string, componentName: string): { ts: string; issues: string[] } {
  const issues: string[] = [];
  let fixed = ts;

  let braceCount = 0;
  for (const ch of fixed) {
    if (ch === '{') braceCount++;
    if (ch === '}') braceCount--;
  }
  if (braceCount > 0) {
    issues.push(`[${componentName}] ${braceCount} unclosed brace(s) in TS`);
    fixed += '\n' + '}'.repeat(braceCount) + '\n';
  }

  fixed = fixed.replace(/this\.this\./g, 'this.');

  return { ts: fixed, issues };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function validateSyntax(
  components: ReadonlyMap<string, TransformedComponent>,
): Map<string, TransformedComponent> {
  const result = new Map<string, TransformedComponent>();
  let totalIssues = 0;

  for (const [key, comp] of components) {
    const htmlResult = validateAndFixTemplate(comp.componentHtml, comp.componentName);
    const tsResult = validateAndFixTs(comp.componentTs, comp.componentName);

    const allIssues = [...htmlResult.issues, ...tsResult.issues];
    if (allIssues.length > 0) {
      totalIssues += allIssues.length;
      for (const issue of allIssues) {
        console.log(`         ⚠ ${issue}`);
      }
    }

    result.set(key, {
      ...comp,
      componentHtml: htmlResult.html,
      componentTs: tsResult.ts,
    });
  }

  if (totalIssues > 0) {
    console.log(`         ${totalIssues} issue(s) auto-fixed`);
  } else {
    console.log('         ✓ Sin problemas de sintaxis');
  }

  return result;
}
