// =============================================================================
// Module Generator – generates a Remote_App with Native Federation
// =============================================================================

import type {
  ModuleConfig,
  RemoteAppArtifact,
  ExposedComponent,
  GeneratedComponent,
} from '../types.js';

/**
 * Generates a complete Remote_App Angular application configured with
 * Native Federation that exposes the specified components.
 */
export function generateRemoteApp(config: ModuleConfig): RemoteAppArtifact {
  const federationConfig = generateFederationConfig(config.moduleName, config.components);
  const components = config.components.map(c => generateComponent(c));
  const appConfig = generateAppConfig();

  return {
    federationConfig,
    components,
    appConfig,
  };
}

// ---------------------------------------------------------------------------
// federation.config.js
// ---------------------------------------------------------------------------

function generateFederationConfig(moduleName: string, components: ExposedComponent[]): string {
  const lines: string[] = [];

  lines.push(`const { withNativeFederation } = require('@angular-architects/native-federation/config');`);
  lines.push(``);
  lines.push(`module.exports = withNativeFederation({`);
  lines.push(`  name: '${moduleName}',`);
  lines.push(`  exposes: {`);

  for (const comp of components) {
    lines.push(`    './${comp.name}': '${comp.path}',`);
  }

  lines.push(`  },`);
  lines.push(`});`);
  lines.push(``);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// app.config.ts for Remote_App
// ---------------------------------------------------------------------------

function generateAppConfig(): string {
  return [
    `import { ApplicationConfig } from '@angular/core';`,
    ``,
    `export const appConfig: ApplicationConfig = {`,
    `  providers: [],`,
    `};`,
    ``,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Placeholder standalone component generation
// ---------------------------------------------------------------------------

function toKebabCase(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

function generateComponent(comp: ExposedComponent): GeneratedComponent {
  const kebab = toKebabCase(comp.name);

  const componentFile = [
    `import { Component } from '@angular/core';`,
    `import { CommonModule } from '@angular/common';`,
    `import { ButtonModule } from 'primeng/button';`,
    `import { InputTextModule } from 'primeng/inputtext';`,
    ``,
    `@Component({`,
    `  selector: 'app-${kebab}',`,
    `  standalone: true,`,
    `  imports: [CommonModule, ButtonModule, InputTextModule],`,
    `  template: \``,
    `    <div class="p-4">`,
    `      <h2>${comp.name} works!</h2>`,
    `    </div>`,
    `  \`,`,
    `  styles: [\``,
    `    :host { display: block; }`,
    `  \`],`,
    `})`,
    `export default class ${comp.name}Component {}`,
    ``,
  ].join('\n');

  const specFile = [
    `import { ComponentFixture, TestBed } from '@angular/core/testing';`,
    `import ${comp.name}Component from './${kebab}.component';`,
    ``,
    `describe('${comp.name}Component', () => {`,
    `  let component: ${comp.name}Component;`,
    `  let fixture: ComponentFixture<${comp.name}Component>;`,
    ``,
    `  beforeEach(async () => {`,
    `    await TestBed.configureTestingModule({`,
    `      imports: [${comp.name}Component],`,
    `    }).compileComponents();`,
    ``,
    `    fixture = TestBed.createComponent(${comp.name}Component);`,
    `    component = fixture.componentInstance;`,
    `    fixture.detectChanges();`,
    `  });`,
    ``,
    `  it('should create', () => {`,
    `    expect(component).toBeTruthy();`,
    `  });`,
    `});`,
    ``,
  ].join('\n');

  return {
    componentFile,
    specFile,
    isPlaceholder: true,
  };
}
