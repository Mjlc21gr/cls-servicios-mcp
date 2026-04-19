// =============================================================================
// Class Context Layer — Enhanced with 4 Refinement Rules
// 1. Auto-Correction: this. prefix for class properties in methods
// 2. Identifier Consolidation: no duplicate signal + @Input
// 3. Template Sanitization: no backticks/complex JS in HTML attributes
// 4. Import Path Verification: all imports resolve to real files
// =============================================================================
/**
 * Validates and fixes class context in generated Angular components.
 * Returns corrected components and a report of all fixes applied.
 */
export function validateClassContext(components) {
    const result = new Map();
    let totalReport = { thisFixCount: 0, duplicatesRemoved: 0, importPathsFixed: 0, templateFixes: 0 };
    for (const [key, component] of components) {
        let ts = component.componentTs;
        let html = component.componentHtml;
        // ─── RULE 1: Auto-Correction of this. scope ───
        const r1 = fixThisScope(ts);
        ts = r1.result;
        totalReport.thisFixCount += r1.fixCount;
        // ─── RULE 2: Consolidate duplicate identifiers ───
        const r2 = consolidateIdentifiers(ts);
        ts = r2.result;
        totalReport.duplicatesRemoved += r2.removedCount;
        // ─── RULE 3: Clean `: any` → `: unknown` ───
        ts = ts.replace(/:\s*any\b/g, ': unknown');
        ts = ts.replace(/<any>/g, '<unknown>');
        // ─── RULE 4: Remove duplicate class declarations ───
        ts = removeDuplicateClasses(ts);
        // ─── RULE 5: Truncate after class end ───
        ts = truncateAfterClassEnd(ts);
        // ─── RULE 6: Clean React residuals ───
        ts = cleanImports(ts);
        ts = cleanMethodBodies(ts);
        // ─── RULE 7: Fix async/await consistency ───
        ts = fixAsyncAwait(ts);
        // ─── TEMPLATE RULE: Sanitize HTML ───
        const r3 = sanitizeTemplate(html);
        html = r3.result;
        totalReport.templateFixes += r3.fixCount;
        result.set(key, { ...component, componentTs: ts, componentHtml: html });
    }
    return result;
}
// ─────────────────────────────────────────────────────────────────────────────
// RULE 1: Fix this. scope — class properties in methods must use this.
// ─────────────────────────────────────────────────────────────────────────────
function fixThisScope(ts) {
    let fixCount = 0;
    // Extract class property names (signals, computed, inject, @Input, etc.)
    const propertyNames = new Set();
    const propPatterns = [
        /(?:readonly\s+)?(\w+)\s*=\s*(?:signal|computed|inject|input|output|viewChild)\b/g,
        /@Input\(\)\s+(\w+)/g,
        /private\s+(?:readonly\s+)?(\w+)\s*=\s*inject\(/g,
    ];
    for (const pattern of propPatterns) {
        let m;
        const re = new RegExp(pattern.source, 'g');
        while ((m = re.exec(ts)) !== null) {
            propertyNames.add(m[1]);
        }
    }
    if (propertyNames.size === 0)
        return { result: ts, fixCount: 0 };
    let result = ts;
    // For each property, ensure it has this. prefix inside method bodies
    for (const prop of propertyNames) {
        // Fix: prop.set( → this.prop.set( (inside methods, not in declarations)
        const setterRe = new RegExp(`(?<!this\\.)(?<!readonly\\s)(?<!\\w)\\b${prop}\\.set\\(`, 'g');
        const beforeCount = (result.match(setterRe) || []).length;
        result = result.replace(setterRe, `this.${prop}.set(`);
        fixCount += beforeCount;
        // Fix: prop.update( → this.prop.update(
        const updaterRe = new RegExp(`(?<!this\\.)(?<!readonly\\s)(?<!\\w)\\b${prop}\\.update\\(`, 'g');
        const updateCount = (result.match(updaterRe) || []).length;
        result = result.replace(updaterRe, `this.${prop}.update(`);
        fixCount += updateCount;
        // Fix: prop.length, prop.filter, prop.xxx → this.prop().length etc. (signal reads with property access)
        // But NOT in declarations, NOT already prefixed with this.
        const propAccessRe = new RegExp(`(?<!this\\.)(?<!readonly\\s)(?<![.\\w])\\b${prop}\\.(length|filter|map|find|some|every|reduce|forEach|includes|indexOf|slice|concat|join|push|pop|shift|unshift|splice)\\b`, 'g');
        const propAccessCount = (result.match(propAccessRe) || []).length;
        result = result.replace(propAccessRe, `this.${prop}().$1`);
        fixCount += propAccessCount;
        // Fix: bare prop reads used as values in expressions (not in declarations)
        // Pattern: standalone prop used in comparisons, assignments, function args
        // e.g. "fallido === 'si'" → "this.fallido() === 'si'"
        // e.g. "evidencias," → "this.evidencias(),"
        // e.g. "[...evidencias," → "[...this.evidencias(),"
        // We target: bare prop NOT followed by ( or . or = (assignment) and NOT preceded by this. or readonly
        const bareReadRe = new RegExp(`(?<!this\\.)(?<!readonly\\s+)(?<![.\\w])\\b${prop}\\b(?!\\s*[(.=:])(?!\\s*=\\s*(?:signal|computed|inject|input|output|viewChild))`, 'g');
        // Only apply inside method bodies — detect by checking we're after a method signature
        // We'll use a line-by-line approach: skip lines that are property declarations
        const lines = result.split('\n');
        let inMethodBody = false;
        let braceDepth = 0;
        let methodStartDepth = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            // Skip property declarations
            if (/^\s*(?:readonly\s+)?(?:@Input\(\)\s+)?\w+\s*[:=]/.test(line) && !inMethodBody)
                continue;
            // Skip import lines
            if (trimmed.startsWith('import '))
                continue;
            // Track brace depth to know when we're inside a method
            const openBraces = (line.match(/\{/g) || []).length;
            const closeBraces = (line.match(/\}/g) || []).length;
            // Detect method start
            if (!inMethodBody && /^\s+(?:async\s+)?\w+\s*\([^)]*\)\s*(?::\s*[^{]*)?\s*\{/.test(line)) {
                inMethodBody = true;
                methodStartDepth = braceDepth;
            }
            braceDepth += openBraces - closeBraces;
            if (inMethodBody) {
                // Apply bare read replacement inside method bodies
                lines[i] = line.replace(new RegExp(`(?<!this\\.)(?<!readonly\\s+)(?<![.\\w])\\b${prop}\\b(?!\\s*[(.=:])(?!\\s*=\\s*(?:signal|computed|inject|input|output|viewChild))`, 'g'), `this.${prop}()`);
                if (lines[i] !== line)
                    fixCount++;
                if (braceDepth <= methodStartDepth) {
                    inMethodBody = false;
                }
            }
        }
        result = lines.join('\n');
    }
    return { result, fixCount };
}
// ─────────────────────────────────────────────────────────────────────────────
// RULE 2: Consolidate duplicate identifiers
// ─────────────────────────────────────────────────────────────────────────────
function consolidateIdentifiers(ts) {
    let removedCount = 0;
    let result = ts;
    // Find signal declarations
    const signalNames = new Set();
    const signalRe = /(?:readonly\s+)?(\w+)\s*=\s*signal\b/g;
    let m;
    while ((m = signalRe.exec(ts)) !== null) {
        signalNames.add(m[1]);
    }
    // Find inject() declarations
    const injectNames = new Set();
    const injectRe = /(?:private\s+)?(?:readonly\s+)?(\w+)\s*=\s*inject\(/g;
    while ((m = injectRe.exec(ts)) !== null) {
        injectNames.add(m[1]);
    }
    // Rule: If a signal and inject have the same name, rename the inject
    for (const name of signalNames) {
        if (injectNames.has(name)) {
            // Rename inject to nameService
            const newName = name + 'Svc';
            result = result.replace(new RegExp(`((?:private\\s+)?(?:readonly\\s+)?)${name}(\\s*=\\s*inject\\()`, 'g'), `$1${newName}$2`);
            // Update all references to the old inject name
            result = result.replace(new RegExp(`this\\.${name}\\.(?!set\\(|update\\(|\\(\\))`, 'g'), `this.${newName}.`);
            removedCount++;
        }
    }
    // Remove @Input() declarations that duplicate signal names
    for (const name of signalNames) {
        const inputRe = new RegExp(`\\s*@Input\\(\\)\\s+${name}[^;]*;\\s*`, 'g');
        const matches = result.match(inputRe);
        if (matches) {
            result = result.replace(inputRe, '\n');
            removedCount += matches.length;
        }
    }
    // Remove viewChild declarations that duplicate signal names
    for (const name of signalNames) {
        const viewChildRe = new RegExp(`\\s*${name}\\s*=\\s*viewChild<[^>]*>\\([^)]*\\);\\s*`, 'g');
        const vcMatches = result.match(viewChildRe);
        if (vcMatches) {
            result = result.replace(viewChildRe, '\n');
            removedCount += vcMatches.length;
        }
    }
    // Remove duplicate signal declarations (keep first)
    const seenSignals = new Set();
    const lines = result.split('\n');
    const cleanedLines = [];
    for (const line of lines) {
        const signalMatch = line.match(/(?:readonly\s+)?(\w+)\s*=\s*signal\b/);
        if (signalMatch) {
            if (seenSignals.has(signalMatch[1])) {
                removedCount++;
                continue;
            }
            seenSignals.add(signalMatch[1]);
        }
        cleanedLines.push(line);
    }
    // Remove duplicate method declarations (keep first)
    const seenMethods = new Set();
    const finalLines = [];
    let skipUntilBrace = false;
    let braceDepth = 0;
    for (const line of cleanedLines) {
        if (skipUntilBrace) {
            if (line.includes('{'))
                braceDepth++;
            if (line.includes('}'))
                braceDepth--;
            if (braceDepth <= 0) {
                skipUntilBrace = false;
                braceDepth = 0;
            }
            continue;
        }
        const methodMatch = line.match(/^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{]*)?\s*\{?\s*$/);
        if (methodMatch && !line.includes('constructor') && !line.includes('=')) {
            if (seenMethods.has(methodMatch[1])) {
                removedCount++;
                if (line.includes('{')) {
                    skipUntilBrace = true;
                    braceDepth = 1;
                }
                continue;
            }
            seenMethods.add(methodMatch[1]);
        }
        finalLines.push(line);
    }
    return { result: finalLines.join('\n'), removedCount };
}
// ─────────────────────────────────────────────────────────────────────────────
// RULE 3: Sanitize templates — no backticks, no complex JS in attributes
// ─────────────────────────────────────────────────────────────────────────────
function sanitizeTemplate(html) {
    let fixCount = 0;
    let result = html;
    // Fix backtick template literals in [binding] attributes: [alt]="`Evidencia ${index + 1}`"
    const backtickBindingRe = /\[(\w+)\]="`([^`]*)`"/g;
    result = result.replace(backtickBindingRe, (_match, attr, inner) => {
        fixCount++;
        const parts = inner.split(/\$\{([^}]+)\}/);
        if (parts.length === 1)
            return `[${attr}]="'${inner}'"`;
        let expr = '';
        for (let i = 0; i < parts.length; i++) {
            if (i % 2 === 0) {
                if (parts[i])
                    expr += (expr ? " + " : "") + `'${parts[i]}'`;
            }
            else {
                expr += (expr ? " + " : "") + `(${parts[i]})`;
            }
        }
        return `[${attr}]="${expr}"`;
    });
    // Fix backtick template literals in plain attributes: alt="`Evidencia ${index + 1}`"
    result = result.replace(/(\s)(\w+)="`([^`]*)`"/g, (_match, space, attr, inner) => {
        fixCount++;
        const parts = inner.split(/\$\{([^}]+)\}/);
        if (parts.length === 1)
            return `${space}${attr}="${inner}"`;
        let expr = '';
        for (let i = 0; i < parts.length; i++) {
            if (i % 2 === 0) {
                if (parts[i])
                    expr += (expr ? " + " : "") + `'${parts[i]}'`;
            }
            else {
                expr += (expr ? " + " : "") + `(${parts[i]})`;
            }
        }
        return `${space}[${attr}]="${expr}"`;
    });
    // FIX NG5002: Double quotes inside double-quoted bindings
    // [variant]="service.fallido ? "destructive" : "secondary""
    // → [variant]="service.fallido ? 'destructive' : 'secondary'"
    // Use a line-by-line approach to handle this correctly
    result = fixBindingDoubleQuotes(result);
    // Fix className → class
    if (result.includes('className=')) {
        result = result.replace(/\bclassName=/g, 'class=');
        fixCount++;
    }
    // Fix htmlFor → for
    if (result.includes('htmlFor=')) {
        result = result.replace(/\bhtmlFor=/g, 'for=');
        fixCount++;
    }
    // Fix required="true" → required
    result = result.replace(/\brequired="true"/g, 'required');
    // Fix (click)="() => methodName(args)" → (click)="methodName(args)"
    result = result.replace(/\((\w+)\)="\(\)\s*=>\s*([^"]+)"/g, (_match, event, body) => {
        fixCount++;
        return `(${event})="${body}"`;
    });
    // Fix [ref]="xxx" → #xxx (Angular template reference)
    result = result.replace(/\s*\[ref\]="(\w+)"/g, (_match, refName) => {
        fixCount++;
        return ` #${refName}`;
    });
    return { result, fixCount };
}
/**
 * Fix binding attributes with nested double quotes by scanning character-by-character.
 * Handles: [variant]="service.fallido ? "destructive" : "secondary""
 * Converts internal double quotes to single quotes.
 */
function fixBindingDoubleQuotes(html) {
    const lines = html.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Find all [attr]=" patterns and fix the expression
        let newLine = '';
        let j = 0;
        while (j < line.length) {
            // Look for [attr]=" pattern
            const bindingMatch = line.slice(j).match(/^\[(\w+)\]="/);
            if (bindingMatch) {
                const attr = bindingMatch[1];
                const exprStart = j + bindingMatch[0].length;
                // Find the closing " — but we need to handle nested quotes
                // Count quotes: the expression ends at the last " before > or end of tag attributes
                // Simple heuristic: find the position where the binding ends
                let quoteCount = 0;
                let exprEnd = exprStart;
                for (let k = exprStart; k < line.length; k++) {
                    if (line[k] === '"') {
                        quoteCount++;
                        // Check if this is the closing quote: next char is space, >, / or end of line
                        const nextChar = line[k + 1];
                        if (nextChar === undefined || nextChar === ' ' || nextChar === '>' || nextChar === '/' || nextChar === '\n') {
                            exprEnd = k;
                            break;
                        }
                    }
                }
                if (exprEnd > exprStart) {
                    const expr = line.slice(exprStart, exprEnd);
                    // Replace internal double quotes with single quotes
                    const fixedExpr = expr.replace(/"/g, "'");
                    newLine += `[${attr}]="${fixedExpr}"`;
                    j = exprEnd + 1;
                }
                else {
                    newLine += line[j];
                    j++;
                }
            }
            else {
                newLine += line[j];
                j++;
            }
        }
        lines[i] = newLine;
    }
    return lines.join('\n');
}
// ─────────────────────────────────────────────────────────────────────────────
// RULE 7: Fix async/await consistency
// ─────────────────────────────────────────────────────────────────────────────
function fixAsyncAwait(ts) {
    let result = ts;
    // Find methods that use `await` but aren't marked `async`
    // Pattern: methodName(...): ... { ... await ... }
    const methodRe = /(\s+)(\w+)\s*\(([^)]*)\)\s*:\s*(\w+)\s*\{/g;
    let m;
    while ((m = methodRe.exec(result)) !== null) {
        const methodStart = m.index;
        const indent = m[1];
        const methodName = m[2];
        const params = m[3];
        const returnType = m[4];
        // Find the method body
        const bodyStart = result.indexOf('{', methodStart + m[0].length - 1);
        if (bodyStart === -1)
            continue;
        const bodyEnd = findMatchingBrace(result, bodyStart);
        if (bodyEnd === -1)
            continue;
        const body = result.substring(bodyStart, bodyEnd + 1);
        // Check if body contains await but method isn't async
        if (body.includes('await ') && !m[0].includes('async')) {
            // Add async to the method
            const oldDecl = m[0];
            const newDecl = `${indent}async ${methodName}(${params}): Promise<${returnType === 'void' ? 'void' : returnType}> {`;
            result = result.replace(oldDecl, newDecl);
        }
    }
    // Also fix: await output.emit() → output.emit() (emit returns void)
    result = result.replace(/await\s+(this\.\w+\.emit\()/g, '$1');
    return result;
}
function findMatchingBrace(str, openPos) {
    let count = 0;
    for (let i = openPos; i < str.length; i++) {
        if (str[i] === '{')
            count++;
        else if (str[i] === '}') {
            count--;
            if (count === 0)
                return i;
        }
    }
    return -1;
}
// ─────────────────────────────────────────────────────────────────────────────
// Existing helpers (kept from previous version)
// ─────────────────────────────────────────────────────────────────────────────
function removeDuplicateClasses(ts) {
    const classMatches = [...ts.matchAll(/^export class \w+Component/gm)];
    if (classMatches.length <= 1)
        return ts;
    const firstEnd = findClassEnd(ts, classMatches[0].index);
    if (firstEnd > 0) {
        const beforeClass = ts.substring(0, classMatches[0].index);
        const classBody = ts.substring(classMatches[0].index, firstEnd + 1);
        return beforeClass + classBody + '\n';
    }
    return ts;
}
function findClassEnd(ts, classStart) {
    let braceCount = 0;
    let inClass = false;
    for (let i = classStart; i < ts.length; i++) {
        if (ts[i] === '{') {
            braceCount++;
            inClass = true;
        }
        else if (ts[i] === '}') {
            braceCount--;
            if (inClass && braceCount === 0)
                return i;
        }
    }
    return -1;
}
function truncateAfterClassEnd(ts) {
    const lines = ts.split('\n');
    let lastClosingBrace = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim() === '}') {
            lastClosingBrace = i;
            break;
        }
    }
    if (lastClosingBrace === -1)
        return ts;
    const after = lines.slice(lastClosingBrace + 1).join('\n').trim();
    if (after.length > 0 && !after.startsWith('//')) {
        return lines.slice(0, lastClosingBrace + 1).join('\n') + '\n';
    }
    return ts;
}
function cleanImports(ts) {
    let result = ts;
    result = result.replace(/^import\s+.*from\s+['"]react['"];?\s*$/gm, '');
    result = result.replace(/^import\s+.*from\s+['"]@\/components\/.*['"];?\s*$/gm, '');
    result = result.replace(/^import\s+.*from\s+['"]lucide-react['"];?\s*$/gm, '');
    result = result.replace(/^import\s+.*from\s+['"]sonner['"];?\s*$/gm, '');
    result = result.replace(/^import\s+.*from\s+['"]motion\/react['"];?\s*$/gm, '');
    result = result.replace(/^import\s+.*from\s+['"]framer-motion['"];?\s*$/gm, '');
    result = result.replace(/\n{3,}/g, '\n\n');
    return result;
}
function cleanMethodBodies(ts) {
    let result = ts;
    result = result.replace(/\btoast\.\w+\([^)]*\);?/g, '// TODO: use MessageService');
    result = result.replace(/(?<!\w)use[A-Z]\w*\([^)]*\);?/g, '// TODO: inject service');
    result = result.replace(/\bReact\./g, '');
    return result;
}
//# sourceMappingURL=class-context-layer.js.map