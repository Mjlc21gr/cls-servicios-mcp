// =============================================================================
// Pipeline_Orchestrator — Top-level coordinator for full project migration
// =============================================================================
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { scanProject } from './project-scanner.js';
import { convertClassToFunctional } from './class-component-converter.js';
import { validateInput } from '../security/validator.js';
import { parseReactComponent } from './ast-parser.js';
import { mapStateToAngular } from './state-mapper.js';
import { generateAngularTemplate } from './template-generator.js';
import { mapToPrimeNG } from './primeng-mapper.js';
import { emitAngularArtifact } from '../emitter/code-emitter.js';
import { aggregateStyles } from './style-aggregator.js';
import { scaffoldProject } from './project-scaffolder.js';
import { fixSignals } from './signal-fixer.js';
import { sanitizePrimeNG } from './primeng-sanitizer.js';
// 4 Capas de Reingeniería Estructural
import { applySemanticUI } from './ui-semantic-engine.js';
import { detectAndGenerateRoutes } from './universal-router-mapper.js';
import { convertHookToService } from './logic-service-converter.js';
import { preserveStyles } from './style-preservator.js';
// 2 Capas de Seguridad (nuevas)
import { validateClassContext } from './class-context-layer.js';
import { validateTemplateIntegrity } from './template-integrity-layer.js';
import { validateOutput } from './output-validator.js';
import { toKebabCase, toPascalCase } from '../utils/naming.utils.js';
// ---------------------------------------------------------------------------
// Topological sort (Kahn's algorithm)
// ---------------------------------------------------------------------------
/**
 * Topologically sort components using Kahn's algorithm.
 * Returns components in dependency order: leaf components (0 in-degree) first.
 *
 * @param components - The scanned component files
 * @param dependencyGraph - Map of component path → paths of its dependencies
 * @returns Sorted array of component file paths
 */
function topologicalSort(components, dependencyGraph) {
    const componentPaths = new Set(components.map((c) => c.path));
    // Build in-degree map (only for known component paths)
    const inDegree = new Map();
    // Reverse adjacency: who depends on me
    const dependents = new Map();
    for (const path of componentPaths) {
        inDegree.set(path, 0);
        dependents.set(path, []);
    }
    for (const [parent, deps] of dependencyGraph) {
        if (!componentPaths.has(parent))
            continue;
        for (const dep of deps) {
            if (!componentPaths.has(dep))
                continue;
            // parent depends on dep → parent's in-degree increases
            inDegree.set(parent, (inDegree.get(parent) ?? 0) + 1);
            dependents.get(dep).push(parent);
        }
    }
    // Start with nodes that have 0 in-degree (leaf components)
    const queue = [];
    for (const [path, degree] of inDegree) {
        if (degree === 0) {
            queue.push(path);
        }
    }
    const sorted = [];
    while (queue.length > 0) {
        const current = queue.shift();
        sorted.push(current);
        for (const dependent of dependents.get(current) ?? []) {
            const newDegree = (inDegree.get(dependent) ?? 1) - 1;
            inDegree.set(dependent, newDegree);
            if (newDegree === 0) {
                queue.push(dependent);
            }
        }
    }
    // If there are cycles, append remaining components (fail-forward)
    for (const path of componentPaths) {
        if (!sorted.includes(path)) {
            sorted.push(path);
        }
    }
    return sorted;
}
// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
/**
 * Migrates an entire React project to a complete Angular 20 + PrimeNG 19 project.
 *
 * Pipeline execution order:
 * 1. Validate sourceDir exists
 * 2. Scan project
 * 3. Topologically sort components
 * 4. Transform each component through the pipeline
 * 5. Aggregate styles
 * 6. Scaffold project
 * 7. Generate routes
 * 8. Fix signals
 * 9. Sanitize PrimeNG
 * 10. Assemble files and write to outputDir
 * 11. Copy static assets
 * 12. Validate output
 * 13. Return result
 */
export async function migrateFullProject(params) {
    const startTime = Date.now();
    const { sourceDir, outputDir, moduleName, options } = params;
    const errors = [];
    try {
        // -----------------------------------------------------------------------
        // Step 1: Validate sourceDir exists
        // -----------------------------------------------------------------------
        if (!existsSync(sourceDir)) {
            return {
                status: 'error',
                outputDir,
                filesGenerated: [],
                migrationSummary: emptySummary(),
                validationReport: [],
                duration: Date.now() - startTime,
                errors: [
                    {
                        stage: 'validation',
                        file: sourceDir,
                        message: `Source directory does not exist: "${sourceDir}"`,
                    },
                ],
            };
        }
        // -----------------------------------------------------------------------
        // Step 2: Scan project
        // -----------------------------------------------------------------------
        const scannedProject = await scanProject(sourceDir);
        // -----------------------------------------------------------------------
        // Step 3: Topologically sort components by dependency graph
        // -----------------------------------------------------------------------
        const sortedPaths = topologicalSort(scannedProject.components, scannedProject.dependencyGraph);
        // Build a lookup from path → ScannedFile
        const componentByPath = new Map();
        for (const comp of scannedProject.components) {
            componentByPath.set(comp.path, comp);
        }
        // -----------------------------------------------------------------------
        // Step 4: Transform each component through the pipeline
        // -----------------------------------------------------------------------
        const transformedComponents = new Map();
        let componentsFailed = 0;
        for (const filePath of sortedPaths) {
            const file = componentByPath.get(filePath);
            if (!file)
                continue;
            try {
                // 4a. Pre-process class components
                const conversion = convertClassToFunctional(file.content);
                const sourceToProcess = conversion.convertedSource;
                // 4b. Validate input
                const validation = validateInput(sourceToProcess);
                if (!validation.isValid) {
                    errors.push({
                        stage: 'validation',
                        file: file.path,
                        message: `Input validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
                    });
                    componentsFailed++;
                    continue;
                }
                // 4c. Parse with AST parser
                const ir = parseReactComponent(sourceToProcess);
                // 4d. Map state to Angular
                const irWithState = mapStateToAngular(ir);
                // 4e. Generate Angular template
                const irWithTemplate = generateAngularTemplate(irWithState);
                // 4f. Map PrimeNG
                const irWithPrimeNG = mapToPrimeNG(irWithTemplate);
                // 4g. Emit Angular artifact
                const artifact = emitAngularArtifact(irWithPrimeNG);
                // 4h. Store as TransformedComponent
                const kebabName = toKebabCase(ir.componentName);
                const transformed = {
                    originalPath: file.path,
                    componentName: ir.componentName,
                    kebabName,
                    componentTs: artifact.componentFile,
                    componentHtml: artifact.templateFile ?? irWithPrimeNG.angularTemplate,
                    componentScss: artifact.scssFile,
                    componentSpec: artifact.specFile,
                    services: artifact.services,
                    ir: irWithPrimeNG,
                };
                transformedComponents.set(ir.componentName, transformed);
            }
            catch (err) {
                // 4i. On error: log PipelineError, skip component, continue
                const message = err instanceof Error ? err.message : String(err);
                errors.push({
                    stage: 'component-transform',
                    file: file.path,
                    message,
                });
                componentsFailed++;
            }
        }
        // -----------------------------------------------------------------------
        // Step 4b: Apply Semantic UI Engine to all templates
        // Converts React UI component trees to PrimeNG equivalents
        // -----------------------------------------------------------------------
        for (const [key, comp] of transformedComponents) {
            const semanticHtml = applySemanticUI(comp.componentHtml);
            if (semanticHtml !== comp.componentHtml) {
                transformedComponents.set(key, { ...comp, componentHtml: semanticHtml });
            }
        }
        // -----------------------------------------------------------------------
        // Step 4c: Convert hooks to real Angular services (Logic-to-Service)
        // -----------------------------------------------------------------------
        const typesFile = scannedProject.configs.find(f => f.path.includes('types'));
        const typesContent = typesFile?.content ?? '';
        const hookServices = [];
        for (const svcFile of scannedProject.services) {
            if (/export\s+function\s+use[A-Z]/.test(svcFile.content)) {
                const generated = convertHookToService(svcFile, typesContent);
                if (generated) {
                    hookServices.push({ fileName: generated.fileName, content: generated.content });
                }
            }
        }
        // -----------------------------------------------------------------------
        // Step 5: Aggregate styles (using Style Preservator)
        // -----------------------------------------------------------------------
        const styleResult = aggregateStyles(scannedProject, transformedComponents, options);
        // -----------------------------------------------------------------------
        // Step 5b: Bug 5 Fix — Scan all component TS for third-party imports
        // -----------------------------------------------------------------------
        const detectedDeps = new Set();
        for (const [, comp] of transformedComponents) {
            const importMatches = comp.componentTs.matchAll(/import\s+.*from\s+['"]([^./][^'"]+)['"]/g);
            for (const m of importMatches) {
                const pkgName = m[1].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0];
                detectedDeps.add(pkgName);
            }
            // Also scan service files
            for (const svc of comp.services) {
                const svcImports = svc.content.matchAll(/import\s+.*from\s+['"]([^./][^'"]+)['"]/g);
                for (const m of svcImports) {
                    const pkgName = m[1].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0];
                    detectedDeps.add(pkgName);
                }
            }
        }
        // -----------------------------------------------------------------------
        // Step 6: Scaffold project
        // -----------------------------------------------------------------------
        const componentNames = [...transformedComponents.keys()];
        const scaffold = scaffoldProject(moduleName, componentNames, options, scannedProject.projectMeta, [...detectedDeps]);
        // -----------------------------------------------------------------------
        // Step 7: Generate routes (Universal Router Mapper)
        // -----------------------------------------------------------------------
        const routesContent = detectAndGenerateRoutes(scannedProject, transformedComponents, moduleName);
        // Fix: rename AppComponent in routes to avoid collision with root
        const featureClassName = toPascalCase(moduleName) + 'Component';
        const fixedRoutesContent = routesContent.replace(/\.then\(m => m\.AppComponent\)/g, `.then(m => m.${featureClassName})`);
        // -----------------------------------------------------------------------
        // Step 8: Fix signals
        // -----------------------------------------------------------------------
        const signalFixed = fixSignals(transformedComponents);
        // -----------------------------------------------------------------------
        // Step 9: Sanitize PrimeNG
        // -----------------------------------------------------------------------
        const sanitized = sanitizePrimeNG(signalFixed);
        // -----------------------------------------------------------------------
        // Step 9b: Class Context Validation (new security layer)
        // -----------------------------------------------------------------------
        const contextValidated = validateClassContext(sanitized);
        // -----------------------------------------------------------------------
        // Step 9c: Template Integrity Validation (new security layer)
        // -----------------------------------------------------------------------
        const integrityValidated = validateTemplateIntegrity(contextValidated);
        // -----------------------------------------------------------------------
        // Step 10: Assemble all files into a Map<string, string>
        // -----------------------------------------------------------------------
        const allFiles = new Map();
        // Scaffold files at root
        for (const [filePath, content] of scaffold.files) {
            allFiles.set(filePath, content);
        }
        // Components at src/app/features/{moduleName}/components/{kebab-name}/
        const moduleKebab = toKebabCase(moduleName);
        for (const [, comp] of integrityValidated) {
            const compDir = `src/app/features/${moduleKebab}/components/${comp.kebabName}`;
            let compTs = comp.componentTs;
            // Fix: Rename feature AppComponent to avoid collision with root AppComponent
            if (comp.kebabName === 'app' && compTs.includes('export class AppComponent')) {
                const featureClassName = toPascalCase(moduleName) + 'Component';
                compTs = compTs.replace(/export class AppComponent/g, `export class ${featureClassName}`);
            }
            allFiles.set(`${compDir}/${comp.kebabName}.component.ts`, compTs);
            allFiles.set(`${compDir}/${comp.kebabName}.component.html`, comp.componentHtml);
            allFiles.set(`${compDir}/${comp.kebabName}.component.scss`, styleResult.componentStyles.get(comp.componentName) || comp.componentScss || generateDefaultScss(comp.kebabName));
            // Fix spec file to use renamed class
            let specContent = comp.componentSpec;
            if (comp.kebabName === 'app' && specContent.includes('AppComponent')) {
                const featureClassName2 = toPascalCase(moduleName) + 'Component';
                specContent = specContent.replace(/AppComponent/g, featureClassName2);
            }
            allFiles.set(`${compDir}/${comp.kebabName}.component.spec.ts`, specContent);
            // Services at src/app/features/{moduleName}/services/
            for (const svc of comp.services) {
                allFiles.set(`src/app/features/${moduleKebab}/services/${svc.fileName}`, svc.content);
            }
        }
        // -----------------------------------------------------------------------
        // MLFIX-TYPESCOPY: read source types.ts
        let sourceTypesContent = '';
        const srcTypesFile = join(params.sourceDir, 'src', 'types.ts');
        if (existsSync(srcTypesFile)) {
            sourceTypesContent = readFileSync(srcTypesFile, 'utf-8');
        }
        // Step 10b: Bug 4 Fix — Generate types.ts if components import from it
        // -----------------------------------------------------------------------
        // MLFIX-TYPES: always generate types.ts
        let needsTypesFile = true; // ML: force types.ts generation
        for (const [, content] of allFiles) {
            if (/import\s+.*from\s+['"].*types['"]/g.test(content)) {
                needsTypesFile = true;
                break;
            }
        }
        if (needsTypesFile) {
            // Collect type interfaces from all transformed components' IR
            const typeInterfaces = [];
            const seenTypes = new Set();
            for (const [, comp] of integrityValidated) {
                if (comp.ir.typeInterfaces) {
                    for (const ti of comp.ir.typeInterfaces) {
                        if (!seenTypes.has(ti.name)) {
                            seenTypes.add(ti.name);
                            typeInterfaces.push(ti.body);
                        }
                    }
                }
            }
            // Also check scanned configs for type definitions
            for (const cfg of scannedProject.configs) {
                if (cfg.path.endsWith('.d.ts') || cfg.path.includes('types')) {
                    if (!typeInterfaces.some((t) => t.includes(cfg.content.slice(0, 50)))) {
                        typeInterfaces.push(cfg.content);
                    }
                }
            }
            const typesContent = typeInterfaces.length > 0
                ? sourceTypesContent + `\n// Auto-generated types from React project migration\n\n${typeInterfaces.join('\n\n')}\n`
                : `// Auto-generated types placeholder\n// Add your shared interfaces and types here\nexport {};\n`;
            // Place types.ts at the feature module level
            allFiles.set(`src/app/features/${moduleKebab}/types.ts`, typesContent);
        }
        // Hook-generated services (from Logic-to-Service Converter)
        for (const svc of hookServices) {
            allFiles.set(`src/app/features/${moduleKebab}/services/${svc.fileName}`, svc.content);
        }
        // Style Preservator: generate Tailwind config if needed
        const preservedStyles = preserveStyles(scannedProject);
        if (preservedStyles.hasTailwind && preservedStyles.tailwindConfig) {
            allFiles.set('tailwind.config.js', preservedStyles.tailwindConfig);
        }
        if (preservedStyles.hasTailwind && preservedStyles.postcssConfig) {
            allFiles.set('postcss.config.js', preservedStyles.postcssConfig);
        }
        // Theme at src/styles/
        allFiles.set('src/styles/_sb-primeng-theme.scss', styleResult.themeFile);
        // Routes at src/app/app.routes.ts
        allFiles.set('src/app/app.routes.ts', fixedRoutesContent);
        // Global styles at src/styles.scss — prepend Tailwind directives
        const tailwindDirectives = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n`;
        allFiles.set('src/styles.scss', tailwindDirectives + styleResult.globalStyles);
        // -----------------------------------------------------------------------
        // Step 11: Write all files to outputDir
        // -----------------------------------------------------------------------
        for (const [filePath, content] of allFiles) {
            const fullPath = join(outputDir, filePath);
            mkdirSync(dirname(fullPath), { recursive: true });
            writeFileSync(fullPath, content, 'utf-8');
        }
        // -----------------------------------------------------------------------
        // Step 12: Copy static assets from scannedProject.assets to src/assets/
        // -----------------------------------------------------------------------
        let staticAssetsCopied = 0;
        for (const asset of scannedProject.assets) {
            try {
                const destPath = join(outputDir, 'src/assets', asset.path);
                mkdirSync(dirname(destPath), { recursive: true });
                copyFileSync(asset.absolutePath, destPath);
                staticAssetsCopied++;
            }
            catch {
                // Skip unreadable assets silently
            }
        }
        // -----------------------------------------------------------------------
        // Step 13: Validate output
        // -----------------------------------------------------------------------
        const validationReport = validateOutput(allFiles);
        // -----------------------------------------------------------------------
        // Step 14: Return FullMigrationResult
        // -----------------------------------------------------------------------
        const servicesGenerated = [...integrityValidated.values()].reduce((sum, c) => sum + c.services.length, 0);
        const migrationSummary = {
            componentsTotal: scannedProject.components.length,
            componentsMigrated: integrityValidated.size,
            componentsFailed,
            servicesGenerated,
            routesGenerated: (fixedRoutesContent.match(/loadComponent/g) ?? []).length,
            stylesGenerated: styleResult.componentStyles.size,
            staticAssetsCopied,
        };
        return {
            status: errors.length > 0 ? 'error' : 'success',
            outputDir,
            filesGenerated: [...allFiles.keys()],
            migrationSummary,
            validationReport,
            duration: Date.now() - startTime,
            errors: errors.length > 0 ? errors : undefined,
        };
    }
    catch (err) {
        // Top-level catch for unexpected failures
        const message = err instanceof Error ? err.message : String(err);
        return {
            status: 'error',
            outputDir,
            filesGenerated: [],
            migrationSummary: emptySummary(),
            validationReport: [],
            duration: Date.now() - startTime,
            errors: [
                {
                    stage: 'pipeline',
                    file: sourceDir,
                    message,
                },
            ],
        };
    }
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function emptySummary() {
    return {
        componentsTotal: 0,
        componentsMigrated: 0,
        componentsFailed: 0,
        servicesGenerated: 0,
        routesGenerated: 0,
        stylesGenerated: 0,
        staticAssetsCopied: 0,
    };
}
/**
 * Generate a minimal default .scss file for a component when no styles are extracted.
 */
function generateDefaultScss(kebabName) {
    return `// ${kebabName} component styles
:host {
  display: block;
  font-family: var(--sb-font-family, 'Montserrat', 'Segoe UI', system-ui, sans-serif);
}
`;
}
//# sourceMappingURL=project-orchestrator.js.map