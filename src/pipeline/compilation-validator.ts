// =============================================================================
// Compilation Validator — Compiles the generated Angular project and logs errors
// =============================================================================
// After the pipeline generates the Angular project, this module:
//   1. Runs `npm install` in the output directory
//   2. Runs `npx ng build` to compile
//   3. Parses TypeScript/Angular compilation errors
//   4. Classifies each error (category + MCP layer)
//   5. Saves errors to the remote REST API database
//   6. Returns a CompilationResult for the pipeline response
// =============================================================================

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { classify } from '../ml/classifier.js';
import {
  isDbConfigured,
  crearIntento,
  insertError,
} from '../ml/db-client.js';
import type { CompilationResult, CompilationError } from './pipeline-types.js';

// ---------------------------------------------------------------------------
// Shell command helper
// ---------------------------------------------------------------------------

function cmd(
  command: string,
  cwd: string,
  timeout = 300_000,
): { success: boolean; output: string } {
  try {
    const out = execSync(command, {
      cwd,
      encoding: 'utf-8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true, output: out };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { success: false, output: (e.stdout ?? '') + '\n' + (e.stderr ?? e.message ?? '') };
  }
}

// ---------------------------------------------------------------------------
// Error parser — extracts TS/NG errors from build output
// ---------------------------------------------------------------------------

/**
 * Parse Angular/TypeScript compilation errors from ng build output.
 * Strips ANSI codes, deduplicates, and extracts file/line info.
 */
function parseCompilationErrors(output: string): CompilationError[] {
  // Strip ANSI escape codes
  const clean = output
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');

  const errors: CompilationError[] = [];

  // Pattern 1: TS/NG errors with file path
  // src/app/features/module/components/x/x.component.ts:15:3 - error TS2339: Property 'x' does not exist
  const fileErrorRe = /([^\s]+\.ts):(\d+):\d+\s*-\s*error\s+(TS-?\d+|NG\d+):\s*(.+)/g;
  let m: RegExpExecArray | null;

  while ((m = fileErrorRe.exec(clean)) !== null) {
    const { category, mcpLayer } = classify(m[3], m[4]);
    errors.push({
      code: m[3],
      message: m[4].trim().slice(0, 500),
      file: m[1],
      line: parseInt(m[2], 10),
      category,
      mcpLayer,
    });
  }

  // Pattern 2: Generic ERROR lines without file path
  const genericErrorRe = /ERROR\]?\s+(?:(TS-?\d+|NG\d+):\s*)?(.+?)(?:\[plugin|$)/gm;
  while ((m = genericErrorRe.exec(clean)) !== null) {
    const code = m[1] ?? 'UNKNOWN';
    const message = m[2].trim().slice(0, 500);
    // Skip if already captured by Pattern 1
    if (!errors.some(e => e.code === code && e.message.slice(0, 50) === message.slice(0, 50))) {
      const { category, mcpLayer } = classify(code, message);
      errors.push({ code, message, category, mcpLayer });
    }
  }

  // Pattern 3: PostCSS / Tailwind runtime errors
  if (clean.includes('PostCSS plugin') || (clean.includes('tailwindcss') && clean.includes('Error:'))) {
    const postcssMatch = clean.match(/Error:\s*(It looks like[^.]+\.)/s);
    if (postcssMatch) {
      errors.push({
        code: 'POSTCSS_CONFIG',
        message: postcssMatch[1].trim().slice(0, 500),
        category: 'postcss_config',
        mcpLayer: 'project-scaffolder',
      });
    }
  }

  // Pattern 4: Module not found
  const moduleRe = /Error:\s*Cannot find module\s+'([^']+)'/g;
  while ((m = moduleRe.exec(clean)) !== null) {
    errors.push({
      code: 'MODULE_NOT_FOUND',
      message: `Cannot find module '${m[1]}'`,
      category: 'missing_dependency',
      mcpLayer: 'project-scaffolder',
    });
  }

  // Deduplicate by code + first 80 chars of message
  const seen = new Set<string>();
  return errors.filter(e => {
    const key = `${e.code}|${e.message.slice(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


// ---------------------------------------------------------------------------
// Main compilation + DB logging function
// ---------------------------------------------------------------------------

/**
 * Compile the generated Angular project and save errors to the remote API DB.
 *
 * Steps:
 *   1. npm install (with legacy-peer-deps)
 *   2. Install Angular build tooling
 *   3. ng build
 *   4. Parse errors
 *   5. Classify each error
 *   6. Save to REST API database (if configured)
 *   7. Return CompilationResult
 *
 * @param outputDir - Path to the generated Angular project
 * @param moduleName - Module name (for logging context)
 * @param iteration - Current iteration number (default 1)
 */
export async function compileAndLogErrors(
  outputDir: string,
  moduleName: string,
  iteration = 1,
): Promise<CompilationResult> {
  // Verify output directory exists
  if (!existsSync(outputDir)) {
    return {
      success: false,
      errorCount: 1,
      errors: [{ code: 'PIPELINE', message: `Output directory does not exist: ${outputDir}` }],
      savedToDb: false,
    };
  }

  // Step 1: npm install
  const installResult = cmd('npm install --legacy-peer-deps', outputDir, 180_000);
  if (!installResult.success) {
    // Try to continue anyway — some deps might fail but build could still work
  }

  // Step 2: Ensure Angular build tooling is available
  cmd(
    'npm install @angular-devkit/build-angular@^20.0.0 @angular/compiler-cli@^20.0.0 typescript@~5.8.0 --save-dev --legacy-peer-deps',
    outputDir,
    180_000,
  );

  // Disable Angular analytics
  cmd('npx ng analytics disable', outputDir, 15_000);

  // Step 3: Compile with ng build
  const buildResult = cmd('npx ng build --configuration=production', outputDir, 300_000);
  const buildOutput = buildResult.output;

  // Step 4: Parse errors
  const compilationErrors = parseCompilationErrors(buildOutput);
  const buildSuccess = compilationErrors.length === 0 &&
    buildOutput.toLowerCase().includes('bundle generation complete');

  // Step 5 & 6: Save to remote API database (if configured)
  let savedToDb = false;
  let intentoId: number | undefined;

  if (isDbConfigured()) {
    try {
      // Create an "intento" record
      intentoId = await crearIntento(
        compilationErrors.length,
        buildSuccess,
        iteration,
        '',
        `migrate_full_project: ${moduleName} — iteration ${iteration}`,
      );

      // Save each error
      for (const err of compilationErrors) {
        await insertError(
          intentoId,
          err.code,
          err.message,
          err.category ?? 'unknown',
          err.mcpLayer ?? 'unknown',
        );
      }

      savedToDb = true;
    } catch {
      // DB save failed — don't block the pipeline
      savedToDb = false;
    }
  }

  return {
    success: buildSuccess,
    errorCount: compilationErrors.length,
    errors: compilationErrors,
    savedToDb,
    intentoId,
  };
}

/**
 * Quick compilation check without npm install (for re-runs after patching).
 * Assumes dependencies are already installed.
 */
export async function recompileAndLogErrors(
  outputDir: string,
  moduleName: string,
  iteration: number,
): Promise<CompilationResult> {
  if (!existsSync(outputDir)) {
    return {
      success: false,
      errorCount: 1,
      errors: [{ code: 'PIPELINE', message: `Output directory does not exist: ${outputDir}` }],
      savedToDb: false,
    };
  }

  // Only compile — skip install
  const buildResult = cmd('npx ng build --configuration=production', outputDir, 300_000);
  const compilationErrors = parseCompilationErrors(buildResult.output);
  const buildSuccess = compilationErrors.length === 0 &&
    buildResult.output.toLowerCase().includes('bundle generation complete');

  let savedToDb = false;
  let intentoId: number | undefined;

  if (isDbConfigured()) {
    try {
      intentoId = await crearIntento(
        compilationErrors.length,
        buildSuccess,
        iteration,
        '',
        `recompile: ${moduleName} — iteration ${iteration}`,
      );

      for (const err of compilationErrors) {
        await insertError(
          intentoId,
          err.code,
          err.message,
          err.category ?? 'unknown',
          err.mcpLayer ?? 'unknown',
        );
      }

      savedToDb = true;
    } catch {
      savedToDb = false;
    }
  }

  return {
    success: buildSuccess,
    errorCount: compilationErrors.length,
    errors: compilationErrors,
    savedToDb,
    intentoId,
  };
}
