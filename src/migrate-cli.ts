#!/usr/bin/env node
/**
 * CLI para migración React → Angular.
 * Uso: node dist/migrate-cli.js <ruta-react> <ruta-angular> <nombre-modulo>
 * 
 * Ejemplo:
 *   node dist/migrate-cli.js C:\proyecto-react C:\proyecto-angular mi-app
 */

import { migrateFullProject } from './pipeline/project-orchestrator.js';

const args = process.argv.slice(2);

if (args.length < 3) {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  CLS Front-End Migration CLI                             ║
║  Migra proyectos React → Angular 20 + PrimeNG 19        ║
╚══════════════════════════════════════════════════════════╝

Uso:
  node dist/migrate-cli.js <sourceDir> <outputDir> <moduleName>

Ejemplo:
  node dist/migrate-cli.js "C:\\mi-proyecto-react" "C:\\mi-proyecto-angular" "mi-app"

Parámetros:
  sourceDir   - Ruta al proyecto React
  outputDir   - Ruta donde se creará el proyecto Angular
  moduleName  - Nombre del módulo Angular (kebab-case)
`);
  process.exit(0);
}

const [sourceDir, outputDir, moduleName] = args;

console.log(`
🚀 CLS Front-End Migration
   React → Angular 20 + PrimeNG 19

   Fuente:  ${sourceDir}
   Destino: ${outputDir}
   Módulo:  ${moduleName}
`);

console.log('⏳ Ejecutando pipeline de migración...\n');

migrateFullProject({ sourceDir, outputDir, moduleName })
  .then((result) => {
    if (result.status === 'success') {
      console.log(`✅ Migración completada en ${result.duration}ms`);
      console.log(`   Archivos generados: ${result.filesGenerated.length}`);
      console.log(`   Componentes migrados: ${result.migrationSummary.componentsMigrated}`);
      console.log(`   Componentes fallidos: ${result.migrationSummary.componentsFailed}`);
      console.log(`   Servicios generados: ${result.migrationSummary.servicesGenerated}`);
      console.log(`   Estilos generados: ${result.migrationSummary.stylesGenerated}`);

      if (result.validationReport.length > 0) {
        console.log(`\n⚠️  Warnings de validación: ${result.validationReport.length}`);
        for (const issue of result.validationReport) {
          console.log(`   - [${issue.severity}] ${issue.file}: ${issue.message}`);
        }
      }

      console.log(`\n📁 Proyecto generado en: ${outputDir}`);
      console.log(`\n🔧 Próximos pasos:`);
      console.log(`   cd "${outputDir}"`);
      console.log(`   npm install`);
      console.log(`   ng serve`);
    } else {
      console.log(`❌ Migración fallida`);
      if (result.errors) {
        for (const err of result.errors) {
          console.log(`   [${err.stage}] ${err.file}: ${err.message}`);
        }
      }
    }
  })
  .catch((err) => {
    console.error(`❌ Error fatal: ${err.message}`);
    process.exit(1);
  });
