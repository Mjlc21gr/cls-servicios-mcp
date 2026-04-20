// =============================================================================
// Style_Aggregator — Extracts and converts CSS from React → Angular .scss
// =============================================================================
import { generateSbPrimeNgTheme } from '../generators/primeng-mapper.generator.js';
// ---------------------------------------------------------------------------
// Regex patterns for CSS extraction
// ---------------------------------------------------------------------------
/** Matches `import './styles.css'` or `import './Component.scss'` */
const CSS_IMPORT_RE = /import\s+['"]([^'"]+\.(?:css|scss|less))['"];?/g;
/** Matches `import styles from './X.module.css'` (CSS Modules) */
const CSS_MODULE_IMPORT_RE = /import\s+(\w+)\s+from\s+['"]([^'"]+\.module\.(?:css|scss|less))['"];?/g;
/** Matches `styles.className` references in JSX/template */
const CSS_MODULE_REF_RE = /\bstyles\.(\w+)/g;
/** Matches styled-components: styled.tag`...` or styled(Component)`...` */
const STYLED_COMPONENT_RE = /styled(?:\.(\w+)|\([^)]+\))\s*`([^`]*)`/g;
/** Matches emotion css`...` */
const EMOTION_CSS_RE = /\bcss\s*`([^`]*)`/g;
/** Matches MUI sx={{ ... }} prop */
const MUI_SX_RE = /\bsx=\{\{([^}]*)\}\}/g;
// ---------------------------------------------------------------------------
// CSS-in-JS property conversion (camelCase → kebab-case)
// ---------------------------------------------------------------------------
function camelToKebab(str) {
    return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
/**
 * Map of common JS style values to Tailwind utility classes.
 * Used to convert inline styles and sx props to Tailwind where possible.
 */
const JS_TO_TAILWIND = {
    display: { flex: 'flex', grid: 'grid', block: 'block', 'inline-flex': 'inline-flex', none: 'hidden' },
    flexDirection: { column: 'flex-col', row: 'flex-row', 'column-reverse': 'flex-col-reverse', 'row-reverse': 'flex-row-reverse' },
    justifyContent: { center: 'justify-center', 'flex-start': 'justify-start', 'flex-end': 'justify-end', 'space-between': 'justify-between', 'space-around': 'justify-around' },
    alignItems: { center: 'items-center', 'flex-start': 'items-start', 'flex-end': 'items-end', stretch: 'items-stretch', baseline: 'items-baseline' },
    textAlign: { center: 'text-center', left: 'text-left', right: 'text-right' },
    fontWeight: { bold: 'font-bold', '600': 'font-semibold', '500': 'font-medium', '400': 'font-normal', '300': 'font-light' },
    overflow: { hidden: 'overflow-hidden', auto: 'overflow-auto', scroll: 'overflow-scroll' },
    position: { relative: 'relative', absolute: 'absolute', fixed: 'fixed', sticky: 'sticky' },
    cursor: { pointer: 'cursor-pointer', 'not-allowed': 'cursor-not-allowed', default: 'cursor-default' },
};
/**
 * Convert spacing values (px, rem) to Tailwind spacing scale.
 */
function spacingToTailwind(value) {
    const pxMatch = value.match(/^(\d+)px$/);
    if (pxMatch) {
        const px = parseInt(pxMatch[1], 10);
        const scale = {
            0: '0', 1: 'px', 2: '0.5', 4: '1', 6: '1.5', 8: '2', 10: '2.5',
            12: '3', 14: '3.5', 16: '4', 20: '5', 24: '6', 28: '7', 32: '8',
            36: '9', 40: '10', 44: '11', 48: '12', 56: '14', 64: '16', 80: '20', 96: '24',
        };
        return scale[px] ?? null;
    }
    const remMatch = value.match(/^([\d.]+)rem$/);
    if (remMatch) {
        const rem = parseFloat(remMatch[1]);
        const px = rem * 16;
        return spacingToTailwind(`${px}px`);
    }
    return null;
}
/**
 * Try to convert a JS style property+value to a Tailwind class.
 * Returns the class string or null if no mapping exists.
 */
function jsStyleToTailwindClass(prop, value) {
    // Direct mapping
    if (JS_TO_TAILWIND[prop]?.[value]) {
        return JS_TO_TAILWIND[prop][value];
    }
    // Spacing properties
    const spacingProps = {
        padding: 'p', paddingTop: 'pt', paddingBottom: 'pb', paddingLeft: 'pl', paddingRight: 'pr',
        margin: 'm', marginTop: 'mt', marginBottom: 'mb', marginLeft: 'ml', marginRight: 'mr',
        gap: 'gap', rowGap: 'gap-y', columnGap: 'gap-x',
    };
    if (spacingProps[prop]) {
        const tw = spacingToTailwind(value);
        if (tw)
            return `${spacingProps[prop]}-${tw}`;
    }
    // Width/height
    if (prop === 'width' || prop === 'height') {
        const prefix = prop === 'width' ? 'w' : 'h';
        if (value === '100%')
            return `${prefix}-full`;
        if (value === 'auto')
            return `${prefix}-auto`;
        if (value === '100vw')
            return `${prefix}-screen`;
        if (value === '100vh')
            return `${prefix}-screen`;
        const tw = spacingToTailwind(value);
        if (tw)
            return `${prefix}-${tw}`;
    }
    // Border radius
    if (prop === 'borderRadius') {
        if (value === '50%' || value === '9999px')
            return 'rounded-full';
        const tw = spacingToTailwind(value);
        if (tw)
            return `rounded-${tw}`;
        return 'rounded';
    }
    return null;
}
/**
 * Convert a JS style object string to CSS properties.
 * e.g. `backgroundColor: 'red', padding: '16px'` → `background-color: red;\npadding: 16px;`
 */
function jsStyleToCSS(jsStyle) {
    const lines = [];
    const propRe = /(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)"|(\d+[\w%]*))/g;
    let match;
    while ((match = propRe.exec(jsStyle)) !== null) {
        const prop = camelToKebab(match[1]);
        const value = match[2] ?? match[3] ?? match[4] ?? '';
        lines.push(`  ${prop}: ${value};`);
    }
    return lines.join('\n');
}
/**
 * Convert a JS style object to Tailwind classes where possible,
 * and return remaining CSS for properties that can't be mapped.
 */
function jsStyleToTailwindAndCSS(jsStyle) {
    const tailwindClasses = [];
    const remainingCSS = [];
    const propRe = /(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)"|(\d+[\w%]*))/g;
    let match;
    while ((match = propRe.exec(jsStyle)) !== null) {
        const prop = match[1];
        const value = match[2] ?? match[3] ?? match[4] ?? '';
        const twClass = jsStyleToTailwindClass(prop, value);
        if (twClass) {
            tailwindClasses.push(twClass);
        }
        else {
            remainingCSS.push(`  ${camelToKebab(prop)}: ${value};`);
        }
    }
    return { tailwindClasses, remainingCSS: remainingCSS.join('\n') };
}
// ---------------------------------------------------------------------------
// Style scoping
// ---------------------------------------------------------------------------
/**
 * Scope CSS rules under `:host` for Angular component encapsulation.
 */
function scopeUnderHost(css) {
    const trimmed = css.trim();
    if (trimmed.length === 0)
        return '';
    return `:host {\n${trimmed}\n}`;
}
// ---------------------------------------------------------------------------
// CSS Module handling
// ---------------------------------------------------------------------------
/**
 * Convert `styles.className` references to plain `.className` in template HTML.
 */
function convertCssModuleRefs(html) {
    return html.replace(CSS_MODULE_REF_RE, '$1');
}
// ---------------------------------------------------------------------------
// LESS → SCSS variable conversion
// ---------------------------------------------------------------------------
/**
 * Convert LESS variables (@var: value) to SCSS variables ($var: value).
 */
function lessToScss(lessContent) {
    return lessContent.replace(/@(\w[\w-]*)\s*:/g, '$$$$1:');
}
// ---------------------------------------------------------------------------
// Style file resolution
// ---------------------------------------------------------------------------
/**
 * Resolve a relative import path to a scanned style file.
 */
function resolveStyleFile(importPath, componentPath, styleFiles) {
    // Normalize the import path relative to the component
    const componentDir = componentPath.replace(/[^/]+$/, '');
    const resolvedPath = normalizePath(componentDir + importPath);
    for (const style of styleFiles) {
        if (style.path === resolvedPath || style.path.endsWith(importPath)) {
            return style.content;
        }
    }
    return undefined;
}
/**
 * Simple path normalization: resolve ./ and ../ segments.
 */
function normalizePath(path) {
    const parts = path.split('/').filter((p) => p !== '.');
    const resolved = [];
    for (const part of parts) {
        if (part === '..') {
            resolved.pop();
        }
        else {
            resolved.push(part);
        }
    }
    return resolved.join('/');
}
// ---------------------------------------------------------------------------
// CSS-in-JS extraction
// ---------------------------------------------------------------------------
/**
 * Extract CSS from styled-components tagged template literals.
 * Converts to proper SCSS with semantic class names.
 */
function extractStyledComponents(source) {
    const rules = [];
    let match;
    const re = new RegExp(STYLED_COMPONENT_RE.source, 'g');
    while ((match = re.exec(source)) !== null) {
        const tag = match[1] ?? 'div';
        let css = match[2] ?? '';
        // Convert interpolations ${props => ...} to CSS custom properties
        css = css.replace(/\$\{[^}]*\}/g, 'var(--dynamic-value)');
        // Convert nested & selectors (styled-components syntax → SCSS)
        // Already valid SCSS syntax, just clean up
        css = css.trim();
        if (css) {
            rules.push(`:host ${tag} {\n  ${css.replace(/\n/g, '\n  ')}\n}`);
        }
    }
    return rules.join('\n\n');
}
/**
 * Extract CSS from emotion css`` tagged template literals.
 * Scopes under :host for Angular component encapsulation.
 */
function extractEmotionCSS(source) {
    const rules = [];
    let match;
    const re = new RegExp(EMOTION_CSS_RE.source, 'g');
    while ((match = re.exec(source)) !== null) {
        let css = match[1].trim();
        // Convert interpolations to CSS custom properties
        css = css.replace(/\$\{[^}]*\}/g, 'var(--dynamic-value)');
        if (css) {
            rules.push(`:host {\n  ${css.replace(/\n/g, '\n  ')}\n}`);
        }
    }
    return rules.join('\n\n');
}
/**
 * Extract CSS from MUI sx={{ ... }} props.
 * Converts to Tailwind classes where possible, remaining goes to SCSS.
 */
function extractMuiSx(source) {
    const rules = [];
    let match;
    const re = new RegExp(MUI_SX_RE.source, 'g');
    while ((match = re.exec(source)) !== null) {
        const { tailwindClasses, remainingCSS } = jsStyleToTailwindAndCSS(match[1]);
        // Tailwind classes are added to the template by the template generator
        // Here we only emit the CSS that couldn't be converted
        if (remainingCSS.trim()) {
            rules.push(`:host {\n${remainingCSS}\n}`);
        }
        // Store tailwind classes as a comment for reference
        if (tailwindClasses.length > 0) {
            rules.push(`/* Tailwind equivalent: ${tailwindClasses.join(' ')} */`);
        }
    }
    return rules.join('\n\n');
}
// ---------------------------------------------------------------------------
// Global styles generation
// ---------------------------------------------------------------------------
/**
 * Generate the global `src/styles.scss` content.
 */
function generateGlobalStyles(_options) {
    return `/* =================================================================
   Global Styles — Angular 20 + PrimeNG 21 + Tailwind v4
   Generated by migrate_full_project pipeline
   ================================================================= */

/* PrimeNG 21 uses preset themes via providePrimeNG() in app.config.ts */

/* Seguros Bolívar Design System Theme */
@use './styles/sb-primeng-theme';

/* Global resets */
*,
*::before,
*::after {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  font-family: var(--sb-font-family, 'Montserrat', 'Segoe UI', system-ui, sans-serif);
  font-size: var(--sb-font-size-base, 1rem);
  color: var(--sb-gray-900, #212529);
  background-color: var(--sb-white, #ffffff);
}

:focus-visible {
  outline: 2px solid var(--sb-primary, #0066cc);
  outline-offset: 2px;
}

html { scroll-behavior: smooth; }
`;
}
// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
/**
 * Aggregates styles from the React project into Angular .component.scss files.
 *
 * 1. For each component, find CSS/SCSS/LESS files imported by the React source
 * 2. Read those style files from scannedProject.styles
 * 3. Scope rules under `:host` and merge into the component's .scss
 * 4. Handle CSS Modules: convert `styles.className` refs to plain `.className`
 * 5. Preserve layout (flexbox, grid), media queries, animations verbatim
 * 6. Generate global `src/styles.scss` importing PrimeNG theme + SB theme
 * 7. Generate SB PrimeNG theme file
 */
export function aggregateStyles(scannedProject, transformedComponents, options) {
    const componentStyles = new Map();
    for (const [key, component] of transformedComponents) {
        const scssChunks = [];
        // Start with existing component SCSS if any
        if (component.componentScss.trim().length > 0) {
            scssChunks.push(component.componentScss);
        }
        // Find the original React source to scan for CSS imports
        const originalFile = scannedProject.components.find((f) => f.path === component.originalPath);
        const reactSource = originalFile?.content ?? '';
        // Extract plain CSS/SCSS/LESS imports
        let importMatch;
        const cssImportRe = new RegExp(CSS_IMPORT_RE.source, 'g');
        while ((importMatch = cssImportRe.exec(reactSource)) !== null) {
            const importPath = importMatch[1];
            const styleContent = resolveStyleFile(importPath, component.originalPath, scannedProject.styles);
            if (styleContent) {
                const processed = importPath.endsWith('.less')
                    ? lessToScss(styleContent)
                    : styleContent;
                scssChunks.push(scopeUnderHost(processed));
            }
        }
        // Extract CSS Module imports and convert references
        const cssModuleRe = new RegExp(CSS_MODULE_IMPORT_RE.source, 'g');
        while ((importMatch = cssModuleRe.exec(reactSource)) !== null) {
            const importPath = importMatch[2];
            const styleContent = resolveStyleFile(importPath, component.originalPath, scannedProject.styles);
            if (styleContent) {
                scssChunks.push(scopeUnderHost(styleContent));
            }
        }
        // Extract CSS-in-JS: styled-components
        const styledCSS = extractStyledComponents(reactSource);
        if (styledCSS.trim()) {
            scssChunks.push(styledCSS);
        }
        // Extract CSS-in-JS: emotion
        const emotionCSS = extractEmotionCSS(reactSource);
        if (emotionCSS.trim()) {
            scssChunks.push(emotionCSS);
        }
        // Extract CSS-in-JS: MUI sx prop
        const muiCSS = extractMuiSx(reactSource);
        if (muiCSS.trim()) {
            scssChunks.push(muiCSS);
        }
        componentStyles.set(key, scssChunks.join('\n\n'));
    }
    // Convert CSS Module references in component HTML
    // (This is informational — actual template updates happen in the pipeline)
    for (const [key, component] of transformedComponents) {
        const updatedHtml = convertCssModuleRefs(component.componentHtml);
        if (updatedHtml !== component.componentHtml) {
            // Store the converted HTML info alongside styles
            const existing = componentStyles.get(key) ?? '';
            componentStyles.set(key, existing);
        }
    }
    const globalStyles = generateGlobalStyles(options);
    const themeFile = generateSbPrimeNgTheme();
    return {
        componentStyles,
        globalStyles,
        themeFile,
    };
}
//# sourceMappingURL=style-aggregator.js.map