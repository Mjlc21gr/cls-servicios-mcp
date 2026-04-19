#!/usr/bin/env node
/**
 * CLI para migración de micro-frontends React → Angular CLS.
 * Uso: mcp-front-migrate --source [repo-react] --dest [path-cls-angular]
 */
import { Command } from 'commander';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, basename, extname, dirname } from 'node:path';
import { analyzeReactComponent } from './analyzers/react-component.analyzer.js';
import { generateAngularComponent } from './generators/component.generator.js';
import { generateServiceFromAnalysis } from './generators/service.generator.js';
import {
  injectClsThemeToScss,
  injectClsThemeToHtml,
  generateClsThemeVariables,
} from './generators/theme-injector.generator.js';
import { toKebabCase, buildModulePaths } from './utils/naming.utils.js';

const program = new Command();

program
  .name('mcp-front-migrate')
  .description('Migra micro-frontends de React a Angular CLS')
  .version('1.0.0');

program
  .command('migrate')
  .description('Migra componentes React a Angular CLS')
  .requiredOption('-s, --source <path>', 'Ruta al directorio/archivo React fuente')
  .requiredOption('-d, --dest <path>', 'Ruta destino del proyecto Angular CLS')
  .requiredOption('-m, --module <name>', 'Nombre del módulo/feature CLS')
  .option('--theme', 'Generar archivo de variables del tema CLS', false)
  .option('--dry-run', 'Solo mostrar qué archivos se generarían', false)
  .action(async (options: {
    source: string;
    dest: string;
    module: string;
    theme: boolean;
    dryRun: boolean;
  }) => {
    console.log('\n🚀 CLS Front-End Migration Tool\n');
    console.log(`  Fuente:  ${options.source}`);
    console.log(`  Destino: ${options.dest}`);
    console.log(`  Módulo:  ${options.module}\n`);

    const reactFiles = findReactFiles(options.source);
    console.log(`📦 Encontrados ${reactFiles.length} componentes React\n`);

    const paths = buildModulePaths(options.module);
    let totalFiles = 0;

    for (const filePath of reactFiles) {
      const fileName = basename(filePath);
      const sourceCode = readFileSync(filePath, 'utf-8');

      console.log(`  ⚙️  Migrando: ${fileName}`);

      try {
        // 1. Analizar
        const analysis = analyzeReactComponent(sourceCode, fileName);
        console.log(`     ├─ Componente: ${analysis.componentName}`);
        console.log(`     ├─ Signals: ${analysis.stateHooks.length}, Effects: ${analysis.effects.length}`);

        // 2. Generar componente Angular
        const files = generateAngularComponent(analysis, options.module);
        const kebabName = toKebabCase(analysis.componentName);

        // 3. Aplicar tema CLS
        const uiLibs = analysis.uiLibraries.map((u) => u.library);
        const themedHtml = injectClsThemeToHtml(files.componentHtml, uiLibs);
        const themedScss = injectClsThemeToScss(files.componentScss);

        // 4. Escribir archivos
        const componentDir = join(options.dest, paths.components, kebabName);
        const outputMap: Record<string, string> = {
          [`${componentDir}/${kebabName}.component.ts`]: files.componentTs,
          [`${componentDir}/${kebabName}.component.html`]: themedHtml,
          [`${componentDir}/${kebabName}.component.scss`]: themedScss,
          [`${componentDir}/${kebabName}.component.spec.ts`]: files.componentSpec,
        };

        // 5. Generar servicio si hay API calls
        const serviceResult = generateServiceFromAnalysis(analysis, options.module);
        if (serviceResult) {
          const svcKebab = toKebabCase(options.module);
          outputMap[join(options.dest, paths.services, `${svcKebab}.service.ts`)] = serviceResult.serviceCode;
          outputMap[join(options.dest, paths.services, `${svcKebab}.service.spec.ts`)] = serviceResult.serviceSpec;
          outputMap[join(options.dest, paths.models, `${svcKebab}.model.ts`)] = serviceResult.modelCode;
          console.log(`     ├─ Servicio generado: ${svcKebab}.service.ts`);
        }

        if (options.dryRun) {
          console.log('     └─ [DRY RUN] Archivos que se generarían:');
          for (const path of Object.keys(outputMap)) {
            console.log(`        - ${path}`);
          }
        } else {
          for (const [outPath, content] of Object.entries(outputMap)) {
            const dir = dirname(outPath);
            mkdirSync(dir, { recursive: true });
            writeFileSync(outPath, content, 'utf-8');
          }
          console.log(`     └─ ✅ ${Object.keys(outputMap).length} archivos generados`);
        }

        totalFiles += Object.keys(outputMap).length;
      } catch (error) {
        console.error(`     └─ ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Generar tema si se solicita
    if (options.theme) {
      const themePath = join(options.dest, 'src/styles/_cls-theme-variables.scss');
      if (options.dryRun) {
        console.log(`\n🎨 [DRY RUN] Tema CLS: ${themePath}`);
      } else {
        const themeDir = join(options.dest, 'src/styles');
        mkdirSync(themeDir, { recursive: true });
        writeFileSync(themePath, generateClsThemeVariables(), 'utf-8');
        console.log(`\n🎨 Tema CLS generado: ${themePath}`);
      }
      totalFiles++;
    }

    console.log(`\n✨ Migración completada: ${totalFiles} archivos ${options.dryRun ? '(dry run)' : 'generados'}\n`);
    console.log('📋 Próximos pasos:');
    console.log(`   1. Registrar componentes en el sistema de rutas de la App CLS`);
    console.log(`   2. Revisar los TODO en los archivos generados`);
    console.log(`   3. Ejecutar: ng test --include='**/features/${options.module}/**'`);
    console.log(`   4. Verificar el tema CLS en los componentes\n`);
  });

program
  .command('analyze')
  .description('Solo analiza componentes React sin generar código')
  .requiredOption('-s, --source <path>', 'Ruta al archivo React')
  .action((options: { source: string }) => {
    const sourceCode = readFileSync(options.source, 'utf-8');
    const fileName = basename(options.source);
    const analysis = analyzeReactComponent(sourceCode, fileName);
    console.log(JSON.stringify(analysis, null, 2));
  });

function findReactFiles(sourcePath: string): string[] {
  const files: string[] = [];
  const stat = statSync(sourcePath);

  if (stat.isFile()) {
    const ext = extname(sourcePath);
    if (['.tsx', '.jsx'].includes(ext)) {
      files.push(sourcePath);
    }
    return files;
  }

  if (stat.isDirectory()) {
    const entries = readdirSync(sourcePath);
    for (const entry of entries) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const fullPath = join(sourcePath, entry);
      files.push(...findReactFiles(fullPath));
    }
  }

  return files;
}

program.parse();
