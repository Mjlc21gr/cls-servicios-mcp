// =============================================================================
// Template Integrity Layer — Validates HTML structure before writing .html files
// =============================================================================
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
export function validateTemplateIntegrity(components) {
    const result = new Map();
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
        html = html.replace(/\{\{\s*format\(new Date\(([^)]+)\),\s*'[^']*'(?:,\s*\{[^}]*\})?\s*\)\s*\}\}/g, '{{ $1 }}');
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
        html = html.replace(/(<app-evidence[^>]*)\(change\)="(\w+)\(\$event\)"/g, '$1(onChange)="$2($event)"');
        html = html.replace(/(<app-evidence[^>]*)\(evidenciasChange\)="(\w+)\(\$event\)"/g, '$1(onChange)="$2($event)"');
        html = html.replace(/(<app-\w+[^>]*)\(set\w+\)="(\w+)\(\$event\)"/g, '$1(onChange)="$2($event)"');
        // Fix 7: Remove key={...} attributes (React-specific)
        html = html.replace(/\s*key=\{[^}]*\}/g, '');
        html = html.replace(/\s*\[key\]="[^"]*"/g, '');
        // Fix 8: Ensure self-closing tags are valid
        html = fixSelfClosingTags(html);
        // Fix 9: Remove empty attribute values
        html = html.replace(/\s+class=""/g, '');
        result.set(key, { ...component, componentHtml: html });
    }
    return result;
}
/**
 * Fix self-closing tags that should have closing tags in Angular.
 * PrimeNG components like <p-select /> need to be <p-select></p-select>
 */
function fixSelfClosingTags(html) {
    const primeNgSelfClosing = ['p-select', 'p-toast', 'p-tag', 'p-checkbox', 'p-datepicker'];
    let result = html;
    for (const tag of primeNgSelfClosing) {
        // <p-select ... /> → <p-select ...></p-select>
        result = result.replace(new RegExp(`<${tag}([^>]*?)\\s*/>`, 'g'), `<${tag}$1></${tag}>`);
    }
    return result;
}
//# sourceMappingURL=template-integrity-layer.js.map