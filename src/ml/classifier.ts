/**
 * Error Classifier — Rule-based + frequency scoring.
 *
 * Classifies TypeScript/Angular compilation errors into categories
 * and identifies which MCP layer needs to be patched.
 *
 * Strategy:
 *   1. Deterministic rules (hardcoded error codes) → confidence 1.0
 *   2. Prefix matching (e.g. NG8xxx) → confidence 0.9
 *   3. Frequency-based from DB history → confidence 0.7
 *   4. Unknown fallback → confidence 0.0
 */

import { getAllErrors } from './db-client.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ClassifyResult {
  category: string;
  mcpLayer: string;
  confidence: number;
}

// ─── Deterministic Rules ─────────────────────────────────────────────────────

/**
 * Maps error codes to [category, mcpLayer].
 * These cover 95%+ of cases deterministically.
 */
const RULES: Record<string, [string, string]> = {
  // Scope / this
  'TS2663': ['this_scope', 'class-context-layer'],
  'TS2551': ['this_scope', 'class-context-layer'],
  'TS2300': ['deduplication', 'class-context-layer'],

  // Template
  'NG8002': ['binding', 'template-generator'],
  'NG8001': ['primeng_import', 'primeng-mapper'],
  'NG5002': ['template_parse', 'template-integrity-layer'],

  // Component properties
  'NG9': ['missing_property', 'code-emitter'],
  'NG1': ['missing_property', 'code-emitter'],

  // Signals / types
  'NG8': ['signal_type', 'code-emitter'],
  'NG5': ['type_safety', 'code-emitter'],

  // Imports
  'TS2307': ['import_path', 'code-emitter'],
  'TS2304': ['missing_name', 'code-emitter'],
  'TS2306': ['import_path', 'code-emitter'],

  // Type safety
  'TS2571': ['signal_type', 'code-emitter'],
  'TS18047': ['type_safety', 'code-emitter'],
  'TS2339': ['type_safety', 'code-emitter'],
  'TS2345': ['type_safety', 'code-emitter'],
  'TS2355': ['type_safety', 'code-emitter'],
  'TS7006': ['type_safety', 'code-emitter'],
  'TS7030': ['type_safety', 'code-emitter'],

  // Syntax
  'TS1005': ['syntax', 'code-emitter'],

  // Custom codes
  'TS-991002': ['inline_template', 'code-emitter'],
  'TS-992012': ['standalone_import', 'code-emitter'],

  // PostCSS / Tailwind / Build config errors
  'POSTCSS_CONFIG': ['postcss_config', 'project-scaffolder'],
  'MODULE_NOT_FOUND': ['missing_dependency', 'project-scaffolder'],
  'SCSS_ERROR': ['style_error', 'project-scaffolder'],
};

// ─── Frequency Map (trained from DB) ────────────────────────────────────────

interface FreqEntry {
  category: string;
  mcpLayer: string;
  count: number;
}

let _freqMap: Map<string, FreqEntry> | null = null;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Train the frequency model from historical error data in the database.
 * Returns true if training succeeded (enough data), false otherwise.
 */
export async function train(): Promise<boolean> {
  try {
    const rows = await getAllErrors();
    if (rows.length < 5) return false;

    // Build frequency map: for each error code, find the most common category+layer
    const freq = new Map<string, Map<string, number>>();
    for (const r of rows) {
      if (!freq.has(r.code)) freq.set(r.code, new Map());
      const key = `${r.category}|${r.mcp_layer}`;
      const m = freq.get(r.code)!;
      m.set(key, (m.get(key) ?? 0) + 1);
    }

    _freqMap = new Map();
    for (const [code, layerCounts] of freq) {
      let best = '';
      let bestCount = 0;
      for (const [k, count] of layerCounts) {
        if (count > bestCount) { best = k; bestCount = count; }
      }
      const [category, mcpLayer] = best.split('|');
      _freqMap.set(code, { category, mcpLayer, count: bestCount });
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Classify a compilation error into a category and target MCP layer.
 *
 * @param code - Error code (e.g. "TS2663", "NG8001")
 * @param _message - Error message (reserved for future NLP-based classification)
 */
export function classify(code: string, _message = ''): ClassifyResult {
  // 1. Exact match in deterministic rules
  if (RULES[code]) {
    const [category, mcpLayer] = RULES[code];
    return { category, mcpLayer, confidence: 1.0 };
  }

  // 2. Prefix match (e.g. NG8xxx matches NG8)
  for (const ruleCode of Object.keys(RULES)) {
    if (code.startsWith(ruleCode)) {
      const [category, mcpLayer] = RULES[ruleCode];
      return { category, mcpLayer, confidence: 0.9 };
    }
  }

  // 3. Frequency-based from training data
  if (_freqMap?.has(code)) {
    const entry = _freqMap.get(code)!;
    return { category: entry.category, mcpLayer: entry.mcpLayer, confidence: 0.7 };
  }

  // 4. Unknown
  return { category: 'unknown', mcpLayer: 'unknown', confidence: 0.0 };
}
