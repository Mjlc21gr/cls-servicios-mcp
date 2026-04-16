// =============================================================================
// Shell Generator – generates a Shell_App with Native Federation
// =============================================================================
/**
 * Generates a complete Shell_App Angular application configured with
 * Native Federation, lazy routes for each remote, Tailwind CSS, and CSP.
 */
export function generateShellApp(config) {
    const appConfig = generateAppConfig();
    const appRoutes = generateAppRoutes(config.remotes);
    const federationConfig = generateFederationConfig(config.remotes);
    const tailwindConfig = generateTailwindConfig();
    const appComponent = generateAppComponent(config.appName);
    const cspMeta = generateCspMeta(config.remotes);
    return {
        appConfig,
        appRoutes,
        federationConfig,
        tailwindConfig,
        appComponent,
        cspMeta,
    };
}
// ---------------------------------------------------------------------------
// app.config.ts
// ---------------------------------------------------------------------------
function generateAppConfig() {
    return [
        `import { ApplicationConfig } from '@angular/core';`,
        `import { provideRouter } from '@angular/router';`,
        `import { routes } from './app.routes';`,
        ``,
        `export const appConfig: ApplicationConfig = {`,
        `  providers: [`,
        `    provideRouter(routes),`,
        `  ],`,
        `};`,
        ``,
    ].join('\n');
}
// ---------------------------------------------------------------------------
// app.routes.ts
// ---------------------------------------------------------------------------
function generateAppRoutes(remotes) {
    const lines = [];
    lines.push(`import { Routes } from '@angular/router';`);
    if (remotes.length > 0) {
        lines.push(`import { loadRemoteModule } from '@angular-architects/native-federation';`);
    }
    lines.push(``);
    lines.push(`export const routes: Routes = [`);
    for (const remote of remotes) {
        lines.push(`  {`);
        lines.push(`    path: '${remote.path}',`);
        lines.push(`    loadComponent: () => loadRemoteModule({`);
        lines.push(`      remoteEntry: '${remote.remoteEntry}',`);
        lines.push(`      exposedModule: '${remote.exposedModule}',`);
        lines.push(`    }).then(m => m.default),`);
        lines.push(`  },`);
    }
    lines.push(`];`);
    lines.push(``);
    return lines.join('\n');
}
// ---------------------------------------------------------------------------
// federation.config.js
// ---------------------------------------------------------------------------
function generateFederationConfig(remotes) {
    const lines = [];
    lines.push(`const { withNativeFederation } = require('@angular-architects/native-federation/config');`);
    lines.push(``);
    lines.push(`module.exports = withNativeFederation({`);
    lines.push(`  name: 'shell',`);
    lines.push(`  remotes: {`);
    for (const remote of remotes) {
        lines.push(`    '${remote.name}': '${remote.remoteEntry}',`);
    }
    lines.push(`  },`);
    lines.push(`});`);
    lines.push(``);
    return lines.join('\n');
}
// ---------------------------------------------------------------------------
// tailwind.config.js (shared base)
// ---------------------------------------------------------------------------
function generateTailwindConfig() {
    return [
        `/** @type {import('tailwindcss').Config} */`,
        `module.exports = {`,
        `  content: [`,
        `    './src/**/*.{html,ts}',`,
        `  ],`,
        `  theme: {`,
        `    extend: {},`,
        `  },`,
        `  plugins: [`,
        `    require('tailwindcss-primeui'),`,
        `  ],`,
        `};`,
        ``,
    ].join('\n');
}
// ---------------------------------------------------------------------------
// app.component.ts
// ---------------------------------------------------------------------------
function generateAppComponent(appName) {
    return [
        `import { Component } from '@angular/core';`,
        `import { RouterOutlet } from '@angular/router';`,
        ``,
        `@Component({`,
        `  selector: 'app-root',`,
        `  standalone: true,`,
        `  imports: [RouterOutlet],`,
        `  template: \``,
        `    <router-outlet></router-outlet>`,
        `  \`,`,
        `})`,
        `export class AppComponent {`,
        `  title = '${appName}';`,
        `}`,
        ``,
    ].join('\n');
}
// ---------------------------------------------------------------------------
// CSP meta tag for index.html
// ---------------------------------------------------------------------------
function generateCspMeta(remotes) {
    // Collect unique origins from remote entries
    const origins = new Set();
    for (const remote of remotes) {
        try {
            const url = new URL(remote.remoteEntry);
            origins.add(url.origin);
        }
        catch {
            // If the URL is not parseable, skip it
        }
    }
    const originList = origins.size > 0
        ? ` ${[...origins].join(' ')}`
        : '';
    return [
        `<meta http-equiv="Content-Security-Policy"`,
        `  content="default-src 'self';`,
        `    script-src 'self'${originList};`,
        `    connect-src 'self'${originList};`,
        `    style-src 'self' 'unsafe-inline';`,
        `    img-src 'self' data:;">`,
    ].join('\n');
}
//# sourceMappingURL=shell-generator.js.map