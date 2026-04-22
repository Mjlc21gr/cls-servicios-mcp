// =============================================================================
// UI Semantic Engine — Maps React UI component TREES to PrimeNG equivalents
// Detects design patterns, not individual tags
// =============================================================================

/**
 * Mapping of React UI library component trees to PrimeNG equivalents.
 * Each entry maps a parent component + its children structure to a single
 * PrimeNG component with the correct API.
 */

export interface SemanticMapping {
  readonly pattern: RegExp;
  readonly replacement: (match: string) => string;
  readonly description: string;
}

// ---------------------------------------------------------------------------
// shadcn/ui Select → PrimeNG Select
// Pattern: <Select value={x} onValueChange={fn}><SelectTrigger><SelectValue/></SelectTrigger>
//          <SelectContent><SelectItem value="a">Label</SelectItem>...</SelectContent></Select>
// → <p-select [options]="[{label:'Label',value:'a'},...]" [ngModel]="x()" (ngModelChange)="x.set($event)">
// ---------------------------------------------------------------------------

export function collapseShadcnSelect(html: string): string {
  // Match the full Select tree including all children
  const selectTreeRe = /<(?:p-select|Select)\s*([^>]*?)>([\s\S]*?)<\/(?:p-select|Select)>/g;

  return html.replace(selectTreeRe, (_match, attrs: string, body: string) => {
    // Extract options from SelectItem or <div value="x">Label</div>
    const options: Array<{ label: string; value: string }> = [];

    // Pattern 1: <SelectItem value="x">Label</SelectItem>
    const selectItemRe = /<SelectItem\s+value="([^"]*)"[^>]*>\s*([^<]*?)\s*<\/SelectItem>/g;
    let m: RegExpExecArray | null;
    while ((m = selectItemRe.exec(body)) !== null) {
      options.push({ value: m[1], label: m[2].trim() });
    }

    // Pattern 2: <div value="x">Label</div> (already converted by template generator)
    if (options.length === 0) {
      const divOptionRe = /<div\s+value="([^"]*)"[^>]*>\s*([^<]*?)\s*<\/div>/g;
      while ((m = divOptionRe.exec(body)) !== null) {
        options.push({ value: m[1], label: m[2].trim() });
      }
    }

    if (options.length === 0) return _match; // Can't extract options, leave as-is

    // Extract signal binding from attrs
    let ngModelBinding = '';
    const valueMatch = attrs.match(/\[(?:value|ngModel)\]="([^"]*)"/);
    if (valueMatch) {
      const signalName = valueMatch[1].replace(/\(\)$/, '');
      ngModelBinding = ` [ngModel]="${signalName}()" (ngModelChange)="${signalName}.set($event)"`;
    }

    // Extract placeholder
    let placeholder = 'Seleccione';
    const placeholderMatch = body.match(/placeholder="([^"]*)"/);
    if (placeholderMatch) placeholder = placeholderMatch[1];

    const optionsJson = JSON.stringify(options);
    return `<p-select [options]='${optionsJson}' optionLabel="label" optionValue="value" placeholder="${placeholder}"${ngModelBinding} />`;
  });
}

// ---------------------------------------------------------------------------
// shadcn/ui Card tree → PrimeNG Card
// Pattern: <Card><CardHeader><CardTitle>T</CardTitle><CardDescription>D</CardDescription></CardHeader>
//          <CardContent>...</CardContent><CardFooter>...</CardFooter></Card>
// → <p-card header="T" subheader="D">content<ng-template pTemplate="footer">footer</ng-template></p-card>
// ---------------------------------------------------------------------------

export function collapseShadcnCard(html: string): string {
  let result = html;

  // CardHeader → header with styling
  result = result.replace(/<CardHeader[^>]*>/g, '<header class="p-4 pb-2">');
  result = result.replace(/<\/CardHeader>/g, '</header>');

  // CardTitle → h3
  result = result.replace(/<CardTitle[^>]*>/g, '<h3 class="text-lg font-semibold">');
  result = result.replace(/<\/CardTitle>/g, '</h3>');

  // CardDescription → p
  result = result.replace(/<CardDescription[^>]*>/g, '<p class="text-sm text-gray-500">');
  result = result.replace(/<\/CardDescription>/g, '</p>');

  // CardContent → section
  result = result.replace(/<CardContent([^>]*)>/g, '<section class="p-4"$1>');
  result = result.replace(/<\/CardContent>/g, '</section>');

  // CardFooter → footer
  result = result.replace(/<CardFooter[^>]*>/g, '<footer class="p-4 pt-0 flex justify-end">');
  result = result.replace(/<\/CardFooter>/g, '</footer>');

  return result;
}

// ---------------------------------------------------------------------------
// MUI component trees → PrimeNG
// ---------------------------------------------------------------------------

export function collapseMuiComponents(html: string): string {
  let result = html;

  // MUI TextField → input pInputText with semantic fieldset
  result = result.replace(/<TextField([^>]*?)\/>/g, (_match, attrs: string) => {
    const label = attrs.match(/label="([^"]*)"/)?.[1] ?? '';
    const name = attrs.match(/name="([^"]*)"/)?.[1] ?? '';
    return `<fieldset class="field"><label>${label}</label><input pInputText name="${name}" class="w-full" /></fieldset>`;
  });

  // MUI Dialog → p-dialog
  result = result.replace(/<Dialog([^>]*)>/g, '<p-dialog$1>');
  result = result.replace(/<\/Dialog>/g, '</p-dialog>');
  result = result.replace(/<DialogTitle[^>]*>/g, '<ng-template pTemplate="header">');
  result = result.replace(/<\/DialogTitle>/g, '</ng-template>');
  result = result.replace(/<DialogContent[^>]*>/g, '');
  result = result.replace(/<\/DialogContent>/g, '');
  result = result.replace(/<DialogActions[^>]*>/g, '<ng-template pTemplate="footer">');
  result = result.replace(/<\/DialogActions>/g, '</ng-template>');

  return result;
}

// ---------------------------------------------------------------------------
// Ant Design component trees → PrimeNG
// ---------------------------------------------------------------------------

export function collapseAntdComponents(html: string): string {
  let result = html;

  // Antd Form.Item → fieldset with label (semantic)
  result = result.replace(/<Form\.Item\s+label="([^"]*)"[^>]*>/g, '<fieldset class="field"><label>$1</label>');
  result = result.replace(/<\/Form\.Item>/g, '</fieldset>');

  // Antd Table → p-table (simplified)
  result = result.replace(/<Table([^>]*)>/g, '<p-table$1>');
  result = result.replace(/<\/Table>/g, '</p-table>');

  return result;
}

// ---------------------------------------------------------------------------
// Lucide/React icons → PrimeIcons
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, string> = {
  'ShieldCheck': 'pi-shield', 'AlertCircle': 'pi-exclamation-circle',
  'PlusCircle': 'pi-plus-circle', 'History': 'pi-history',
  'Camera': 'pi-camera', 'X': 'pi-times', 'Car': 'pi-car',
  'Home': 'pi-home', 'Calendar': 'pi-calendar', 'Clock': 'pi-clock',
  'ChevronDown': 'pi-chevron-down', 'ChevronUp': 'pi-chevron-up',
  'Search': 'pi-search', 'Filter': 'pi-filter', 'Edit': 'pi-pencil',
  'Trash': 'pi-trash', 'Plus': 'pi-plus', 'Minus': 'pi-minus',
  'Check': 'pi-check', 'Close': 'pi-times', 'Menu': 'pi-bars',
  'Settings': 'pi-cog', 'User': 'pi-user', 'Mail': 'pi-envelope',
  'Loader2': 'pi-spin pi-spinner', 'Save': 'pi-save',
  'AlertTriangle': 'pi-exclamation-triangle', 'RefreshCcw': 'pi-refresh',
  'Eye': 'pi-eye', 'EyeOff': 'pi-eye-slash', 'Copy': 'pi-copy',
  'Download': 'pi-download', 'Upload': 'pi-upload', 'Link': 'pi-link',
  'ExternalLink': 'pi-external-link', 'ArrowLeft': 'pi-arrow-left',
  'ArrowRight': 'pi-arrow-right', 'Info': 'pi-info-circle',
  'HelpCircle': 'pi-question-circle', 'Star': 'pi-star',
  'Heart': 'pi-heart', 'Bell': 'pi-bell', 'Lock': 'pi-lock',
  'Unlock': 'pi-lock-open', 'Globe': 'pi-globe', 'Phone': 'pi-phone',
  'MapPin': 'pi-map-marker', 'Image': 'pi-image', 'File': 'pi-file',
  'Folder': 'pi-folder', 'Database': 'pi-database',
};

export function convertIconsToPI(html: string): string {
  let result = html;

  for (const [reactIcon, piClass] of Object.entries(ICON_MAP)) {
    // Self-closing: <IconName className="..." />
    result = result.replace(
      new RegExp(`<${reactIcon}\\s+class(?:Name)?="([^"]*)"\\s*/>`, 'g'),
      `<i class="pi ${piClass} $1"></i>`,
    );
    // Self-closing without className: <IconName />
    result = result.replace(
      new RegExp(`<${reactIcon}\\s*/>`, 'g'),
      `<i class="pi ${piClass}"></i>`,
    );
    // With children (rare for icons): <IconName>...</IconName>
    result = result.replace(
      new RegExp(`<${reactIcon}[^>]*>[^<]*</${reactIcon}>`, 'g'),
      `<i class="pi ${piClass}"></i>`,
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// Framer Motion → plain HTML with Angular animations or CSS transitions
// ---------------------------------------------------------------------------

export function convertMotionToHtml(html: string): string {
  let result = html;

  // <AnimatePresence ...>...</AnimatePresence> → just children (no wrapper needed)
  result = result.replace(/<AnimatePresence[^>]*>/g, '');
  result = result.replace(/<\/AnimatePresence>/g, '');

  // <motion.element ...> → <element class="transition-all" ...>
  result = result.replace(/<motion\.(\w+)([^>]*)>/g, '<$1 class="transition-all"$2>');
  result = result.replace(/<\/motion\.(\w+)>/g, '</$1>');

  // Remove motion-specific attributes
  result = result.replace(/\s*(?:initial|animate|exit|transition|whileHover|whileTap|whileInView|variants|layout|layoutId)=\{[^}]*\}/g, '');

  return result;
}

// ---------------------------------------------------------------------------
// Toast (sonner) → PrimeNG Toast references
// ---------------------------------------------------------------------------

export function convertToasterToToast(html: string): string {
  let result = html;
  result = result.replace(/<Toaster[^>]*\/>/g, '<p-toast></p-toast>');
  result = result.replace(/<Toaster[^>]*>[^<]*<\/Toaster>/g, '<p-toast></p-toast>');
  return result;
}

// ---------------------------------------------------------------------------
// Badge → PrimeNG Tag
// ---------------------------------------------------------------------------

export function convertBadgeToTag(html: string): string {
  let result = html;

  // <Badge variant="destructive">text</Badge> → <p-tag severity="danger" value="text" />
  result = result.replace(
    /<Badge\s+variant="destructive"[^>]*>([^<]*)<\/Badge>/g,
    '<p-tag severity="danger" value="$1" [rounded]="true"></p-tag>',
  );
  result = result.replace(
    /<Badge\s+variant="secondary"[^>]*>([^<]*)<\/Badge>/g,
    '<p-tag severity="secondary" value="$1" [rounded]="true"></p-tag>',
  );
  result = result.replace(
    /<Badge[^>]*>([^<]*)<\/Badge>/g,
    '<p-tag value="$1" [rounded]="true"></p-tag>',
  );

  return result;
}

// ---------------------------------------------------------------------------
// Master function: Apply all semantic transformations
// ---------------------------------------------------------------------------

export function applySemanticUI(html: string): string {
  let result = html;

  // Order matters: icons first, then component trees, then motion
  result = convertIconsToPI(result);
  result = convertMotionToHtml(result);
  result = convertToasterToToast(result);
  result = convertBadgeToTag(result);
  result = collapseShadcnSelect(result);
  result = collapseShadcnCard(result);
  result = collapseMuiComponents(result);
  result = collapseAntdComponents(result);

  // Final cleanup: convert remaining React component refs to Angular selectors
  // <ComponentName → <app-component-name (only for PascalCase tags not in PrimeNG)
  const primeNgTags = new Set(['p-card', 'p-button', 'p-select', 'p-table', 'p-dialog', 'p-tag', 'p-toast', 'p-checkbox', 'p-datepicker']);
  result = result.replace(/<(\/?)([A-Z][a-zA-Z0-9]+)(\s|>|\/)/g, (_match, slash, name, after) => {
    // Skip if it's a known icon or already handled
    if (ICON_MAP[name]) return _match;
    // Convert to app-kebab-case
    const kebab = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    if (primeNgTags.has(`p-${kebab}`)) return _match;
    return `<${slash}app-${kebab}${after}`;
  });

  // Fix htmlFor → for
  result = result.replace(/\bhtmlFor=/g, 'for=');

  // Fix className → class (should already be done but ensure)
  result = result.replace(/\bclassName=/g, 'class=');

  return result;
}
