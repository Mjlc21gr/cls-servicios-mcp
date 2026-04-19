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
 * Convert a JS style object string to CSS properties.
 * e.g. `backgroundColor: 'red', padding: '16px'` → `background-color: red;\npadding: 16px;`
 */
function jsStyleToCSS(jsStyle) {
    const lines = [];
    // Match key: 'value' or key: "value" or key: number patterns
    const propRe = /(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)"|(\d+[\w%]*))/g;
    let match;
    while ((match = propRe.exec(jsStyle)) !== null) {
        const prop = camelToKebab(match[1]);
        const value = match[2] ?? match[3] ?? match[4] ?? '';
        lines.push(`  ${prop}: ${value};`);
    }
    return lines.join('\n');
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
 */
function extractStyledComponents(source) {
    const rules = [];
    let match;
    const re = new RegExp(STYLED_COMPONENT_RE.source, 'g');
    while ((match = re.exec(source)) !== null) {
        const tag = match[1] ?? 'div';
        const css = match[2] ?? '';
        rules.push(`.styled-${tag} {\n${css.trim()}\n}`);
    }
    return rules.join('\n\n');
}
/**
 * Extract CSS from emotion css`` tagged template literals.
 */
function extractEmotionCSS(source) {
    const rules = [];
    let match;
    const re = new RegExp(EMOTION_CSS_RE.source, 'g');
    while ((match = re.exec(source)) !== null) {
        rules.push(match[1].trim());
    }
    return rules.join('\n\n');
}
/**
 * Extract CSS from MUI sx={{ ... }} props.
 */
function extractMuiSx(source) {
    const rules = [];
    let match;
    const re = new RegExp(MUI_SX_RE.source, 'g');
    while ((match = re.exec(source)) !== null) {
        const cssProps = jsStyleToCSS(match[1]);
        if (cssProps.trim()) {
            rules.push(`:host {\n${cssProps}\n}`);
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
   Global Styles — Angular Project
   Generated by migrate_full_project pipeline
   ================================================================= */

/* PrimeNG 19 uses preset themes via providePrimeNG() in app.config.ts */
/* Only primeicons CSS is needed as a direct import */

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