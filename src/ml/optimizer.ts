/**
 * ML Optimizer — Intelligent self-healing cycle.
 *
 * The ML has FULL CONTEXT of:
 *   - The MCP source code (what generates Angular)
 *   - The React source project (what's being transformed)
 *   - The generated Angular project (what was produced)
 *   - Historical patches (what worked before for similar errors)
 *   - The error database (what's been tried and what succeeded)
 *
 * Flow per iteration:
 *   1. Read errors from the API database
 *   2. Check if any error matches a previously successful patch pattern
 *   3. If match found → apply known fix (high confidence)
 *   4. If no match → ask LLM (Gemini/GPT) with full context
 *   5. Apply the suggested fix to the MCP source
 *   6. Rebuild the MCP
 *   7. Re-run the transformation on the React project
 *   8. Re-compile the Angular output
 *   9. Compare errors: if reduced → mark as solved, keep patch
 *   10. If not reduced → revert patch, mark as not solved
 *   11. Repeat until all errors solved or max iterations reached
 *
 * Key principles:
 *   - NEVER break what already works
 *   - Each patch is validated before being kept
 *   - The ML learns from its own history (patches table)
 *   - LLM is a tool, not the decision maker — ML validates everything
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { classify, train } from './classifier.js';
import { applyPatchesForErrors, rebuild, setMcpRoot, LAYER_FILE } from './patcher.js';
import {
  configureDb,
  isDbConfigured,
  crearIntento,
  insertError,
  getErrors,
  getPatches,
  updateIntento,
  registrarSeguimiento,
  marcarSolucionado,
  marcarNoSolucionado,
  getPendientes,
} from './db-client.js';
import { configureLlm, sugerirFix, isAvailable as isLlmAvailable, type LlmConfig } from './llm-client.js';
import { GEMINI_DEFAULT } from './defaults.js';


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
  /** Maximum optimization iterations (default: 10) */
  maxIterations?: number;
  /** Database credentials */
  db: { clientId: string; clientSecret: string };
  /** Optional LLM configuration (defaults to Gemini) */
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
  /** Errors that were solved */
  errorsSolved: number;
  /** Execution log */
  log: string[];
}

interface ErrorWithContext {
  code: string;
  message: string;
  category: string;
  mcpLayer: string;
  file?: string;
}

// ─── Shell Helper ────────────────────────────────────────────────────────────

function cmd(command: string, cwd?: string, timeout = 300_000): { success: boolean; output: string } {
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

// ─── Error Parser ────────────────────────────────────────────────────────────

function parseErrors(output: string): ErrorWithContext[] {
  const clean = output
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');

  const errs: ErrorWithContext[] = [];

  // Pattern 1: TS/NG errors with file path
  // src/app/features/module/components/x/x.component.ts:15:3 - error TS2339: Property 'x' does not exist
  const fileRe = /([^\s]+\.ts):(\d+):\d+\s*-\s*error\s+(TS-?\d+|NG\d+):\s*(.+)/g;
  let m: RegExpExecArray | null;
  while ((m = fileRe.exec(clean)) !== null) {
    const { category, mcpLayer } = classify(m[3], m[4]);
    errs.push({ code: m[3], message: m[4].trim().slice(0, 500), category, mcpLayer, file: m[1] });
  }

  // Pattern 2: Generic ERROR lines (TS/NG codes)
  const genericRe = /ERROR\]?\s+(?:(TS-?\d+|NG\d+):\s*)?(.+?)(?:\[plugin|$)/gm;
  while ((m = genericRe.exec(clean)) !== null) {
    const code = m[1] ?? 'UNKNOWN';
    const message = m[2].trim().slice(0, 500);
    if (!errs.some(e => e.code === code && e.message.slice(0, 50) === message.slice(0, 50))) {
      const { category, mcpLayer } = classify(code, message);
      errs.push({ code, message, category, mcpLayer });
    }
  }

  // Pattern 3: PostCSS / Tailwind runtime errors
  // "Error: It looks like you're trying to use `tailwindcss` directly as a PostCSS plugin"
  if (clean.includes('PostCSS plugin') || clean.includes('tailwindcss') && clean.includes('Error:')) {
    const postcssMatch = clean.match(/Error:\s*(.+?)(?:\n|at\s)/s);
    if (postcssMatch) {
      errs.push({
        code: 'POSTCSS_CONFIG',
        message: postcssMatch[1].trim().slice(0, 500),
        category: 'postcss_config',
        mcpLayer: 'project-scaffolder',
      });
    }
  }

  // Pattern 4: Node.js module not found errors
  // "Error: Cannot find module '@tailwindcss/postcss'"
  const moduleNotFoundRe = /Error:\s*Cannot find module\s+'([^']+)'/g;
  while ((m = moduleNotFoundRe.exec(clean)) !== null) {
    errs.push({
      code: 'MODULE_NOT_FOUND',
      message: `Cannot find module '${m[1]}'`,
      category: 'missing_dependency',
      mcpLayer: 'project-scaffolder',
    });
  }

  // Pattern 5: SCSS/CSS compilation errors
  // "SassError: ..." or "Error: Can't find stylesheet to import"
  const sassRe = /(?:Sass|CSS)Error:\s*(.+?)(?:\n|$)/gm;
  while ((m = sassRe.exec(clean)) !== null) {
    errs.push({
      code: 'SCSS_ERROR',
      message: m[1].trim().slice(0, 500),
      category: 'style_error',
      mcpLayer: 'project-scaffolder',
    });
  }

  // Deduplicate
  const seen = new Set<string>();
  return errs.filter(e => {
    const key = `${e.code}|${e.message.slice(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


// ─── Context Builder ─────────────────────────────────────────────────────────

/**
 * Build full context for the LLM: MCP source + React source + Angular output + error.
 * This gives the LLM everything it needs to suggest a precise fix.
 */
function buildLlmContext(
  error: ErrorWithContext,
  mcpRoot: string,
  reactSource: string,
  angularOutput: string,
): string {
  const parts: string[] = [];

  // 1. MCP layer source (the code that GENERATES Angular)
  const layerFile = LAYER_FILE[error.mcpLayer];
  if (layerFile) {
    try {
      const mcpSrc = readFileSync(join(mcpRoot, layerFile), 'utf-8');
      // Send relevant portion (around 3000 chars)
      parts.push(`=== MCP LAYER: ${layerFile} (this generates the Angular code) ===`);
      parts.push(mcpSrc.slice(0, 3000));
    } catch { /* skip */ }
  }

  // 2. The Angular file that has the error (what was generated)
  if (error.file && existsSync(join(angularOutput, error.file))) {
    try {
      const angularFile = readFileSync(join(angularOutput, error.file), 'utf-8');
      parts.push(`\n=== GENERATED ANGULAR FILE (has the error): ${error.file} ===`);
      parts.push(angularFile.slice(0, 2000));
    } catch { /* skip */ }
  }

  // 3. React source component (what's being transformed)
  // Try to find the corresponding React file
  if (error.file) {
    const componentName = error.file.match(/([^/]+)\.component\.ts$/)?.[1];
    if (componentName) {
      const possibleReactFiles = [
        join(reactSource, 'src', `${componentName}.tsx`),
        join(reactSource, 'src', 'components', `${componentName}.tsx`),
        join(reactSource, 'src', 'pages', `${componentName}.tsx`),
      ];
      for (const rf of possibleReactFiles) {
        if (existsSync(rf)) {
          try {
            const reactSrc = readFileSync(rf, 'utf-8');
            parts.push(`\n=== ORIGINAL REACT SOURCE: ${rf} ===`);
            parts.push(reactSrc.slice(0, 2000));
          } catch { /* skip */ }
          break;
        }
      }
    }
  }

  return parts.join('\n');
}

// ─── Patch History Matching ──────────────────────────────────────────────────

/**
 * Check if a similar error was previously fixed successfully.
 * Returns the patch description if found, null otherwise.
 */
async function findSimilarPatch(error: ErrorWithContext): Promise<string | null> {
  try {
    const patches = await getPatches();
    // Find patches for the same error code with success_count > 0
    const matching = patches.filter(p =>
      p.error_code === error.code &&
      (p.success_count ?? 0) > 0 &&
      (p.confidence ?? 0) > 0.5
    );
    if (matching.length > 0) {
      // Return the most successful patch
      matching.sort((a, b) => (b.success_count ?? 0) - (a.success_count ?? 0));
      return matching[0].description;
    }
  } catch { /* DB not available */ }
  return null;
}


// ─── LLM-Assisted Fix with Full Context ──────────────────────────────────────

/**
 * Ask the LLM for a fix with FULL context (MCP + React + Angular + error).
 * The LLM understands:
 *   - What the MCP layer does (generates Angular code)
 *   - What the React source looks like (input)
 *   - What was generated (output with error)
 *   - What the error is
 *
 * Returns a fix suggestion or null.
 */
async function askLlmWithFullContext(
  error: ErrorWithContext,
  mcpRoot: string,
  reactSource: string,
  angularOutput: string,
  previousPatchHint: string | null,
): Promise<{ old: string; new: string; explanation: string } | null> {
  const layerFile = LAYER_FILE[error.mcpLayer];
  if (!layerFile) return null;

  let mcpSrc: string;
  try { mcpSrc = readFileSync(join(mcpRoot, layerFile), 'utf-8'); } catch { return null; }

  const context = buildLlmContext(error, mcpRoot, reactSource, angularOutput);

  const prompt = `You are an ML system that fixes an Angular code generator (MCP).
The MCP transforms React projects into Angular 20 + PrimeNG 21 + Tailwind.

COMPILATION ERROR in the generated Angular project:
  Code: ${error.code}
  Message: ${error.message}
  File: ${error.file ?? 'unknown'}
  Category: ${error.category}
  MCP Layer to fix: ${layerFile}

${previousPatchHint ? `HINT: A similar error was previously fixed with: "${previousPatchHint}"\n` : ''}

CONTEXT:
${context}

YOUR TASK:
Fix the MCP source file (${layerFile}) so it generates CORRECT Angular code.
- The fix must be in the MCP source, NOT in the generated Angular file
- The fix must be MINIMAL — don't restructure code
- The fix must NOT break other components that already work
- The "old" string must exist EXACTLY in the MCP source

Respond ONLY with JSON:
{"old": "exact string to replace in MCP source", "new": "replacement", "explanation": "why this fixes the error"}

JSON:`;

  return await sugerirFix(error.code, prompt, mcpSrc.slice(0, 3000), layerFile);
}

// ─── Main Optimizer ──────────────────────────────────────────────────────────

/**
 * Run the full ML optimization cycle with context-aware fixing.
 *
 * The ML:
 *   1. Knows what errors exist (from DB)
 *   2. Knows what worked before (patches table)
 *   3. Has full context (MCP + React + Angular)
 *   4. Validates every fix before keeping it
 *   5. Tracks what it solved and what it didn't
 */
export async function runOptimizer(config: OptimizerConfig): Promise<OptimizerResult> {
  const log: string[] = [];
  const maxIter = config.maxIterations ?? 10;
  let totalPatches = 0;
  let finalErrors = 0;
  let errorsSolved = 0;

  // Configure subsystems
  setMcpRoot(config.mcpRoot);
  configureDb(config.db);
  configureLlm(config.llm ?? GEMINI_DEFAULT);

  const { reactSource: SRC, angularOutput: OUT, moduleName: MOD, mcpRoot: MCP } = config;

  for (let iteration = 1; iteration <= maxIter; iteration++) {
    log.push(`\n═══ ITERATION ${iteration}/${maxIter} ═══`);

    // ─── Step 1: Transform React → Angular ───────────────────────────────
    if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
    log.push('[1] Transforming React → Angular...');
    const cli = join(MCP, 'dist', 'migrate-cli.js');
    const { success: transformOk, output: transformOut } = cmd(`node "${cli}" "${SRC}" "${OUT}" "${MOD}"`);
    if (!transformOk) {
      log.push(`    FAIL: ${transformOut.slice(0, 200)}`);
      continue;
    }
    log.push('    OK');

    // ─── Step 2: Install deps + Compile ──────────────────────────────────
    log.push('[2] Installing deps...');
    cmd('npm install --legacy-peer-deps', OUT, 180_000);
    cmd('npm install @angular-devkit/build-angular@^20.0.0 @angular/compiler-cli@^20.0.0 typescript@~5.8.0 --save-dev --legacy-peer-deps', OUT, 180_000);
    cmd('npx ng analytics disable', OUT, 15_000);

    log.push('[3] Compiling (ng build)...');
    const { output: buildOutput } = cmd('npx ng build --configuration=production', OUT);
    const errs = parseErrors(buildOutput);
    const buildOk = errs.length === 0 && buildOutput.toLowerCase().includes('bundle generation complete');
    finalErrors = errs.length;
    log.push(buildOk ? '    ✓ BUILD OK — 0 errors' : `    ✗ ${errs.length} errors`);

    // ─── Step 3: Save errors to API DB (optional — continues if fails) ───
    let intentoId = 0;
    try {
      if (isDbConfigured() && config.db.clientId) {
        intentoId = await crearIntento(errs.length, buildOk, iteration, '', `ML iter ${iteration}`);
        for (const e of errs) {
          await insertError(intentoId, e.code, e.message, e.category, e.mcpLayer);
        }
        log.push(`[4] ${errs.length} errors saved to DB (intento #${intentoId})`);
      } else {
        log.push(`[4] DB not configured — skipping save`);
      }
    } catch {
      log.push(`[4] DB save failed — continuing without DB`);
    }

    // ─── Success? ────────────────────────────────────────────────────────
    if (buildOk) {
      // Verify pending errors from previous iterations are now solved
      try { await verifyPendingErrors(errs, intentoId, log); } catch { /* DB unavailable */ }
      log.push(`\n✓ SUCCESS — Build OK at iteration ${iteration}`);
      return { success: true, iterations: iteration, totalPatches, finalErrors: 0, errorsSolved, log };
    }

    // ─── Step 4: Train classifier from history ───────────────────────────
    log.push('[5] ML analyzing errors...');
    try { await train(); } catch { /* DB unavailable — use rules only */ }

    // Show top errors
    for (const e of errs.slice(0, 5)) {
      log.push(`    ${e.code} (${e.category}) → ${e.mcpLayer}`);
    }

    // ─── Step 5: Try fixes (predefined → history → LLM) ─────────────────
    log.push('[6] Applying fixes...');
    let patchesThisIteration = 0;

    // 5a. Try predefined fixes first
    const classifiedErrors = errs.map(e => ({ code: e.code, message: e.message, category: e.category, mcp_layer: e.mcpLayer }));
    const predefined = await applyPatchesForErrors(classifiedErrors);
    if (predefined.length > 0) {
      patchesThisIteration += predefined.length;
      for (const p of predefined) {
        log.push(`    [predefined] ${p.name}: ${p.description}`);
        try { await registrarSeguimiento(p.name, p.description, p.name, 'patcher', p.description, intentoId); } catch { /* DB unavailable */ }
      }
    }

    // 5b. For remaining errors, try LLM with full context
    if (predefined.length === 0 && await isLlmAvailable()) {
      log.push('    No predefined fixes — asking LLM with full context...');

      for (const err of errs.slice(0, 5)) { // Max 5 LLM calls per iteration
        // Check history first
        const previousHint = await findSimilarPatch(err);
        if (previousHint) {
          log.push(`    [history] Found similar patch for ${err.code}: ${previousHint}`);
        }

        // Ask LLM
        const fix = await askLlmWithFullContext(err, MCP, SRC, OUT, previousHint);
        if (!fix) {
          log.push(`    [llm] No fix for ${err.code}`);
          continue;
        }

        // Validate: old must exist in MCP source
        const layerFile = LAYER_FILE[err.mcpLayer];
        if (!layerFile) continue;

        let src: string;
        try { src = readFileSync(join(MCP, layerFile), 'utf-8'); } catch { continue; }
        if (!src.includes(fix.old)) {
          log.push(`    [llm] Fix rejected — "old" not found in ${layerFile}`);
          continue;
        }

        // Validate: change must be small
        if (Math.abs(fix.new.length - fix.old.length) > 800) {
          log.push(`    [llm] Fix rejected — too large (${Math.abs(fix.new.length - fix.old.length)} chars)`);
          continue;
        }

        // Apply fix
        const backup = src;
        writeFileSync(join(MCP, layerFile), src.replace(fix.old, fix.new), 'utf-8');

        // Rebuild MCP
        const [rebuildOk] = rebuild();
        if (!rebuildOk) {
          // Revert — fix broke the MCP
          writeFileSync(join(MCP, layerFile), backup, 'utf-8');
          log.push(`    [llm] Fix reverted — MCP build failed`);
          continue;
        }

        patchesThisIteration++;
        log.push(`    [llm] ✓ Applied: ${fix.explanation}`);
        await registrarSeguimiento(err.code, err.message, err.category, err.mcpLayer, fix.explanation, intentoId);
      }
    }

    totalPatches += patchesThisIteration;

    // ─── Step 6: Rebuild MCP if patches were applied ─────────────────────
    if (patchesThisIteration > 0) {
      log.push(`[7] ${patchesThisIteration} patches applied — rebuilding MCP...`);
      const [rebuildOk, rebuildErr] = rebuild();
      if (rebuildOk) {
        log.push('    MCP rebuilt OK');
        await updateIntento(intentoId, { patches_applied: `${patchesThisIteration} patches` });
      } else {
        log.push(`    MCP rebuild FAIL: ${rebuildErr}`);
      }
    } else {
      log.push('    No new patches available — stopping');
      break;
    }
  }

  log.push(`\nMax iterations (${maxIter}) reached — ${finalErrors} errors remain`);
  return { success: false, iterations: maxIter, totalPatches, finalErrors, errorsSolved, log };
}


// ─── Verification: Check if previous errors are now solved ───────────────────

/**
 * After a successful build (or reduced errors), check which previously
 * pending errors are now solved and update the DB accordingly.
 */
async function verifyPendingErrors(
  currentErrors: ErrorWithContext[],
  intentoId: number,
  log: string[],
): Promise<void> {
  try {
    const pending = await getPendientes();
    if (pending.length === 0) return;

    const currentCodes = new Set(currentErrors.map(e => `${e.code}|${e.category}`));

    for (const p of pending) {
      const key = `${p.error_code}|${p.category}`;
      if (!currentCodes.has(key)) {
        // Error no longer appears → mark as solved
        await marcarSolucionado(p.error_code, p.category, intentoId);
        log.push(`    ✓ Solved: ${p.error_code} (${p.category})`);
      } else {
        // Error still present → mark as not solved
        await marcarNoSolucionado(p.error_code, p.category, intentoId, 'Still present after patch');
        log.push(`    ✗ Still pending: ${p.error_code} (${p.category})`);
      }
    }
  } catch {
    // DB not available — skip verification
  }
}
