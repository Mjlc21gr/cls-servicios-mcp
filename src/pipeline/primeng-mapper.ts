import { ComponentIR, PrimeNGImport } from '../types.js';

// ---------------------------------------------------------------------------
// PrimeNG Mapping Tables
// ---------------------------------------------------------------------------

/**
 * Maps PrimeNG component/directive tags to their module imports.
 */
const PRIMENG_IMPORT_MAP: Record<string, PrimeNGImport> = {
  'p-button': { moduleName: 'ButtonModule', importPath: 'primeng/button' },
  'pInputText': { moduleName: 'InputTextModule', importPath: 'primeng/inputtext' },
  'p-dropdown': { moduleName: 'DropdownModule', importPath: 'primeng/dropdown' },
  'p-table': { moduleName: 'TableModule', importPath: 'primeng/table' },
  'p-checkbox': { moduleName: 'CheckboxModule', importPath: 'primeng/checkbox' },
  'pInputTextarea': { moduleName: 'InputTextareaModule', importPath: 'primeng/inputtextarea' },
  'p-dialog': { moduleName: 'DialogModule', importPath: 'primeng/dialog' },
};

// ---------------------------------------------------------------------------
// Replacement helpers
// ---------------------------------------------------------------------------

/**
 * Replace `<p-button ...>...</button>` with `<p-button ...>...</p-button>`.
 * Handles self-closing `<button ... />` as well.
 */
function replaceButton(template: string): string {
  // Opening tags: <button ...> → <p-button ...>
  template = template.replace(/<button(\s|>|\/)/g, '<p-button$1');
  // Closing tags: </button> → </p-button>
  template = template.replace(/<\/button>/g, '</p-button>');
  return template;
}

/**
 * Replace `<input pInputText ...>` and `<input ... />` (text inputs) with
 * `<input pInputText ...>`. Only targets inputs with type="text" or inputs
 * without an explicit type (default is text). Does NOT touch checkbox inputs.
 */
function replaceInputText(template: string): string {
  // Match <input with type="text" — add pInputText and remove type="text"
  template = template.replace(
    /<input(\s[^>]*)?\stype="text"([^>]*?)\s*\/?>/g,
    (_match, before = '', after = '') => {
      const attrs = `${before}${after}`.trim();
      return `<input pInputText${attrs ? ' ' + attrs : ''} />`;
    },
  );
  return template;
}

/**
 * Replace `<input type="checkbox" ...>` with `<p-checkbox ...>`.
 * Must run BEFORE replaceInputText to avoid conflicts.
 */
function replaceCheckbox(template: string): string {
  template = template.replace(
    /<input(\s[^>]*)?\stype="checkbox"([^>]*?)\s*\/?>/g,
    (_match, before = '', after = '') => {
      const attrs = `${before}${after}`.trim();
      return `<p-checkbox${attrs ? ' ' + attrs : ''} />`;
    },
  );
  return template;
}

/**
 * Replace `<select ...>...</select>` with `<p-dropdown ...>...</p-dropdown>`.
 */
function replaceSelect(template: string): string {
  template = template.replace(/<select(\s|>|\/)/g, '<p-dropdown$1');
  template = template.replace(/<\/select>/g, '</p-dropdown>');
  return template;
}

/**
 * Replace `<table ...>...</table>` with `<p-table ...>...</p-table>`.
 */
function replaceTable(template: string): string {
  template = template.replace(/<table(\s|>|\/)/g, '<p-table$1');
  template = template.replace(/<\/table>/g, '</p-table>');
  return template;
}

/**
 * Replace `<textarea ...>` with `<textarea pInputTextarea ...>`.
 */
function replaceTextarea(template: string): string {
  template = template.replace(
    /<textarea(?!\s[^>]*pInputTextarea)(\s|>)/g,
    '<textarea pInputTextarea$1',
  );
  return template;
}

/**
 * Replace `<dialog ...>...</dialog>` with `<p-dialog ...>...</p-dialog>`.
 */
function replaceDialog(template: string): string {
  template = template.replace(/<dialog(\s|>|\/)/g, '<p-dialog$1');
  template = template.replace(/<\/dialog>/g, '</p-dialog>');
  return template;
}

// ---------------------------------------------------------------------------
// Import detection
// ---------------------------------------------------------------------------

/**
 * Scan the (already-replaced) template and collect the PrimeNG imports
 * needed based on which PrimeNG components/directives are present.
 */
function detectPrimeNGImports(template: string): PrimeNGImport[] {
  const imports: PrimeNGImport[] = [];
  const seen = new Set<string>();

  // Detect <p-button
  if (/<p-button[\s>\/]/.test(template) && !seen.has('ButtonModule')) {
    seen.add('ButtonModule');
    imports.push(PRIMENG_IMPORT_MAP['p-button']);
  }

  // Detect pInputText attribute
  if (/pInputText[\s>\/]/.test(template) && !seen.has('InputTextModule')) {
    seen.add('InputTextModule');
    imports.push(PRIMENG_IMPORT_MAP['pInputText']);
  }

  // Detect <p-dropdown
  if (/<p-dropdown[\s>\/]/.test(template) && !seen.has('DropdownModule')) {
    seen.add('DropdownModule');
    imports.push(PRIMENG_IMPORT_MAP['p-dropdown']);
  }

  // Detect <p-table
  if (/<p-table[\s>\/]/.test(template) && !seen.has('TableModule')) {
    seen.add('TableModule');
    imports.push(PRIMENG_IMPORT_MAP['p-table']);
  }

  // Detect <p-checkbox
  if (/<p-checkbox[\s>\/]/.test(template) && !seen.has('CheckboxModule')) {
    seen.add('CheckboxModule');
    imports.push(PRIMENG_IMPORT_MAP['p-checkbox']);
  }

  // Detect pInputTextarea attribute
  if (/pInputTextarea[\s>\/]/.test(template) && !seen.has('InputTextareaModule')) {
    seen.add('InputTextareaModule');
    imports.push(PRIMENG_IMPORT_MAP['pInputTextarea']);
  }

  // Detect <p-dialog
  if (/<p-dialog[\s>\/]/.test(template) && !seen.has('DialogModule')) {
    seen.add('DialogModule');
    imports.push(PRIMENG_IMPORT_MAP['p-dialog']);
  }

  return imports;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Replaces native HTML elements in the Angular template with their PrimeNG
 * equivalents and populates the `primeNgImports` array in the IR.
 *
 * Elements without a PrimeNG equivalent are preserved without modification.
 * Does NOT mutate the input — returns a new ComponentIR.
 */
export function mapToPrimeNG(ir: ComponentIR): ComponentIR {
  let template = ir.angularTemplate;

  // Order matters: checkbox before generic input text
  template = replaceCheckbox(template);
  template = replaceInputText(template);
  template = replaceButton(template);
  template = replaceSelect(template);
  template = replaceTable(template);
  template = replaceTextarea(template);
  template = replaceDialog(template);

  // Limpiar atributos HTML no soportados por PrimeNG
  const primeNgTags = ['p-dropdown', 'p-checkbox', 'p-dialog', 'p-table'];
  for (const tag of primeNgTags) {
    template = template.replace(new RegExp(`(<${tag}[^>]*)\\s+required(?=[\\s/>])`, 'g'), '$1');
    template = template.replace(new RegExp(`(<${tag}[^>]*)\\s+required=["'][^"']*["']`, 'g'), '$1');
  }

  const primeNgImports = detectPrimeNGImports(template);

  return {
    ...ir,
    angularTemplate: template,
    primeNgImports,
  };
}
