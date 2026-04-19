/**
 * Mapper de UI: React (MUI/Tailwind/genérico) → PrimeNG + Seguros Bolívar Design System.
 *
 * Convierte componentes de UI del prototipo React a componentes PrimeNG
 * con el tema corporativo de Seguros Bolívar (SB).
 *
 * Genera:
 *   - Imports de módulos PrimeNG necesarios
 *   - Template HTML con componentes PrimeNG
 *   - SCSS con variables del tema SB
 *   - Validación de accesibilidad básica (ARIA)
 */
const MUI_TO_PRIMENG = {
    'Button': {
        primeComponent: 'Button',
        primeModule: 'ButtonModule',
        primeImport: 'primeng/button',
        htmlTag: 'p-button',
        defaultProps: { styleClass: 'sb-btn-primary' },
    },
    'IconButton': {
        primeComponent: 'Button',
        primeModule: 'ButtonModule',
        primeImport: 'primeng/button',
        htmlTag: 'p-button',
        defaultProps: { icon: 'pi pi-pencil', styleClass: 'p-button-rounded sb-btn-icon' },
    },
    'TextField': {
        primeComponent: 'InputText',
        primeModule: 'InputTextModule',
        primeImport: 'primeng/inputtext',
        htmlTag: 'input pInputText',
        defaultProps: { styleClass: 'sb-input' },
    },
    'Select': {
        primeComponent: 'Select',
        primeModule: 'SelectModule',
        primeImport: 'primeng/select',
        htmlTag: 'p-select',
        defaultProps: { styleClass: 'sb-dropdown' },
    },
    'MenuItem': {
        primeComponent: 'Select',
        primeModule: 'SelectModule',
        primeImport: 'primeng/select',
        htmlTag: 'p-select',
        defaultProps: {},
    },
    'Checkbox': {
        primeComponent: 'Checkbox',
        primeModule: 'CheckboxModule',
        primeImport: 'primeng/checkbox',
        htmlTag: 'p-checkbox',
        defaultProps: { styleClass: 'sb-checkbox' },
    },
    'Switch': {
        primeComponent: 'InputSwitch',
        primeModule: 'InputSwitchModule',
        primeImport: 'primeng/inputswitch',
        htmlTag: 'p-inputSwitch',
        defaultProps: { styleClass: 'sb-switch' },
    },
    'Radio': {
        primeComponent: 'RadioButton',
        primeModule: 'RadioButtonModule',
        primeImport: 'primeng/radiobutton',
        htmlTag: 'p-radioButton',
        defaultProps: { styleClass: 'sb-radio' },
    },
    'Card': {
        primeComponent: 'Card',
        primeModule: 'CardModule',
        primeImport: 'primeng/card',
        htmlTag: 'p-card',
        defaultProps: { styleClass: 'sb-card' },
    },
    'CardContent': {
        primeComponent: 'Card',
        primeModule: 'CardModule',
        primeImport: 'primeng/card',
        htmlTag: 'ng-template pTemplate="content"',
        defaultProps: {},
    },
    'CardHeader': {
        primeComponent: 'Card',
        primeModule: 'CardModule',
        primeImport: 'primeng/card',
        htmlTag: 'ng-template pTemplate="header"',
        defaultProps: {},
    },
    'Dialog': {
        primeComponent: 'Dialog',
        primeModule: 'DialogModule',
        primeImport: 'primeng/dialog',
        htmlTag: 'p-dialog',
        defaultProps: { styleClass: 'sb-dialog', modal: 'true', draggable: 'false' },
    },
    'DialogTitle': {
        primeComponent: 'Dialog',
        primeModule: 'DialogModule',
        primeImport: 'primeng/dialog',
        htmlTag: 'ng-template pTemplate="header"',
        defaultProps: {},
    },
    'DialogContent': {
        primeComponent: 'Dialog',
        primeModule: 'DialogModule',
        primeImport: 'primeng/dialog',
        htmlTag: 'ng-template pTemplate="content"',
        defaultProps: {},
    },
    'DialogActions': {
        primeComponent: 'Dialog',
        primeModule: 'DialogModule',
        primeImport: 'primeng/dialog',
        htmlTag: 'ng-template pTemplate="footer"',
        defaultProps: {},
    },
    'Table': {
        primeComponent: 'Table',
        primeModule: 'TableModule',
        primeImport: 'primeng/table',
        htmlTag: 'p-table',
        defaultProps: { styleClass: 'sb-table', responsiveLayout: 'scroll' },
    },
    'TableHead': {
        primeComponent: 'Table',
        primeModule: 'TableModule',
        primeImport: 'primeng/table',
        htmlTag: 'ng-template pTemplate="header"',
        defaultProps: {},
    },
    'TableBody': {
        primeComponent: 'Table',
        primeModule: 'TableModule',
        primeImport: 'primeng/table',
        htmlTag: 'ng-template pTemplate="body" let-item',
        defaultProps: {},
    },
    'TableRow': {
        primeComponent: 'Table',
        primeModule: 'TableModule',
        primeImport: 'primeng/table',
        htmlTag: 'tr',
        defaultProps: {},
    },
    'TableCell': {
        primeComponent: 'Table',
        primeModule: 'TableModule',
        primeImport: 'primeng/table',
        htmlTag: 'td',
        defaultProps: {},
    },
    'Tabs': {
        primeComponent: 'TabView',
        primeModule: 'TabViewModule',
        primeImport: 'primeng/tabview',
        htmlTag: 'p-tabView',
        defaultProps: { styleClass: 'sb-tabs' },
    },
    'Tab': {
        primeComponent: 'TabPanel',
        primeModule: 'TabViewModule',
        primeImport: 'primeng/tabview',
        htmlTag: 'p-tabPanel',
        defaultProps: {},
    },
    'CircularProgress': {
        primeComponent: 'ProgressSpinner',
        primeModule: 'ProgressSpinnerModule',
        primeImport: 'primeng/progressspinner',
        htmlTag: 'p-progressSpinner',
        defaultProps: { styleClass: 'sb-spinner' },
    },
    'LinearProgress': {
        primeComponent: 'ProgressBar',
        primeModule: 'ProgressBarModule',
        primeImport: 'primeng/progressbar',
        htmlTag: 'p-progressBar',
        defaultProps: { styleClass: 'sb-progress' },
    },
    'Chip': {
        primeComponent: 'Tag',
        primeModule: 'TagModule',
        primeImport: 'primeng/tag',
        htmlTag: 'p-tag',
        defaultProps: { styleClass: 'sb-tag' },
    },
    'Avatar': {
        primeComponent: 'Avatar',
        primeModule: 'AvatarModule',
        primeImport: 'primeng/avatar',
        htmlTag: 'p-avatar',
        defaultProps: { styleClass: 'sb-avatar', shape: 'circle' },
    },
    'Tooltip': {
        primeComponent: 'Tooltip',
        primeModule: 'TooltipModule',
        primeImport: 'primeng/tooltip',
        htmlTag: 'pTooltip',
        defaultProps: {},
    },
    'Snackbar': {
        primeComponent: 'Toast',
        primeModule: 'ToastModule',
        primeImport: 'primeng/toast',
        htmlTag: 'p-toast',
        defaultProps: { styleClass: 'sb-toast' },
    },
    'Alert': {
        primeComponent: 'Message',
        primeModule: 'MessageModule',
        primeImport: 'primeng/message',
        htmlTag: 'p-message',
        defaultProps: { styleClass: 'sb-message' },
    },
    'AppBar': {
        primeComponent: 'Toolbar',
        primeModule: 'ToolbarModule',
        primeImport: 'primeng/toolbar',
        htmlTag: 'p-toolbar',
        defaultProps: { styleClass: 'sb-toolbar' },
    },
    'Toolbar': {
        primeComponent: 'Toolbar',
        primeModule: 'ToolbarModule',
        primeImport: 'primeng/toolbar',
        htmlTag: 'p-toolbar',
        defaultProps: { styleClass: 'sb-toolbar' },
    },
    'Drawer': {
        primeComponent: 'Sidebar',
        primeModule: 'SidebarModule',
        primeImport: 'primeng/sidebar',
        htmlTag: 'p-sidebar',
        defaultProps: { styleClass: 'sb-sidebar' },
    },
    'List': {
        primeComponent: 'Listbox',
        primeModule: 'ListboxModule',
        primeImport: 'primeng/listbox',
        htmlTag: 'p-listbox',
        defaultProps: { styleClass: 'sb-listbox' },
    },
    'Accordion': {
        primeComponent: 'Accordion',
        primeModule: 'AccordionModule',
        primeImport: 'primeng/accordion',
        htmlTag: 'p-accordion',
        defaultProps: { styleClass: 'sb-accordion' },
    },
    'AccordionSummary': {
        primeComponent: 'AccordionTab',
        primeModule: 'AccordionModule',
        primeImport: 'primeng/accordion',
        htmlTag: 'p-accordionTab',
        defaultProps: {},
    },
};
// ─── Mapeo HTML genérico → PrimeNG ─────────────────────────────────────────
const HTML_TO_PRIMENG = {
    'input[type="text"]': {
        primeComponent: 'InputText',
        primeModule: 'InputTextModule',
        primeImport: 'primeng/inputtext',
        htmlTag: 'input pInputText',
        defaultProps: { styleClass: 'sb-input' },
    },
    'input[type="number"]': {
        primeComponent: 'InputNumber',
        primeModule: 'InputNumberModule',
        primeImport: 'primeng/inputnumber',
        htmlTag: 'p-inputNumber',
        defaultProps: { styleClass: 'sb-input-number' },
    },
    'textarea': {
        primeComponent: 'InputTextarea',
        primeModule: 'InputTextareaModule',
        primeImport: 'primeng/inputtextarea',
        htmlTag: 'textarea pInputTextarea',
        defaultProps: { styleClass: 'sb-textarea' },
    },
    'select': {
        primeComponent: 'Dropdown',
        primeModule: 'DropdownModule',
        primeImport: 'primeng/dropdown',
        htmlTag: 'p-dropdown',
        defaultProps: { styleClass: 'sb-dropdown' },
    },
};
/**
 * Limpia atributos HTML que no son soportados por componentes PrimeNG.
 * - required no es un @Input válido en p-select, p-dropdown, etc.
 * - placeholder en algunos componentes PrimeNG usa [placeholder] binding
 */
function cleanPrimeNgAttributes(html) {
    let result = html;
    // Quitar required de componentes PrimeNG (no es un @Input válido)
    const primeNgTags = ['p-select', 'p-dropdown', 'p-checkbox', 'p-radioButton', 'p-inputSwitch', 'p-calendar', 'p-autoComplete', 'p-multiSelect'];
    for (const tag of primeNgTags) {
        // Quitar required como atributo standalone
        result = result.replace(new RegExp(`(<${tag}[^>]*)\\s+required(?=[\\s/>])`, 'g'), '$1');
        // Quitar required="required" o required="true"
        result = result.replace(new RegExp(`(<${tag}[^>]*)\\s+required=["'][^"']*["']`, 'g'), '$1');
    }
    return result;
}
/**
 * Convierte template HTML con componentes MUI/genéricos a PrimeNG.
 */
export function convertToPrimeNg(html, detectedUiLibraries) {
    let converted = html;
    const modules = new Map();
    const warnings = [];
    let componentCount = 0;
    // Paso 1: Convertir componentes MUI → PrimeNG
    for (const [muiComp, mapping] of Object.entries(MUI_TO_PRIMENG)) {
        const openTagRegex = new RegExp(`<${muiComp}([\\s/>])`, 'g');
        const closeTagRegex = new RegExp(`</${muiComp}>`, 'g');
        if (openTagRegex.test(converted)) {
            componentCount++;
            modules.set(mapping.primeModule, {
                moduleName: mapping.primeModule,
                importPath: mapping.primeImport,
            });
            // Construir props por defecto
            const propsStr = Object.entries(mapping.defaultProps)
                .map(([k, v]) => `${k}="${v}"`)
                .join(' ');
            const propsInsert = propsStr ? ` ${propsStr}` : '';
            // Reemplazar tags
            converted = converted.replace(new RegExp(`<${muiComp}([\\s/>])`, 'g'), `<${mapping.htmlTag}${propsInsert}$1`);
            converted = converted.replace(closeTagRegex, `</${mapping.htmlTag.split(' ')[0]}>`);
        }
    }
    // Paso 2: Convertir atributos React → Angular
    converted = convertReactPropsToAngular(converted);
    // Paso 3: Agregar clases SB donde falten
    converted = injectSbClasses(converted);
    // Paso 4: Limpiar atributos HTML no soportados en componentes PrimeNG
    converted = cleanPrimeNgAttributes(converted);
    // Paso 5: Validar accesibilidad básica
    const a11yWarnings = validateAccessibility(converted);
    warnings.push(...a11yWarnings);
    return {
        html: converted,
        requiredModules: [...modules.values()],
        warnings,
        componentCount,
    };
}
/**
 * Convierte props de React a atributos Angular en el template.
 */
function convertReactPropsToAngular(html) {
    let result = html;
    // variant="contained" → severity="primary" (PrimeNG Button)
    result = result.replace(/variant="contained"/g, 'severity="primary"');
    result = result.replace(/variant="outlined"/g, 'severity="secondary" [outlined]="true"');
    result = result.replace(/variant="text"/g, 'severity="secondary" [text]="true"');
    // color="primary" → severity="primary"
    result = result.replace(/color="primary"/g, 'severity="primary"');
    result = result.replace(/color="secondary"/g, 'severity="secondary"');
    result = result.replace(/color="error"/g, 'severity="danger"');
    result = result.replace(/color="warning"/g, 'severity="warning"');
    result = result.replace(/color="success"/g, 'severity="success"');
    result = result.replace(/color="info"/g, 'severity="info"');
    // size="small" → size="small" (PrimeNG compatible)
    result = result.replace(/size="medium"/g, '');
    result = result.replace(/size="large"/g, 'size="large"');
    // disabled={true} → [disabled]="true"
    result = result.replace(/disabled=\{(\w+)\}/g, '[disabled]="$1"');
    // fullWidth → styleClass="w-full"
    result = result.replace(/\bfullWidth\b/g, 'styleClass="w-full"');
    // startIcon={<Icon />} → icon="pi pi-icon" iconPos="left"
    result = result.replace(/startIcon=\{[^}]+\}/g, 'icon="pi pi-check" iconPos="left"');
    result = result.replace(/endIcon=\{[^}]+\}/g, 'icon="pi pi-check" iconPos="right"');
    return result;
}
/**
 * Inyecta clases del Design System Seguros Bolívar donde falten.
 */
function injectSbClasses(html) {
    let result = html;
    // Formularios sin clase SB
    result = result.replace(/<form(?![^>]*class=)/g, '<form class="sb-form"');
    // Contenedores principales
    result = result.replace(/<div class="container"/g, '<div class="sb-container"');
    result = result.replace(/<div class="wrapper"/g, '<div class="sb-wrapper"');
    // Headers
    result = result.replace(/<h1(?![^>]*class=)/g, '<h1 class="sb-heading-1"');
    result = result.replace(/<h2(?![^>]*class=)/g, '<h2 class="sb-heading-2"');
    result = result.replace(/<h3(?![^>]*class=)/g, '<h3 class="sb-heading-3"');
    return result;
}
/**
 * Validación básica de accesibilidad (ARIA).
 */
function validateAccessibility(html) {
    const warnings = [];
    // Imágenes sin alt
    const imgWithoutAlt = html.match(/<img(?![^>]*alt=)[^>]*>/g);
    if (imgWithoutAlt) {
        warnings.push(`A11Y: ${imgWithoutAlt.length} imagen(es) sin atributo alt`);
    }
    // Botones sin texto o aria-label
    const buttonWithoutLabel = html.match(/<p-button(?![^>]*(?:label=|aria-label=))[^>]*\/>/g);
    if (buttonWithoutLabel) {
        warnings.push(`A11Y: ${buttonWithoutLabel.length} botón(es) sin label o aria-label`);
    }
    // Inputs sin label asociado
    const inputsWithoutId = html.match(/<input(?![^>]*id=)[^>]*>/g);
    if (inputsWithoutId) {
        warnings.push(`A11Y: ${inputsWithoutId.length} input(s) sin id (necesario para label asociado)`);
    }
    // Formularios sin role
    const formsWithoutRole = html.match(/<form(?![^>]*(?:role=|aria-label=))[^>]*>/g);
    if (formsWithoutRole) {
        warnings.push(`A11Y: ${formsWithoutRole.length} formulario(s) sin role o aria-label`);
    }
    return warnings;
}
/**
 * Genera los imports de PrimeNG para el .component.ts
 */
export function generatePrimeNgImports(modules) {
    if (modules.length === 0)
        return '';
    const uniqueModules = [...new Map(modules.map((m) => [m.moduleName, m])).values()];
    return uniqueModules
        .map((m) => `import { ${m.moduleName} } from '${m.importPath}';`)
        .join('\n');
}
/**
 * Genera el SCSS con el tema Seguros Bolívar para PrimeNG.
 */
export function generateSbPrimeNgTheme() {
    return `// ═══════════════════════════════════════════════════════════════
// Seguros Bolívar - Design System para PrimeNG
// Tema corporativo aplicado sobre PrimeNG components
// ═══════════════════════════════════════════════════════════════

// ─── Paleta Corporativa Seguros Bolívar ─────────────────────
:root {
  // Primarios
  --sb-primary: #003DA5;
  --sb-primary-dark: #002D7A;
  --sb-primary-light: #4D7CC7;
  --sb-primary-50: #E6EDF7;
  --sb-primary-100: #B3CCE8;

  // Secundarios
  --sb-secondary: #00A651;
  --sb-secondary-dark: #007A3D;
  --sb-secondary-light: #4DC484;

  // Acento
  --sb-accent: #F7941D;
  --sb-accent-dark: #D47A0F;
  --sb-accent-light: #FABD6E;

  // Neutros
  --sb-white: #FFFFFF;
  --sb-gray-50: #F8F9FA;
  --sb-gray-100: #F1F3F5;
  --sb-gray-200: #E9ECEF;
  --sb-gray-300: #DEE2E6;
  --sb-gray-400: #CED4DA;
  --sb-gray-500: #ADB5BD;
  --sb-gray-600: #6C757D;
  --sb-gray-700: #495057;
  --sb-gray-800: #343A40;
  --sb-gray-900: #212529;

  // Semánticos
  --sb-success: #00A651;
  --sb-warning: #F7941D;
  --sb-danger: #DC3545;
  --sb-info: #003DA5;

  // Tipografía
  --sb-font-family: 'Montserrat', 'Segoe UI', system-ui, sans-serif;
  --sb-font-size-xs: 0.75rem;
  --sb-font-size-sm: 0.875rem;
  --sb-font-size-base: 1rem;
  --sb-font-size-lg: 1.125rem;
  --sb-font-size-xl: 1.25rem;
  --sb-font-size-2xl: 1.5rem;
  --sb-font-size-3xl: 2rem;

  // Espaciado
  --sb-spacing-xs: 4px;
  --sb-spacing-sm: 8px;
  --sb-spacing-md: 16px;
  --sb-spacing-lg: 24px;
  --sb-spacing-xl: 32px;
  --sb-spacing-2xl: 48px;

  // Bordes
  --sb-border-radius: 8px;
  --sb-border-radius-sm: 4px;
  --sb-border-radius-lg: 12px;
  --sb-border-radius-full: 50%;
  --sb-border-color: var(--sb-gray-300);

  // Sombras
  --sb-shadow-sm: 0 1px 3px rgba(0, 61, 165, 0.08);
  --sb-shadow: 0 2px 8px rgba(0, 61, 165, 0.12);
  --sb-shadow-lg: 0 4px 16px rgba(0, 61, 165, 0.16);

  // Transiciones
  --sb-transition: 200ms ease-in-out;
}

// ─── Override PrimeNG con tema SB ───────────────────────────

// Botones
.sb-btn-primary {
  background-color: var(--sb-primary) !important;
  border-color: var(--sb-primary) !important;
  font-family: var(--sb-font-family);
  border-radius: var(--sb-border-radius) !important;
  transition: all var(--sb-transition);

  &:hover {
    background-color: var(--sb-primary-dark) !important;
    border-color: var(--sb-primary-dark) !important;
  }

  &:focus {
    box-shadow: 0 0 0 3px var(--sb-primary-100) !important;
  }
}

.sb-btn-secondary {
  background-color: var(--sb-secondary) !important;
  border-color: var(--sb-secondary) !important;

  &:hover {
    background-color: var(--sb-secondary-dark) !important;
  }
}

.sb-btn-icon {
  background-color: transparent !important;
  color: var(--sb-primary) !important;
  border: none !important;

  &:hover {
    background-color: var(--sb-primary-50) !important;
  }
}

// Inputs
.sb-input {
  border-radius: var(--sb-border-radius-sm) !important;
  border-color: var(--sb-border-color) !important;
  font-family: var(--sb-font-family);

  &:focus {
    border-color: var(--sb-primary) !important;
    box-shadow: 0 0 0 2px var(--sb-primary-100) !important;
  }
}

// Cards
.sb-card {
  border-radius: var(--sb-border-radius-lg) !important;
  box-shadow: var(--sb-shadow) !important;
  border: 1px solid var(--sb-gray-200);
  font-family: var(--sb-font-family);
}

// Tablas
.sb-table {
  font-family: var(--sb-font-family);

  .p-datatable-header {
    background-color: var(--sb-primary) !important;
    color: var(--sb-white) !important;
    border-radius: var(--sb-border-radius) var(--sb-border-radius) 0 0;
  }

  .p-datatable-thead > tr > th {
    background-color: var(--sb-primary-50) !important;
    color: var(--sb-primary-dark) !important;
    font-weight: 600;
  }

  .p-datatable-tbody > tr {
    &:nth-child(even) {
      background-color: var(--sb-gray-50);
    }

    &:hover {
      background-color: var(--sb-primary-50) !important;
    }
  }
}

// Dialog/Modal
.sb-dialog {
  border-radius: var(--sb-border-radius-lg) !important;
  font-family: var(--sb-font-family);

  .p-dialog-header {
    background-color: var(--sb-primary);
    color: var(--sb-white);
    border-radius: var(--sb-border-radius-lg) var(--sb-border-radius-lg) 0 0;
  }
}

// Toast
.sb-toast {
  font-family: var(--sb-font-family);
}

// Toolbar / Header
.sb-toolbar {
  background-color: var(--sb-primary) !important;
  border: none !important;
  border-radius: 0 !important;
  font-family: var(--sb-font-family);
}

// Sidebar
.sb-sidebar {
  font-family: var(--sb-font-family);
  background-color: var(--sb-white);
  border-right: 2px solid var(--sb-primary);
}

// Tags / Badges
.sb-tag {
  font-family: var(--sb-font-family);
  border-radius: var(--sb-border-radius-sm);
}

// Tabs
.sb-tabs {
  font-family: var(--sb-font-family);

  .p-tabview-nav li.p-highlight .p-tabview-nav-link {
    color: var(--sb-primary) !important;
    border-color: var(--sb-primary) !important;
  }
}

// Formularios
.sb-form {
  font-family: var(--sb-font-family);

  .p-field {
    margin-bottom: var(--sb-spacing-md);
  }

  label {
    color: var(--sb-gray-700);
    font-weight: 500;
    margin-bottom: var(--sb-spacing-xs);
    display: block;
  }
}

// Headings corporativos
.sb-heading-1 {
  font-family: var(--sb-font-family);
  font-size: var(--sb-font-size-3xl);
  font-weight: 700;
  color: var(--sb-primary-dark);
}

.sb-heading-2 {
  font-family: var(--sb-font-family);
  font-size: var(--sb-font-size-2xl);
  font-weight: 600;
  color: var(--sb-primary);
}

.sb-heading-3 {
  font-family: var(--sb-font-family);
  font-size: var(--sb-font-size-xl);
  font-weight: 600;
  color: var(--sb-gray-800);
}

// Contenedores
.sb-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--sb-spacing-lg);
}

.sb-wrapper {
  padding: var(--sb-spacing-md);
}

// Spinner
.sb-spinner {
  .p-progress-spinner-circle {
    stroke: var(--sb-primary) !important;
  }
}

// Message / Alert
.sb-message {
  font-family: var(--sb-font-family);
  border-radius: var(--sb-border-radius);
}
`;
}
//# sourceMappingURL=primeng-mapper.generator.js.map