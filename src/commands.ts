#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CLS Front-End Migration — Comandos unificados
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Comandos disponibles:
 *
 *   cls-migrate convert <archivo.tsx>          → Convierte un componente React a Angular
 *   cls-migrate project <react-dir> <out-dir>  → Migra un proyecto completo
 *   cls-migrate optimize                       → Ejecuta el ML optimizer
 *   cls-migrate status                         → Estado de la DB (errores, patches)
 *   cls-migrate serve                          → Inicia el MCP server (stdio)
 *   cls-migrate serve-http                     → Inicia el MCP server (HTTP)
 */

import { Command } from 'commander';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const program = new Command();

program
  .name('cls-migrate')
  .description('CLS Front-End Migration — React → Angular 20 + PrimeNG 21 + Tailwind')
  .version('1.3.1');

// ─────────────────────────────────────────────────────────────────────────────
// convert — Convierte un solo componente
// ─────────────────────────────────────────────────────────────────────────────

program
  .command('convert <file>')
  .description('Convierte un componente React (.tsx/.jsx) a Angular')
  .option('-o, --output <dir>', 'Directorio de salida', './angular-output')
  .action(async (file: string, opts: { output: string }) => {
    const { validateInput } = await import('./security/validator.js');
    const { parseReactComponent } = await import('./pipeline/ast-parser.js');
    const { mapStateToAngular } = await import('./pipeline/state-mapper.js');
    const { generateAngularTemplate } = await import('./pipeline/template-generator.js');
    const { mapToPrimeNG } = await import('./pipeline/primeng-mapper.js');
    const { emitAngularArtifact } = await import('./emitter/code-emitter.js');
    const { applySemanticUI } = await import('./pipeline/ui-semantic-engine.js');
    const { applySemanticHtml } = await import('./pipeline/semantic-html-engine.js');
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { toKebabCase } = await import('./utils/naming.utils.js');

    const filePath = resolve(file);
    if (!existsSync(filePath)) {
      console.error(`❌ Archivo no encontrado: ${filePath}`);
      process.exit(1);
    }

    console.log(`\n⚙️  Convirtiendo: ${basename(filePath)}`);
    const source = readFileSync(filePath, 'utf-8');

    const validation = validateInput(source);
    if (!validation.isValid) {
      console.error(`❌ Validación fallida: ${validation.errors[0]?.message}`);
      process.exit(1);
    }

    const ir = parseReactComponent(validation.sanitizedCode ?? source);
    const irState = mapStateToAngular(ir);
    const irTemplate = generateAngularTemplate(irState);
    const irPrimeNG = mapToPrimeNG(irTemplate);

    // Semantic transformations
    let html = applySemanticUI(irPrimeNG.angularTemplate);
    html = applySemanticHtml(html, ir.componentName);
    const irFinal = { ...irPrimeNG, angularTemplate: html };

    const artifact = emitAngularArtifact(irFinal);
    const kebab = toKebabCase(ir.componentName);
    const outDir = join(resolve(opts.output), kebab);
    mkdirSync(outDir, { recursive: true });

    writeFileSync(join(outDir, `${kebab}.component.ts`), artifact.componentFile);
    writeFileSync(join(outDir, `${kebab}.component.html`), artifact.templateFile ?? html);
    writeFileSync(join(outDir, `${kebab}.component.scss`), artifact.scssFile);
    writeFileSync(join(outDir, `${kebab}.component.spec.ts`), artifact.specFile);

    for (const svc of artifact.services) {
      writeFileSync(join(outDir, svc.fileName), svc.content);
    }

    console.log(`✅ Componente generado en: ${outDir}`);
    console.log(`   - ${kebab}.component.ts`);
    console.log(`   - ${kebab}.component.html`);
    console.log(`   - ${kebab}.component.scss`);
    console.log(`   - ${kebab}.component.spec.ts`);
    if (artifact.services.length > 0) {
      console.log(`   - ${artifact.services.length} servicio(s)`);
    }
  });


// ─────────────────────────────────────────────────────────────────────────────
// project — Migra un proyecto completo
// ─────────────────────────────────────────────────────────────────────────────

program
  .command('project <sourceDir> <outputDir>')
  .description('Migra un proyecto React completo a Angular 20 + PrimeNG 21')
  .option('-m, --module <name>', 'Nombre del módulo Angular', 'app')
  .option('--no-compile', 'No compilar el proyecto generado')
  .action(async (sourceDir: string, outputDir: string, opts: { module: string; compile: boolean }) => {
    const { migrateFullProject } = await import('./pipeline/project-orchestrator.js');

    const src = resolve(sourceDir);
    const out = resolve(outputDir);

    console.log(`
╔══════════════════════════════════════════════════════════╗
║  CLS Migration — React → Angular 20 + PrimeNG 21        ║
╚══════════════════════════════════════════════════════════╝

  Fuente:  ${src}
  Destino: ${out}
  Módulo:  ${opts.module}
`);

    console.log('⏳ Ejecutando pipeline...\n');

    const result = await migrateFullProject({
      sourceDir: src,
      outputDir: out,
      moduleName: opts.module,
    });

    if (result.status === 'success') {
      console.log(`✅ Migración completada en ${result.duration}ms`);
    } else {
      console.log(`⚠️  Migración con errores (${result.duration}ms)`);
    }

    console.log(`   Componentes: ${result.migrationSummary.componentsMigrated}/${result.migrationSummary.componentsTotal}`);
    console.log(`   Servicios: ${result.migrationSummary.servicesGenerated}`);
    console.log(`   Rutas: ${result.migrationSummary.routesGenerated}`);
    console.log(`   Archivos: ${result.filesGenerated.length}`);

    if (result.compilation) {
      console.log(`\n📦 Compilación:`);
      if (result.compilation.success) {
        console.log(`   ✅ BUILD OK — 0 errores`);
      } else {
        console.log(`   ❌ ${result.compilation.errorCount} errores de compilación`);
        if (result.compilation.savedToDb) {
          console.log(`   💾 Errores guardados en DB (intento #${result.compilation.intentoId})`);
        }
        // Show top 10 errors
        for (const err of result.compilation.errors.slice(0, 10)) {
          console.log(`      ${err.code}: ${err.message.slice(0, 80)}`);
        }
        if (result.compilation.errorCount > 10) {
          console.log(`      ... y ${result.compilation.errorCount - 10} más`);
        }
      }
    }

    if (result.compilation?.success) {
      console.log(`\n🎉 Proyecto listo:`);
      console.log(`   cd "${out}" && ng serve`);
    } else {
      console.log(`\n🔧 Para corregir errores automáticamente:`);
      console.log(`   cls-migrate optimize --react "${src}" --output "${out}" --module ${opts.module}`);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// optimize — Ejecuta el ML optimizer
// ─────────────────────────────────────────────────────────────────────────────

program
  .command('optimize')
  .description('Ejecuta el ML optimizer para corregir errores de compilación')
  .requiredOption('--react <dir>', 'Ruta al proyecto React fuente')
  .requiredOption('--output <dir>', 'Ruta al proyecto Angular generado')
  .option('-m, --module <name>', 'Nombre del módulo', 'app')
  .option('-i, --iterations <n>', 'Máximo de iteraciones', '10')
  .option('--client-id <id>', 'Client ID para la API DB', process.env['MCP_DB_CLIENT_ID'] ?? '')
  .option('--client-secret <secret>', 'Client Secret para la API DB', process.env['MCP_DB_CLIENT_SECRET'] ?? '')
  .action(async (opts: {
    react: string;
    output: string;
    module: string;
    iterations: string;
    clientId: string;
    clientSecret: string;
  }) => {
    const { runOptimizer } = await import('./ml/optimizer.js');

    console.log(`
╔══════════════════════════════════════════════════════════╗
║  ML Optimizer — Auto-fix compilation errors              ║
╚══════════════════════════════════════════════════════════╝

  React:      ${opts.react}
  Angular:    ${opts.output}
  Módulo:     ${opts.module}
  Max iter:   ${opts.iterations}
`);

    const result = await runOptimizer({
      mcpRoot: resolve('.'),
      reactSource: resolve(opts.react),
      angularOutput: resolve(opts.output),
      moduleName: opts.module,
      maxIterations: parseInt(opts.iterations, 10),
      db: { clientId: opts.clientId, clientSecret: opts.clientSecret },
    });

    console.log('\n' + result.log.join('\n'));
    console.log(`\n═══ RESULTADO ═══`);
    console.log(`  ${result.success ? '✅ BUILD OK' : '❌ BUILD FAILED'}`);
    console.log(`  Iteraciones: ${result.iterations}`);
    console.log(`  Patches aplicados: ${result.totalPatches}`);
    console.log(`  Errores resueltos: ${result.errorsSolved}`);
    console.log(`  Errores restantes: ${result.finalErrors}`);

    process.exit(result.success ? 0 : 1);
  });


// ─────────────────────────────────────────────────────────────────────────────
// status — Estado de la DB
// ─────────────────────────────────────────────────────────────────────────────

program
  .command('status')
  .description('Muestra el estado de errores, patches y seguimiento en la DB')
  .option('--client-id <id>', 'Client ID', process.env['MCP_DB_CLIENT_ID'] ?? '')
  .option('--client-secret <secret>', 'Client Secret', process.env['MCP_DB_CLIENT_SECRET'] ?? '')
  .action(async (opts: { clientId: string; clientSecret: string }) => {
    const { configureDb, getErrors, getPatches, getResumen, getIntentos } = await import('./ml/db-client.js');

    if (opts.clientId) {
      configureDb({ clientId: opts.clientId, clientSecret: opts.clientSecret });
    }

    console.log('\n📊 Estado del ML Optimizer\n');

    try {
      const intentos = await getIntentos();
      const errors = await getErrors();
      const patches = await getPatches();
      const resumen = await getResumen();

      console.log(`  Intentos totales: ${intentos.length}`);
      console.log(`  Errores en DB: ${errors.length}`);
      console.log(`  Patches registrados: ${patches.length}`);

      if (resumen.length > 0) {
        console.log(`\n  Resumen por categoría:`);
        for (const r of resumen as Array<{ category: string; total: number; resueltos: number; pendientes: number }>) {
          console.log(`    ${r.category}: ${r.total} total, ${r.resueltos ?? 0} resueltos, ${r.pendientes ?? 0} pendientes`);
        }
      }

      // Last intento
      if (intentos.length > 0) {
        const last = intentos[intentos.length - 1];
        console.log(`\n  Último intento:`);
        console.log(`    ID: ${last.id}`);
        console.log(`    Errores: ${last.total_errors}`);
        console.log(`    Build OK: ${last.build_ok}`);
        console.log(`    Iteración: ${last.iteration}`);
      }

      // Top errors
      if (errors.length > 0) {
        console.log(`\n  Top errores:`);
        const grouped = new Map<string, number>();
        for (const e of errors) {
          grouped.set(e.code, (grouped.get(e.code) ?? 0) + (e.total ?? 1));
        }
        const sorted = [...grouped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
        for (const [code, count] of sorted) {
          console.log(`    ${code}: ${count} ocurrencias`);
        }
      }
    } catch (err) {
      console.error(`  ❌ Error conectando a DB: ${err instanceof Error ? err.message : String(err)}`);
      console.log(`\n  Configura las credenciales:`);
      console.log(`    export MCP_DB_CLIENT_ID="tu-client-id"`);
      console.log(`    export MCP_DB_CLIENT_SECRET="tu-client-secret"`);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// serve — Inicia el MCP server (stdio)
// ─────────────────────────────────────────────────────────────────────────────

program
  .command('serve')
  .description('Inicia el MCP server en modo stdio (para IDEs)')
  .action(async () => {
    console.error('🚀 Iniciando MCP server (stdio)...');
    await import('./stdio-server.js');
  });

// ─────────────────────────────────────────────────────────────────────────────
// serve-http — Inicia el MCP server (HTTP)
// ─────────────────────────────────────────────────────────────────────────────

program
  .command('serve-http')
  .description('Inicia el MCP server en modo HTTP')
  .option('-p, --port <port>', 'Puerto', '3000')
  .action(async (opts: { port: string }) => {
    process.env['PORT'] = opts.port;
    console.error(`🚀 Iniciando MCP server HTTP en puerto ${opts.port}...`);
    await import('./http-server.js');
  });

// ─────────────────────────────────────────────────────────────────────────────
// analyze — Solo analiza sin generar
// ─────────────────────────────────────────────────────────────────────────────

program
  .command('analyze <file>')
  .description('Analiza un componente React y muestra su estructura')
  .action(async (file: string) => {
    const { analyzeReactComponent } = await import('./analyzers/react-component.analyzer.js');

    const filePath = resolve(file);
    if (!existsSync(filePath)) {
      console.error(`❌ Archivo no encontrado: ${filePath}`);
      process.exit(1);
    }

    const source = readFileSync(filePath, 'utf-8');
    const analysis = analyzeReactComponent(source, basename(filePath));

    console.log(`\n📋 Análisis: ${analysis.componentName}\n`);
    console.log(`  Props: ${analysis.props.length}`);
    console.log(`  State (useState): ${analysis.stateHooks.length}`);
    console.log(`  Effects: ${analysis.effects.length}`);
    console.log(`  Memos: ${analysis.memos.length}`);
    console.log(`  Callbacks: ${analysis.callbacks.length}`);
    console.log(`  Refs: ${analysis.refs.length}`);
    console.log(`  Contexts: ${analysis.contexts.length}`);
    console.log(`  Custom Hooks: ${analysis.customHooks.length}`);
    console.log(`  UI Libraries: ${analysis.uiLibraries.map(u => u.library).join(', ') || 'ninguna'}`);

    if (analysis.stateHooks.length > 0) {
      console.log(`\n  Signals (useState → signal):`);
      for (const s of analysis.stateHooks) {
        console.log(`    ${s.name} = signal(${s.initialValue})`);
      }
    }

    if (analysis.effects.length > 0) {
      console.log(`\n  Effects:`);
      for (const e of analysis.effects) {
        const type = e.isOnMount ? 'ngOnInit' : 'effect()';
        console.log(`    ${type} [${e.dependencies.join(', ')}]${e.hasCleanup ? ' + cleanup' : ''}`);
      }
    }
  });

// ─────────────────────────────────────────────────────────────────────────────

program.parse();
