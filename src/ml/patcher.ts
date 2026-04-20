/**
 * MCP Patcher — Writes fixes directly to MCP source files.
 *
 * Each fix targets a specific bug category identified by the classifier.
 * Fixes are idempotent: they check for markers before applying.
 *
 * Strategy:
 *   1. Try predefined fixes (deterministic, marker-based)
 *   2. If none apply, ask the LLM for a suggestion
 *   3. Validate LLM suggestion (exists in source, small change, compiles)
 *   4. Revert if compilation fails
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { logPatch } from './db-client.js';
import { sugerirFix, isAvailable } from './llm-client.js';

// ─── Types ───────────────────────────────────────────────────────────────────

type FixResult = [applied: boolean, description: string];

export interface PatchApplied {
  name: string;
  description: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

let MCP_ROOT = process.cwd();

/**
 * Set the root directory of the MCP project (where src/ and node_modules/ live).
 */
export function setMcpRoot(root: string): void {
  MCP_ROOT = root;
}

/**
 * Map of MCP layer names to their source file paths (relative to MCP_ROOT).
 */
export const LAYER_FILE: Record<string, string> = {
  'class-context-layer': 'src/pipeline/class-context-layer.ts',
  'code-emitter': 'src/emitter/code-emitter.ts',
  'template-generator': 'src/pipeline/template-generator.ts',
  'template-integrity-layer': 'src/pipeline/template-integrity-layer.ts',
  'primeng-mapper': 'src/pipeline/primeng-mapper.ts',
  'primeng-sanitizer': 'src/pipeline/primeng-sanitizer.ts',
  'signal-fixer': 'src/pipeline/signal-fixer.ts',
  'state-mapper': 'src/pipeline/state-mapper.ts',
  'project-orchestrator': 'src/pipeline/project-orchestrator.ts',
  'project-scaffolder': 'src/pipeline/project-scaffolder.ts',
};

// ─── File Helpers ────────────────────────────────────────────────────────────

function readSource(rel: string): string {
  return readFileSync(join(MCP_ROOT, rel), 'utf-8');
}

function writeSource(rel: string, content: string): void {
  const full = join(MCP_ROOT, rel);
  const bakDir = join(MCP_ROOT, '.ml-backup');
  mkdirSync(bakDir, { recursive: true });

  // Create timestamped backup before writing
  const ts = new Date().toISOString().replace(/[:.]/g, '').slice(9, 15);
  if (existsSync(full)) {
    copyFileSync(full, join(bakDir, `${basename(full)}.${ts}.bak`));
  }

  writeFileSync(full, content, 'utf-8');
}

function hasMarker(content: string, marker: string): boolean {
  return content.includes(marker);
}

// ─── Build ───────────────────────────────────────────────────────────────────

/**
 * Rebuild the MCP project (TypeScript compilation).
 * Returns [success, errorOutput].
 */
export function rebuild(): [boolean, string] {
  try {
    execSync('node node_modules/typescript/bin/tsc', {
      cwd: MCP_ROOT,
      encoding: 'utf-8',
      timeout: 120_000,
    });
    return [true, ''];
  } catch (err: unknown) {
    const msg = err instanceof Error
      ? (err as { stderr?: string }).stderr ?? err.message
      : String(err);
    return [false, msg.slice(0, 300)];
  }
}

// ─── Predefined Fixes ────────────────────────────────────────────────────────
// Each fix is idempotent: checks for a marker before applying.
// Returns [true, description] if applied, [false, reason] if skipped.

function fixThisScope(): FixResult {
  const f = LAYER_FILE['code-emitter'];
  const c = readSource(f);
  const M = '// MLFIX-THIS';

  if (hasMarker(c, M) || c.includes('3. Rewrite bare state reads')) {
    return [false, 'already applied'];
  }

  const old = '  // 3. Rewrite DOM ref access';
  const alt = '  // 4. Rewrite DOM ref access';
  const target = c.includes(old) ? old : c.includes(alt) ? alt : null;
  if (!target) return [false, 'target not found'];

  const patch = [
    `  ${M}: rewrite bare state reads`,
    '  for (const s of ir.state) {',
    '    const name = s.variableName;',
    '    result = result.replace(',
    '      new RegExp(`(?<!this\\\\.)(?<![.\\\\w])\\\\b${name}\\\\b(?!\\\\s*[(.=:])(?!\\\\s*=\\\\s*signal)`, \'g\'),',
    '      `this.${name}()`,',
    '    );',
    '  }',
    '',
    `  ${target}`,
  ].join('\n');

  writeSource(f, c.replace(target, patch));
  void logPatch('TS2663', f, 'Add bare state read rewriting');
  return [true, 'Add bare state read rewriting'];
}

function fixInlineTemplate(): FixResult {
  const f = LAYER_FILE['code-emitter'];
  const c = readSource(f);
  const M = '// MLFIX-INLINE';

  if (hasMarker(c, M) || c.includes('hasBadChars')) {
    return [false, 'already applied'];
  }

  const old = '  if (ir.isInlineTemplate) {';
  if (!c.includes(old)) return [false, 'target not found'];

  const patch = [
    `  ${M}`,
    "  const hasBadChars = ir.angularTemplate.includes('`') || ir.angularTemplate.includes('${');",
    '  if (ir.isInlineTemplate && !hasBadChars) {',
  ].join('\n');

  writeSource(f, c.replace(old, patch));
  void logPatch('TS-991002', f, 'Force external templateUrl on backtick templates');
  return [true, 'Force external templateUrl'];
}

function fixServiceImportPath(): FixResult {
  const f = LAYER_FILE['code-emitter'];
  const c = readSource(f);
  const M = '// MLFIX-SVCPATH';

  if (hasMarker(c, M)) return [false, 'already applied'];

  const old = "lines.push(`import { ${svc.serviceName} } from '../services/${svc.fileName}';`);";
  if (!c.includes(old)) return [false, 'already applied'];

  const patch = `${M}\n    lines.push(\`import { \${svc.serviceName} } from '../../services/\${svc.fileName}.service';\`);`;
  writeSource(f, c.replace(old, patch));
  void logPatch('TS2307', f, 'Fix service import path');
  return [true, 'Fix service import path'];
}

function fixMissingTypes(): FixResult {
  const f = LAYER_FILE['project-orchestrator'];
  const c = readSource(f);
  const M = '// MLFIX-TYPES';

  if (hasMarker(c, M) || c.includes('needsTypesFile = true')) {
    return [false, 'already applied'];
  }

  const old = '    let needsTypesFile = false;';
  if (!c.includes(old)) return [false, 'target not found'];

  writeSource(f, c.replace(old, `    ${M}\n    let needsTypesFile = true;`));
  void logPatch('TS2304', f, 'Force types.ts generation');
  return [true, 'Force types.ts generation'];
}

function fixPrimengButton(): FixResult {
  const f = LAYER_FILE['primeng-sanitizer'];
  const c = readSource(f);

  if (!c.includes('ButtonDirective')) return [false, 'already applied'];

  writeSource(f, c.replaceAll('ButtonDirective', 'Button'));
  void logPatch('NG8001', f, 'PrimeNG 19: ButtonDirective -> Button');
  return [true, 'ButtonDirective -> Button'];
}

function fixTypeSafety(): FixResult {
  const f = LAYER_FILE['code-emitter'];
  const c = readSource(f);
  const M = '// MLFIX-TYPESAFE';

  if (hasMarker(c, M)) return [false, 'already applied'];

  const old = '  // 7. Replace React types with Angular equivalents';
  const alt = '  // 6. Replace React types with Angular equivalents';
  const target = c.includes(old) ? old : c.includes(alt) ? alt : null;
  if (!target) return [false, 'target not found'];

  const patch = [
    `  ${M}`,
    "  result = result.replace(/e\\.target\\.files/g, '(e.target as HTMLInputElement).files');",
    "  result = result.replace(/e\\.currentTarget/g, '(e.target as HTMLFormElement)');",
    '',
    `  ${target}`,
  ].join('\n');

  writeSource(f, c.replace(target, patch));
  void logPatch('TS18047', f, 'Add type narrowing for Event handlers');
  return [true, 'Add type narrowing'];
}

function fixDoubleBrace(): FixResult {
  const f = LAYER_FILE['code-emitter'];
  const c = readSource(f);
  const M = '// MLFIX-DOUBLEBRACE';

  if (hasMarker(c, M)) return [false, 'already applied'];

  const old = '    const safeBody = safeRewriteBody(method.body, ir);';
  if (!c.includes(old)) return [false, 'target not found'];

  const patch = `    ${M}\n    const safeBody = safeRewriteBody(method.body, ir).replace(/^\\s*\\{/, '').replace(/\\}\\s*$/, '').trim();`;
  writeSource(f, c.replace(old, patch));
  void logPatch('TS1005', f, 'Strip double braces');
  return [true, 'Strip double braces'];
}

function fixRewriteGuard(): FixResult {
  const f = LAYER_FILE['code-emitter'];
  const c = readSource(f);
  const M = '// MLFIX-GUARD';

  if (hasMarker(c, M)) return [false, 'already applied'];

  const old = '  if (ir.state.length === 0 && ir.refs.length === 0 && ir.contexts.length === 0) return body;';
  if (!c.includes(old)) return [false, 'target not found'];

  const patch = `  ${M}\n  if (ir.state.length === 0 && ir.refs.length === 0 && ir.contexts.length === 0 && ir.props.length === 0) return body;`;
  writeSource(f, c.replace(old, patch));
  void logPatch('TS2663', f, 'Fix safeRewriteBody guard');
  return [true, 'Fix safeRewriteBody guard'];
}

// Stubs for fixes that are resolved by other patches or no longer needed
function fixTemplateQuotes(): FixResult { return [false, 'already applied']; }
function fixSetterMethod(): FixResult { return [false, 'already applied']; }
function fixSignalUnknownType(): FixResult { return [false, 'already applied']; }
function fixStandaloneImport(): FixResult { return [false, 'resolved by fix_inline_template']; }
function fixReturnTypeVoid(): FixResult { return [false, 'already applied']; }
function fixServiceGen(): FixResult { return [false, 'target not found']; }
function fixThisScopeRegex(): FixResult { return [false, 'target not found']; }
function fixTypesCopySource(): FixResult { return [false, 'target not found']; }
function fixCallbackToOutputBinding(): FixResult { return [false, 'target not found']; }
function fixPrimengAutoImport(): FixResult { return [false, 'target not found']; }
function fixFeatureClassRename(): FixResult { return [false, 'already applied']; }

function fixPostcssConfig(): FixResult {
  const f = LAYER_FILE['project-scaffolder'];
  const c = readSource(f);

  // Fix: tailwindcss → @tailwindcss/postcss in postcss.config.js generator
  if (!c.includes("'tailwindcss': {},")) return [false, 'already applied'];

  writeSource(f, c.replace("'tailwindcss': {},", "'@tailwindcss/postcss': {},"));
  void logPatch('POSTCSS_CONFIG', f, 'Tailwind v4: use @tailwindcss/postcss plugin');
  return [true, 'Tailwind v4: use @tailwindcss/postcss plugin'];
}

function fixStylePreservatorPostcss(): FixResult {
  const f = 'src/pipeline/style-preservator.ts';
  let c: string;
  try { c = readSource(f); } catch { return [false, 'file not found']; }

  if (!c.includes("tailwindcss: {},")) return [false, 'already applied'];

  writeSource(f, c.replace("tailwindcss: {},", "'@tailwindcss/postcss': {},"));
  void logPatch('POSTCSS_CONFIG', f, 'Tailwind v4: fix style-preservator postcss config');
  return [true, 'Fix style-preservator postcss config'];
}

// ─── Fix Registry ────────────────────────────────────────────────────────────

/**
 * Maps error categories to fix functions.
 * Multiple fixes can target the same category (tried in order).
 */
const ALL_FIXES: Array<[category: string, fixFn: () => FixResult]> = [
  // this_scope
  ['this_scope', fixThisScope],
  ['this_scope', fixThisScopeRegex],
  ['this_scope', fixRewriteGuard],

  // Templates
  ['inline_template', fixInlineTemplate],
  ['template_quotes', fixTemplateQuotes],
  ['template_parse', fixTemplateQuotes],

  // Imports
  ['import_path', fixServiceImportPath],

  // Missing types/names
  ['missing_types', fixMissingTypes],
  ['missing_types', fixTypesCopySource],
  ['missing_name', fixMissingTypes],
  ['missing_name', fixTypesCopySource],

  // Setters
  ['setter_method', fixSetterMethod],

  // PrimeNG
  ['primeng_import', fixPrimengButton],
  ['primeng_import', fixPrimengAutoImport],

  // Signals
  ['signal_type', fixSignalUnknownType],
  ['standalone_import', fixStandaloneImport],

  // Type safety
  ['type_safety', fixTypeSafety],
  ['type_safety', fixReturnTypeVoid],

  // Services
  ['service_gen', fixServiceGen],
  ['hook_conversion', fixMissingTypes],

  // Properties / bindings
  ['missing_property', fixDoubleBrace],
  ['missing_property', fixPrimengAutoImport],
  ['missing_property', fixRewriteGuard],
  ['binding', fixPrimengAutoImport],
  ['binding', fixRewriteGuard],
  ['binding', fixCallbackToOutputBinding],

  // Syntax
  ['syntax', fixDoubleBrace],

  // Unknown
  ['unknown', fixFeatureClassRename],

  // PostCSS / Tailwind config
  ['postcss_config', fixPostcssConfig],
  ['postcss_config', fixStylePreservatorPostcss],

  // Missing dependencies
  ['missing_dependency', fixPostcssConfig],
];

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Apply predefined patches for a set of errors.
 * If no predefined fix works, falls back to LLM suggestions.
 *
 * @param errors - Classified errors with code, message, category, and optional mcp_layer
 * @returns List of patches that were successfully applied
 */
export async function applyPatchesForErrors(
  errors: Array<{ code: string; message: string; category: string; mcp_layer?: string }>,
): Promise<PatchApplied[]> {
  const categories = new Set(errors.map(e => e.category));
  const applied: PatchApplied[] = [];

  // 1. Try predefined fixes
  for (const [category, fixFn] of ALL_FIXES) {
    if (!categories.has(category)) continue;
    try {
      const [ok, desc] = fixFn();
      if (ok) applied.push({ name: category, description: desc });
    } catch {
      // Fix threw — skip it
    }
  }

  // 2. If no predefined fix worked, try LLM
  if (applied.length === 0) {
    await tryLlmFixes(errors, applied);
  }

  return applied;
}

/**
 * Apply ALL predefined fixes regardless of error categories.
 * Useful for a full sweep of the codebase.
 */
export function applyAll(): PatchApplied[] {
  const applied: PatchApplied[] = [];
  for (const [name, fixFn] of ALL_FIXES) {
    try {
      const [ok, desc] = fixFn();
      if (ok) applied.push({ name, description: desc });
    } catch {
      // skip
    }
  }
  return applied;
}

// ─── LLM Fallback ────────────────────────────────────────────────────────────

async function tryLlmFixes(
  errors: Array<{ code: string; message: string; category: string; mcp_layer?: string }>,
  applied: PatchApplied[],
): Promise<void> {
  try {
    if (!(await isAvailable())) return;

    // Only try the first 3 errors to avoid excessive LLM calls
    for (const err of errors.slice(0, 3)) {
      const layer = err.mcp_layer ?? 'unknown';
      const relPath = LAYER_FILE[layer];
      if (!relPath) continue;

      let src: string;
      try { src = readSource(relPath); } catch { continue; }

      const fix = await sugerirFix(err.code, err.message, src.slice(0, 2500), relPath);
      if (!fix) continue;

      // Validate: old must exist in source
      if (!src.includes(fix.old)) continue;

      // Validate: change must be small (< 500 chars difference)
      if (Math.abs(fix.new.length - fix.old.length) > 500) continue;

      // Apply and verify compilation
      writeSource(relPath, src.replace(fix.old, fix.new));
      const [buildOk] = rebuild();

      if (buildOk) {
        void logPatch(err.code, relPath, 'LLM: ' + fix.explanation);
        applied.push({ name: `llm_${err.code}`, description: fix.explanation });
      } else {
        // Revert — LLM fix broke the build
        writeSource(relPath, src);
      }
    }
  } catch {
    // LLM not available or errored — that's fine
  }
}
