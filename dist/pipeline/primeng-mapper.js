// ---------------------------------------------------------------------------
// PrimeNG 21 Import Map — Module names match what you import in Angular
// ---------------------------------------------------------------------------
const PRIMENG_IMPORT_MAP = {
    'p-button': { moduleName: 'ButtonModule', importPath: 'primeng/button' },
    'pButton': { moduleName: 'ButtonModule', importPath: 'primeng/button' },
    'pInputText': { moduleName: 'InputTextModule', importPath: 'primeng/inputtext' },
    'p-select': { moduleName: 'SelectModule', importPath: 'primeng/select' },
    'p-table': { moduleName: 'TableModule', importPath: 'primeng/table' },
    'p-checkbox': { moduleName: 'CheckboxModule', importPath: 'primeng/checkbox' },
    'pTextarea': { moduleName: 'TextareaModule', importPath: 'primeng/textarea' },
    'p-dialog': { moduleName: 'DialogModule', importPath: 'primeng/dialog' },
    'p-toast': { moduleName: 'ToastModule', importPath: 'primeng/toast' },
    'p-tag': { moduleName: 'TagModule', importPath: 'primeng/tag' },
    'p-card': { moduleName: 'CardModule', importPath: 'primeng/card' },
    'p-datepicker': { moduleName: 'DatePickerModule', importPath: 'primeng/datepicker' },
    'p-inputnumber': { moduleName: 'InputNumberModule', importPath: 'primeng/inputnumber' },
    'p-progressbar': { moduleName: 'ProgressBarModule', importPath: 'primeng/progressbar' },
    'p-accordion': { moduleName: 'AccordionModule', importPath: 'primeng/accordion' },
    'p-menu': { moduleName: 'MenuModule', importPath: 'primeng/menu' },
    'p-toolbar': { moduleName: 'ToolbarModule', importPath: 'primeng/toolbar' },
    'p-fileupload': { moduleName: 'FileUploadModule', importPath: 'primeng/fileupload' },
    'p-confirmdialog': { moduleName: 'ConfirmDialogModule', importPath: 'primeng/confirmdialog' },
    'p-badge': { moduleName: 'BadgeModule', importPath: 'primeng/badge' },
    'p-chip': { moduleName: 'ChipModule', importPath: 'primeng/chip' },
    'p-avatar': { moduleName: 'AvatarModule', importPath: 'primeng/avatar' },
    'p-divider': { moduleName: 'DividerModule', importPath: 'primeng/divider' },
    'p-skeleton': { moduleName: 'SkeletonModule', importPath: 'primeng/skeleton' },
    'p-panel': { moduleName: 'PanelModule', importPath: 'primeng/panel' },
    'p-message': { moduleName: 'MessageModule', importPath: 'primeng/message' },
    'p-autocomplete': { moduleName: 'AutoCompleteModule', importPath: 'primeng/autocomplete' },
    'p-multiselect': { moduleName: 'MultiSelectModule', importPath: 'primeng/multiselect' },
    'p-radiobutton': { moduleName: 'RadioButtonModule', importPath: 'primeng/radiobutton' },
    'p-toggleswitch': { moduleName: 'ToggleSwitchModule', importPath: 'primeng/toggleswitch' },
    'p-slider': { moduleName: 'SliderModule', importPath: 'primeng/slider' },
    'p-paginator': { moduleName: 'PaginatorModule', importPath: 'primeng/paginator' },
    'p-image': { moduleName: 'ImageModule', importPath: 'primeng/image' },
    'p-popover': { moduleName: 'PopoverModule', importPath: 'primeng/popover' },
    'p-drawer': { moduleName: 'DrawerModule', importPath: 'primeng/drawer' },
    'p-floatlabel': { moduleName: 'FloatLabelModule', importPath: 'primeng/floatlabel' },
};
// ---------------------------------------------------------------------------
// Replacement helpers
// ---------------------------------------------------------------------------
/** <button> → <p-button> (PrimeNG 21 component approach — self-closing with label/icon props) */
function replaceButton(template) {
    // Convert <button ...>text</button> → <p-button ...>text</p-button>
    template = template.replace(/<button(?!\s[^>]*\bpButton\b)(\s[^>]*)?>/g, (_match, attrs) => {
        const a = (attrs ?? '').trim();
        return '<p-button' + (a ? ' ' + a : '') + '>';
    });
    template = template.replace(/<\/button>/g, '</p-button>');
    return template;
}
/** <input type="text"> → <input pInputText> */
function replaceInputText(template) {
    template = template.replace(/<input(\s[^>]*)?\stype="text"([^>]*?)\s*\/?>/g, (_match, before = '', after = '') => {
        const attrs = `${before}${after}`.trim();
        return `<input pInputText${attrs ? ' ' + attrs : ''} />`;
    });
    return template;
}
/** <input type="checkbox"> → <p-checkbox /> */
function replaceCheckbox(template) {
    template = template.replace(/<input(\s[^>]*)?\stype="checkbox"([^>]*?)\s*\/?>/g, (_match, before = '', after = '') => {
        const attrs = `${before}${after}`.trim();
        return `<p-checkbox${attrs ? ' ' + attrs : ''} />`;
    });
    return template;
}
/** <select>...<option>...</option>...</select> → <p-select [options]="..." /> */
function replaceSelect(template) {
    template = template.replace(/<select(\s[^>]*)>([\s\S]*?)<\/select>/g, (_match, attrs, body) => {
        const options = [];
        const optRe = /<option\s+value="([^"]*)"[^>]*>\s*([^<]*?)\s*<\/option>/g;
        let m;
        while ((m = optRe.exec(body)) !== null) {
            options.push({ value: m[1], label: m[2].trim() });
        }
        const ngModelMatch = attrs.match(/\[?\(?\s*ngModel\s*\)?\]?\s*=\s*"([^"]*)"/);
        const ngModel = ngModelMatch ? ngModelMatch[1] : '';
        let result = '<p-select';
        if (options.length > 0) {
            result += ` [options]='${JSON.stringify(options)}' optionLabel="label" optionValue="value"`;
        }
        if (ngModel)
            result += ` [(ngModel)]="${ngModel}"`;
        const cleanAttrs = attrs.replace(/\[?\(?\s*ngModel\s*\)?\]?\s*=\s*"[^"]*"/g, '').replace(/\s*name="[^"]*"/g, '').trim();
        if (cleanAttrs)
            result += ` ${cleanAttrs}`;
        result += ' />';
        return result;
    });
    template = template.replace(/<select(\s[^>]*?)\s*\/>/g, '<p-select$1 />');
    template = template.replace(/<p-dropdown/g, '<p-select');
    template = template.replace(/<\/p-dropdown>/g, '');
    return template;
}
/** <table> → <p-table> */
function replaceTable(template) {
    template = template.replace(/<table(\s|>|\/)/g, '<p-table$1');
    template = template.replace(/<\/table>/g, '</p-table>');
    return template;
}
/** <textarea> → <textarea pTextarea> */
function replaceTextarea(template) {
    template = template.replace(/<textarea(?!\s[^>]*pTextarea)(\s|>)/g, '<textarea pTextarea$1');
    return template;
}
/** <dialog> → <p-dialog> */
function replaceDialog(template) {
    template = template.replace(/<dialog(\s|>|\/)/g, '<p-dialog$1');
    template = template.replace(/<\/dialog>/g, '</p-dialog>');
    return template;
}
// ---------------------------------------------------------------------------
// Import detection — simple string matching, no regex issues
// ---------------------------------------------------------------------------
function detectPrimeNGImports(template) {
    const imports = [];
    const seen = new Set();
    for (const [tag, importDef] of Object.entries(PRIMENG_IMPORT_MAP)) {
        if (seen.has(importDef.moduleName))
            continue;
        const isDirective = tag.startsWith('p') && tag[1] !== '-';
        const found = isDirective
            ? template.includes(tag)
            : template.includes('<' + tag + ' ') || template.includes('<' + tag + '>') || template.includes('<' + tag + '/');
        if (found) {
            seen.add(importDef.moduleName);
            imports.push(importDef);
        }
    }
    return imports;
}
// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
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
    // Clean unsupported HTML attrs on PrimeNG components
    for (const tag of ['p-select', 'p-checkbox', 'p-dialog', 'p-table']) {
        template = template.replace(new RegExp(`(<${tag}[^>]*)\\s+required(?=[\\s/>])`, 'g'), '$1');
    }
    // PrimeNG 21: "destructive" → "danger"
    template = template.replace(/'destructive'/g, "'danger'");
    template = template.replace(/severity="destructive"/g, 'severity="danger"');
    // Consolidate [ngModel] + (ngModelChange) → [(ngModel)]
    template = template.replace(/\[ngModel\]="(\w+)\(\)"\s*\(ngModelChange\)="\1\.set\(\$event\)"/g, '[(ngModel)]="$1()"');
    const primeNgImports = detectPrimeNGImports(template);
    return { ...ir, angularTemplate: template, primeNgImports };
}
//# sourceMappingURL=primeng-mapper.js.map