// =============================================================================
// PrimeNG_Sanitizer — Removes unsupported attributes & fixes PrimeNG 19 compat
// =============================================================================

import type { TransformedComponent } from './pipeline-types.js';

// ---------------------------------------------------------------------------
// PrimeNG components that do NOT support the `required` HTML attribute
// ---------------------------------------------------------------------------

const PRIMENG_NO_REQUIRED: readonly string[] = [
  'p-select',
  'p-dropdown',
  'p-checkbox',
  'p-radioButton',
  'p-inputSwitch',
  'p-calendar',
  'p-autoComplete',
  'p-multiSelect',
];

// ---------------------------------------------------------------------------
// PrimeNG 19 import path migrations (old → new)
// ---------------------------------------------------------------------------

const IMPORT_PATH_MIGRATIONS: ReadonlyMap<string, string> = new Map([
  ['primeng/dropdown', 'primeng/select'],
  ['primeng/inputtextarea', 'primeng/textarea'],
]);

const MODULE_NAME_MIGRATIONS: ReadonlyMap<string, string> = new Map([
  ['DropdownModule', 'Select'],
  ['SelectModule', 'Select'],
  ['ButtonModule', 'Button'],
  ['InputTextModule', 'InputText'],
  ['InputTextareaModule', 'Textarea'],
  ['CheckboxModule', 'Checkbox'],
  ['RadioButtonModule', 'RadioButton'],
  ['InputSwitchModule', 'ToggleSwitch'],
  ['TableModule', 'TableModule'],
  ['DialogModule', 'Dialog'],
  ['CardModule', 'Card'],
  ['TabViewModule', 'TabView'],
  ['ProgressSpinnerModule', 'ProgressSpinner'],
  ['ProgressBarModule', 'ProgressBar'],
  ['TagModule', 'Tag'],
  ['AvatarModule', 'Avatar'],
  ['TooltipModule', 'Tooltip'],
  ['ToastModule', 'Toast'],
  ['MessageModule', 'Message'],
  ['ToolbarModule', 'Toolbar'],
  ['SidebarModule', 'Drawer'],
  ['ListboxModule', 'Listbox'],
  ['AccordionModule', 'Accordion'],
  ['InputNumberModule', 'InputNumber'],
  ['CalendarModule', 'DatePicker'],
  ['AutoCompleteModule', 'AutoComplete'],
  ['MultiSelectModule', 'MultiSelect'],
  ['FileUploadModule', 'FileUpload'],
]);

// ---------------------------------------------------------------------------
// PrimeNG 19 tag migrations (old → new)
// ---------------------------------------------------------------------------

const TAG_MIGRATIONS: ReadonlyMap<string, string> = new Map([
  ['p-dropdown', 'p-select'],
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Remove the `required` attribute (with or without a value) from the
 * specified PrimeNG component tags in an HTML template.
 */
function removeRequiredFromPrimeNG(html: string): string {
  let result = html;

  for (const tag of PRIMENG_NO_REQUIRED) {
    // Match opening tags for this PrimeNG component and strip `required`
    // Handles: required, required="required", required="true", [required]="expr"
    const tagPattern = new RegExp(
      `(<${escapeRegex(tag)}\\b[^>]*)\\s+(?:\\[?required\\]?)(?:="[^"]*")?(?=[\\s/>])`,
      'g',
    );
    // Repeat until no more matches (handles multiple required attrs on same tag)
    let prev = '';
    while (prev !== result) {
      prev = result;
      result = result.replace(tagPattern, '$1');
    }
  }

  return result;
}

/**
 * Replace old PrimeNG tag names with PrimeNG 19 equivalents in templates.
 */
function migrateTemplateTags(html: string): string {
  let result = html;

  for (const [oldTag, newTag] of TAG_MIGRATIONS) {
    // Opening tags: <p-dropdown → <p-select
    const openRe = new RegExp(`<${escapeRegex(oldTag)}(\\s|>|\\/)`, 'g');
    result = result.replace(openRe, `<${newTag}$1`);

    // Closing tags: </p-dropdown> → </p-select>
    const closeRe = new RegExp(`<\\/${escapeRegex(oldTag)}>`, 'g');
    result = result.replace(closeRe, `</${newTag}>`);
  }

  return result;
}

/**
 * Migrate old PrimeNG import paths and module names in component TS source.
 */
function migrateImportPaths(ts: string): string {
  let result = ts;

  // Migrate import paths: 'primeng/dropdown' → 'primeng/select'
  for (const [oldPath, newPath] of IMPORT_PATH_MIGRATIONS) {
    result = result.replace(
      new RegExp(`(['"])${escapeRegex(oldPath)}\\1`, 'g'),
      `$1${newPath}$1`,
    );
  }

  // Migrate module names: DropdownModule → SelectModule
  for (const [oldName, newName] of MODULE_NAME_MIGRATIONS) {
    result = result.replace(new RegExp(`\\b${oldName}\\b`, 'g'), newName);
  }

  return result;
}

/**
 * Ensure PrimeNG imports use standalone component API (PrimeNG 19).
 * Converts `XxxModule` import paths to the correct standalone export names.
 * E.g.: import { InputTextareaModule } from 'primeng/inputtextarea'
 *     → import { Textarea } from 'primeng/textarea'
 */
function ensureStandaloneImports(ts: string): string {
  let result = ts;

  // Fix import paths for PrimeNG 19 standalone components
  const pathFixes: ReadonlyMap<string, string> = new Map([
    ['primeng/inputtextarea', 'primeng/textarea'],
    ['primeng/inputswitch', 'primeng/toggleswitch'],
    ['primeng/calendar', 'primeng/datepicker'],
    ['primeng/sidebar', 'primeng/drawer'],
  ]);

  for (const [oldPath, newPath] of pathFixes) {
    result = result.replace(
      new RegExp(`(['"])${escapeRegex(oldPath)}\\1`, 'g'),
      `$1${newPath}$1`,
    );
  }

  return result;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Sanitizes PrimeNG usage in generated Angular components:
 *
 * 1. Remove `required` attribute from PrimeNG components that don't support it
 * 2. Replace old PrimeNG import paths with PrimeNG 19 equivalents
 * 3. Replace old PrimeNG tag names (p-dropdown → p-select) in templates
 * 4. Ensure standalone component API imports
 */
export function sanitizePrimeNG(
  components: ReadonlyMap<string, TransformedComponent>,
): Map<string, TransformedComponent> {
  const result = new Map<string, TransformedComponent>();

  for (const [key, component] of components) {
    let { componentHtml, componentTs } = component;

    // 1. Remove unsupported `required` attribute from PrimeNG components
    componentHtml = removeRequiredFromPrimeNG(componentHtml);

    // 2. Migrate old PrimeNG tags in templates (p-dropdown → p-select)
    componentHtml = migrateTemplateTags(componentHtml);

    // 2b. Fix PrimeNG 19 directive names in templates
    componentHtml = componentHtml.replace(/pInputTextarea/g, 'pTextarea');
    componentHtml = componentHtml.replace(/pInputText(?!area)/g, 'pInputText'); // pInputText stays the same in PrimeNG 19

    // 3. Migrate import paths and module names in TS
    componentTs = migrateImportPaths(componentTs);

    // 4. Ensure standalone component API
    componentTs = ensureStandaloneImports(componentTs);

    result.set(key, {
      ...component,
      componentHtml,
      componentTs,
    });
  }

  return result;
}
