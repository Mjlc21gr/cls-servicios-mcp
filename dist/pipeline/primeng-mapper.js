// ---------------------------------------------------------------------------
// PrimeNG 21 Mapping Tables (Standalone Components — no modules)
// ---------------------------------------------------------------------------
/**
 * Maps PrimeNG component/directive tags to their standalone imports.
 * PrimeNG 21 uses standalone components directly, not NgModules.
 */
const PRIMENG_IMPORT_MAP = {
    'p-button': { moduleName: 'Button', importPath: 'primeng/button' },
    'pInputText': { moduleName: 'InputText', importPath: 'primeng/inputtext' },
    'p-select': { moduleName: 'Select', importPath: 'primeng/select' },
    'p-table': { moduleName: 'Table', importPath: 'primeng/table' },
    'p-checkbox': { moduleName: 'Checkbox', importPath: 'primeng/checkbox' },
    'pTextarea': { moduleName: 'Textarea', importPath: 'primeng/textarea' },
    'p-dialog': { moduleName: 'Dialog', importPath: 'primeng/dialog' },
    'p-toast': { moduleName: 'Toast', importPath: 'primeng/toast' },
    'p-tag': { moduleName: 'Tag', importPath: 'primeng/tag' },
    'p-card': { moduleName: 'Card', importPath: 'primeng/card' },
    'p-datepicker': { moduleName: 'DatePicker', importPath: 'primeng/datepicker' },
    'p-inputnumber': { moduleName: 'InputNumber', importPath: 'primeng/inputnumber' },
    'p-textarea': { moduleName: 'Textarea', importPath: 'primeng/textarea' },
    'p-progressbar': { moduleName: 'ProgressBar', importPath: 'primeng/progressbar' },
    'p-accordion': { moduleName: 'Accordion', importPath: 'primeng/accordion' },
    'p-tabview': { moduleName: 'TabView', importPath: 'primeng/tabview' },
    'p-menu': { moduleName: 'Menu', importPath: 'primeng/menu' },
    'p-toolbar': { moduleName: 'Toolbar', importPath: 'primeng/toolbar' },
    'p-fileupload': { moduleName: 'FileUpload', importPath: 'primeng/fileupload' },
    'p-confirmdialog': { moduleName: 'ConfirmDialog', importPath: 'primeng/confirmdialog' },
    'p-tooltip': { moduleName: 'Tooltip', importPath: 'primeng/tooltip' },
    'p-badge': { moduleName: 'Badge', importPath: 'primeng/badge' },
    'p-chip': { moduleName: 'Chip', importPath: 'primeng/chip' },
    'p-avatar': { moduleName: 'Avatar', importPath: 'primeng/avatar' },
    'p-divider': { moduleName: 'Divider', importPath: 'primeng/divider' },
    'p-skeleton': { moduleName: 'Skeleton', importPath: 'primeng/skeleton' },
    'p-panel': { moduleName: 'Panel', importPath: 'primeng/panel' },
    'p-steps': { moduleName: 'Steps', importPath: 'primeng/steps' },
    'p-message': { moduleName: 'Message', importPath: 'primeng/message' },
    'p-autocomplete': { moduleName: 'AutoComplete', importPath: 'primeng/autocomplete' },
    'p-multiselect': { moduleName: 'MultiSelect', importPath: 'primeng/multiselect' },
    'p-radiobutton': { moduleName: 'RadioButton', importPath: 'primeng/radiobutton' },
    'p-toggleswitch': { moduleName: 'ToggleSwitch', importPath: 'primeng/toggleswitch' },
    'p-rating': { moduleName: 'Rating', importPath: 'primeng/rating' },
    'p-slider': { moduleName: 'Slider', importPath: 'primeng/slider' },
    'p-paginator': { moduleName: 'Paginator', importPath: 'primeng/paginator' },
    'p-image': { moduleName: 'Image', importPath: 'primeng/image' },
    'p-carousel': { moduleName: 'Carousel', importPath: 'primeng/carousel' },
    'p-galleria': { moduleName: 'Galleria', importPath: 'primeng/galleria' },
};
// ---------------------------------------------------------------------------
// Replacement helpers
// ---------------------------------------------------------------------------
/**
 * Replace `<p-button ...>...</button>` with `<p-button ...>...</p-button>`.
 * Handles self-closing `<button ... />` as well.
 */
function replaceButton(template) {
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
function replaceInputText(template) {
    // Match <input with type="text" — add pInputText and remove type="text"
    template = template.replace(/<input(\s[^>]*)?\stype="text"([^>]*?)\s*\/?>/g, (_match, before = '', after = '') => {
        const attrs = `${before}${after}`.trim();
        return `<input pInputText${attrs ? ' ' + attrs : ''} />`;
    });
    return template;
}
/**
 * Replace `<input type="checkbox" ...>` with `<p-checkbox ...>`.
 * Must run BEFORE replaceInputText to avoid conflicts.
 */
function replaceCheckbox(template) {
    template = template.replace(/<input(\s[^>]*)?\stype="checkbox"([^>]*?)\s*\/?>/g, (_match, before = '', after = '') => {
        const attrs = `${before}${after}`.trim();
        return `<p-checkbox${attrs ? ' ' + attrs : ''} />`;
    });
    return template;
}
/**
 * Replace `<select ...>...</select>` with `<p-select ...>...</p-select>`.
 * PrimeNG 21 uses p-select (formerly p-dropdown).
 */
function replaceSelect(template) {
    template = template.replace(/<select(\s|>|\/)/g, '<p-select$1');
    template = template.replace(/<\/select>/g, '</p-select>');
    // Also convert any remaining p-dropdown to p-select (PrimeNG 21 migration)
    template = template.replace(/<p-dropdown(\s|>|\/)/g, '<p-select$1');
    template = template.replace(/<\/p-dropdown>/g, '</p-select>');
    return template;
}
/**
 * Replace `<table ...>...</table>` with `<p-table ...>...</p-table>`.
 */
function replaceTable(template) {
    template = template.replace(/<table(\s|>|\/)/g, '<p-table$1');
    template = template.replace(/<\/table>/g, '</p-table>');
    return template;
}
/**
 * Replace `<textarea ...>` with `<textarea pTextarea ...>`.
 * PrimeNG 21 uses pTextarea (formerly pInputTextarea).
 */
function replaceTextarea(template) {
    template = template.replace(/<textarea(?!\s[^>]*pTextarea)(\s|>)/g, '<textarea pTextarea$1');
    return template;
}
/**
 * Replace `<dialog ...>...</dialog>` with `<p-dialog ...>...</p-dialog>`.
 */
function replaceDialog(template) {
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
 * PrimeNG 21: standalone components, no NgModules.
 */
function detectPrimeNGImports(template) {
    const imports = [];
    const seen = new Set();
    for (const [tag, importDef] of Object.entries(PRIMENG_IMPORT_MAP)) {
        if (seen.has(importDef.moduleName))
            continue;
        // Check if the tag/directive is present in the template
        const isDirective = tag.startsWith('p') && tag[1] !== '-'; // pInputText, pTextarea, etc.
        const pattern = isDirective
            ? new RegExp(`\\b${tag}[\\s>]`)
            : new RegExp(`<${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s>/]`);
        if (pattern.test(template)) {
            seen.add(importDef.moduleName);
            imports.push(importDef);
        }
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
export function mapToPrimeNG(ir) {
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
    const primeNgTags = ['p-select', 'p-checkbox', 'p-dialog', 'p-table'];
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
//# sourceMappingURL=primeng-mapper.js.map