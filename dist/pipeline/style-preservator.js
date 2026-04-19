// =============================================================================
// Style Preservator — Detects style origin and preserves visual identity
// =============================================================================
/**
 * Analyze the React project's styling approach and generate
 * equivalent Angular styles that preserve the visual identity.
 */
export function preserveStyles(scannedProject) {
    const styleFiles = scannedProject.styles;
    const uiLibs = scannedProject.projectMeta.uiLibraries;
    // Detect Tailwind
    const hasTailwind = uiLibs.includes('Tailwind CSS') ||
        styleFiles.some(f => f.content.includes('@tailwind') || f.content.includes('tailwindcss'));
    // Extract global CSS variables and base styles
    const globalCssVars = extractCssVariables(styleFiles);
    const componentStyleMap = extractComponentStyles(scannedProject);
    // Generate global SCSS
    const globalScss = generateGlobalScss(hasTailwind, globalCssVars);
    // Generate Tailwind config if needed
    const tailwindConfig = hasTailwind ? generateTailwindConfig() : null;
    const postcssConfig = hasTailwind ? generatePostcssConfig() : null;
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
            vars.push(rootMatch[1].trim());
        }
        // Extract .dark { --var: value; } blocks
        const darkMatch = file.content.match(/\.dark\s*\{([^}]+)\}/);
        if (darkMatch) {
            vars.push(`/* Dark theme */\n.dark {\n${darkMatch[1].trim()}\n}`);
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
                componentStyles.push(cleanCssForAngular(styleFile.content));
            }
        }
        // Extract inline styles from styled-components
        const styledRe = /styled\.(\w+)`([^`]*)`/g;
        while ((m = styledRe.exec(comp.content)) !== null) {
            componentStyles.push(`.styled-${m[1]} {\n${m[2].trim()}\n}`);
        }
        // Extract emotion css`` blocks
        const emotionRe = /css`([^`]*)`/g;
        while ((m = emotionRe.exec(comp.content)) !== null) {
            componentStyles.push(m[1].trim());
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
    return result.trim();
}
// ---------------------------------------------------------------------------
// Global SCSS generation
// ---------------------------------------------------------------------------
function generateGlobalScss(hasTailwind, cssVars) {
    const lines = [];
    if (hasTailwind) {
        lines.push('@tailwind base;');
        lines.push('@tailwind components;');
        lines.push('@tailwind utilities;');
        lines.push('');
    }
    lines.push('/* PrimeIcons */');
    lines.push('@import "primeicons/primeicons.css";');
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
    return `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
`;
}
function generatePostcssConfig() {
    return `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;
}
//# sourceMappingURL=style-preservator.js.map