/**
 * Analizador de proyectos Google Apps Script.
 * Extrae funciones, llamadas a servicios Google, google.script.run,
 * templates HTML, PropertiesService, y UrlFetchApp.
 *
 * Soporta archivos .gs (server-side) y .html (HtmlService templates).
 */
import type {
  AppScriptAnalysis,
  AppScriptFileAnalysis,
  AppScriptFunction,
  AppScriptParam,
  GoogleServiceCall,
  ScriptRunCall,
  HtmlTemplate,
  HtmlFormElement,
  ExternalApiCall,
  PropertyAccess,
} from '../models/appscript-analysis.model.js';

// ---------------------------------------------------------------------------
// Entry points y triggers conocidos de Apps Script
// ---------------------------------------------------------------------------

const ENTRY_POINT_NAMES = new Set([
  'doGet', 'doPost', 'onOpen', 'onEdit', 'onInstall',
  'onSelectionChange', 'onFormSubmit', 'onChange',
]);

const GOOGLE_SERVICES = [
  'SpreadsheetApp', 'DocumentApp', 'FormApp', 'SlidesApp',
  'DriveApp', 'GmailApp', 'CalendarApp', 'ContactsApp',
  'UrlFetchApp', 'PropertiesService', 'CacheService',
  'ScriptApp', 'HtmlService', 'ContentService',
  'Utilities', 'Logger', 'Session', 'LockService',
  'MailApp', 'CardService', 'Charts',
];

// ---------------------------------------------------------------------------
// Análisis principal
// ---------------------------------------------------------------------------

/**
 * Analiza un conjunto de archivos de un proyecto Apps Script.
 * @param files - Map de fileName → sourceCode
 * @param projectName - Nombre del proyecto
 */
export function analyzeAppScript(
  files: Record<string, string>,
  projectName: string,
): AppScriptAnalysis {
  const fileAnalyses: AppScriptFileAnalysis[] = [];
  const allFunctions: AppScriptFunction[] = [];
  const allGoogleCalls: GoogleServiceCall[] = [];
  const allExternalCalls: ExternalApiCall[] = [];
  const allPropertyAccesses: PropertyAccess[] = [];
  const htmlTemplates: HtmlTemplate[] = [];

  for (const [fileName, sourceCode] of Object.entries(files)) {
    if (fileName.endsWith('.html')) {
      const template = analyzeHtmlTemplate(fileName, sourceCode);
      htmlTemplates.push(template);
      fileAnalyses.push({
        fileName,
        fileType: 'html',
        functions: [],
        googleServiceCalls: [],
        externalApiCalls: [],
        propertyAccesses: [],
      });
    } else {
      // .gs o .js — server-side code
      const analysis = analyzeServerFile(fileName, sourceCode);
      fileAnalyses.push(analysis);
      allFunctions.push(...analysis.functions);
      allGoogleCalls.push(...analysis.googleServiceCalls);
      allExternalCalls.push(...analysis.externalApiCalls);
      allPropertyAccesses.push(...analysis.propertyAccesses);
    }
  }

  const entryPoints = allFunctions.filter((f) => f.isEntryPoint);

  // Detectar funciones llamadas desde google.script.run en HTML templates
  const scriptRunNames = new Set(
    htmlTemplates.flatMap((t) => t.scriptRunCalls.map((c) => c.serverFunction)),
  );
  const serverCallable = allFunctions.filter(
    (f) => scriptRunNames.has(f.name) || f.isServerCallable,
  );

  const migrationNotes = buildMigrationNotes(
    allFunctions, allGoogleCalls, allExternalCalls,
    allPropertyAccesses, htmlTemplates,
  );

  return {
    projectName,
    files: fileAnalyses,
    entryPoints,
    serverCallableFunctions: serverCallable,
    googleServiceCalls: allGoogleCalls,
    externalApiCalls: allExternalCalls,
    propertyAccesses: allPropertyAccesses,
    htmlTemplates,
    totalFunctions: allFunctions.length,
    migrationNotes,
  };
}


// ---------------------------------------------------------------------------
// Análisis de archivos server-side (.gs / .js)
// ---------------------------------------------------------------------------

function analyzeServerFile(fileName: string, source: string): AppScriptFileAnalysis {
  const functions = extractFunctions(source);
  const googleCalls = extractGoogleServiceCalls(source);
  const externalCalls = extractExternalApiCalls(source);
  const propertyAccesses = extractPropertyAccesses(source);

  return {
    fileName,
    fileType: fileName === 'appsscript.json' ? 'config' : 'server',
    functions,
    googleServiceCalls: googleCalls,
    externalApiCalls: externalCalls,
    propertyAccesses: propertyAccesses,
  };
}

// ---------------------------------------------------------------------------
// Extracción de funciones
// ---------------------------------------------------------------------------

function extractFunctions(source: string): AppScriptFunction[] {
  const functions: AppScriptFunction[] = [];

  // Patrón: function name(params) { body }
  const funcRegex = /(?:\/\*\*[\s\S]*?\*\/\s*)?function\s+(\w+)\s*\(([^)]*)\)\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = funcRegex.exec(source)) !== null) {
    const name = match[1];
    const paramsStr = match[2].trim();
    const bodyStart = match.index + match[0].length;
    const body = extractFunctionBody(source, bodyStart);

    // Extraer JSDoc si existe
    const jsdocMatch = source.slice(Math.max(0, match.index - 500), match.index)
      .match(/\/\*\*([\s\S]*?)\*\/\s*$/);
    const jsdoc = jsdocMatch ? jsdocMatch[0] : null;

    const params = parseParams(paramsStr, jsdoc);

    functions.push({
      name,
      params,
      body,
      returnType: inferReturnType(body, jsdoc),
      isEntryPoint: ENTRY_POINT_NAMES.has(name),
      isServerCallable: false, // Se determina después cruzando con HTML
      jsdoc,
    });
  }

  // Patrón: const name = function(params) { ... } o arrow functions
  const varFuncRegex = /(?:const|let|var)\s+(\w+)\s*=\s*(?:function\s*\(([^)]*)\)|(?:\(([^)]*)\)|(\w+))\s*=>)\s*\{?/g;
  while ((match = varFuncRegex.exec(source)) !== null) {
    const name = match[1];
    const paramsStr = (match[2] || match[3] || match[4] || '').trim();
    const bodyStart = match.index + match[0].length;
    const body = extractFunctionBody(source, bodyStart);

    functions.push({
      name,
      params: parseParams(paramsStr, null),
      body,
      returnType: inferReturnType(body, null),
      isEntryPoint: ENTRY_POINT_NAMES.has(name),
      isServerCallable: false,
      jsdoc: null,
    });
  }

  return functions;
}

function extractFunctionBody(source: string, startIndex: number): string {
  let depth = 1;
  let i = startIndex;

  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    i++;
  }

  return source.slice(startIndex, i - 1).trim();
}

function parseParams(paramsStr: string, jsdoc: string | null): AppScriptParam[] {
  if (!paramsStr) return [];

  return paramsStr.split(',').map((p) => {
    const name = p.trim().replace(/\s*=.*$/, ''); // Quitar defaults
    let type = 'unknown';

    // Intentar extraer tipo de JSDoc @param {Type} name
    if (jsdoc) {
      const paramTypeMatch = jsdoc.match(
        new RegExp(`@param\\s+\\{([^}]+)\\}\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      );
      if (paramTypeMatch) {
        type = mapAppScriptType(paramTypeMatch[1]);
      }
    }

    return { name, type };
  });
}

function inferReturnType(body: string, jsdoc: string | null): string {
  // Desde JSDoc
  if (jsdoc) {
    const returnMatch = jsdoc.match(/@returns?\s+\{([^}]+)\}/);
    if (returnMatch) return mapAppScriptType(returnMatch[1]);
  }

  // Heurísticas del body
  if (!body.includes('return')) return 'void';
  if (body.includes('return HtmlService')) return 'GoogleAppsScript.HTML.HtmlOutput';
  if (body.includes('return ContentService')) return 'GoogleAppsScript.Content.TextOutput';
  if (body.includes('JSON.stringify')) return 'string';

  return 'unknown';
}

function mapAppScriptType(gsType: string): string {
  const typeMap: Record<string, string> = {
    'string': 'string',
    'number': 'number',
    'boolean': 'boolean',
    'Object': 'Record<string, unknown>',
    'object': 'Record<string, unknown>',
    'Array': 'unknown[]',
    'Date': 'Date',
    'void': 'void',
    'any': 'unknown',
    '*': 'unknown',
  };
  return typeMap[gsType] || 'unknown';
}

// ---------------------------------------------------------------------------
// Extracción de llamadas a servicios Google
// ---------------------------------------------------------------------------

function extractGoogleServiceCalls(source: string): GoogleServiceCall[] {
  const calls: GoogleServiceCall[] = [];

  for (const service of GOOGLE_SERVICES) {
    const regex = new RegExp(`(${service}(?:\\.[\\w]+)+)\\(`, 'g');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(source)) !== null) {
      const chain = match[1];
      const parts = chain.split('.');
      const method = parts[1] || '';
      const context = findContainingFunction(source, match.index);

      calls.push({ service, method, chain, context });
    }
  }

  return calls;
}

// ---------------------------------------------------------------------------
// Extracción de llamadas HTTP externas (UrlFetchApp)
// ---------------------------------------------------------------------------

function extractExternalApiCalls(source: string): ExternalApiCall[] {
  const calls: ExternalApiCall[] = [];

  // UrlFetchApp.fetch(url, options)
  const fetchRegex = /UrlFetchApp\.fetch\(\s*(['"`]([^'"`]+)['"`]|(\w+))/g;
  let match: RegExpExecArray | null;

  while ((match = fetchRegex.exec(source)) !== null) {
    const url = match[2] || match[3] || 'dynamic_url';
    const context = findContainingFunction(source, match.index);

    // Buscar method en options cercanas
    const surroundingCode = source.slice(match.index, match.index + 300);
    const methodMatch = surroundingCode.match(/['"]method['"]\s*:\s*['"](\w+)['"]/i);
    const method = (methodMatch?.[1]?.toUpperCase() || 'GET') as ExternalApiCall['method'];
    const hasPayload = /['"]payload['"]\s*:/.test(surroundingCode);

    calls.push({ url, method, hasPayload, context });
  }

  return calls;
}

// ---------------------------------------------------------------------------
// Extracción de PropertiesService / CacheService
// ---------------------------------------------------------------------------

function extractPropertyAccesses(source: string): PropertyAccess[] {
  const accesses: PropertyAccess[] = [];

  const propRegex = /PropertiesService\.(getScriptProperties|getUserProperties|getDocumentProperties)\(\)\.(getProperty|setProperty|deleteProperty)\(\s*['"`]([^'"`]+)['"`]/g;
  let match: RegExpExecArray | null;

  while ((match = propRegex.exec(source)) !== null) {
    const storeMap: Record<string, PropertyAccess['store']> = {
      'getScriptProperties': 'script',
      'getUserProperties': 'user',
      'getDocumentProperties': 'document',
    };
    const opMap: Record<string, PropertyAccess['operation']> = {
      'getProperty': 'get',
      'setProperty': 'set',
      'deleteProperty': 'delete',
    };

    accesses.push({
      store: storeMap[match[1]] || 'script',
      key: match[3],
      operation: opMap[match[2]] || 'get',
      context: findContainingFunction(source, match.index),
    });
  }

  return accesses;
}

// ---------------------------------------------------------------------------
// Análisis de HTML templates (HtmlService)
// ---------------------------------------------------------------------------

function analyzeHtmlTemplate(fileName: string, source: string): HtmlTemplate {
  const hasScriptlets = /<%[=!]?/.test(source);
  const scriptletVars = extractScriptletVariables(source);
  const formElements = extractFormElements(source);
  const scriptRunCalls = extractScriptRunCalls(source);
  const cssClasses = extractCssClasses(source);
  const inlineStyles = /style\s*=\s*["']/.test(source);

  return {
    fileName,
    hasScriptlets,
    scriptletVariables: scriptletVars,
    formElements,
    scriptRunCalls,
    cssClasses,
    inlineStyles,
  };
}

function extractScriptletVariables(source: string): string[] {
  const vars: string[] = [];
  const regex = /<%[=!]\s*(\w+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source)) !== null) {
    if (!vars.includes(match[1])) {
      vars.push(match[1]);
    }
  }

  return vars;
}

function extractFormElements(source: string): HtmlFormElement[] {
  const elements: HtmlFormElement[] = [];
  const regex = /<(input|select|textarea|button)\b([^>]*)>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source)) !== null) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];

    const idMatch = attrs.match(/id\s*=\s*["']([^"']+)["']/);
    const nameMatch = attrs.match(/name\s*=\s*["']([^"']+)["']/);
    const typeMatch = attrs.match(/type\s*=\s*["']([^"']+)["']/);
    const hasValidation = /required|pattern|min=|max=|minlength|maxlength/.test(attrs);

    elements.push({
      tag,
      id: idMatch?.[1] || null,
      name: nameMatch?.[1] || null,
      type: typeMatch?.[1] || null,
      hasValidation,
    });
  }

  return elements;
}

function extractScriptRunCalls(source: string): ScriptRunCall[] {
  const calls: ScriptRunCall[] = [];

  // google.script.run.withSuccessHandler(fn).withFailureHandler(fn).serverFunc(args)
  const regex = /google\.script\.run(?:\.withSuccessHandler\((\w+)\))?(?:\.withFailureHandler\((\w+)\))?\.(\w+)\(/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source)) !== null) {
    calls.push({
      serverFunction: match[3],
      successHandler: match[1] || null,
      failureHandler: match[2] || null,
      context: findContainingFunction(source, match.index),
    });
  }

  return calls;
}

function extractCssClasses(source: string): string[] {
  const classes: string[] = [];
  const regex = /class\s*=\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source)) !== null) {
    match[1].split(/\s+/).forEach((cls) => {
      if (cls && !classes.includes(cls)) classes.push(cls);
    });
  }

  return classes;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findContainingFunction(source: string, position: number): string {
  const before = source.slice(0, position);
  const funcMatch = before.match(/function\s+(\w+)\s*\([^)]*\)\s*\{[^]*$/);
  if (funcMatch) return funcMatch[1];

  const varFuncMatch = before.match(/(?:const|let|var)\s+(\w+)\s*=\s*(?:function|\([^)]*\)\s*=>)[^]*$/);
  if (varFuncMatch) return varFuncMatch[1];

  return 'global';
}

function buildMigrationNotes(
  functions: AppScriptFunction[],
  googleCalls: GoogleServiceCall[],
  externalCalls: ExternalApiCall[],
  propertyAccesses: PropertyAccess[],
  htmlTemplates: HtmlTemplate[],
): string[] {
  const notes: string[] = [];

  const entryPoints = functions.filter((f) => f.isEntryPoint);
  if (entryPoints.length > 0) {
    notes.push(`${entryPoints.length} entry points (${entryPoints.map((e) => e.name).join(', ')}) → Angular routes/guards`);
  }

  notes.push(`${functions.length} funciones totales → servicios + componentes Angular`);

  // Servicios Google usados
  const usedServices = new Set(googleCalls.map((c) => c.service));
  if (usedServices.size > 0) {
    notes.push(`Servicios Google: ${[...usedServices].join(', ')} → Angular services con HttpClient`);
  }

  if (externalCalls.length > 0) {
    notes.push(`${externalCalls.length} llamadas UrlFetchApp → HttpClient`);
  }

  if (propertyAccesses.length > 0) {
    notes.push(`${propertyAccesses.length} accesos PropertiesService → localStorage/sessionStorage o backend`);
  }

  if (htmlTemplates.length > 0) {
    notes.push(`${htmlTemplates.length} HTML templates → componentes Angular`);
    const withScriptlets = htmlTemplates.filter((t) => t.hasScriptlets);
    if (withScriptlets.length > 0) {
      notes.push(`${withScriptlets.length} templates con scriptlets (<? ?>) → interpolación Angular`);
    }
    const totalForms = htmlTemplates.reduce((sum, t) => sum + t.formElements.length, 0);
    if (totalForms > 0) {
      notes.push(`${totalForms} elementos de formulario → Reactive Forms / PrimeNG`);
    }
  }

  const scriptRunCount = htmlTemplates.reduce((sum, t) => sum + t.scriptRunCalls.length, 0);
  if (scriptRunCount > 0) {
    notes.push(`${scriptRunCount} llamadas google.script.run → HttpClient service calls`);
  }

  return notes;
}
