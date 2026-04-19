/**
 * Inyector de tema CLS.
 * Sustituye estilos genéricos del prototipo React por variables CSS del Design System CLS.
 */

const CLS_VARIABLE_MAP: Record<string, string> = {
  // Colores
  '#1976d2': 'var(--cls-primary)',
  '#1565c0': 'var(--cls-primary-dark)',
  '#42a5f5': 'var(--cls-primary-light)',
  '#dc004e': 'var(--cls-secondary)',
  '#9c27b0': 'var(--cls-accent)',
  '#f5f5f5': 'var(--cls-bg-secondary)',
  '#ffffff': 'var(--cls-bg-primary)',
  '#fff': 'var(--cls-bg-primary)',
  '#333': 'var(--cls-text-primary)',
  '#333333': 'var(--cls-text-primary)',
  '#666': 'var(--cls-text-secondary)',
  '#666666': 'var(--cls-text-secondary)',
  '#999': 'var(--cls-text-disabled)',
  '#e0e0e0': 'var(--cls-border-color)',
  '#ccc': 'var(--cls-border-color)',

  // Fuentes
  'Arial': 'var(--cls-font-family)',
  'Helvetica': 'var(--cls-font-family)',
  'sans-serif': 'var(--cls-font-family)',
  'Roboto': 'var(--cls-font-family)',

  // Spacing comunes
  '4px': 'var(--cls-spacing-xs)',
  '8px': 'var(--cls-spacing-sm)',
  '12px': 'var(--cls-spacing-md)',
  '16px': 'var(--cls-spacing-lg)',
  '24px': 'var(--cls-spacing-xl)',
  '32px': 'var(--cls-spacing-2xl)',

  // Border radius
  'border-radius: 4px': 'border-radius: var(--cls-border-radius-sm)',
  'border-radius: 8px': 'border-radius: var(--cls-border-radius)',
  'border-radius: 16px': 'border-radius: var(--cls-border-radius-lg)',
  'border-radius: 50%': 'border-radius: var(--cls-border-radius-full)',
};

const MUI_TO_CLS_MAP: Record<string, string> = {
  'Button': 'cls-button',
  'TextField': 'cls-input',
  'Card': 'cls-card',
  'CardContent': 'cls-card__content',
  'CardHeader': 'cls-card__header',
  'Dialog': 'cls-modal',
  'DialogTitle': 'cls-modal__title',
  'DialogContent': 'cls-modal__content',
  'DialogActions': 'cls-modal__actions',
  'AppBar': 'cls-header',
  'Toolbar': 'cls-toolbar',
  'Drawer': 'cls-sidebar',
  'List': 'cls-list',
  'ListItem': 'cls-list__item',
  'Table': 'cls-table',
  'TableHead': 'cls-table__head',
  'TableBody': 'cls-table__body',
  'TableRow': 'cls-table__row',
  'TableCell': 'cls-table__cell',
  'Chip': 'cls-badge',
  'Avatar': 'cls-avatar',
  'Tabs': 'cls-tabs',
  'Tab': 'cls-tabs__tab',
  'Snackbar': 'cls-toast',
  'Alert': 'cls-alert',
  'CircularProgress': 'cls-spinner',
  'LinearProgress': 'cls-progress-bar',
  'Tooltip': 'cls-tooltip',
  'IconButton': 'cls-icon-button',
  'Select': 'cls-select',
  'MenuItem': 'cls-select__option',
  'Checkbox': 'cls-checkbox',
  'Switch': 'cls-toggle',
  'Radio': 'cls-radio',
};

const TAILWIND_TO_CLS_MAP: Record<string, string> = {
  'bg-blue-500': 'cls-bg-primary',
  'bg-blue-600': 'cls-bg-primary-dark',
  'bg-white': 'cls-bg-primary',
  'bg-gray-100': 'cls-bg-secondary',
  'text-gray-900': 'cls-text-primary',
  'text-gray-600': 'cls-text-secondary',
  'text-white': 'cls-text-inverse',
  'rounded': 'cls-rounded',
  'rounded-lg': 'cls-rounded-lg',
  'shadow': 'cls-shadow',
  'shadow-lg': 'cls-shadow-lg',
  'p-4': 'cls-p-lg',
  'p-2': 'cls-p-sm',
  'px-4': 'cls-px-lg',
  'py-2': 'cls-py-sm',
  'm-4': 'cls-m-lg',
  'mx-auto': 'cls-mx-auto',
  'flex': 'cls-flex',
  'grid': 'cls-grid',
  'gap-4': 'cls-gap-lg',
  'items-center': 'cls-items-center',
  'justify-between': 'cls-justify-between',
};

export function injectClsThemeToScss(rawScss: string): string {
  let themed = rawScss;

  for (const [original, clsVar] of Object.entries(CLS_VARIABLE_MAP)) {
    const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    themed = themed.replace(new RegExp(escaped, 'gi'), clsVar);
  }

  return themed;
}

export function injectClsThemeToHtml(html: string, uiLibraries: readonly string[]): string {
  let themed = html;

  // Reemplazar componentes MUI por clases CLS
  if (uiLibraries.some((lib) => lib.includes('mui') || lib.includes('material'))) {
    for (const [muiComp, clsClass] of Object.entries(MUI_TO_CLS_MAP)) {
      // <Button → <button class="cls-button"
      themed = themed.replace(
        new RegExp(`<${muiComp}([\\s>])`, 'g'),
        `<div class="${clsClass}"$1`
      );
      themed = themed.replace(
        new RegExp(`</${muiComp}>`, 'g'),
        '</div>'
      );
    }
  }

  // Reemplazar clases Tailwind por clases CLS
  if (uiLibraries.some((lib) => lib.includes('tailwind'))) {
    for (const [twClass, clsClass] of Object.entries(TAILWIND_TO_CLS_MAP)) {
      themed = themed.replace(new RegExp(`\\b${twClass}\\b`, 'g'), clsClass);
    }
  }

  return themed;
}

export function generateClsThemeVariables(): string {
  return `// CLS Design System - Variables CSS
// Importar en styles.scss global de la aplicación

:root {
  // Colores primarios
  --cls-primary: #1a73e8;
  --cls-primary-dark: #1557b0;
  --cls-primary-light: #4a90d9;
  --cls-secondary: #e8453c;
  --cls-accent: #7c3aed;

  // Fondos
  --cls-bg-primary: #ffffff;
  --cls-bg-secondary: #f8f9fa;
  --cls-bg-tertiary: #e8eaed;

  // Texto
  --cls-text-primary: #202124;
  --cls-text-secondary: #5f6368;
  --cls-text-disabled: #9aa0a6;
  --cls-text-inverse: #ffffff;

  // Bordes
  --cls-border-color: #dadce0;
  --cls-border-radius-sm: 4px;
  --cls-border-radius: 8px;
  --cls-border-radius-lg: 16px;
  --cls-border-radius-full: 50%;

  // Spacing
  --cls-spacing-xs: 4px;
  --cls-spacing-sm: 8px;
  --cls-spacing-md: 12px;
  --cls-spacing-lg: 16px;
  --cls-spacing-xl: 24px;
  --cls-spacing-2xl: 32px;

  // Tipografía
  --cls-font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
  --cls-font-size-xs: 0.75rem;
  --cls-font-size-sm: 0.875rem;
  --cls-font-size-base: 1rem;
  --cls-font-size-lg: 1.125rem;
  --cls-font-size-xl: 1.25rem;
  --cls-font-size-2xl: 1.5rem;

  // Sombras
  --cls-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --cls-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  --cls-shadow-lg: 0 4px 6px rgba(0, 0, 0, 0.1);

  // Transiciones
  --cls-transition-fast: 150ms ease;
  --cls-transition-base: 250ms ease;
  --cls-transition-slow: 350ms ease;
}
`;
}
