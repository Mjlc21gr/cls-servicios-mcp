// =============================================================================
// Project Scaffolder — generates Angular 20 project skeleton files
// =============================================================================

import type { MigrationOptions, ProjectMeta, ScaffoldFiles } from './pipeline-types.js';
import { toKebabCase } from '../utils/naming.utils.js';

/**
 * Generates the Angular 20 + PrimeNG 19 project skeleton.
 * Returns a map of file paths → file contents.
 */
export function scaffoldProject(
  moduleName: string,
  componentNames: readonly string[],
  options?: MigrationOptions,
  projectMeta?: ProjectMeta,
  detectedDependencies?: readonly string[],
): ScaffoldFiles {
  const files = new Map<string, string>();

  // Always generate .npmrc for PrimeNG peer dep compatibility
  files.set('.npmrc', 'legacy-peer-deps=true\n');

  files.set('package.json', generatePackageJson(moduleName, options, projectMeta, detectedDependencies));
  files.set('angular.json', generateAngularJson(moduleName));
  files.set('tsconfig.json', generateTsConfig());
  files.set('tsconfig.app.json', generateTsConfigApp());
  files.set('src/main.ts', generateMainTs());
  files.set('src/app/app.config.ts', generateAppConfig());
  files.set('src/app/app.component.ts', generateAppComponent());
  files.set('src/index.html', generateIndexHtml(moduleName));
  files.set('src/styles.scss', generateStylesScss());

  // Generate Tailwind config if source project uses Tailwind
  const hasTailwind = projectMeta?.uiLibraries.includes('Tailwind CSS') ||
    projectMeta?.uiLibraries.includes('tailwindcss') ||
    detectedDependencies?.some(d => d.includes('tailwind'));
  if (hasTailwind) {
    files.set('tailwind.config.js', generateTailwindConfig());
    files.set('postcss.config.js', generatePostcssConfig());
  }

  return { files };
}


// ---------------------------------------------------------------------------
// package.json
// ---------------------------------------------------------------------------

function generatePackageJson(
  moduleName: string,
  options?: MigrationOptions,
  projectMeta?: ProjectMeta,
  detectedDependencies?: readonly string[],
): string {
  const deps: Record<string, string> = {
    '@angular/animations': '^20.0.0',
    '@angular/common': '^20.0.0',
    '@angular/compiler': '^20.0.0',
    '@angular/core': '^20.0.0',
    '@angular/forms': '^20.0.0',
    '@angular/platform-browser': '^20.0.0',
    '@angular/platform-browser-dynamic': '^20.0.0',
    '@angular/router': '^20.0.0',
    primeng: '^19.0.0',
    '@primeng/themes': '^19.0.0',
    primeicons: '^7.0.0',
    rxjs: '^7.8.0',
    tslib: '^2.6.0',
    'zone.js': '^0.15.0',
  };

  // Bug 5 Fix: Add detected third-party dependencies
  if (detectedDependencies) {
    const KNOWN_ANGULAR_PKGS = new Set([
      '@angular/animations', '@angular/common', '@angular/compiler', '@angular/core',
      '@angular/forms', '@angular/platform-browser', '@angular/platform-browser-dynamic',
      '@angular/router', 'primeng', '@primeng/themes', 'primeicons', 'rxjs', 'tslib', 'zone.js',
      'react', 'react-dom', 'react-router', 'react-router-dom',
    ]);
    for (const dep of detectedDependencies) {
      const pkgName = dep.startsWith('@') ? dep.split('/').slice(0, 2).join('/') : dep.split('/')[0];
      if (!KNOWN_ANGULAR_PKGS.has(pkgName) && !deps[pkgName]) {
        deps[pkgName] = '*';
      }
    }
  }

  const devDeps: Record<string, string> = {
    '@angular-devkit/build-angular': '^20.0.0',
    '@angular/cli': '^20.0.0',
    '@angular/compiler-cli': '^20.0.0',
    typescript: '^5.8.0',
    // Bug 7 Fix: Add test runner dependencies
    karma: '~6.4.0',
    'karma-chrome-launcher': '~3.2.0',
    'karma-coverage': '~2.2.0',
    'karma-jasmine': '~5.1.0',
    'karma-jasmine-html-reporter': '~2.1.0',
    'jasmine-core': '~5.1.0',
    '@types/jasmine': '~5.1.0',
  };

  const pkg: Record<string, unknown> = {
    name: toKebabCase(moduleName),
    version: '0.0.1',
    private: true,
    scripts: {
      ng: 'ng',
      start: 'ng serve',
      build: 'ng build',
      test: 'ng test',
    },
    dependencies: deps,
    devDependencies: devDeps,
  };

  // Add Tailwind if the source project uses it (ALWAYS, not just when convertTailwind is false)
  const hasTailwind = projectMeta?.uiLibraries.includes('Tailwind CSS') ||
    projectMeta?.uiLibraries.includes('tailwindcss') ||
    detectedDependencies?.some(d => d.includes('tailwind'));
  if (hasTailwind) {
    (pkg.devDependencies as Record<string, string>)['tailwindcss'] = '^3.4.0';
    (pkg.devDependencies as Record<string, string>)['autoprefixer'] = '^10.4.0';
    (pkg.devDependencies as Record<string, string>)['postcss'] = '^8.4.0';
  }

  return JSON.stringify(pkg, null, 2) + '\n';
}


// ---------------------------------------------------------------------------
// angular.json
// ---------------------------------------------------------------------------

function generateAngularJson(moduleName: string): string {
  const projectName = toKebabCase(moduleName);
  const config = {
    $schema: './node_modules/@angular/cli/lib/config/schema.json',
    version: 1,
    newProjectRoot: 'projects',
    projects: {
      [projectName]: {
        projectType: 'application',
        root: '',
        sourceRoot: 'src',
        prefix: 'app',
        architect: {
          build: {
            builder: '@angular-devkit/build-angular:application',
            options: {
              outputPath: `dist/${projectName}`,
              index: 'src/index.html',
              browser: 'src/main.ts',
              tsConfig: 'tsconfig.app.json',
              styles: [
                'src/styles.scss',
                'node_modules/primeicons/primeicons.css',
              ],
              scripts: [],
            },
            configurations: {
              production: {
                budgets: [
                  { type: 'initial', maximumWarning: '500kB', maximumError: '1MB' },
                  { type: 'anyComponentStyle', maximumWarning: '2kB', maximumError: '4kB' },
                ],
                outputHashing: 'all',
              },
              development: {
                optimization: false,
                extractLicenses: false,
                sourceMap: true,
              },
            },
            defaultConfiguration: 'production',
          },
          serve: {
            builder: '@angular-devkit/build-angular:dev-server',
            configurations: {
              production: { buildTarget: `${projectName}:build:production` },
              development: { buildTarget: `${projectName}:build:development` },
            },
            defaultConfiguration: 'development',
          },
          test: {
            builder: '@angular-devkit/build-angular:karma',
            options: {
              tsConfig: 'tsconfig.app.json',
              styles: ['src/styles.scss'],
            },
          },
        },
      },
    },
  };

  return JSON.stringify(config, null, 2) + '\n';
}


// ---------------------------------------------------------------------------
// tsconfig.json
// ---------------------------------------------------------------------------

function generateTsConfig(): string {
  const config = {
    compileOnSave: false,
    compilerOptions: {
      outDir: './dist/out-tsc',
      strict: true,
      noImplicitOverride: true,
      noPropertyAccessFromIndexSignature: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
      target: 'ES2022',
      module: 'ES2022',
      moduleResolution: 'bundler',
      importHelpers: true,
      sourceMap: true,
      declaration: false,
      downlevelIteration: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      lib: ['ES2022', 'dom'],
    },
    angularCompilerOptions: {
      enableI18nLegacyMessageIdFormat: false,
      strictInjectionParameters: true,
      strictInputAccessModifiers: true,
      strictTemplates: true,
    },
  };

  return JSON.stringify(config, null, 2) + '\n';
}

// ---------------------------------------------------------------------------
// tsconfig.app.json
// ---------------------------------------------------------------------------

function generateTsConfigApp(): string {
  const config = {
    extends: './tsconfig.json',
    compilerOptions: {
      outDir: './out-tsc/app',
      types: ['jasmine'],
    },
    files: ['src/main.ts'],
    include: ['src/**/*.ts'],
  };

  return JSON.stringify(config, null, 2) + '\n';
}


// ---------------------------------------------------------------------------
// src/main.ts
// ---------------------------------------------------------------------------

function generateMainTs(): string {
  return `import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
`;
}

// ---------------------------------------------------------------------------
// src/app/app.config.ts
// ---------------------------------------------------------------------------

function generateAppConfig(): string {
  return `import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(),
    provideAnimationsAsync(),
    providePrimeNG({ theme: { preset: Aura } }),
  ],
};
`;
}

// ---------------------------------------------------------------------------
// src/app/app.component.ts
// ---------------------------------------------------------------------------

function generateAppComponent(): string {
  return `import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>',
  styles: [],
})
export class AppComponent {}
`;
}


// ---------------------------------------------------------------------------
// src/index.html
// ---------------------------------------------------------------------------

function generateIndexHtml(moduleName: string): string {
  const title = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <base href="/">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/x-icon" href="favicon.ico">
</head>
<body>
  <app-root></app-root>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// src/styles.scss
// ---------------------------------------------------------------------------

function generateStylesScss(): string {
  return `/* PrimeNG 19 uses preset themes via providePrimeNG() in app.config.ts */
/* Only primeicons CSS is needed as a direct import */

/* Seguros Bolívar Design System theme */
@use './styles/sb-primeng-theme';
`;
}

// ---------------------------------------------------------------------------
// tailwind.config.js (conditional)
// ---------------------------------------------------------------------------

function generateTailwindConfig(): string {
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

function generatePostcssConfig(): string {
  return `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;
}
