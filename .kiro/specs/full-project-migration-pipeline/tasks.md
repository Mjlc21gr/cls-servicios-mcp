# Implementation Plan: Full Project Migration Pipeline

## Overview

Extend the existing `@cls/mcp-front-migrate` MCP server with a project-level orchestration layer. The new `migrate_full_project` MCP tool accepts an entire React project directory, scans every source file, runs each through the existing transformation pipeline, and emits a complete Angular 20 + PrimeNG 19 project ready to `npm install && ng serve`. Implementation uses TypeScript throughout, building on the existing pipeline modules (`AST_Parser`, `State_Mapper`, `Template_Generator`, `PrimeNG_Mapper`, `Code_Emitter`).

## Tasks

- [x] 1. Define shared interfaces and types for the full-project migration pipeline
  - [x] 1.1 Add pipeline-wide interfaces to `src/types.ts` or a new `src/pipeline/pipeline-types.ts`
    - Add `MigrateFullProjectParams`, `MigrationOptions`, `FullMigrationResult`, `MigrationSummary`, `PipelineError` interfaces
    - Add `ScannedProject`, `ScannedFile`, `FileCategory`, `ProjectMeta` interfaces
    - Add `TransformedComponent`, `GeneratedRoute`, `ScaffoldFiles`, `StyleExtractionResult`, `ValidationIssue` interfaces
    - Add `ClassComponentConversion`, `StateManagementDetection`, `StateUsage` interfaces
    - Add `CSSInJSExtraction`, `ExtractedCSSRule` interfaces
    - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 12.1, 12.3_

- [x] 2. Implement Project_Scanner module
  - [x] 2.1 Create `src/pipeline/project-scanner.ts` with `scanProject()` function
    - Recursively discover all files matching `*.tsx`, `*.jsx`, `*.ts`, `*.js`, `*.css`, `*.scss`, `*.less`, `*.json`
    - Exclude `node_modules/**`, `dist/**`, `build/**`, `*.test.*`, `*.spec.*`, `*.stories.*`, `__tests__/**`, `__mocks__/**`
    - Return descriptive error if directory does not exist or contains zero scannable files
    - _Requirements: 2.1, 2.3, 2.5_

  - [x] 2.2 Implement file classification logic in `project-scanner.ts`
    - Classify files into categories: `component`, `service`, `style`, `config`, `asset`
    - Components: `.tsx`/`.jsx` files exporting functions returning JSX (regex + Babel parse)
    - Services: `.ts`/`.js` files with `fetch`/`axios`/HTTP calls without JSX returns
    - Styles: `.css`, `.scss`, `.less` files
    - Configs: `package.json`, `tsconfig.json`, `.babelrc`, `vite.config.*`, `next.config.*`
    - Assets: files in `public/` or `static/` directories
    - _Requirements: 2.2, 15.8_

  - [x] 2.3 Implement dependency graph construction and project metadata detection
    - Parse import statements in component files to build dependency graph (component → child components)
    - Detect package manager: `package-lock.json` (npm), `yarn.lock` (yarn), `pnpm-lock.yaml` (pnpm)
    - Detect build tool: CRA (`react-scripts`), Vite (`vite`), Next.js (`next`), Remix (`@remix-run/react`), Webpack custom
    - Detect TypeScript usage, router presence, UI libraries, state management libraries
    - _Requirements: 2.4, 15.1, 15.2_

  - [ ]* 2.4 Write property tests for Project_Scanner
    - **Property 4: File discovery completeness with exclusion**
    - **Property 5: File classification correctness**
    - **Property 6: Dependency graph correctness**
    - **Property 26: Project metadata detection**
    - **Property 30: Static asset copying**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 15.1, 15.2, 15.8**

  - [ ]* 2.5 Write unit tests for Project_Scanner
    - Test edge cases: empty directory, non-existent path, Next.js `pages/` structure, mixed TS/JS
    - _Requirements: 2.1, 2.5, 15.2_

- [x] 3. Implement class component pre-processor
  - [x] 3.1 Create `src/pipeline/class-component-converter.ts` with `convertClassToFunctional()` function
    - Detect class components (`extends React.Component` or `extends Component`)
    - Convert `this.state.x` → `useState` call, `this.setState({x})` → setter call
    - Convert `componentDidMount` → `useEffect(() => {}, [])`, `componentWillUnmount` → cleanup
    - Convert `this.props.x` → destructured prop, `this.handleClick` → `useCallback`
    - Unwrap `React.memo` / `React.forwardRef` wrappers before parsing
    - _Requirements: 15.3_

  - [ ]* 3.2 Write unit tests for class component converter
    - Test class-to-functional conversion patterns, lifecycle methods, state, props
    - _Requirements: 15.3_

- [x] 4. Checkpoint — Ensure scanner and converter compile and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Project_Scaffolder module
  - [x] 5.1 Create `src/pipeline/project-scaffolder.ts` with `scaffoldProject()` function
    - Generate `package.json` with Angular 20 + PrimeNG 19 + all required dependencies (`@angular/core`, `@angular/common`, `@angular/router`, `@angular/forms`, `@angular/platform-browser`, `@angular/compiler`, `primeng`, `@angular/animations`, `zone.js`, `rxjs`, `tslib`) and TypeScript 5.8+ as devDependency
    - Generate `angular.json` with build/serve/test targets, styles array referencing `src/styles.scss`
    - Generate `tsconfig.json` with `strict: true`, `ES2022`, Angular compiler options
    - Generate `tsconfig.app.json` extending base config
    - Generate `src/main.ts` with `bootstrapApplication(AppComponent, appConfig)`
    - Generate `src/app/app.config.ts` with `provideRouter`, `provideHttpClient`, `provideAnimationsAsync`, `provideZoneChangeDetection`
    - Generate `src/app/app.component.ts` with `<router-outlet>` and `standalone: true`
    - Generate `src/index.html` with `<app-root>`, meta tags, charset, viewport
    - Generate `src/styles.scss` importing SB theme + PrimeNG
    - No extraneous files — only files required for the project to build and run
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.5, 11.1, 11.2, 11.3_

  - [ ]* 5.2 Write property tests for Project_Scaffolder
    - **Property 10: Scaffold dependency completeness**
    - **Property 29: Standard output directory structure**
    - **Validates: Requirements 4.1, 10.2, 15.7**

  - [ ]* 5.3 Write unit tests for Project_Scaffolder
    - Verify specific file content: package.json deps, angular.json structure, tsconfig options
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 6. Implement Route_Generator module
  - [x] 6.1 Create `src/pipeline/route-generator.ts` with `generateRoutes()` function
    - Search for imports from `react-router-dom` or `react-router` in all component files
    - Extract `<Route path="..." component={...} />` and `<Route path="..." element={<.../>} />` patterns
    - Extract route definitions from `createBrowserRouter` / `createRoutesFromElements` calls
    - For Next.js: derive routes from `pages/` or `app/` directory structure
    - Map each route's component to its Angular equivalent
    - Generate `app.routes.ts` with `loadComponent` lazy loading for all routes
    - Ensure every route's import path resolves to an existing component file
    - If no router detected, generate default single-route config pointing to main component
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 6.2 Write property tests for Route_Generator
    - **Property 12: Route generation with lazy loading and valid imports**
    - **Validates: Requirements 5.1, 5.2, 5.3, 10.3**

  - [ ]* 6.3 Write unit tests for Route_Generator
    - Test edge cases: no router, nested routes, dynamic routes, Next.js file-based routing
    - _Requirements: 5.1, 5.4_

- [x] 7. Implement Signal_Fixer module
  - [x] 7.1 Create `src/pipeline/signal-fixer.ts` with `fixSignals()` function
    - Replace `[(ngModel)]="signalName"` → `[ngModel]="signalName()" (ngModelChange)="signalName.set($event)"` in all `.component.html` files
    - Ensure signal reads use `()` syntax in interpolations (`{{ signalName() }}`), `@if` conditions, `@for` collections, and property bindings (`[value]="signalName()"`)
    - Scan each `.component.ts` for signal references in the template that lack a corresponding `signal()`, `computed()`, or `input()` declaration — add missing declarations with type-inferred defaults
    - Ensure `FormsModule` is imported when `ngModel` is used
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 7.2 Write property tests for Signal_Fixer
    - **Property 13: Signal compatibility — template signal reads and ngModel**
    - **Property 14: Signal declaration completeness**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

  - [ ]* 7.3 Write unit tests for Signal_Fixer
    - Test specific signal fix patterns, FormsModule injection
    - _Requirements: 6.1, 6.4_

- [x] 8. Implement PrimeNG_Sanitizer module
  - [x] 8.1 Create `src/pipeline/primeng-sanitizer.ts` with `sanitizePrimeNG()` function
    - Remove `required` attribute from: `p-select`, `p-dropdown`, `p-checkbox`, `p-radioButton`, `p-inputSwitch`, `p-calendar`, `p-autoComplete`, `p-multiSelect`
    - Ensure PrimeNG 19 import paths (e.g., `primeng/select` not `primeng/dropdown` for Select)
    - Ensure standalone component API imports (no NgModule-style imports)
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 8.2 Write property tests for PrimeNG_Sanitizer
    - **Property 15: PrimeNG attribute sanitization**
    - **Validates: Requirements 7.1, 10.6**

  - [ ]* 8.3 Write unit tests for PrimeNG_Sanitizer
    - Test specific attribute removal patterns
    - _Requirements: 7.1_

- [x] 9. Checkpoint — Ensure all post-processing modules compile and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement Style_Aggregator module
  - [x] 10.1 Create `src/pipeline/style-aggregator.ts` with `aggregateStyles()` function
    - Read and parse every CSS/SCSS/LESS file imported by each React component
    - Scope imported CSS rules under `:host` and copy to `.component.scss`
    - Convert CSS Module references (`styles.className`) to plain class names in templates, copy rules to `.scss`
    - Extract CSS from styled-components / emotion tagged template literals → static SCSS
    - Extract MUI `sx` prop object expressions → CSS properties in `.scss`
    - Preserve layout properties (flexbox, grid, positioning), media queries, animations/transitions verbatim
    - Convert LESS variables to SCSS variables
    - Generate global `src/styles.scss` importing PrimeNG theme, primeicons, SB theme, and shared styles
    - Generate SB PrimeNG theme override file (`_sb-primeng-theme.scss`)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 14.1, 14.3, 14.5, 14.6, 14.7, 14.8_

  - [ ]* 10.2 Write property tests for Style_Aggregator
    - **Property 16: CSS import extraction**
    - **Property 17: CSS preservation — layout, media queries, animations**
    - **Property 18: CSS Module conversion**
    - **Property 19: CSS-in-JS extraction**
    - **Validates: Requirements 8.5, 14.1, 14.3, 14.5, 14.6, 14.7, 14.8**

  - [ ]* 10.3 Write unit tests for Style_Aggregator
    - Test CSS Module conversion, Tailwind handling, CSS-in-JS extraction examples
    - _Requirements: 14.3, 14.4, 14.8_

- [x] 11. Implement Output_Validator module
  - [x] 11.1 Create `src/pipeline/output-validator.ts` with `validateOutput()` function
    - Verify every `.component.ts` has matching `.component.html`, `.component.scss`, `.component.spec.ts`
    - Verify `package.json` contains all required Angular 20 + PrimeNG 19 dependencies
    - Verify `app.routes.ts` references only existing components with valid import paths
    - Verify no `.ts` file contains `: any` (must use `unknown`)
    - Verify all components have `standalone: true`
    - Verify no PrimeNG component has unsupported `required` attribute
    - Verify no empty/placeholder files (files must have meaningful content)
    - Return validation issues alongside generated files (non-blocking)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [ ]* 11.2 Write property tests for Output_Validator
    - **Property 24: No `any` type in generated TypeScript**
    - **Property 25: All components use standalone: true**
    - **Validates: Requirements 10.4, 10.5**

  - [ ]* 11.3 Write unit tests for Output_Validator
    - Test specific validation rule examples
    - _Requirements: 10.1, 10.6_

- [x] 12. Checkpoint — Ensure all pipeline modules compile and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement Pipeline_Orchestrator module
  - [x] 13.1 Create `src/pipeline/project-orchestrator.ts` with `migrateFullProject()` function
    - Validate `sourceDir` exists and is readable; return error immediately if not
    - Call `scanProject()` to discover files
    - Topologically sort components by dependency graph (Kahn's algorithm)
    - Pre-process class components with `convertClassToFunctional()` before pipeline
    - Iterate components calling existing per-component pipeline: `parseReactComponent` → `mapStateToAngular` → `generateAngularTemplate` → `mapToPrimeNG` → `emitAngularArtifact`
    - Wrap each component transformation in try/catch — log error, skip failed component, continue
    - Call `aggregateStyles()` for CSS extraction
    - Call `scaffoldProject()` for Angular skeleton
    - Call `generateRoutes()` for routing
    - Call `fixSignals()` for signal post-processing
    - Call `sanitizePrimeNG()` for attribute cleanup
    - Call `validateOutput()` for final checks
    - Assemble all files into `outputDir` with correct directory structure
    - Copy static assets from `public/`/`static/` to `src/assets/`
    - Return `FullMigrationResult` with status, filesGenerated, migrationSummary, validationReport, duration, errors
    - Handle state management libraries (Redux, Zustand, Jotai, Recoil, MobX, Context) → Angular services with signals
    - Handle any directory structure and organize output in standard Angular feature-module layout
    - Handle TypeScript and JavaScript source files, using `unknown` as fallback type
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1, 3.2, 3.3, 3.4, 3.5, 9.1, 9.2, 9.3, 9.4, 9.5, 11.1, 11.2, 11.3, 15.3, 15.4, 15.5, 15.6, 15.7_

  - [ ]* 13.2 Write property tests for Pipeline_Orchestrator
    - **Property 7: Topological processing order**
    - **Property 8: Component file completeness**
    - **Property 9: Error resilience — valid components survive invalid siblings**
    - **Property 11: No extraneous files**
    - **Property 21: Pipeline error response structure**
    - **Property 22: Pipeline success response structure**
    - **Property 23: Validation report with files on failure**
    - **Validates: Requirements 1.3, 1.4, 3.2, 3.4, 3.5, 4.7, 10.7, 11.1, 12.3**

  - [ ]* 13.3 Write unit tests for Pipeline_Orchestrator
    - Test end-to-end with small sample React project
    - _Requirements: 1.1, 3.4_

- [x] 14. Register `migrate_full_project` MCP tool in `src/server.ts`
  - [x] 14.1 Add `migrate_full_project` tool registration to `createServer()` in `src/server.ts`
    - Register tool with name `migrate_full_project`, description, and Zod schema for `sourceDir`, `outputDir`, `moduleName`, and optional `options` object
    - Handler calls `migrateFullProject()` from the orchestrator
    - Return JSON response with `status`, `outputDir`, `filesGenerated`, `migrationSummary`, `validationReport`, `duration`
    - Return error response if `sourceDir` does not exist or is not readable
    - No user confirmation or additional input required
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [ ]* 14.2 Write unit tests for MCP tool registration
    - Test tool registration and invocation
    - _Requirements: 12.1, 12.2_

- [x] 15. Rebuild and restart the HTTP server
  - [x] 15.1 Run `npm run build` to compile all TypeScript
    - Verify no compilation errors
    - Ensure `dist/` output is complete

  - [x] 15.2 Verify the HTTP server starts correctly
    - Confirm `migrate_full_project` tool is registered alongside existing tools
    - Verify `/health` endpoint responds
    - _Requirements: 12.1, 12.2_

- [x] 16. Final checkpoint — Full pipeline validation
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing per-component pipeline (`AST_Parser`, `State_Mapper`, `Template_Generator`, `PrimeNG_Mapper`, `Code_Emitter`) is reused as-is — no modifications needed
- All new modules are in `src/pipeline/` alongside existing pipeline code
- The orchestrator coordinates all stages and handles fail-forward error recovery
