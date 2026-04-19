// =============================================================================
// Output_Validator — Validates generated Angular project for completeness
// =============================================================================
// ---------------------------------------------------------------------------
// PrimeNG components that must NOT have `required` attribute
// ---------------------------------------------------------------------------
const PRIMENG_NO_REQUIRED = [
    'p-select',
    'p-dropdown',
    'p-checkbox',
    'p-radioButton',
    'p-inputSwitch',
    'p-calendar',
    'p-autoComplete',
    'p-multiSelect',
];
// ---------------------------------------------------------------------------
// Required Angular + PrimeNG dependencies
// ---------------------------------------------------------------------------
const REQUIRED_DEPS = [
    '@angular/core',
    '@angular/common',
    '@angular/router',
    'primeng',
];
// ---------------------------------------------------------------------------
// Minimum meaningful file size (chars)
// ---------------------------------------------------------------------------
const MIN_FILE_SIZE = 10;
// ---------------------------------------------------------------------------
// Validation rules
// ---------------------------------------------------------------------------
/**
 * Rule 1: Every .component.ts must have matching .component.html,
 * .component.scss, and .component.spec.ts
 */
function validateComponentCompleteness(files) {
    const issues = [];
    for (const [filePath, content] of files) {
        if (!filePath.endsWith('.component.ts'))
            continue;
        // Skip root app.component.ts — it uses inline template (router-outlet only)
        if (filePath === 'src/app/app.component.ts')
            continue;
        // Skip components with inline templates (template: `...`)
        if (content.includes("template:") && !content.includes("templateUrl:"))
            continue;
        const basePath = filePath.replace(/\.component\.ts$/, '');
        const expectedFiles = [
            `${basePath}.component.html`,
            `${basePath}.component.scss`,
            `${basePath}.component.spec.ts`,
        ];
        for (const expected of expectedFiles) {
            if (!files.has(expected)) {
                issues.push({
                    severity: 'error',
                    file: filePath,
                    message: `Missing companion file: ${expected}`,
                    rule: 'component-completeness',
                });
            }
        }
    }
    return issues;
}
/**
 * Rule 2: package.json must contain required Angular + PrimeNG dependencies
 */
function validatePackageDependencies(files) {
    const issues = [];
    const packageJsonPath = findFile(files, 'package.json');
    if (!packageJsonPath) {
        issues.push({
            severity: 'error',
            file: 'package.json',
            message: 'package.json not found in generated project',
            rule: 'package-dependencies',
        });
        return issues;
    }
    const content = files.get(packageJsonPath) ?? '';
    let parsed;
    try {
        parsed = JSON.parse(content);
    }
    catch {
        issues.push({
            severity: 'error',
            file: packageJsonPath,
            message: 'package.json is not valid JSON',
            rule: 'package-dependencies',
        });
        return issues;
    }
    const deps = (parsed['dependencies'] ?? {});
    const devDeps = (parsed['devDependencies'] ?? {});
    const allDeps = { ...deps, ...devDeps };
    for (const dep of REQUIRED_DEPS) {
        if (!(dep in allDeps)) {
            issues.push({
                severity: 'error',
                file: packageJsonPath,
                message: `Missing required dependency: ${dep}`,
                rule: 'package-dependencies',
            });
        }
    }
    return issues;
}
/**
 * Rule 3: app.routes.ts must reference only components that exist in the files map
 */
function validateRouteReferences(files) {
    const issues = [];
    const routesPath = findFile(files, 'app.routes.ts');
    if (!routesPath) {
        // Routes file is optional if there's only one component
        return issues;
    }
    const routesContent = files.get(routesPath) ?? '';
    // Extract import paths from the routes file
    const importRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let match;
    while ((match = importRe.exec(routesContent)) !== null) {
        const importPath = match[1];
        // Check if the referenced component file exists
        const resolvedPath = resolveImportPath(routesPath, importPath, files);
        if (!resolvedPath) {
            issues.push({
                severity: 'error',
                file: routesPath,
                message: `Route references non-existent component: ${importPath}`,
                rule: 'route-references',
            });
        }
    }
    return issues;
}
/**
 * Rule 4: No .ts file (except .spec.ts) should contain `: any`
 */
function validateNoAnyType(files) {
    const issues = [];
    for (const [filePath, content] of files) {
        if (!filePath.endsWith('.ts'))
            continue;
        if (filePath.endsWith('.spec.ts'))
            continue;
        // Match `: any` but not `: anything` or `: anyOtherType`
        const anyRe = /:\s*any\b(?!\w)/g;
        if (anyRe.test(content)) {
            issues.push({
                severity: 'warning',
                file: filePath,
                message: 'File contains `: any` type — use `unknown` instead',
                rule: 'no-any-type',
            });
        }
    }
    return issues;
}
/**
 * Rule 5: All components must have `standalone: true`
 */
function validateStandaloneComponents(files) {
    const issues = [];
    for (const [filePath, content] of files) {
        if (!filePath.endsWith('.component.ts'))
            continue;
        if (content.includes('@Component') && !content.includes('standalone: true') && !content.includes('standalone:true')) {
            issues.push({
                severity: 'error',
                file: filePath,
                message: 'Component missing `standalone: true` in @Component decorator',
                rule: 'standalone-components',
            });
        }
    }
    return issues;
}
/**
 * Rule 6: No PrimeNG component should have `required` attribute
 */
function validateNoPrimeNGRequired(files) {
    const issues = [];
    for (const [filePath, content] of files) {
        if (!filePath.endsWith('.component.html'))
            continue;
        for (const tag of PRIMENG_NO_REQUIRED) {
            const tagRe = new RegExp(`<${escapeRegex(tag)}\\b[^>]*\\brequired\\b`, 'g');
            if (tagRe.test(content)) {
                issues.push({
                    severity: 'error',
                    file: filePath,
                    message: `PrimeNG component <${tag}> has unsupported \`required\` attribute`,
                    rule: 'primeng-no-required',
                });
            }
        }
    }
    return issues;
}
/**
 * Rule 7: No empty files (< MIN_FILE_SIZE chars)
 */
function validateNoEmptyFiles(files) {
    const issues = [];
    for (const [filePath, content] of files) {
        if (content.trim().length < MIN_FILE_SIZE) {
            issues.push({
                severity: 'warning',
                file: filePath,
                message: `File has less than ${MIN_FILE_SIZE} characters of content`,
                rule: 'no-empty-files',
            });
        }
    }
    return issues;
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Find a file in the files map by its basename (last path segment).
 */
function findFile(files, basename) {
    for (const filePath of files.keys()) {
        if (filePath === basename || filePath.endsWith(`/${basename}`)) {
            return filePath;
        }
    }
    return undefined;
}
/**
 * Resolve a relative import path from a source file to a file in the map.
 */
function resolveImportPath(fromFile, importPath, files) {
    const fromDir = fromFile.replace(/[^/]+$/, '');
    const resolved = normalizePath(fromDir + importPath);
    // Try exact match and common extensions
    const candidates = [
        resolved,
        `${resolved}.ts`,
        `${resolved}.component.ts`,
        `${resolved}/index.ts`,
    ];
    for (const candidate of candidates) {
        if (files.has(candidate)) {
            return candidate;
        }
    }
    // Try matching by the end of the path
    for (const filePath of files.keys()) {
        if (filePath.endsWith(importPath) || filePath.endsWith(`${importPath}.ts`)) {
            return filePath;
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
/**
 * Escape special regex characters.
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
/**
 * Validates the generated Angular project for structural completeness.
 *
 * Rules:
 * 1. Every .component.ts has matching .component.html, .component.scss, .component.spec.ts
 * 2. package.json contains @angular/core, @angular/common, @angular/router, primeng
 * 3. app.routes.ts references only components that exist in the files map
 * 4. No .ts file (except .spec.ts) contains `: any` — must use `unknown`
 * 5. All components have `standalone: true`
 * 6. No PrimeNG component has `required` attribute
 * 7. No empty files (< 10 chars)
 */
export function validateOutput(files) {
    const issues = [];
    issues.push(...validateComponentCompleteness(files));
    issues.push(...validatePackageDependencies(files));
    issues.push(...validateRouteReferences(files));
    issues.push(...validateNoAnyType(files));
    issues.push(...validateStandaloneComponents(files));
    issues.push(...validateNoPrimeNGRequired(files));
    issues.push(...validateNoEmptyFiles(files));
    return issues;
}
//# sourceMappingURL=output-validator.js.map