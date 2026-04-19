// =============================================================================
// Universal Router Mapper — Detects routing patterns from any React framework
// and generates Angular routing configuration
// =============================================================================

import type { ScannedProject, TransformedComponent, GeneratedRoute } from './pipeline-types.js';
import { toKebabCase } from '../utils/naming.utils.js';

// ---------------------------------------------------------------------------
// Route detection strategies
// ---------------------------------------------------------------------------

interface DetectedRoute {
  readonly path: string;
  readonly componentName: string;
  readonly isLayout: boolean;
  readonly children?: DetectedRoute[];
}

/**
 * Detect routing pattern and generate Angular routes.
 * Supports: React Router, Next.js, Remix, tab-based navigation, single-page.
 */
export function detectAndGenerateRoutes(
  scannedProject: ScannedProject,
  transformedComponents: ReadonlyMap<string, TransformedComponent>,
  moduleName: string,
): string {
  const buildTool = scannedProject.projectMeta.buildTool;
  const moduleKebab = toKebabCase(moduleName);

  // Strategy 1: Remix file-based routing
  if (buildTool === 'remix') {
    return generateRemixRoutes(scannedProject, transformedComponents, moduleKebab);
  }

  // Strategy 2: Next.js file-based routing
  if (buildTool === 'nextjs') {
    return generateNextJsRoutes(scannedProject, transformedComponents, moduleKebab);
  }

  // Strategy 3: React Router (detect from imports)
  const hasReactRouter = scannedProject.components.some(f =>
    f.content.includes('react-router-dom') || f.content.includes('react-router')
  );
  if (hasReactRouter) {
    return generateReactRouterRoutes(scannedProject, transformedComponents, moduleKebab);
  }

  // Strategy 4: Tab-based navigation (detect useState with tab pattern)
  const hasTabNav = scannedProject.components.some(f =>
    /useState.*'form'.*'list'|useState.*'tab/i.test(f.content) ||
    /activeTab|currentTab|selectedTab/i.test(f.content)
  );
  if (hasTabNav) {
    return generateTabBasedRoutes(transformedComponents, moduleKebab);
  }

  // Strategy 5: Single-page app (default)
  return generateSinglePageRoute(transformedComponents, moduleKebab);
}

// ---------------------------------------------------------------------------
// Remix routes
// ---------------------------------------------------------------------------

function generateRemixRoutes(
  scannedProject: ScannedProject,
  transformedComponents: ReadonlyMap<string, TransformedComponent>,
  moduleKebab: string,
): string {
  const routes: string[] = [];

  for (const file of scannedProject.components) {
    const path = file.path.replace(/\\/g, '/');

    // Match routes/ directory patterns
    const routeMatch = path.match(/routes\/(.+?)\.(?:tsx|jsx|ts|js)$/);
    if (!routeMatch) continue;

    let routePath = routeMatch[1];

    // Remix conventions
    if (routePath === '_index') routePath = '';
    routePath = routePath
      .replace(/\$(\w+)/g, ':$1')  // $param → :param
      .replace(/\./g, '/')          // dots → slashes
      .replace(/_/g, '');            // remove layout prefixes

    // Find matching component
    const comp = findComponentForFile(file.path, transformedComponents);
    if (!comp) continue;

    routes.push(buildRouteEntry(routePath, comp, moduleKebab));
  }

  return wrapRoutesFile(routes);
}

// ---------------------------------------------------------------------------
// Next.js routes
// ---------------------------------------------------------------------------

function generateNextJsRoutes(
  scannedProject: ScannedProject,
  transformedComponents: ReadonlyMap<string, TransformedComponent>,
  moduleKebab: string,
): string {
  const routes: string[] = [];

  for (const file of scannedProject.components) {
    const path = file.path.replace(/\\/g, '/');

    // Pages router: pages/about.tsx → /about
    const pagesMatch = path.match(/pages\/(.+?)(?:\/index)?\.(?:tsx|jsx)$/);
    // App router: app/about/page.tsx → /about
    const appMatch = path.match(/app\/(.+?)\/page\.(?:tsx|jsx)$/);

    const relativePath = pagesMatch?.[1] ?? appMatch?.[1];
    if (!relativePath) continue;
    if (/^_/.test(relativePath) || /layout$/.test(relativePath)) continue;

    const routePath = relativePath
      .replace(/\[([^\]]+)\]/g, ':$1')
      .replace(/\\/g, '/');

    const comp = findComponentForFile(file.path, transformedComponents);
    if (!comp) continue;

    routes.push(buildRouteEntry(routePath, comp, moduleKebab));
  }

  return wrapRoutesFile(routes);
}

// ---------------------------------------------------------------------------
// React Router routes
// ---------------------------------------------------------------------------

function generateReactRouterRoutes(
  scannedProject: ScannedProject,
  transformedComponents: ReadonlyMap<string, TransformedComponent>,
  moduleKebab: string,
): string {
  const routes: string[] = [];
  const seen = new Set<string>();

  for (const file of scannedProject.components) {
    if (!file.content.includes('react-router')) continue;

    // Extract <Route path="..." element={<Comp/>} /> patterns
    const routeRe = /<Route\s[^>]*?path\s*=\s*["']([^"']+)["'][^>]*?(?:element|component)\s*=\s*\{<?(\w+)/g;
    let m: RegExpExecArray | null;

    while ((m = routeRe.exec(file.content)) !== null) {
      const routePath = m[1].replace(/^\//, '');
      const compName = m[2];
      if (seen.has(routePath)) continue;
      seen.add(routePath);

      const comp = transformedComponents.get(compName);
      if (comp) {
        routes.push(buildRouteEntry(routePath, comp, moduleKebab));
      }
    }
  }

  if (routes.length === 0) {
    return generateSinglePageRoute(transformedComponents, moduleKebab);
  }

  return wrapRoutesFile(routes);
}

// ---------------------------------------------------------------------------
// Tab-based navigation → single route with the main component
// ---------------------------------------------------------------------------

function generateTabBasedRoutes(
  transformedComponents: ReadonlyMap<string, TransformedComponent>,
  moduleKebab: string,
): string {
  // Find the main/app component (the one with tab navigation)
  let mainComp: TransformedComponent | undefined;

  for (const [, comp] of transformedComponents) {
    if (/activeTab|currentTab|setActiveTab/i.test(comp.componentTs)) {
      mainComp = comp;
      break;
    }
  }

  if (!mainComp) {
    mainComp = transformedComponents.values().next().value;
  }

  if (!mainComp) return wrapRoutesFile([]);

  const routes = [buildRouteEntry('', mainComp, moduleKebab)];
  return wrapRoutesFile(routes);
}

// ---------------------------------------------------------------------------
// Single page (default)
// ---------------------------------------------------------------------------

function generateSinglePageRoute(
  transformedComponents: ReadonlyMap<string, TransformedComponent>,
  moduleKebab: string,
): string {
  const first = transformedComponents.values().next().value;
  if (!first) return wrapRoutesFile([]);

  return wrapRoutesFile([buildRouteEntry('', first, moduleKebab)]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findComponentForFile(
  filePath: string,
  transformedComponents: ReadonlyMap<string, TransformedComponent>,
): TransformedComponent | undefined {
  const normalised = filePath.replace(/\\/g, '/');
  for (const [, comp] of transformedComponents) {
    if (comp.originalPath.replace(/\\/g, '/') === normalised) return comp;
  }
  return undefined;
}

function buildRouteEntry(
  path: string,
  comp: TransformedComponent,
  moduleKebab: string,
): string {
  const kebab = comp.kebabName;
  const className = comp.componentName;
  const importPath = `./features/${moduleKebab}/components/${kebab}/${kebab}.component`;

  return `  {
    path: '${path}',
    loadComponent: () => import('${importPath}').then(m => m.${className}Component),
  }`;
}

function wrapRoutesFile(routeEntries: string[]): string {
  const routes = routeEntries.length > 0
    ? routeEntries.join(',\n') + ','
    : '';

  return `import { Routes } from '@angular/router';

export const routes: Routes = [
${routes}
  { path: '**', redirectTo: '' },
];
`;
}
