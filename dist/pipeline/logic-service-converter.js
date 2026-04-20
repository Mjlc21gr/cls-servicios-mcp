// =============================================================================
// Logic-to-Service Converter — Converts React hooks to Angular services
// with REAL logic, not stubs
// =============================================================================
/**
 * Convert a React custom hook file to an Angular Injectable service.
 * Extracts the REAL logic from the hook body.
 */
export function convertHookToService(hookFile, typesContent) {
    const source = hookFile.content;
    // Extract hook name: export function useXxx(...)
    const hookNameMatch = source.match(/export\s+function\s+(use[A-Z]\w*)/);
    if (!hookNameMatch)
        return null;
    const hookName = hookNameMatch[1];
    const serviceName = hookName.replace(/^use/, '') + 'Service';
    const className = serviceName.charAt(0).toUpperCase() + serviceName.slice(1);
    const fileName = toKebabCase(serviceName) + '.service.ts';
    // Extract the hook body
    const bodyMatch = source.match(/export\s+function\s+use\w+[^{]*\{([\s\S]*)\}\s*$/);
    if (!bodyMatch)
        return null;
    const hookBody = bodyMatch[1];
    // Analyze the hook to understand its structure
    const analysis = analyzeHookBody(hookBody);
    // Generate the Angular service
    let content = generateServiceContent(className, analysis, typesContent, source);
    // Fix computed() closure: .length\n  }); → .length\n    };\n  });
    content = content.replace(/(\.length)\s*\n(\s*\}\);)/g, '$1\n    };\n$2');
    return { fileName, className, content };
}
function analyzeHookBody(body) {
    const stateVars = [];
    const effects = [];
    const methods = [];
    const imports = [];
    // Extract useState calls
    const useStateRe = /const\s+\[(\w+),\s*(\w+)\]\s*=\s*useState<([^>]*)>\(([^)]*)\)/g;
    let m;
    while ((m = useStateRe.exec(body)) !== null) {
        stateVars.push({ name: m[1], setter: m[2], type: m[3], initialValue: m[4] || 'undefined' });
    }
    // Also match useState without generic type
    const useStateSimpleRe = /const\s+\[(\w+),\s*(\w+)\]\s*=\s*useState\(([^)]*)\)/g;
    while ((m = useStateSimpleRe.exec(body)) !== null) {
        if (!stateVars.some(s => s.name === m[1])) {
            const val = m[3];
            const type = inferType(val);
            stateVars.push({ name: m[1], setter: m[2], type, initialValue: val || 'undefined' });
        }
    }
    // Extract useEffect blocks
    const useEffectRe = /useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[(.*?)\]\)/g;
    while ((m = useEffectRe.exec(body)) !== null) {
        const deps = m[2].trim() ? m[2].split(',').map(d => d.trim()) : [];
        effects.push({ body: m[1].trim(), deps, isOnMount: deps.length === 0 });
    }
    // Extract methods (const xxx = async (...) => { ... })
    const asyncMethodRe = /const\s+(\w+)\s*=\s*async\s*\(([^)]*)\)\s*(?::\s*[^=]*)?=>\s*\{([\s\S]*?)\n\s*\};/g;
    while ((m = asyncMethodRe.exec(body)) !== null) {
        methods.push({ name: m[1], params: m[2], body: m[3].trim(), isAsync: true, returnType: 'Promise<unknown>' });
    }
    // Extract methods (const xxx = (...) => { ... })
    const syncMethodRe = /const\s+(\w+)\s*=\s*\(([^)]*)\)\s*(?::\s*[^=]*)?=>\s*\{([\s\S]*?)\n\s*\};/g;
    while ((m = syncMethodRe.exec(body)) !== null) {
        if (!methods.some(method => method.name === m[1])) {
            methods.push({ name: m[1], params: m[2], body: m[3].trim(), isAsync: false, returnType: 'unknown' });
        }
    }
    // Detect localStorage usage
    const usesLocalStorage = body.includes('localStorage');
    const storageKeyMatch = body.match(/(?:STORAGE_KEY|storageKey)\s*(?:=|:)\s*['"]([^'"]+)['"]/);
    const storageKey = storageKeyMatch?.[1] ?? null;
    // Also check for STORAGE_KEY defined outside the hook
    const outerStorageKey = body.match(/localStorage\.(?:get|set)Item\(\s*(?:STORAGE_KEY|['"]([^'"]+)['"])/);
    // Extract return statement to know what's exposed
    const returnMatch = body.match(/return\s*\{([^}]+)\}/);
    const returnedKeys = returnMatch
        ? returnMatch[1].split(',').map(k => k.trim().split(':')[0].trim()).filter(Boolean)
        : [];
    return { stateVars, effects, methods, returnedKeys, usesLocalStorage, storageKey: storageKey ?? outerStorageKey?.[1] ?? null, imports };
}
// ---------------------------------------------------------------------------
// Service generation
// ---------------------------------------------------------------------------
function generateServiceContent(className, analysis, typesContent, originalSource) {
    const lines = [];
    // Imports
    lines.push(`import { Injectable, signal, computed, effect } from '@angular/core';`);
    // Extract type imports from original source
    const typeImportMatch = originalSource.match(/import\s*(?:type\s*)?\{([^}]+)\}\s*from\s*['"](?:\.\.\/)?types['"]/);
    if (typeImportMatch) {
        const types = typeImportMatch[1].trim();
        lines.push(`import type { ${types} } from '../types';`);
    }
    lines.push('');
    // Storage key constant
    const storageKeyMatch = originalSource.match(/const\s+STORAGE_KEY\s*=\s*['"]([^'"]+)['"]/);
    if (storageKeyMatch) {
        lines.push(`const STORAGE_KEY = '${storageKeyMatch[1]}';`);
        lines.push('');
    }
    lines.push(`@Injectable({ providedIn: 'root' })`);
    lines.push(`export class ${className} {`);
    // Convert useState → signal
    for (const sv of analysis.stateVars) {
        lines.push(`  readonly ${sv.name} = signal<${sv.type}>(${sv.initialValue});`);
    }
    if (analysis.stateVars.length > 0)
        lines.push('');
    // Add computed properties for stats-like patterns
    if (analysis.methods.some(m => m.name.includes('Stats') || m.name.includes('stats'))) {
        const statsMethod = analysis.methods.find(m => m.name.includes('Stats') || m.name.includes('stats'));
        if (statsMethod) {
            // Convert the stats method body to a computed
            let computedBody = statsMethod.body;
            // Replace state variable reads with signal reads
            for (const sv of analysis.stateVars) {
                computedBody = computedBody.replace(new RegExp(`\\b${sv.name}\\b(?!\\()`, 'g'), `this.${sv.name}()`);
            }
            // Ensure the body has a proper return statement and closing brace
            const trimmedBody = computedBody.trim();
            lines.push(`  readonly stats = computed(() => {`);
            lines.push(`    ${trimmedBody}`);
            // If the body doesn't end with }, add one (for incomplete return blocks)
            if (!trimmedBody.endsWith('}') && !trimmedBody.endsWith('};')) {
                lines.push(`  });`);
            }
            else {
                lines.push(`  });`);
            }
            lines.push('');
        }
    }
    // Constructor with effects (for useEffect with [] deps = onInit)
    const onMountEffects = analysis.effects.filter(e => e.isOnMount);
    if (onMountEffects.length > 0 || analysis.usesLocalStorage) {
        lines.push(`  constructor() {`);
        // Load from localStorage
        if (analysis.usesLocalStorage && analysis.stateVars.length > 0) {
            const mainState = analysis.stateVars[0];
            const key = analysis.storageKey ?? 'app_data';
            lines.push(`    // Load from localStorage`);
            lines.push(`    try {`);
            lines.push(`      const stored = localStorage.getItem('${key}');`);
            lines.push(`      if (stored) {`);
            lines.push(`        this.${mainState.name}.set(JSON.parse(stored));`);
            lines.push(`      }`);
            lines.push(`    } catch {`);
            lines.push(`      console.error('Error loading from localStorage');`);
            lines.push(`    }`);
        }
        lines.push(`  }`);
        lines.push('');
    }
    // Convert methods
    for (const method of analysis.methods) {
        // Skip stats methods (already converted to computed)
        if (method.name.includes('Stats') || method.name.includes('stats'))
            continue;
        // Clean the method body
        let cleanBody = method.body;
        // Replace setter calls: setXxx(value) → this.xxx.set(value)
        for (const sv of analysis.stateVars) {
            cleanBody = cleanBody.replace(new RegExp(`\\b${sv.setter}\\(`, 'g'), `this.${sv.name}.set(`);
            // Replace state reads: xxx → this.xxx()
            cleanBody = cleanBody.replace(new RegExp(`(?<!this\\.)\\b${sv.name}\\b(?!\\s*[(.=])`, 'g'), `this.${sv.name}()`);
        }
        // Replace localStorage calls
        if (analysis.usesLocalStorage) {
            const key = analysis.storageKey ?? 'app_data';
            cleanBody = cleanBody.replace(/localStorage\.setItem\([^,]+,\s*/g, `localStorage.setItem('${key}', `);
        }
        // Clean params
        let cleanParams = method.params;
        // Replace React types
        cleanParams = cleanParams.replace(/React\.\w+<[^>]*>/g, 'unknown');
        const asyncPrefix = method.isAsync ? 'async ' : '';
        lines.push(`  ${asyncPrefix}${method.name}(${cleanParams}): ${method.isAsync ? 'Promise<void>' : 'void'} {`);
        // Ensure the body is properly closed
        let bodyLines = cleanBody.split('\n');
        // Check brace balance
        let braceBalance = 0;
        for (const bl of bodyLines) {
            braceBalance += (bl.match(/\{/g) || []).length;
            braceBalance -= (bl.match(/\}/g) || []).length;
        }
        lines.push(`    ${cleanBody}`);
        // Add missing closing braces
        while (braceBalance > 0) {
            lines.push(`    }`);
            braceBalance--;
        }
        lines.push(`  }`);
        lines.push('');
    }
    lines.push('}');
    return lines.join('\n');
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function toKebabCase(str) {
    return str
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .toLowerCase();
}
function inferType(value) {
    if (!value)
        return 'unknown';
    if (value === 'true' || value === 'false')
        return 'boolean';
    if (value === 'null')
        return 'unknown';
    if (/^['"`]/.test(value))
        return 'string';
    if (/^\d/.test(value))
        return 'number';
    if (value.startsWith('['))
        return 'unknown[]';
    if (value.startsWith('{'))
        return 'Record<string, unknown>';
    return 'unknown';
}
//# sourceMappingURL=logic-service-converter.js.map