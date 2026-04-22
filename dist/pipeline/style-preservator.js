// =============================================================================
// Style Preservator — Detects style origin and preserves visual identity
// =============================================================================
/**
 * Analyze the React project's styling approach and generate
 * equivalent Angular styles that preserve the visual identity.
 *
 * Handles:
 * - Plain CSS/SCSS/LESS imports → component SCSS
 * - CSS Modules → scoped SCSS
 * - styled-components → extracted SCSS
 * - emotion css`` → extracted SCSS
 * - Tailwind classes → preserved in templates (no conversion needed)
 * - CSS variables → preserved in global :root
 * - Inline style objects → converted to Tailwind or SCSS
 */
export function preserveStyles(scannedProject) {
    const styleFiles = scannedProject.styles;
    const uiLibs = scannedProject.projectMeta.uiLibraries;
    // Detect Tailwind (always true for CLS projects, but detect from source too)
    const hasTailwind = true; // CLS standard: always use Tailwind
    // Extract global CSS variables and base styles
    const globalCssVars = extractCssVariables(styleFiles);
    const componentStyleMap = extractComponentStyles(scannedProject);
    // Generate global SCSS
    const globalScss = generateGlobalScss(hasTailwind, globalCssVars);
    // Always generate Tailwind config
    const tailwindConfig = generateTailwindConfig();
    const postcssConfig = generatePostcssConfig();
    return {
        globalScss,
        componentStyles: componentStyleMap,
        hasTailwind,
        tailwindConfig,
        postcssConfig,
    };
}
// ---------------------------------------------------------------------------
// CSS Variable extraction
// ---------------------------------------------------------------------------
function extractCssVariables(styleFiles) {
    const vars = [];
    for (const file of styleFiles) {
        // Extract :root { --var: value; } blocks
        const rootMatch = file.content.match(/:root\s*\{([^}]+)\}/);
        if (rootMatch) {
            vars.push(`:root {\n${rootMatch[1].trim()}\n}`);
        }
        // Extract .dark { --var: value; } blocks
        const darkMatch = file.content.match(/\.dark\s*\{([^}]+)\}/);
        if (darkMatch) {
            vars.push(`.dark {\n${darkMatch[1].trim()}\n}`);
        }
        // Extract @theme inline { --var: value; } blocks (Tailwind v4 / shadcn)
        const themeMatch = file.content.match(/@theme\s+inline\s*\{([\s\S]*?)\}/);
        if (themeMatch) {
            // Convert @theme inline vars to :root CSS variables
            const themeVars = themeMatch[1].trim();
            vars.push(`/* Tailwind theme variables */\n:root {\n${themeVars}\n}`);
        }
        // Extract @layer base { :root { } .dark { } } blocks (shadcn)
        const layerBaseRe = /@layer\s+base\s*\{([\s\S]*?)\}\s*\}/g;
        let layerMatch;
        while ((layerMatch = layerBaseRe.exec(file.content)) !== null) {
            const layerContent = layerMatch[1];
            // Extract :root inside @layer base
            const innerRoot = layerContent.match(/:root\s*\{([^}]+)\}/);
            if (innerRoot) {
                vars.push(`:root {\n${innerRoot[1].trim()}\n}`);
            }
            const innerDark = layerContent.match(/\.dark\s*\{([^}]+)\}/);
            if (innerDark) {
                vars.push(`.dark {\n${innerDark[1].trim()}\n}`);
            }
        }
    }
    return vars.join('\n\n');
}
// ---------------------------------------------------------------------------
// Component-level style extraction
// ---------------------------------------------------------------------------
function extractComponentStyles(scannedProject) {
    const styles = new Map();
    for (const comp of scannedProject.components) {
        const componentStyles = [];
        // Find CSS/SCSS imports in the component
        const cssImportRe = /import\s+['"]([^'"]+\.(?:css|scss|less))['"];?/g;
        let m;
        while ((m = cssImportRe.exec(comp.content)) !== null) {
            const importPath = m[1];
            // Find the matching style file
            const styleFile = scannedProject.styles.find(s => s.path.endsWith(importPath.replace('./', '')) ||
                s.path.includes(importPath.replace('./', '')));
            if (styleFile) {
                componentStyles.push(cleanCssForAngular(styleFile.content));
            }
        }
        // Find CSS Module imports: import styles from './X.module.css'
        const moduleImportRe = /import\s+(\w+)\s+from\s+['"]([^'"]+\.module\.(?:css|scss))['"];?/g;
        while ((m = moduleImportRe.exec(comp.content)) !== null) {
            const styleFile = scannedProject.styles.find(s => s.path.endsWith(m[2].replace('./', '')));
            if (styleFile) {
                // CSS Modules → scope under :host for Angular encapsulation
                componentStyles.push(`:host {\n${cleanCssForAngular(styleFile.content)}\n}`);
            }
        }
        // Extract inline styles from styled-components
        const styledRe = /styled\.(\w+)`([^`]*)`/g;
        while ((m = styledRe.exec(comp.content)) !== null) {
            let css = m[2].trim();
            // Convert interpolations to CSS custom properties
            css = css.replace(/\$\{[^}]*\}/g, 'var(--dynamic-value)');
            componentStyles.push(`:host ${m[1]} {\n  ${css.replace(/\n/g, '\n  ')}\n}`);
        }
        // Extract emotion css`` blocks
        const emotionRe = /css`([^`]*)`/g;
        while ((m = emotionRe.exec(comp.content)) !== null) {
            let css = m[1].trim();
            css = css.replace(/\$\{[^}]*\}/g, 'var(--dynamic-value)');
            if (css) {
                componentStyles.push(`:host {\n  ${css.replace(/\n/g, '\n  ')}\n}`);
            }
        }
        // Extract MUI makeStyles / useStyles
        const makeStylesRe = /makeStyles\(\s*\(\s*\w*\s*\)\s*=>\s*\(\{([\s\S]*?)\}\)\s*\)/g;
        while ((m = makeStylesRe.exec(comp.content)) !== null) {
            const stylesObj = m[1];
            // Parse each class: className: { prop: value }
            const classRe = /(\w+)\s*:\s*\{([^}]*)\}/g;
            let classMatch;
            while ((classMatch = classRe.exec(stylesObj)) !== null) {
                const className = classMatch[1];
                const props = classMatch[2];
                const cssProps = props.replace(/(\w+)\s*:\s*['"]?([^,'"]+)['"]?,?/g, (_, p, v) => {
                    return `  ${p.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`)}: ${v.trim()};\n`;
                });
                componentStyles.push(`.${className} {\n${cssProps}}`);
            }
        }
        if (componentStyles.length > 0) {
            // Extract component name from file
            const nameMatch = comp.content.match(/(?:export\s+(?:default\s+)?function|export\s+const)\s+(\w+)/);
            if (nameMatch) {
                styles.set(nameMatch[1], componentStyles.join('\n\n'));
            }
        }
    }
    return styles;
}
// ---------------------------------------------------------------------------
// CSS cleanup for Angular
// ---------------------------------------------------------------------------
function cleanCssForAngular(css) {
    let result = css;
    // Remove Tailwind directives (handled by global styles)
    result = result.replace(/@import\s+["']tailwindcss["'];?\s*/g, '');
    result = result.replace(/@tailwind\s+\w+;\s*/g, '');
    result = result.replace(/@import\s+["']tw-animate-css["'];?\s*/g, '');
    result = result.replace(/@import\s+["']shadcn\/tailwind\.css["'];?\s*/g, '');
    result = result.replace(/@import\s+["']@fontsource[^"']*["'];?\s*/g, '');
    // Remove @custom-variant (Tailwind v4 specific)
    result = result.replace(/@custom-variant[^;]*;\s*/g, '');
    // Remove @theme inline blocks (Tailwind v4 specific)
    result = result.replace(/@theme\s+inline\s*\{[\s\S]*?\}\s*/g, '');
    // Remove @layer base blocks with @apply (Tailwind specific)
    result = result.replace(/@layer\s+base\s*\{[\s\S]*?\}\s*/g, '');
    // Preserve CSS custom properties as-is (don't rename)
    // React projects use --background, --foreground, etc. that Tailwind/shadcn need
    // Remove React-specific comments
    result = result.replace(/\/\*\s*@refresh\s*\*\//g, '');
    return result.trim();
}
// ---------------------------------------------------------------------------
// Global SCSS generation
// ---------------------------------------------------------------------------
function generateGlobalScss(hasTailwind, cssVars) {
    const lines = [];
    if (cssVars) {
        lines.push('/* CSS Variables from React project */');
        lines.push(cssVars);
        lines.push('');
    }
    lines.push('/* Base styles */');
    lines.push('html, body {');
    lines.push('  margin: 0;');
    lines.push('  padding: 0;');
    lines.push("  font-family: var(--font-sans, 'Segoe UI', system-ui, -apple-system, sans-serif);");
    lines.push('}');
    lines.push('');
    lines.push('');
    if (cssVars) {
        lines.push('/* CSS Variables from React project */');
        lines.push(`:root {\n${cssVars}\n}`);
        lines.push('');
    }
    lines.push('/* Base styles */');
    lines.push('html, body {');
    lines.push('  margin: 0;');
    lines.push('  padding: 0;');
    lines.push("  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;");
    lines.push('}');
    lines.push('');
    return lines.join('\n');
}
// ---------------------------------------------------------------------------
// Tailwind config generation
// ---------------------------------------------------------------------------
function generateTailwindConfig() {
    // Tailwind v4 uses CSS-first config — no tailwind.config.js needed
    // Return empty string so the orchestrator doesn't write this file
    return '';
}
function generatePostcssConfig() {
    // Tailwind v4 + Angular 20 uses .postcssrc.json (generated by scaffolder)
    // Return empty string so the orchestrator doesn't overwrite it
    return '';
}
//# sourceMappingURL=style-preservator.js.map