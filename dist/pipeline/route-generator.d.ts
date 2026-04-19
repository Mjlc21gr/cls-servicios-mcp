import type { ScannedProject, TransformedComponent, GeneratedRoute } from './pipeline-types.js';
/**
 * Generates the content of `app.routes.ts` for the Angular project.
 *
 * Detection strategy:
 *  1. React Router (`react-router-dom` / `react-router`) — JSX `<Route>` patterns
 *  2. `createBrowserRouter` / `createRoutesFromElements` object-style routes
 *  3. Next.js file-based routing (`pages/` or `app/` directory)
 *  4. Fallback: single default route pointing to the first/main component
 */
export declare function generateRoutes(scannedProject: ScannedProject, transformedComponents: ReadonlyMap<string, TransformedComponent>, moduleName?: string): string;
/**
 * Extracts route definitions from the scanned React project and maps them
 * to Angular equivalents using the transformedComponents map.
 */
export declare function extractRoutes(scannedProject: ScannedProject, transformedComponents: ReadonlyMap<string, TransformedComponent>, moduleName?: string): GeneratedRoute[];
//# sourceMappingURL=route-generator.d.ts.map