/**
 * Output Fixer — Corrects generated Angular code using LLM.
 *
 * Works from npm — no access to MCP source needed.
 * Fixes the OUTPUT code, not the MCP itself.
 *
 * Flow:
 *   1. Receive generated Angular files (component.ts, template.html, etc.)
 *   2. Detect common errors via pattern analysis
 *   3. Ask LLM (Gemini) to fix each error
 *   4. Apply fixes and re-check
 *   5. Log everything to the database (if configured)
 *
 * SECURITY: No credentials in this file. DB and LLM read from env vars.
 */

import { sugerirFix, isAvailable, isLlmConfigured } from './llm-client.js';
import { classify } from './classifier.js';
import {
  isDbConfigured,
  crearIntento,
  insertError,
  logPatch,
  registrarSeguimiento,
  marcarSolucionado,
} from './db-client.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface FixResult {
  files: GeneratedFile[];
  errorsFound: number;
  errorsFixed: number;
  fixes: Array<{ file: string; errorCode: string; description: string }>;
  remaining: Array<{ code: string; message: string; file: string }>;
  savedToDb: boolean;
}

interface DetectedError {
  code: string;
  message: string;
  file: string;
  line?: number;
}

// ─── Error Detection ─────────────────────────────────────────────────────────

function detectErrors(files: GeneratedFile[]): DetectedError[] {
  const errors: DetectedError[] = [];

  for (const file of files) {
    if (!file.path.endsWith('.ts')) continue;
    const lines = file.content.split('\n');
    const content = file.content;

    // Line-level checks
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Type 'any' usage (forbidden in CLS)
      if (/:\s*any\b/.test(line) && !line.includes('// eslint') && !line.trimStart().startsWith('//')) {
        errors.push({ code: 'TS7006', message: `Implicit 'any' type at line ${i + 1}`, file: file.path, line: i + 1 });
      }
    }

    // File-level checks for .component.ts
    if (file.path.endsWith('.component.ts')) {
      if (!content.includes('@Component')) {
        errors.push({ code: 'NG9', message: 'Missing @Component decorator', file: file.path });
      }
      if (content.includes('@Component') && !content.includes('standalone')) {
        errors.push({ code: 'NG9', message: 'Missing standalone: true in @Component', file: file.path });
      }
    }

    // React residuals in Angular code
    if (content.includes('useState') || content.includes('useEffect') || content.includes('useRef')) {
      errors.push({ code: 'TS2304', message: 'React hook found in Angular code', file: file.path });
    }
    if (content.includes('className=') && !content.includes('//')) {
      errors.push({ code: 'NG8002', message: 'React className attribute in Angular template', file: file.path });
    }
  }

  return errors;
}

// ─── LLM Fix ─────────────────────────────────────────────────────────────────

async function tryFixWithLlm(
  file: GeneratedFile,
  error: DetectedError,
): Promise<{ fixed: boolean; content: string; description: string }> {
  const snippet = file.content.slice(0, 3000);
  const fix = await sugerirFix(error.code, error.message, snippet, file.path);

  if (!fix) return { fixed: false, content: file.content, description: '' };
  if (!file.content.includes(fix.old)) return { fixed: false, content: file.content, description: '' };
  if (Math.abs(fix.new.length - fix.old.length) > 500) return { fixed: false, content: file.content, description: '' };

  return { fixed: true, content: file.content.replace(fix.old, fix.new), description: fix.explanation };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fix errors in generated Angular files using the LLM.
 * Optionally logs all errors and fixes to the database.
 *
 * Works from npm — no access to MCP source needed.
 */
export async function fixGeneratedOutput(
  files: GeneratedFile[],
  moduleName: string,
  maxAttempts = 3,
): Promise<FixResult> {
  const result: FixResult = {
    files: files.map(f => ({ ...f })),
    errorsFound: 0,
    errorsFixed: 0,
    fixes: [],
    remaining: [],
    savedToDb: false,
  };

  const llmReady = isLlmConfigured() && await isAvailable();
  const dbReady = isDbConfigured();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const errors = detectErrors(result.files);
    if (attempt === 0) result.errorsFound = errors.length;
    if (errors.length === 0) break;

    // Save to DB if configured
    if (dbReady) {
      try {
        const intentoId = await crearIntento(
          errors.length, false, attempt + 1, '',
          `Output fix attempt ${attempt + 1} for ${moduleName}`,
        );
        for (const err of errors) {
          const { category, mcpLayer } = classify(err.code, err.message);
          await insertError(intentoId, err.code, err.message, category, mcpLayer);
        }
        result.savedToDb = true;
      } catch {
        // DB not available — continue without logging
      }
    }

    if (!llmReady) {
      result.remaining = errors.map(e => ({ code: e.code, message: e.message, file: e.file }));
      break;
    }

    // Try to fix each error with LLM
    let fixedAny = false;
    for (const error of errors) {
      const fileIdx = result.files.findIndex(f => f.path === error.file);
      if (fileIdx < 0) continue;

      const { fixed, content, description } = await tryFixWithLlm(result.files[fileIdx], error);
      if (fixed) {
        result.files[fileIdx] = { ...result.files[fileIdx], content };
        result.errorsFixed++;
        result.fixes.push({ file: error.file, errorCode: error.code, description });
        fixedAny = true;

        if (dbReady) {
          try {
            await logPatch(error.code, error.file, 'LLM output fix: ' + description);
            const { category, mcpLayer } = classify(error.code, error.message);
            await registrarSeguimiento(error.code, error.message, category, mcpLayer, description, 0);
          } catch { /* continue */ }
        }
      }
    }

    if (!fixedAny) {
      result.remaining = errors.map(e => ({ code: e.code, message: e.message, file: e.file }));
      break;
    }
  }

  // Mark fixed errors as resolved
  if (dbReady && result.errorsFixed > 0) {
    try {
      for (const fix of result.fixes) {
        const { category } = classify(fix.errorCode, '');
        await marcarSolucionado(fix.errorCode, category, 0);
      }
    } catch { /* continue */ }
  }

  return result;
}
