/**
 * Modelos para el análisis de Google Apps Script.
 * Representan la estructura extraída del código .gs/.js de Apps Script.
 *
 * Apps Script tiene patrones muy distintos a React:
 * - Funciones globales (doGet, doPost, onOpen, onEdit, etc.)
 * - google.script.run para llamadas server-side
 * - HtmlService para UI (HTML templates con scriptlets <? ?>)
 * - SpreadsheetApp, DocumentApp, FormApp, etc.
 * - PropertiesService para estado persistente
 * - UrlFetchApp para llamadas HTTP externas
 */

// ---------------------------------------------------------------------------
// Funciones globales de Apps Script
// ---------------------------------------------------------------------------

export interface AppScriptFunction {
  readonly name: string;
  readonly params: readonly AppScriptParam[];
  readonly body: string;
  readonly returnType: string;
  readonly isEntryPoint: boolean;       // doGet, doPost, onOpen, onEdit, etc.
  readonly isServerCallable: boolean;   // Llamada desde google.script.run
  readonly jsdoc: string | null;
}

export interface AppScriptParam {
  readonly name: string;
  readonly type: string;               // Inferido de JSDoc o 'unknown'
}

// ---------------------------------------------------------------------------
// Llamadas a servicios de Google
// ---------------------------------------------------------------------------

export interface GoogleServiceCall {
  readonly service: string;             // SpreadsheetApp, UrlFetchApp, etc.
  readonly method: string;              // getActiveSpreadsheet, fetch, etc.
  readonly chain: string;               // Cadena completa: SpreadsheetApp.getActive().getSheetByName(...)
  readonly context: string;             // Nombre de la función que lo contiene
}

// ---------------------------------------------------------------------------
// Llamadas google.script.run (client → server)
// ---------------------------------------------------------------------------

export interface ScriptRunCall {
  readonly serverFunction: string;      // Nombre de la función server-side
  readonly successHandler: string | null;
  readonly failureHandler: string | null;
  readonly context: string;             // Función HTML que lo invoca
}

// ---------------------------------------------------------------------------
// HTML Templates (HtmlService)
// ---------------------------------------------------------------------------

export interface HtmlTemplate {
  readonly fileName: string;
  readonly hasScriptlets: boolean;      // Usa <? ?> / <?= ?>
  readonly scriptletVariables: readonly string[];
  readonly formElements: readonly HtmlFormElement[];
  readonly scriptRunCalls: readonly ScriptRunCall[];
  readonly cssClasses: readonly string[];
  readonly inlineStyles: boolean;
}

export interface HtmlFormElement {
  readonly tag: string;                 // input, select, textarea, button
  readonly id: string | null;
  readonly name: string | null;
  readonly type: string | null;         // text, number, checkbox, etc.
  readonly hasValidation: boolean;
}

// ---------------------------------------------------------------------------
// Estado persistente (PropertiesService / CacheService)
// ---------------------------------------------------------------------------

export interface PropertyAccess {
  readonly store: 'script' | 'user' | 'document';
  readonly key: string;
  readonly operation: 'get' | 'set' | 'delete';
  readonly context: string;
}

// ---------------------------------------------------------------------------
// Llamadas HTTP externas (UrlFetchApp)
// ---------------------------------------------------------------------------

export interface ExternalApiCall {
  readonly url: string;
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  readonly hasPayload: boolean;
  readonly context: string;
}

// ---------------------------------------------------------------------------
// Análisis completo de un proyecto Apps Script
// ---------------------------------------------------------------------------

export interface AppScriptAnalysis {
  readonly projectName: string;
  readonly files: readonly AppScriptFileAnalysis[];
  readonly entryPoints: readonly AppScriptFunction[];
  readonly serverCallableFunctions: readonly AppScriptFunction[];
  readonly googleServiceCalls: readonly GoogleServiceCall[];
  readonly externalApiCalls: readonly ExternalApiCall[];
  readonly propertyAccesses: readonly PropertyAccess[];
  readonly htmlTemplates: readonly HtmlTemplate[];
  readonly totalFunctions: number;
  readonly migrationNotes: readonly string[];
}

export interface AppScriptFileAnalysis {
  readonly fileName: string;
  readonly fileType: 'server' | 'html' | 'config';
  readonly functions: readonly AppScriptFunction[];
  readonly googleServiceCalls: readonly GoogleServiceCall[];
  readonly externalApiCalls: readonly ExternalApiCall[];
  readonly propertyAccesses: readonly PropertyAccess[];
}
