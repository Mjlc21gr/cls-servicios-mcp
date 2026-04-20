// =============================================================================
// Signal_Fixer — Post-processes generated Angular components for signal compat
// =============================================================================

import type { TransformedComponent } from './pipeline-types.js';

// ---------------------------------------------------------------------------
// PrimeNG components that commonly use ngModel
// ---------------------------------------------------------------------------

const PRIMENG_NGMODEL_TAGS = new Set([
  'p-select', 'p-dropdown', 'p-checkbox', 'p-radioButton',
  'p-inputSwitch', 'p-calendar', 'p-autoComplete', 'p-multiSelect',
  'p-inputNumber', 'p-slider', 'p-rating', 'p-toggleButton',
]);

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

/** Matches [(ngModel)]="signalName" */
const BANANA_NGMODEL_RE = /\[\(ngModel\)\]="(\w+)"/g;

/** Matches interpolation {{ expr }} where expr does NOT already end with () */
const INTERPOLATION_RE = /\{\{\s*(\w+)\s*\}\}/g;

/** Matches @if (expr) where expr is a bare identifier without () */
const AT_IF_RE = /@if\s*\(\s*(\w+)\s*\)/g;

/** Matches @for (item of expr) where expr is a bare identifier without () */
const AT_FOR_RE = /@for\s*\([^)]*\bof\s+(\w+)\s*[;)]/g;

/** Matches [prop]="expr" where expr is a bare identifier without () */
const PROP_BINDING_RE = /\[(\w+)\]="(\w+)"/g;

/** Matches signal(), computed(), or input() declarations in .component.ts */
const SIGNAL_DECL_RE = /(?:readonly\s+)?(\w+)\s*=\s*(?:signal|computed|input)(?:<[^>]*>)?\s*\(/g;

/** Matches input() declarations specifically */
const INPUT_DECL_RE = /(?:readonly\s+)?(\w+)\s*=\s*input(?:<[^>]*>)?\s*\(/g;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract all signal/computed/input names declared in a component TS source.
 */
function extractDeclaredSignals(componentTs: string): Set<string> {
  const names = new Set<string>();
  let match: RegExpExecArray | null;

  const re = new RegExp(SIGNAL_DECL_RE.source, 'g');
  while ((match = re.exec(componentTs)) !== null) {
    names.add(match[1]);
  }
  return names;
}

/**
 * Collect all signal-like identifiers referenced in a template.
 * These are bare identifiers used in interpolations, bindings, @if, @for.
 */
function extractTemplateSignalRefs(html: string): Set<string> {
  const refs = new Set<string>();

  // From interpolations {{ name }}
  let m: RegExpExecArray | null;
  const intRe = new RegExp(INTERPOLATION_RE.source, 'g');
  while ((m = intRe.exec(html)) !== null) {
    refs.add(m[1]);
  }

  // From @if (name)
  const ifRe = new RegExp(AT_IF_RE.source, 'g');
  while ((m = ifRe.exec(html)) !== null) {
    refs.add(m[1]);
  }

  // From @for (... of name)
  const forRe = new RegExp(AT_FOR_RE.source, 'g');
  while ((m = forRe.exec(html)) !== null) {
    refs.add(m[1]);
  }

  // From [prop]="name"
  const propRe = new RegExp(PROP_BINDING_RE.source, 'g');
  while ((m = propRe.exec(html)) !== null) {
    refs.add(m[2]);
  }

  // From [(ngModel)]="name"
  const ngModelRe = new RegExp(BANANA_NGMODEL_RE.source, 'g');
  while ((m = ngModelRe.exec(html)) !== null) {
    refs.add(m[1]);
  }

  return refs;
}

// ---------------------------------------------------------------------------
// Built-in Angular / HTML identifiers that are NOT signals
// ---------------------------------------------------------------------------

const NON_SIGNAL_NAMES = new Set([
  'true', 'false', 'null', 'undefined', 'item', 'index', '$event',
  '$index', '$first', '$last', '$even', '$odd', '$count',
  'Math', 'JSON', 'Date', 'console', 'window', 'document',
  'this', 'event',
  // Common @for loop variables and template-local variables
  'i', 'idx', 'src', 'el', 'key', 'value', 'entry', 'row', 'col',
  'service', 'file', 'img', 'option', 'data', 'error', 'result',
]);

// ---------------------------------------------------------------------------
// Fix 1: Replace [(ngModel)]="signal" with split binding
// ---------------------------------------------------------------------------

function fixNgModelBananaBox(html: string): string {
  return html.replace(BANANA_NGMODEL_RE, (_match, signalName: string) => {
    return `[ngModel]="${signalName}()" (ngModelChange)="${signalName}.set($event)"`;
  });
}

// ---------------------------------------------------------------------------
// Fix 2: Ensure signal reads use () in templates
// ---------------------------------------------------------------------------

function ensureSignalCallSyntax(html: string, signalNames: Set<string>): string {
  let result = html;

  // Fix interpolations: {{ name }} → {{ name() }}
  result = result.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) => {
    if (signalNames.has(name)) {
      return `{{ ${name}() }}`;
    }
    return _match;
  });

  // Fix @if (name) → @if (name())
  result = result.replace(/@if\s*\(\s*(\w+)\s*\)/g, (_match, name: string) => {
    if (signalNames.has(name)) {
      return `@if (${name}())`;
    }
    return _match;
  });

  // Fix @for (... of name) → @for (... of name())
  result = result.replace(
    /(@for\s*\([^)]*\bof\s+)(\w+)(\s*[;)])/g,
    (_match, prefix: string, name: string, suffix: string) => {
      if (signalNames.has(name)) {
        return `${prefix}${name}()${suffix}`;
      }
      return _match;
    },
  );

  // Fix [prop]="name" → [prop]="name()"
  result = result.replace(/\[(\w+)\]="(\w+)"/g, (_match, prop: string, name: string) => {
    if (signalNames.has(name) && prop !== 'ngModel') {
      return `[${prop}]="${name}()"`;
    }
    return _match;
  });

  return result;
}

// ---------------------------------------------------------------------------
// Fix 3: Add missing signal declarations to component TS
// ---------------------------------------------------------------------------

function addMissingSignalDeclarations(
  componentTs: string,
  missingSignals: ReadonlySet<string>,
): string {
  if (missingSignals.size === 0) return componentTs;

  const declarations = [...missingSignals]
    .map((name) => `  readonly ${name} = signal<unknown>(undefined);`)
    .join('\n');

  // Ensure signal import exists
  let result = componentTs;
  if (!result.includes("from '@angular/core'")) {
    result = `import { signal } from '@angular/core';\n${result}`;
  } else if (!/\bsignal\b/.test(result.split("from '@angular/core'")[0].split('\n').pop() ?? '')) {
    result = result.replace(
      /(import\s*\{[^}]*)(}\s*from\s*'@angular\/core')/,
      `$1, signal $2`,
    );
  }

  // Insert declarations after the class opening brace
  const classBodyMatch = result.match(/(export\s+class\s+\w+[^{]*\{)/);
  if (classBodyMatch) {
    const insertPos = result.indexOf(classBodyMatch[0]) + classBodyMatch[0].length;
    result = result.slice(0, insertPos) + '\n' + declarations + result.slice(insertPos);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Fix 4: Ensure FormsModule is imported when ngModel is used
// ---------------------------------------------------------------------------

function ensureFormsModuleImport(componentTs: string, html: string): string {
  const usesNgModel = /ngModel/.test(html);
  if (!usesNgModel) return componentTs;

  let result = componentTs;

  // Add FormsModule to the imports array in @Component decorator
  if (!result.includes('FormsModule')) {
    // Add the TS import statement
    if (result.includes("from '@angular/forms'")) {
      result = result.replace(
        /(import\s*\{[^}]*)(}\s*from\s*'@angular\/forms')/,
        `$1, FormsModule $2`,
      );
    } else {
      result = `import { FormsModule } from '@angular/forms';\n${result}`;
    }

    // Add to @Component imports array
    result = result.replace(
      /(imports\s*:\s*\[)([^\]]*?)(\])/,
      (_match, open: string, existing: string, close: string) => {
        const trimmed = existing.trim();
        if (trimmed.length === 0) {
          return `${open}FormsModule${close}`;
        }
        return `${open}${existing}, FormsModule${close}`;
      },
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// Fix 6b: Ensure PrimeNG components used in template are in imports array
// ---------------------------------------------------------------------------

const PRIMENG_TAG_TO_IMPORT: Record<string, { name: string; path: string }> = {
  'p-card': { name: 'Card', path: 'primeng/card' },
  'p-button': { name: 'Button', path: 'primeng/button' },
  'p-select': { name: 'Select', path: 'primeng/select' },
  'p-toast': { name: 'Toast', path: 'primeng/toast' },
  'p-tag': { name: 'Tag', path: 'primeng/tag' },
  'p-dialog': { name: 'Dialog', path: 'primeng/dialog' },
  'p-table': { name: 'Table', path: 'primeng/table' },
  'p-inputSwitch': { name: 'InputSwitch', path: 'primeng/inputswitch' },
  'p-checkbox': { name: 'Checkbox', path: 'primeng/checkbox' },
  'p-progressSpinner': { name: 'ProgressSpinner', path: 'primeng/progressspinner' },
  'p-progressBar': { name: 'ProgressBar', path: 'primeng/progressbar' },
  'p-menu': { name: 'Menu', path: 'primeng/menu' },
  'p-menubar': { name: 'Menubar', path: 'primeng/menubar' },
  'p-sidebar': { name: 'Sidebar', path: 'primeng/sidebar' },
  'p-accordion': { name: 'Accordion', path: 'primeng/accordion' },
  'p-tabView': { name: 'TabView', path: 'primeng/tabview' },
  'p-toolbar': { name: 'Toolbar', path: 'primeng/toolbar' },
  'p-divider': { name: 'Divider', path: 'primeng/divider' },
  'p-message': { name: 'Message', path: 'primeng/message' },
  'p-image': { name: 'Image', path: 'primeng/image' },
  'p-avatar': { name: 'Avatar', path: 'primeng/avatar' },
  'p-badge': { name: 'Badge', path: 'primeng/badge' },
  'p-chip': { name: 'Chip', path: 'primeng/chip' },
  'p-skeleton': { name: 'Skeleton', path: 'primeng/skeleton' },
  'p-panel': { name: 'Panel', path: 'primeng/panel' },
  'p-fieldset': { name: 'Fieldset', path: 'primeng/fieldset' },
  'p-steps': { name: 'Steps', path: 'primeng/steps' },
  'p-paginator': { name: 'Paginator', path: 'primeng/paginator' },
  'p-confirmdialog': { name: 'ConfirmDialog', path: 'primeng/confirmdialog' },
  'p-overlayPanel': { name: 'OverlayPanel', path: 'primeng/overlaypanel' },
  'p-fileUpload': { name: 'FileUpload', path: 'primeng/fileupload' },
  'p-carousel': { name: 'Carousel', path: 'primeng/carousel' },
  'p-timeline': { name: 'Timeline', path: 'primeng/timeline' },
  'p-dataView': { name: 'DataView', path: 'primeng/dataview' },
  'p-listbox': { name: 'Listbox', path: 'primeng/listbox' },
  'p-tree': { name: 'Tree', path: 'primeng/tree' },
  'p-autoComplete': { name: 'AutoComplete', path: 'primeng/autocomplete' },
  'p-calendar': { name: 'DatePicker', path: 'primeng/datepicker' },
  'p-speedDial': { name: 'SpeedDial', path: 'primeng/speeddial' },
};

function ensurePrimeNgImports(componentTs: string, html: string): string {
  let result = componentTs;

  for (const [tag, info] of Object.entries(PRIMENG_TAG_TO_IMPORT)) {
    // Check if the tag is used in the template
    if (!html.includes(`<${tag}`) && !html.includes(`</${tag}`)) continue;

    // Check if already in @Component imports array (not just TS import)
    const importsArrayMatch = result.match(/imports\s*:\s*\[([^\]]*)\]/);
    const importsArray = importsArrayMatch ? importsArrayMatch[1] : '';
    if (importsArray.includes(info.name)) continue;

    // Add TS import statement if not present
    if (!result.includes(`import { ${info.name} }`) && !result.match(new RegExp(`import\\s*\\{[^}]*\\b${info.name}\\b[^}]*\\}`))) {
      result = `import { ${info.name} } from '${info.path}';\n${result}`;
    }

    // Add to @Component imports array
    const hasImportsArray = result.match(/imports\s*:\s*\[/);
    if (hasImportsArray) {
      result = result.replace(
        /(imports\s*:\s*\[)([^\]]*?)(\])/,
        (_m, open: string, existing: string, close: string) => {
          const trimmed = existing.trim();
          if (trimmed.includes(info.name)) return `${open}${existing}${close}`;
          return trimmed
            ? `${open}${existing.trimEnd()}, ${info.name}${close}`
            : `${open}${info.name}${close}`;
        },
      );
    } else {
      // No imports array — add one after standalone: true
      result = result.replace(
        /(standalone\s*:\s*true\s*,)/,
        `$1\n  imports: [${info.name}],`,
      );
    }
  }

  // If p-toast is used, also add MessageService as provider
  if (html.includes('<p-toast') || html.includes('</p-toast')) {
    if (!result.includes('MessageService')) {
      result = `import { MessageService } from 'primeng/api';\n${result}`;
      if (result.includes('providers:')) {
        result = result.replace(
          /(providers\s*:\s*\[)([^\]]*?)(\])/,
          (_m, open: string, existing: string, close: string) => {
            return existing.includes('MessageService') ? `${open}${existing}${close}` : `${open}${existing.trimEnd()}, MessageService${close}`;
          },
        );
      } else {
        result = result.replace(
          /(standalone\s*:\s*true\s*,)/,
          `$1\n  providers: [MessageService],`,
        );
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Fix 6: Ensure child components used in template are in imports array
// ---------------------------------------------------------------------------

function ensureChildComponentImports(
  componentTs: string,
  html: string,
  allComponents: ReadonlyMap<string, TransformedComponent>,
): string {
  let result = componentTs;

  // Find <app-xxx> tags in the template
  const childTagRe = /<app-([\w-]+)/g;
  let match: RegExpExecArray | null;
  const childSelectors = new Set<string>();

  while ((match = childTagRe.exec(html)) !== null) {
    childSelectors.add(match[1]);
  }

  for (const selector of childSelectors) {
    // Find the matching component by kebab name
    for (const [, comp] of allComponents) {
      if (comp.kebabName === selector) {
        const className = `${comp.componentName}Component`;
        if (!result.includes(className)) {
          // Add import statement — sibling components are at ../{kebab-name}/{kebab-name}.component
          const importPath = `../${comp.kebabName}/${comp.kebabName}.component`;
          result = `import { ${className} } from '${importPath}';\n${result}`;

          // Add to imports array
          result = result.replace(
            /(imports\s*:\s*\[)([^\]]*?)(\])/,
            (_m, open: string, existing: string, close: string) => {
              const trimmed = existing.trim();
              if (trimmed.length === 0) return `${open}${className}${close}`;
              return `${open}${existing}, ${className}${close}`;
            },
          );
        }
        break;
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Fix 7: Move submit button out of ng-template footer into form
// ---------------------------------------------------------------------------

function fixSubmitButtonPlacement(html: string): string {
  // If there's a <p-button type="submit"> inside <ng-template pTemplate="footer">,
  // move it before the closing </form> tag instead
  // This is a heuristic — we detect the pattern and add a comment
  let result = html;

  // Check if there's a submit button inside a footer template
  const footerWithSubmit = /<ng-template\s+pTemplate="footer">\s*[\s\S]*?type="submit"[\s\S]*?<\/ng-template>/;
  if (footerWithSubmit.test(result)) {
    // Add a comment warning about the placement issue
    result = result.replace(
      /(<ng-template\s+pTemplate="footer">)/,
      '<!-- NOTA: Los botones de submit deben estar dentro del <form> para que (ngSubmit) funcione -->\n$1',
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Post-processes generated Angular components to fix signal compatibility:
 *
 * 1. Replace `[(ngModel)]="signalName"` with split `[ngModel]` + `(ngModelChange)`
 * 2. Ensure signal reads use `()` in interpolations, @if, @for, [prop] bindings
 * 3. Add missing signal declarations for template references
 * 4. Ensure FormsModule is imported when ngModel is used
 */
export function fixSignals(
  components: ReadonlyMap<string, TransformedComponent>,
): Map<string, TransformedComponent> {
  const result = new Map<string, TransformedComponent>();

  for (const [key, component] of components) {
    let { componentHtml, componentTs } = component;

    // Collect declared signal names from the TS source
    const declaredSignals = extractDeclaredSignals(componentTs);

    // Fix 1: Replace banana-box ngModel with split binding
    componentHtml = fixNgModelBananaBox(componentHtml);

    // Fix 2: Ensure signal reads use () syntax
    componentHtml = ensureSignalCallSyntax(componentHtml, declaredSignals);

    // Fix 3: Find template refs that lack declarations and add them
    const templateRefs = extractTemplateSignalRefs(component.componentHtml);
    const missingSignals = new Set<string>();

    // Extract @for loop variables to exclude them from signal declarations
    const forLoopVars = new Set<string>();
    const forVarRe = /@for\s*\(\s*(?:let\s+)?(\w+)\s+of\s+/g;
    let forMatch: RegExpExecArray | null;
    while ((forMatch = forVarRe.exec(component.componentHtml)) !== null) {
      forLoopVars.add(forMatch[1]);
    }

    // Also extract variables used in @for item access patterns (e.g., service.xxx)
    const dotAccessRe = /\b(\w+)\.\w+/g;
    let dotMatch: RegExpExecArray | null;
    const dotAccessVars = new Set<string>();
    while ((dotMatch = dotAccessRe.exec(component.componentHtml)) !== null) {
      if (forLoopVars.has(dotMatch[1])) {
        dotAccessVars.add(dotMatch[1]);
      }
    }

    for (const ref of templateRefs) {
      if (!declaredSignals.has(ref) && !NON_SIGNAL_NAMES.has(ref) && !forLoopVars.has(ref) && !dotAccessVars.has(ref)) {
        missingSignals.add(ref);
      }
    }
    componentTs = addMissingSignalDeclarations(componentTs, missingSignals);

    // Fix 4: Ensure FormsModule is imported when ngModel is used
    componentTs = ensureFormsModuleImport(componentTs, componentHtml);

    // Fix 5: Remove await from output().emit() calls — emit returns void, not Promise
    componentTs = componentTs.replace(/await\s+(this\.\w+\.emit\()/g, '$1');

    // Fix 6: Ensure child components used in template are imported
    componentTs = ensureChildComponentImports(componentTs, componentHtml, components);

    // Fix 6b: Ensure PrimeNG components used in template are imported
    componentTs = ensurePrimeNgImports(componentTs, componentHtml);

    // Fix 7: Ensure p-button with type="submit" is inside <form>, not in ng-template pTemplate="footer"
    componentHtml = fixSubmitButtonPlacement(componentHtml);

    result.set(key, {
      ...component,
      componentHtml,
      componentTs,
    });
  }

  return result;
}
