# Requirements Document

## Introduction

This feature adds a unified, project-level migration pipeline to the existing `@cls/mcp-front-migrate` MCP server. Today the server exposes 10 tools that operate on individual React components. The Full Project Migration Pipeline introduces a new MCP tool (`migrate_full_project`) and supporting orchestration layer that takes an entire React project directory as input, scans every component, service, style, and configuration file, runs each through the existing transformation pipeline, and emits a complete, self-contained Angular 20 project that is ready to `npm install && ng serve` without any manual intervention.

The pipeline must be fully autonomous — no authorization prompts, no human confirmation gates — and must address known Angular/PrimeNG compatibility issues (signal-based `ngModel`, missing `.scss` files, missing signal declarations, PrimeNG 19 attribute compatibility, and correct `app.routes.ts` imports).

## Glossary

- **Pipeline_Orchestrator**: The top-level module that coordinates the full-project migration flow from scanning to output.
- **Project_Scanner**: The module responsible for recursively discovering all React source files, styles, assets, and configuration in the input project directory.
- **Component_Transformer**: The existing per-component pipeline (AST_Parser → State_Mapper → Template_Generator → PrimeNG_Mapper → Code_Emitter) applied to each discovered React component.
- **Project_Scaffolder**: The module that generates the Angular project skeleton (package.json, angular.json, tsconfig.json, app.config.ts, app.routes.ts, styles.scss, main.ts, index.html).
- **Signal_Fixer**: The post-processing module that corrects signal-related issues in generated code (ngModel with signals, missing signal declarations).
- **PrimeNG_Sanitizer**: The post-processing module that removes unsupported HTML attributes from PrimeNG components (e.g., `required` on `p-select`).
- **Route_Generator**: The module that builds `app.routes.ts` with correct lazy-loaded routes and proper component imports.
- **Style_Aggregator**: The module that collects and generates all `.scss` files, the global `styles.scss`, and the Seguros Bolívar Design System theme.
- **Output_Validator**: The module that performs final validation on the generated project to ensure it is structurally complete and free of known issues.
- **MCP_Tool**: A tool exposed by the MCP server that can be invoked by an AI agent or client without requiring human confirmation.
- **React_Project**: The source directory containing a React application with components (.tsx/.jsx), services, styles, and configuration files.
- **Angular_Project**: The output directory containing a complete, runnable Angular 20 application with PrimeNG 19 and the Seguros Bolívar Design System.

## Requirements

### Requirement 1: Autonomous Execution

**User Story:** As a developer, I want the migration pipeline to execute fully autonomously, so that no human confirmation or authorization is required during the migration process.

#### Acceptance Criteria

1. WHEN the `migrate_full_project` MCP_Tool is invoked, THE Pipeline_Orchestrator SHALL execute all pipeline stages sequentially without requesting user confirmation at any stage.
2. THE MCP_Tool SHALL accept a single input parameter specifying the React_Project source directory path and an output directory path for the Angular_Project.
3. IF a non-recoverable error occurs during any pipeline stage, THEN THE Pipeline_Orchestrator SHALL halt execution, record the error with the failing stage name and error details, and return a structured error response.
4. WHEN the pipeline completes all stages, THE Pipeline_Orchestrator SHALL return a structured success response containing the output directory path, a list of all generated files, and a migration summary with counts of components, services, routes, and styles migrated.

### Requirement 2: Project Scanning

**User Story:** As a developer, I want the pipeline to automatically discover all React source files in my project, so that every component, service, style, and configuration file is included in the migration.

#### Acceptance Criteria

1. WHEN a React_Project directory is provided, THE Project_Scanner SHALL recursively scan the directory tree and identify all files matching the patterns: `*.tsx`, `*.jsx`, `*.ts`, `*.js`, `*.css`, `*.scss`, `*.less`, `*.json`.
2. THE Project_Scanner SHALL classify discovered files into categories: components (files exporting React components with JSX returns), services (files with API calls or business logic without JSX), styles (CSS/SCSS/LESS files), configuration (package.json, tsconfig.json), and assets (images, fonts, static files).
3. THE Project_Scanner SHALL exclude files matching the patterns: `node_modules/**`, `dist/**`, `build/**`, `*.test.*`, `*.spec.*`, `*.stories.*`, `__tests__/**`, `__mocks__/**`.
4. THE Project_Scanner SHALL build a dependency graph of components by analyzing import statements, identifying which components are children of other components.
5. IF the React_Project directory does not exist or contains zero scannable files, THEN THE Project_Scanner SHALL return a descriptive error specifying the directory path and the reason for failure.

### Requirement 3: Complete Component Transformation

**User Story:** As a developer, I want every React component in my project to be transformed to an Angular standalone component, so that the output project contains all the functionality of the original.

#### Acceptance Criteria

1. WHEN the Project_Scanner identifies a React component file, THE Component_Transformer SHALL process the file through the full pipeline: AST parsing, state mapping (useState→signal, useEffect→effect, useMemo→computed, useCallback→method, useRef→viewChild), template generation (JSX→Angular template), PrimeNG mapping, and code emission.
2. THE Component_Transformer SHALL generate four files per component: `{kebab-name}.component.ts`, `{kebab-name}.component.html`, `{kebab-name}.component.scss`, and `{kebab-name}.component.spec.ts`.
3. THE Component_Transformer SHALL preserve all component logic including state management, event handlers, lifecycle hooks, computed values, and service injections.
4. IF a component fails to parse or transform, THEN THE Component_Transformer SHALL log the error with the file name and error details, skip the component, and continue processing remaining components.
5. THE Component_Transformer SHALL process components in dependency order (leaf components first, parent components after their children) to ensure child component selectors are available when generating parent templates.

### Requirement 4: Angular Project Scaffolding

**User Story:** As a developer, I want the pipeline to generate a complete Angular project structure with all configuration files, so that the output project is ready to run immediately.

#### Acceptance Criteria

1. THE Project_Scaffolder SHALL generate a `package.json` with Angular 20 core dependencies (`@angular/core`, `@angular/common`, `@angular/router`, `@angular/forms`, `@angular/platform-browser`, `@angular/compiler`), PrimeNG 19 (`primeng`), `@angular/animations`, `zone.js`, `rxjs`, `tslib`, and TypeScript 5.8+ as a dev dependency.
2. THE Project_Scaffolder SHALL generate an `angular.json` with a valid project configuration including build, serve, and test targets, with the correct `styles` array referencing `src/styles.scss` and PrimeNG theme assets.
3. THE Project_Scaffolder SHALL generate a `tsconfig.json` with `strict: true`, `target: "ES2022"`, `module: "ES2022"`, and Angular-specific compiler options (`experimentalDecorators`, `emitDecoratorMetadata`).
4. THE Project_Scaffolder SHALL generate `src/main.ts` bootstrapping the application with `bootstrapApplication` and `appConfig`.
5. THE Project_Scaffolder SHALL generate `src/app/app.config.ts` with `provideRouter`, `provideHttpClient`, `provideAnimationsAsync`, and `provideZoneChangeDetection`.
6. THE Project_Scaffolder SHALL generate `src/index.html` with proper meta tags, charset, viewport, and a root `<app-root>` element.
7. THE Project_Scaffolder SHALL generate only files required for the Angular project to build and run; no extraneous files, placeholder files, or unused configuration files SHALL be created.

### Requirement 5: Route Generation

**User Story:** As a developer, I want the pipeline to automatically generate Angular routing configuration from the React project structure, so that navigation works in the output project.

#### Acceptance Criteria

1. WHEN the Project_Scanner identifies React Router usage (imports from `react-router-dom`, `react-router`), THE Route_Generator SHALL extract route definitions and generate equivalent Angular routes in `src/app/app.routes.ts`.
2. THE Route_Generator SHALL use lazy loading (`loadComponent`) for all route components to optimize bundle size.
3. THE Route_Generator SHALL include the correct import statement for each routed component, referencing the component by its file path relative to the routes file.
4. IF no React Router usage is detected, THEN THE Route_Generator SHALL generate a default route configuration with a single route pointing to the main/root component.
5. THE Route_Generator SHALL generate an `AppComponent` in `src/app/app.component.ts` that includes `<router-outlet>` and is properly imported in the application bootstrap.

### Requirement 6: Signal Compatibility Fixes

**User Story:** As a developer, I want the pipeline to automatically fix Angular signal compatibility issues, so that the generated code compiles and runs without manual corrections.

#### Acceptance Criteria

1. THE Signal_Fixer SHALL replace all occurrences of `[(ngModel)]="signalName"` with `[ngModel]="signalName()" (ngModelChange)="signalName.set($event)"` in generated templates, because two-way binding with signals is not supported in Angular.
2. THE Signal_Fixer SHALL scan all generated `.component.ts` files and verify that every signal referenced in the template has a corresponding `signal()`, `computed()`, or `input()` declaration in the component class.
3. IF a signal is referenced in a template but not declared in the component class, THEN THE Signal_Fixer SHALL add a `signal()` declaration with a type-inferred default value to the component class.
4. THE Signal_Fixer SHALL ensure that signal reads in templates use the function call syntax (`signalName()`) in interpolations, property bindings, `@if` conditions, and `@for` collections.

### Requirement 7: PrimeNG 19 Compatibility

**User Story:** As a developer, I want the pipeline to generate PrimeNG 19 compatible code, so that all UI components work correctly with Angular 20.

#### Acceptance Criteria

1. THE PrimeNG_Sanitizer SHALL remove the `required` HTML attribute from all PrimeNG components that do not support it as an `@Input` (`p-select`, `p-dropdown`, `p-checkbox`, `p-radioButton`, `p-inputSwitch`, `p-calendar`, `p-autoComplete`, `p-multiSelect`).
2. THE PrimeNG_Sanitizer SHALL use PrimeNG 19 component names and import paths (e.g., `Select` from `primeng/select` instead of `Dropdown` from `primeng/dropdown`).
3. THE PrimeNG_Sanitizer SHALL ensure all PrimeNG module imports in component `imports` arrays use the standalone component API compatible with PrimeNG 19.
4. WHEN a React UI library component (MUI, Ant Design, Chakra UI, React Bootstrap) is detected, THE PrimeNG_Sanitizer SHALL map the component to its PrimeNG 19 equivalent using the existing `PRIMENG_COMPONENT_MAP`.

### Requirement 8: Style and Theme Generation

**User Story:** As a developer, I want the pipeline to generate all style files with the Seguros Bolívar Design System theme, so that the output project preserves the visual design of the original.

#### Acceptance Criteria

1. THE Style_Aggregator SHALL generate a `.component.scss` file for every generated component, containing component-specific styles derived from the original React component's CSS classes and inline styles.
2. THE Style_Aggregator SHALL generate a global `src/styles.scss` file that imports the Seguros Bolívar Design System CSS variables, PrimeNG theme, and shared component styles.
3. THE Style_Aggregator SHALL convert React CSS class names (camelCase from CSS modules, Tailwind utility classes, MUI class overrides) to Angular-compatible SCSS using Seguros Bolívar design tokens (`--sb-*` CSS variables).
4. THE Style_Aggregator SHALL generate the Seguros Bolívar PrimeNG theme override file (`_sb-primeng-theme.scss`) with corporate color palette, typography, spacing, and component-specific overrides.
5. IF a React component references a CSS/SCSS file via import, THEN THE Style_Aggregator SHALL extract the styles from that file and include them in the corresponding Angular component's `.scss` file.

### Requirement 9: Service Migration

**User Story:** As a developer, I want the pipeline to migrate React services and API calls to Angular services, so that backend communication works in the output project.

#### Acceptance Criteria

1. WHEN the Project_Scanner identifies a service file (a TypeScript/JavaScript file containing `fetch`, `axios`, or HTTP client calls without JSX), THE Pipeline_Orchestrator SHALL generate a corresponding Angular `@Injectable` service with `HttpClient` using `inject()`.
2. THE service generator SHALL map `fetch`/`axios` calls to `HttpClient` methods (`get`, `post`, `put`, `delete`, `patch`) with proper typing and `Observable` return types.
3. THE service generator SHALL use the configured base URL (`/servicios-core/api/v1/`) for all API endpoints.
4. THE service generator SHALL generate a `.service.spec.ts` file for each service with `HttpClientTestingModule` setup and method-level tests.
5. WHEN a React component uses a custom hook that wraps API calls, THE Pipeline_Orchestrator SHALL generate an Angular service from the hook and inject it into the component using `inject()`.

### Requirement 10: Output Validation

**User Story:** As a developer, I want the pipeline to validate the generated project before returning it, so that I can be confident the output is structurally complete and free of known issues.

#### Acceptance Criteria

1. THE Output_Validator SHALL verify that every generated `.component.ts` file has a corresponding `.component.html`, `.component.scss`, and `.component.spec.ts` file.
2. THE Output_Validator SHALL verify that `package.json` contains all required dependencies for Angular 20 and PrimeNG 19.
3. THE Output_Validator SHALL verify that `app.routes.ts` references only components that exist in the generated project and that all import paths are valid.
4. THE Output_Validator SHALL verify that no generated TypeScript file contains the `any` type (use `unknown` instead).
5. THE Output_Validator SHALL verify that all generated components use `standalone: true` in their `@Component` decorator.
6. THE Output_Validator SHALL verify that no PrimeNG component has unsupported HTML attributes (e.g., `required` on `p-select`).
7. IF validation fails, THEN THE Output_Validator SHALL return a list of all validation errors with file paths and descriptions, and the pipeline SHALL still return the generated files alongside the validation report.

### Requirement 11: No Extraneous Files

**User Story:** As a developer, I want the pipeline to generate only the files needed for the Angular project, so that the output is clean and free of unnecessary artifacts.

#### Acceptance Criteria

1. THE Pipeline_Orchestrator SHALL generate only files that are required for the Angular project to build and run: component files (.ts, .html, .scss, .spec.ts), service files (.service.ts, .service.spec.ts), model/interface files (.model.ts), configuration files (package.json, angular.json, tsconfig.json, main.ts, app.config.ts, app.routes.ts, index.html, styles.scss), and theme files.
2. THE Pipeline_Orchestrator SHALL NOT generate Tailwind CSS configuration files, federation configuration files, or micro-frontend shell files unless explicitly requested via an input parameter.
3. THE Pipeline_Orchestrator SHALL NOT generate empty placeholder files, `.gitkeep` files, or files with only TODO comments.

### Requirement 12: MCP Tool Interface

**User Story:** As an AI agent, I want a single MCP tool that migrates an entire React project, so that I can invoke the full migration with one tool call.

#### Acceptance Criteria

1. THE MCP server SHALL expose a tool named `migrate_full_project` that accepts the following parameters: `sourceDir` (string, required — path to the React project), `outputDir` (string, required — path for the Angular output), `moduleName` (string, required — name of the Angular module/feature), and `options` (object, optional — overrides for target Angular version, PrimeNG version, strict mode, and base API URL).
2. WHEN `migrate_full_project` is invoked, THE MCP server SHALL execute the full pipeline without requesting any additional user input or confirmation.
3. THE `migrate_full_project` tool SHALL return a JSON response containing: `status` ("success" or "error"), `outputDir`, `filesGenerated` (array of file paths), `migrationSummary` (counts of components, services, routes, styles), `validationReport` (array of warnings/errors from Output_Validator), and `duration` (total execution time in milliseconds).
4. IF the `sourceDir` does not exist or is not readable, THEN THE MCP_Tool SHALL return an error response without executing any pipeline stages.

### Requirement 13: Parser Round-Trip Integrity

**User Story:** As a developer, I want confidence that the AST parsing and code emission pipeline preserves component semantics, so that the migrated Angular components behave equivalently to the original React components.

#### Acceptance Criteria

1. FOR ALL valid React component source code, parsing with AST_Parser then emitting with Code_Emitter SHALL produce an Angular component that contains the same number of state variables (signals), effects, computed values, methods, and template bindings as the original React component.
2. FOR ALL valid React component source code, THE AST_Parser SHALL produce a ComponentIR where `componentName` is non-empty, `fileName` is the kebab-case equivalent of `componentName`, and `jsxTree` has at least one node.
3. THE Code_Emitter SHALL produce a `.component.ts` file that is valid TypeScript (no syntax errors) for every ComponentIR that has a non-empty `componentName` and a non-empty `angularTemplate`.

### Requirement 14: Visual Fidelity — 1:1 Design Preservation

**User Story:** As a developer, I want the Angular output to look visually identical to the original React application, so that the migration does not alter the user experience or visual composition.

#### Acceptance Criteria

1. THE Style_Aggregator SHALL read and parse every CSS, SCSS, and LESS file imported by each React component (via `import './styles.css'`, `import styles from './Component.module.css'`, or inline `<style>` tags) and include the extracted rules in the corresponding Angular `.component.scss` file.
2. WHEN a React component uses inline styles via the `style` JSX attribute (e.g., `style={{ color: 'red', padding: '16px' }}`), THE Template_Generator SHALL convert them to Angular `[ngStyle]` bindings preserving the exact CSS property names and values.
3. WHEN a React component uses CSS Modules (e.g., `styles.container`), THE Style_Aggregator SHALL convert the module references to plain CSS class names in the Angular template and copy the corresponding CSS rules into the component's `.scss` file.
4. WHEN a React component uses Tailwind CSS utility classes, THE Style_Aggregator SHALL preserve the class names in the Angular template and include Tailwind CSS as a dependency in the generated `package.json` and configure it in `angular.json`, OR convert them to equivalent SCSS rules using Seguros Bolívar design tokens if the `convertTailwind` option is enabled.
5. THE Style_Aggregator SHALL preserve the original layout structure (flexbox, grid, positioning) by copying layout-related CSS properties verbatim into the Angular component's `.scss` file.
6. THE Style_Aggregator SHALL preserve responsive media queries from the React project's stylesheets and include them in the corresponding Angular `.component.scss` files.
7. THE Style_Aggregator SHALL preserve CSS animations and transitions from the React project and include them in the Angular component's `.scss` file.
8. WHEN the React project uses a CSS-in-JS library (styled-components, emotion, MUI `sx` prop), THE Style_Aggregator SHALL extract the CSS rules from the JavaScript expressions and convert them to static SCSS rules in the Angular component's `.scss` file.

### Requirement 15: Universal Standardization — Any React Project

**User Story:** As a developer, I want the pipeline to work with any standard React project regardless of its tooling, so that I can migrate projects built with different React stacks.

#### Acceptance Criteria

1. THE Project_Scanner SHALL detect the React project's package manager (npm, yarn, pnpm) by checking for `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml`, and use this information to read dependency versions from the lock file or `package.json`.
2. THE Project_Scanner SHALL detect the React project's build tool (Create React App, Vite, Next.js, Remix, Webpack custom) by analyzing `package.json` scripts and configuration files, and adapt the scanning strategy accordingly (e.g., Next.js `pages/` or `app/` directory, CRA `src/` directory).
3. THE Component_Transformer SHALL handle React components written in any of the following patterns: function components with hooks, arrow function components, class components (converting `this.state` to signals and lifecycle methods to Angular equivalents), and components wrapped in `React.memo`, `React.forwardRef`, or higher-order components.
4. THE Pipeline_Orchestrator SHALL handle React projects that use any combination of the following UI libraries: MUI (Material UI), Ant Design, Chakra UI, React Bootstrap, Tailwind CSS, styled-components, emotion, CSS Modules, plain CSS/SCSS, and map them to PrimeNG 19 equivalents or preserve the original styles.
5. THE Pipeline_Orchestrator SHALL handle React projects that use any of the following state management libraries: Redux, Zustand, Jotai, Recoil, MobX, React Context, and convert them to Angular services with signals or NgRx equivalents.
6. THE Pipeline_Orchestrator SHALL handle React projects with TypeScript or JavaScript source files, inferring types from JavaScript files where possible and using `unknown` as a fallback type.
7. THE Pipeline_Orchestrator SHALL handle React projects with any directory structure (flat, feature-based, domain-driven) and organize the Angular output in a standard Angular feature-module structure (`src/app/features/{module}/components/`, `src/app/features/{module}/services/`, `src/app/features/{module}/models/`).
8. THE Project_Scanner SHALL read the React project's `public/` or `static/` directory and copy static assets (images, fonts, icons, favicon) to the Angular project's `src/assets/` directory.
