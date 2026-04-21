/**
 * Detector inteligente del tipo de fuente.
 * Determina si el input es React, Apps Script, o un script ID de GCP.
 *
 * Orden de detección:
 * 1. scriptId → GCP Apps Script (inequívoco)
 * 2. sourceCode con patrones React → React pipeline
 * 3. sourceCode con patrones Apps Script → Apps Script pipeline
 * 4. files (Record) con .gs/.html → Apps Script pipeline
 * 5. sourceDir → escaneo de directorio
 */

export type SourceType = 'react' | 'appscript' | 'appscript-gcp' | 'unknown';

export interface DetectionResult {
  readonly type: SourceType;
  readonly confidence: number;       // 0-100
  readonly signals: readonly string[];  // Qué patrones se detectaron
}

// ---------------------------------------------------------------------------
// Patrones de detección
// ---------------------------------------------------------------------------

const REACT_PATTERNS: readonly RegExp[] = [
  /import\s+React/,
  /from\s+['"]react['"]/,
  /useState\s*[<(]/,
  /useEffect\s*\(/,
  /useMemo\s*\(/,
  /useCallback\s*\(/,
  /useRef\s*[<(]/,
  /useContext\s*\(/,
  /className\s*=/,
  /export\s+default\s+function\s+\w+/,
  /export\s+const\s+\w+\s*[:=]\s*(?:React\.)?FC/,
  /<\w+\s+className=/,
  /ReactDOM/,
  /jsx|tsx/i,
];

const APPSCRIPT_PATTERNS: readonly RegExp[] = [
  /function\s+doGet\s*\(/,
  /function\s+doPost\s*\(/,
  /function\s+onOpen\s*\(/,
  /function\s+onEdit\s*\(/,
  /function\s+onInstall\s*\(/,
  /SpreadsheetApp\./,
  /DocumentApp\./,
  /DriveApp\./,
  /FormApp\./,
  /GmailApp\./,
  /CalendarApp\./,
  /UrlFetchApp\./,
  /HtmlService\./,
  /PropertiesService\./,
  /CacheService\./,
  /google\.script\.run/,
  /ContentService\./,
  /ScriptApp\./,
  /Logger\.log/,
];

/**
 * Valida si un string parece un Apps Script ID.
 * Los IDs de Apps Script son strings alfanuméricos con guiones bajos y guiones,
 * típicamente de 40-60 caracteres.
 */
export function isScriptId(value: string): boolean {
  const trimmed = value.trim();
  // Apps Script IDs: alfanumérico + guiones bajos + guiones, ~40-60 chars
  return /^[a-zA-Z0-9_-]{30,80}$/.test(trimmed);
}

/**
 * Detecta el tipo de fuente a partir de código fuente.
 */
export function detectSourceType(sourceCode: string): DetectionResult {
  const reactScore = countMatches(sourceCode, REACT_PATTERNS);
  const appscriptScore = countMatches(sourceCode, APPSCRIPT_PATTERNS);

  const reactSignals = getMatchedPatterns(sourceCode, REACT_PATTERNS);
  const appscriptSignals = getMatchedPatterns(sourceCode, APPSCRIPT_PATTERNS);

  if (reactScore > appscriptScore && reactScore >= 2) {
    return {
      type: 'react',
      confidence: Math.min(100, reactScore * 15),
      signals: reactSignals,
    };
  }

  if (appscriptScore > reactScore && appscriptScore >= 1) {
    return {
      type: 'appscript',
      confidence: Math.min(100, appscriptScore * 20),
      signals: appscriptSignals,
    };
  }

  if (reactScore > 0) {
    return { type: 'react', confidence: reactScore * 10, signals: reactSignals };
  }

  if (appscriptScore > 0) {
    return { type: 'appscript', confidence: appscriptScore * 15, signals: appscriptSignals };
  }

  return { type: 'unknown', confidence: 0, signals: ['No se detectaron patrones conocidos'] };
}

/**
 * Detecta el tipo a partir de un mapa de archivos (Record<string, string>).
 */
export function detectFromFileMap(files: Record<string, string>): DetectionResult {
  const fileNames = Object.keys(files);

  const hasGs = fileNames.some((f) => f.endsWith('.gs'));
  const hasHtmlWithScriptlets = fileNames.some((f) => {
    if (!f.endsWith('.html')) return false;
    const content = files[f];
    return /google\.script\.run/.test(content) || /<\?[=!]?/.test(content);
  });
  const hasTsx = fileNames.some((f) => f.endsWith('.tsx') || f.endsWith('.jsx'));

  if (hasGs || hasHtmlWithScriptlets) {
    return {
      type: 'appscript',
      confidence: 90,
      signals: [
        ...(hasGs ? ['.gs files detected'] : []),
        ...(hasHtmlWithScriptlets ? ['HTML with scriptlets/google.script.run'] : []),
      ],
    };
  }

  if (hasTsx) {
    return {
      type: 'react',
      confidence: 85,
      signals: ['.tsx/.jsx files detected'],
    };
  }

  // Fallback: analizar contenido de todos los archivos
  const allContent = Object.values(files).join('\n');
  return detectSourceType(allContent);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countMatches(source: string, patterns: readonly RegExp[]): number {
  return patterns.filter((p) => p.test(source)).length;
}

function getMatchedPatterns(source: string, patterns: readonly RegExp[]): string[] {
  return patterns
    .filter((p) => p.test(source))
    .map((p) => p.source);
}
