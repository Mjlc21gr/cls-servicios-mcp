/**
 * ML Optimizer — Automatic optimization cycle.
 *
 * Flow per iteration:
 *   1. Clean previous output
 *   2. Transform React → Angular (via migrate-cli)
 *   3. Install Angular dependencies
 *   4. Compile (ng build) and parse errors
 *   5. Save errors to database
 *   6. Train classifier on historical data
 *   7. Apply ML patches to MCP source
 *   8. Rebuild MCP
 *   9. Repeat until build succeeds or max iterations reached
 */

import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { classify, train } from './classifier.js';
import { applyPatchesForErrors, rebuild, setMcpRoot } from './patcher.js';
import { configureDb, crearIntento, insertError, getErrors, updateIntento } from './db-client.js';
import { configureLlm, type LlmConfig } from './llm-client.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OptimizerConfig {
  /** Root directory of the MCP project */
  mcpRoot: string;
  /** Path to the React source project */
  reactSource: string;
  /** Path where Angular output will be generated */
  angularOutput: string;
  /** Module name for the Angular project */
  moduleName: string;
  /** Maximum optimization iterations (default: 5) */
  maxIterations?: number;
  /** Database credentials */
  db: { clientId: string; clientSecret: string };
  /** Optional LLM configuration for dynamic fixes */
  llm?: LlmConfig;
}

export interface OptimizerResult {
  /** Whether the build succeeded */
  success: boolean;
  /** Number of iterations executed */
  iterations: number;
  /** Total patches applied across all iterations */
  totalPatches: number;
  /** Number of errors in the final build */
  finalErrors: number;
  /** Execution log */
  log: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cmd(command: string, cwd?: string, timeout = 300_000): [success: boolean, output: string] {
  try {
    const out = execSync(command, {
      cwd,
      encoding: 'utf-8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return [true, out];
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return [false, (e.stdout ?? '') + '\n' + (e.stderr ?? e.message ?? '')];
  }
}

/**
 * Parse Angular/TypeScript compilation errors from build output.
 * Strips ANSI codes and deduplicates.
 */
function parseErrors(output: string): Array<{ code: string; message: string }> {
  const clean = output
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');

  const errs: Array<{ code: string; message: string }> = [];
  const re = /ERROR\]?\s+(?:(TS-?\d+|NG\d+):\s*)?(.+?)(?:\[plugin|$)/gm;
  let m: RegExpExecArray | null;

  while ((m = re.exec(clean)) !== null) {
    errs.push({ code: m[1] ?? 'UNKNOWN', message: m[2].trim().slice(0, 300) });
  }

  // Deduplicate by code + first 50 chars of message
  const seen = new Set<string>();
  return errs.filter(e => {
    const key = e.code + e.message.slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Main Optimizer ──────────────────────────────────────────────────────────

/**
 * Run the full optimization cycle.
 *
 * Iterates: transform → compile → classify errors → patch MCP → rebuild
 * until the Angular build succeeds or max iterations are reached.
 */
export async function runOptimizer(config: OptimizerConfig): Promise<OptimizerResult> {
  const log: string[] = [];
  const maxIter = config.maxIterations ?? 5;
  let totalPatches = 0;
  let finalErrors = 0;

  // Configure subsystems
  setMcpRoot(config.mcpRoot);
  configureDb(config.db);
  if (config.llm) configureLlm(config.llm);

  const { reactSource: SRC, angularOutput: OUT, moduleName: MOD } = config;

  for (let iteration = 1; iteration <= maxIter; iteration++) {
    log.push(`--- ITERATION ${iteration}/${maxIter} ---`);

    // Step 1: Clean previous output
    if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
    log.push('[1] Clean');

    // Step 2: Transform React → Angular
    log.push('[2] Transforming...');
    const cli = join(config.mcpRoot, 'dist', 'migrate-cli.js');
    const [transformOk, transformOut] = cmd(`node "${cli}" "${SRC}" "${OUT}" "${MOD}"`);
    if (!transformOk) {
      log.push('    FAIL: ' + transformOut.slice(0, 200));
      continue;
    }
    log.push('    OK');

    // Step 3: Install Angular dependencies
    log.push('[3] Installing deps...');
    cmd('npm install', OUT, 180_000);
    cmd(
      'npm install @angular-devkit/build-angular@^20.0.0 @angular/compiler@^20.0.0 @angular/compiler-cli@^20.0.0 typescript@~5.8.0 --save-dev',
      OUT,
      180_000,
    );
    cmd('npx ng analytics disable', OUT, 30_000);
    log.push('    OK');

    // Step 4: Compile and parse errors
    log.push('[4] Compiling (ng build)...');
    const [, buildOutput] = cmd('npx ng build', OUT);
    const errs = parseErrors(buildOutput);
    const buildOk = errs.length === 0 && buildOutput.toLowerCase().includes('bundle generation complete');
    finalErrors = errs.length;
    log.push(buildOk ? '    OK - 0 errors' : `    FAIL - ${errs.length} errors`);

    // Step 5: Save to database
    const intentoId = await crearIntento(errs.length, buildOk, iteration, '', `Iter ${iteration}`);
    for (const e of errs) {
      const { category, mcpLayer } = classify(e.code, e.message);
      await insertError(intentoId, e.code, e.message, category, mcpLayer);
    }
    log.push(`[5] ${errs.length} errors saved to DB`);

    // Success check
    if (buildOk) {
      log.push(`SUCCESS - Build OK at iteration ${iteration}`);
      return { success: true, iterations: iteration, totalPatches, finalErrors: 0, log };
    }

    // Step 6: Train classifier
    log.push('[6] ML analyzing errors...');
    await train();
    const dbErrors = await getErrors();
    if (!dbErrors.length) {
      log.push('    No errors in DB');
      continue;
    }
    for (const e of dbErrors.slice(0, 5)) {
      log.push(`    ${e.code} (${e.category}) -> ${e.mcp_layer}`);
    }

    // Step 7: Apply patches
    log.push('[7] ML patching MCP...');
    const applied = await applyPatchesForErrors(dbErrors);
    totalPatches += applied.length;
    log.push(`    ${applied.length} patches applied`);

    // Step 8: Rebuild MCP
    if (applied.length > 0) {
      log.push('[8] Rebuilding MCP...');
      const [rebuildOk, rebuildErr] = rebuild();
      if (rebuildOk) {
        log.push('    MCP updated OK');
        await updateIntento(intentoId, { patches_applied: applied.map(p => p.name).join(',') });
      } else {
        log.push(`    MCP rebuild FAIL: ${rebuildErr}`);
      }
    } else {
      log.push('    No new patches available');
    }
  }

  log.push(`Max iterations (${maxIter}) reached`);
  return { success: false, iterations: maxIter, totalPatches, finalErrors, log };
}
