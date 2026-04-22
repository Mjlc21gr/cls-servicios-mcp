// =============================================================================
// Project Scaffolder — generates Angular 20 + PrimeNG 21 + Tailwind v4 project
// =============================================================================
import { toKebabCase } from '../utils/naming.utils.js';
/**
 * Generates the Angular 20 + PrimeNG 21 + Tailwind v4 project skeleton.
 * Returns a map of file paths → file contents.
 */
export function scaffoldProject(moduleName, componentNames, options, projectMeta, detectedDependencies) {
    const files = new Map();
    files.set('.npmrc', 'legacy-peer-deps=true\n');
    files.set('package.json', generatePackageJson(moduleName, options, projectMeta, detectedDependencies));
    files.set('angular.json', generateAngularJson(moduleName));
    files.set('tsconfig.json', generateTsConfig());
    files.set('tsconfig.app.json', generateTsConfigApp());
    files.set('src/main.ts', generateMainTs());
    files.set('src/app/app.config.ts', generateAppConfig());
    files.set('src/app/app.component.ts', generateAppComponent());
    files.set('src/index.html', generateIndexHtml(moduleName));
    files.set('public/favicon.ico', ''); // placeholder
    files.set('src/styles.scss', generateStylesScss());
    // Tailwind v4: .postcssrc.json + tailwind.css (official Angular setup)
    files.set('.postcssrc.json', generatePostcssRc());
    files.set('src/tailwind.css', '@import "tailwindcss";\n@import "tailwindcss-primeui";\n');
    return { files };
}
// ---------------------------------------------------------------------------
// package.json — aligned with CLS Clever project reference
// ---------------------------------------------------------------------------
function generatePackageJson(moduleName, options, projectMeta, detectedDependencies) {
    const deps = {
        '@angular/common': '^20.3.0',
        '@angular/compiler': '^20.3.0',
        '@angular/core': '^20.3.0',
        '@angular/forms': '^20.3.0',
        '@angular/platform-browser': '^20.3.0',
        '@angular/router': '^20.3.0',
        '@primeng/themes': '~21.0.0',
        'primeicons': '^7.0.0',
        'primeng': '21.1.1',
        'rxjs': '~7.8.0',
        'tslib': '^2.3.0',
    };
    // Add detected third-party dependencies from the React project
    if (detectedDependencies) {
        const SKIP = new Set([
            '@angular/common', '@angular/compiler', '@angular/core', '@angular/forms',
            '@angular/platform-browser', '@angular/router', 'primeng', '@primeng/themes',
            'primeicons', 'rxjs', 'tslib',
            'react', 'react-dom', 'react-router', 'react-router-dom',
            'next', 'remix', '@remix-run/react', '@remix-run/node',
        ]);
        for (const dep of detectedDependencies) {
            const pkgName = dep.startsWith('@') ? dep.split('/').slice(0, 2).join('/') : dep.split('/')[0];
            if (!SKIP.has(pkgName) && !deps[pkgName]) {
                deps[pkgName] = '*';
            }
        }
    }
    const devDeps = {
        '@angular/build': '^20.3.13',
        '@angular/cli': '^20.3.10',
        '@angular/compiler-cli': '^20.3.0',
        '@angular/platform-browser-dynamic': '^20.3.0',
        '@tailwindcss/postcss': '^4.1.18',
        '@types/jest': '^29.5.14',
        'jest': '^29.7.0',
        'jest-environment-jsdom': '^29.7.0',
        'jest-preset-angular': '^14.4.0',
        'postcss': '^8.5.6',
        'tailwindcss': '^4.1.18',
        'tailwindcss-primeui': '^0.6.1',
        'typescript': '~5.9.2',
    };
    const pkg = {
        name: toKebabCase(moduleName),
        version: '0.0.1',
        private: true,
        scripts: {
            ng: 'ng',
            start: 'ng serve',
            build: 'ng build',
            test: 'jest',
            'test:watch': 'jest --watch',
            'test:coverage': 'jest --coverage',
        },
        dependencies: deps,
        devDependencies: devDeps,
    };
    return JSON.stringify(pkg, null, 2) + '\n';
}
// ---------------------------------------------------------------------------
// angular.json — uses @angular/build (not @angular-devkit/build-angular)
// ---------------------------------------------------------------------------
function generateAngularJson(moduleName) {
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
                        builder: '@angular/build:application',
                        options: {
                            outputPath: `dist/${projectName}`,
                            browser: 'src/main.ts',
                            tsConfig: 'tsconfig.app.json',
                            inlineStyleLanguage: 'scss',
                            assets: [{ glob: '**/*', input: 'public' }],
                            styles: [
                                'src/tailwind.css',
                                'src/styles.scss',
                                'node_modules/primeicons/primeicons.css',
                            ],
                            scripts: [],
                        },
                        configurations: {
                            production: {
                                budgets: [
                                    { type: 'initial', maximumWarning: '500kB', maximumError: '2MB' },
                                    { type: 'anyComponentStyle', maximumWarning: '4kB', maximumError: '8kB' },
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
                        builder: '@angular/build:dev-server',
                        configurations: {
                            production: { buildTarget: `${projectName}:build:production` },
                            development: { buildTarget: `${projectName}:build:development` },
                        },
                        defaultConfiguration: 'development',
                    },
                },
            },
        },
    };
    return JSON.stringify(config, null, 2) + '\n';
}
// ---------------------------------------------------------------------------
// .postcssrc.json — Tailwind v4 official Angular config
// ---------------------------------------------------------------------------
function generatePostcssRc() {
    return JSON.stringify({
        plugins: {
            '@tailwindcss/postcss': {},
        },
    }, null, 2) + '\n';
}
// ---------------------------------------------------------------------------
// tsconfig.json
// ---------------------------------------------------------------------------
function generateTsConfig() {
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
function generateTsConfigApp() {
    const config = {
        extends: './tsconfig.json',
        compilerOptions: {
            outDir: './out-tsc/app',
            types: ['jest'],
        },
        files: ['src/main.ts'],
        include: ['src/**/*.ts'],
    };
    return JSON.stringify(config, null, 2) + '\n';
}
// ---------------------------------------------------------------------------
// src/main.ts
// ---------------------------------------------------------------------------
function generateMainTs() {
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
function generateAppConfig() {
    return `import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { providePrimeNG } from 'primeng/config';
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

import { routes } from './app.routes';

const AppPreset = definePreset(Aura, {});

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    providePrimeNG({
      theme: {
        preset: AppPreset,
        options: {
          cssLayer: {
            name: 'primeng',
            order: 'theme, base, primeng',
          },
        },
      },
    }),
  ],
};
`;
}
// ---------------------------------------------------------------------------
// src/app/app.component.ts
// ---------------------------------------------------------------------------
function generateAppComponent() {
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
function generateIndexHtml(moduleName) {
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
function generateStylesScss() {
    return `/* PrimeNG 21 — theme configured via providePrimeNG() in app.config.ts */

/* Global resets */
*, *::before, *::after { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  font-family: var(--font-family, 'Segoe UI', system-ui, -apple-system, sans-serif);
}

:focus-visible {
  outline: 2px solid var(--p-primary-500, #0066cc);
  outline-offset: 2px;
}

html { scroll-behavior: smooth; }
`;
}
//# sourceMappingURL=project-scaffolder.js.map