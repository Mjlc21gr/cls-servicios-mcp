// =============================================================================
// Route Generator — analyzes React Router usage and generates app.routes.ts
// =============================================================================
import { toKebabCase } from '../utils/naming.utils.js';
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Generates the content of `app.routes.ts` for the Angular project.
 *
 * Detection strategy:
 *  1. React Router (`react-router-dom` / `react-router`) — JSX `<Route>` patterns
 *  2. `createBrowserRouter` / `createRoutesFromElements` object-style routes
 *  3. Next.js file-based routing (`pages/` or `app/` directory)
 *  4. Fallback: single default route pointing to the first/main component
 */
export function generateRoutes(scannedProject, transformedComponents, moduleName) {
    const routes = extractRoutes(scannedProject, transformedComponents, moduleName);
    return renderRoutesFile(routes);
}
/**
 * Extracts route definitions from the scanned React project and maps them
 * to Angular equivalents using the transformedComponents map.
 */
export function extractRoutes(scannedProject, transformedComponents, moduleName) {
    // 1. Try React Router JSX patterns
    let routes = extractReactRouterRoutes(scannedProject, transformedComponents, moduleName);
    // 2. Try createBrowserRouter / createRoutesFromElements
    if (routes.length === 0) {
        routes = extractObjectRoutes(scannedProject, transformedComponents, moduleName);
    }
    // 3. Try Next.js file-based routing
    if (routes.length === 0 && scannedProject.projectMeta.buildTool === 'nextjs') {
        routes = extractNextJsRoutes(scannedProject, transformedComponents, moduleName);
    }
    // 4. Fallback: single default route
    if (routes.length === 0) {
        routes = buildDefaultRoute(transformedComponents, moduleName);
    }
    return routes;
}
// ---------------------------------------------------------------------------
// React Router JSX extraction
// ---------------------------------------------------------------------------
const ROUTER_IMPORT_RE = /import\s+.*from\s+['"]react-router(?:-dom)?['"]/;
/**
 * Matches JSX `<Route path="..." component={Comp} />` or
 * `<Route path="..." element={<Comp ... />} />`.
 */
const ROUTE_COMPONENT_RE = /<Route\s[^>]*?path\s*=\s*["']([^"']+)["'][^>]*?component\s*=\s*\{(\w+)\}/g;
const ROUTE_ELEMENT_RE = /<Route\s[^>]*?path\s*=\s*["']([^"']+)["'][^>]*?element\s*=\s*\{<(\w+)/g;
/** Also handle reversed attribute order: element before path */
const ROUTE_ELEMENT_REV_RE = /<Route\s[^>]*?element\s*=\s*\{<(\w+)[^>]*?path\s*=\s*["']([^"']+)["']/g;
const ROUTE_COMPONENT_REV_RE = /<Route\s[^>]*?component\s*=\s*\{(\w+)\}[^>]*?path\s*=\s*["']([^"']+)["']/g;
function extractReactRouterRoutes(scannedProject, transformedComponents, moduleName) {
    const allFiles = [
        ...scannedProject.components,
        ...scannedProject.services,
        ...scannedProject.configs,
    ];
    // Check if any file imports react-router
    const routerFiles = allFiles.filter((f) => ROUTER_IMPORT_RE.test(f.content));
    if (routerFiles.length === 0)
        return [];
    const routes = [];
    const seen = new Set();
    for (const file of routerFiles) {
        collectJsxRoutes(file.content, transformedComponents, routes, seen, moduleName);
    }
    return routes;
}
function collectJsxRoutes(source, transformedComponents, routes, seen, moduleName) {
    const patterns = [
        { re: ROUTE_COMPONENT_RE, pathIdx: 1, compIdx: 2 },
        { re: ROUTE_ELEMENT_RE, pathIdx: 1, compIdx: 2 },
        { re: ROUTE_COMPONENT_REV_RE, pathIdx: 2, compIdx: 1 },
        { re: ROUTE_ELEMENT_REV_RE, pathIdx: 2, compIdx: 1 },
    ];
    for (const { re, pathIdx, compIdx } of patterns) {
        re.lastIndex = 0;
        let match;
        while ((match = re.exec(source)) !== null) {
            const routePath = normalisePath(match[pathIdx]);
            const componentName = match[compIdx];
            if (seen.has(routePath))
                continue;
            seen.add(routePath);
            const resolved = resolveComponent(componentName, transformedComponents, moduleName);
            if (resolved) {
                routes.push(resolved.route(routePath));
            }
        }
    }
}
// ---------------------------------------------------------------------------
// Object-style route extraction (createBrowserRouter / createRoutesFromElements)
// ---------------------------------------------------------------------------
const CREATE_ROUTER_RE = /createBrowserRouter\s*\(\s*\[([^]*?)\]\s*\)/;
const CREATE_ROUTES_FROM_ELEMENTS_RE = /createRoutesFromElements\s*\(/;
const OBJECT_ROUTE_RE = /\{\s*path\s*:\s*["']([^"']+)["'][^}]*?(?:component|element)\s*:\s*(?:<\s*)?(\w+)/g;
function extractObjectRoutes(scannedProject, transformedComponents, moduleName) {
    const allFiles = [
        ...scannedProject.components,
        ...scannedProject.services,
        ...scannedProject.configs,
    ];
    const routes = [];
    const seen = new Set();
    for (const file of allFiles) {
        if (!CREATE_ROUTER_RE.test(file.content) && !CREATE_ROUTES_FROM_ELEMENTS_RE.test(file.content)) {
            continue;
        }
        OBJECT_ROUTE_RE.lastIndex = 0;
        let match;
        while ((match = OBJECT_ROUTE_RE.exec(file.content)) !== null) {
            const routePath = normalisePath(match[1]);
            const componentName = match[2];
            if (seen.has(routePath))
                continue;
            seen.add(routePath);
            const resolved = resolveComponent(componentName, transformedComponents, moduleName);
            if (resolved) {
                routes.push(resolved.route(routePath));
            }
        }
    }
    return routes;
}
// ---------------------------------------------------------------------------
// Next.js file-based routing
// ---------------------------------------------------------------------------
function extractNextJsRoutes(scannedProject, transformedComponents, moduleName) {
    const routes = [];
    const seen = new Set();
    for (const file of scannedProject.components) {
        const filePath = file.path.replace(/\\/g, '/');
        // Match pages/ or app/ directory patterns
        const pagesMatch = filePath.match(/^(?:src\/)?pages\/(.+?)(?:\/index)?\.(?:tsx|jsx|ts|js)$/);
        const appMatch = filePath.match(/^(?:src\/)?app\/(.+?)\/page\.(?:tsx|jsx|ts|js)$/);
        const relativePath = pagesMatch?.[1] ?? appMatch?.[1];
        if (!relativePath)
            continue;
        // Skip _app, _document, _error, layout files
        if (/^_/.test(relativePath) || /layout$/.test(relativePath))
            continue;
        // Convert Next.js dynamic segments [param] → :param
        const routePath = normalisePath(relativePath.replace(/\[([^\]]+)\]/g, ':$1'));
        if (seen.has(routePath))
            continue;
        seen.add(routePath);
        // Try to find a matching transformed component
        const resolved = resolveComponentFromFile(file.path, transformedComponents, moduleName);
        if (resolved) {
            routes.push(resolved.route(routePath));
        }
    }
    return routes;
}
// ---------------------------------------------------------------------------
// Default fallback route
// ---------------------------------------------------------------------------
function buildDefaultRoute(transformedComponents, moduleName) {
    if (transformedComponents.size === 0)
        return [];
    // Pick the first component (often App or Main)
    const first = transformedComponents.values().next().value;
    if (!first)
        return [];
    return [
        {
            path: '',
            componentName: first.componentName,
            componentPath: buildImportPath(first, moduleName),
            isLazy: true,
        },
    ];
}
/**
 * Resolves a React component name (PascalCase) to its transformed Angular
 * equivalent by searching the transformedComponents map.
 */
function resolveComponent(reactName, transformedComponents, moduleName) {
    // Direct match by component name
    const direct = transformedComponents.get(reactName);
    if (direct)
        return wrapResolved(direct, moduleName);
    // Try kebab-case key
    const kebab = toKebabCase(reactName);
    for (const [, comp] of transformedComponents) {
        if (comp.kebabName === kebab || comp.componentName === reactName) {
            return wrapResolved(comp, moduleName);
        }
    }
    return null;
}
/**
 * Resolves a component by its original file path (used for Next.js routing).
 */
function resolveComponentFromFile(filePath, transformedComponents, moduleName) {
    const normalised = filePath.replace(/\\/g, '/');
    for (const [, comp] of transformedComponents) {
        if (comp.originalPath.replace(/\\/g, '/') === normalised) {
            return wrapResolved(comp, moduleName);
        }
    }
    return null;
}
function wrapResolved(comp, moduleName) {
    return {
        component: comp,
        route: (path) => ({
            path,
            componentName: comp.componentName,
            componentPath: buildImportPath(comp, moduleName),
            isLazy: true,
        }),
    };
}
/**
 * Builds the relative import path for a component from `app.routes.ts`.
 * Output example: `./features/my-module/components/dashboard/dashboard.component`
 *
 * Bug 8 Fix: Use the actual module kebab name instead of hardcoded 'module'.
 */
function buildImportPath(comp, moduleName) {
    const kebab = comp.kebabName;
    const moduleKebab = moduleName ? toKebabCase(moduleName) : 'module';
    return `./features/${moduleKebab}/components/${kebab}/${kebab}.component`;
}
/**
 * Normalises a route path: strips leading `/`, trims whitespace.
 */
function normalisePath(raw) {
    return raw.trim().replace(/^\/+/, '');
}
// ---------------------------------------------------------------------------
// Renderer — produces the app.routes.ts file content
// ---------------------------------------------------------------------------
function renderRoutesFile(routes) {
    const lines = [
        `import { Routes } from '@angular/router';`,
        '',
        'export const routes: Routes = [',
    ];
    for (const route of routes) {
        lines.push(`  {`);
        lines.push(`    path: '${route.path}',`);
        lines.push(`    loadComponent: () => import('${route.componentPath}').then(m => m.${route.componentName}Component),`);
        lines.push(`  },`);
    }
    lines.push('];');
    lines.push('');
    return lines.join('\n');
}
//# sourceMappingURL=route-generator.js.map