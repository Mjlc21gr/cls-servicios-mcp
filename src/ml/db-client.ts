/**
 * Database access layer via REST API.
 *
 * Connects to a REST backend (AWS API Gateway) that wraps the ML database.
 * All operations are async and handle auth token refresh automatically.
 *
 * API contract:
 *   POST /auth/token                      → { token }
 *   POST /store/:store/inbound/:table     → insert record
 *   GET  /queries/execute/:table?params   → query records
 *
 * Table names (all lowercase):
 *   intentos, errores, patches, ml-seguimiento
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DbConfig {
  clientId: string;
  clientSecret: string;
  apiBase?: string;
  storeName?: string;
}

export interface DbError {
  id?: number;
  intento_id?: number;
  code: string;
  message: string;
  file_path?: string;
  category: string;
  mcp_layer: string;
  fixed?: boolean;
  total?: number;
}

export interface DbIntento {
  id?: number;
  ts?: string;
  total_errors: number;
  build_ok: boolean;
  render_ok?: boolean;
  iteration: number;
  patches_applied: string;
  notes: string;
}

export interface DbPatch {
  id?: number;
  ts?: string;
  error_code: string;
  mcp_file: string;
  description: string;
  applied_count?: number;
  success_count?: number;
  confidence?: number;
}

export interface DbSeguimiento {
  id?: number;
  ts?: string;
  error_code: string;
  error_message: string;
  category: string;
  mcp_layer: string;
  patch_applied: string;
  solucionado?: boolean;
  intento_origen: number;
  intento_verificacion?: number;
  notas?: string;
}

// ─── Table Names (all lowercase, matching API endpoints) ─────────────────────

const TABLE = {
  intentos: 'intentos',
  errores: 'errores',
  patches: 'patches',
  seguimiento: 'ml-seguimiento',
} as const;

// ─── Internal State ──────────────────────────────────────────────────────────

const DEFAULT_API_BASE = 'https://r4yl4sit9d.execute-api.us-east-1.amazonaws.com/dev/api/v1';
const DEFAULT_STORE = 'MCP CLS - CLEVER';
const DEFAULT_CLIENT_ID = 'MCP CLS - Clever';
const DEFAULT_CLIENT_SECRET = 'SdjiHvDrXFUoXhV39TfUIGOoZz1GxbQwe_BVJSSPDCI';
const TOKEN_TTL_MS = 50 * 60 * 1000; // 50 minutes

let _config: DbConfig | null = null;
let _token: string | null = null;
let _tokenExpiry = 0;
let _idCounters: Record<string, number> = {};

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * Configure database connection. Must be called before any DB operation.
 */
export function configureDb(config: DbConfig): void {
  _config = config;
  _token = null;
  _tokenExpiry = 0;
  _idCounters = {};
}

/**
 * Check if the database is configured.
 */
export function isDbConfigured(): boolean {
  return _config !== null;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function getApiBase(): string {
  return _config?.apiBase ?? DEFAULT_API_BASE;
}

function getStoreName(): string {
  return _config?.storeName ?? DEFAULT_STORE;
}

async function getToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiry) return _token;

  // Auto-configure with defaults if not explicitly configured
  if (!_config) {
    _config = {
      clientId: process.env['MCP_DB_CLIENT_ID'] ?? DEFAULT_CLIENT_ID,
      clientSecret: process.env['MCP_DB_CLIENT_SECRET'] ?? DEFAULT_CLIENT_SECRET,
    };
  }

  const res = await fetch(`${getApiBase()}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: _config.clientId,
      clientSecret: _config.clientSecret,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Auth failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json() as { token?: string };
  _token = data.token ?? '';
  _tokenExpiry = Date.now() + TOKEN_TTL_MS;
  return _token;
}

function nextId(table: string): number {
  _idCounters[table] = (_idCounters[table] ?? 0) + 1;
  const now = new Date();
  const date = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return Number(`${date}${String(_idCounters[table]).padStart(4, '0')}`);
}

async function insert(table: string, record: Record<string, unknown>): Promise<void> {
  const token = await getToken();
  const url = `${getApiBase()}/store/${encodeURIComponent(getStoreName())}/inbound/${table}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(record),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Insert into ${table} failed: ${res.status} ${body}`);
  }
}

async function queryTable<T>(table: string, params?: Record<string, string>): Promise<T[]> {
  const token = await getToken();
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const url = `${getApiBase()}/queries/execute/${table}${qs}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) return [];
  const data = await res.json() as { results?: Record<string, unknown>[] };
  const rows = data.results ?? [];

  // API returns fields prefixed with table name in uppercase:
  //   INTENTOS_id, ERRORES_code, ML-SEGUIMIENTO_error_code, PATCHES_mcp_file
  // We strip the prefix to get clean field names: id, code, error_code, mcp_file
  // Build prefix from the queryName (table uppercase + underscore)
  const prefix = table.toUpperCase() + '_';
  return rows.map(row => {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      const fieldName = key.startsWith(prefix) ? key.slice(prefix.length) : key;
      clean[fieldName] = value;
    }
    return clean as T;
  });
}

/**
 * Get a valid auth token (for use by MCP tools that need direct API access).
 */
export async function getAuthToken(): Promise<string> {
  return getToken();
}

// ─── Intentos ────────────────────────────────────────────────────────────────

export async function crearIntento(
  totalErrors: number, buildOk: boolean, iteration: number, patches: string, notes: string,
): Promise<number> {
  const id = nextId(TABLE.intentos);
  await insert(TABLE.intentos, {
    id: String(id), ts: new Date().toISOString(),
    total_errors: totalErrors, build_ok: buildOk, render_ok: false,
    iteration, patches_applied: patches, notes,
  });
  return id;
}

export async function updateIntento(id: number, fields: Partial<DbIntento>): Promise<void> {
  await insert(TABLE.intentos, { id: String(id), ...fields });
}

export async function getIntentos(): Promise<DbIntento[]> {
  return queryTable<DbIntento>(TABLE.intentos);
}

// ─── Errores ─────────────────────────────────────────────────────────────────

export async function insertError(
  intentoId: number, code: string, message: string, category: string, mcpLayer: string,
): Promise<void> {
  await insert(TABLE.errores, {
    id: String(nextId(TABLE.errores)), intento_id: intentoId, ts: new Date().toISOString(),
    code, message: message.slice(0, 500), file_path: '', category, mcp_layer: mcpLayer, fixed: false,
  });
}

export async function getErrors(): Promise<DbError[]> {
  return queryTable<DbError>(TABLE.errores);
}

export async function getAllErrors(): Promise<DbError[]> {
  return queryTable<DbError>(TABLE.errores);
}

// ─── Patches ─────────────────────────────────────────────────────────────────

export async function logPatch(errorCode: string, mcpFile: string, description: string): Promise<void> {
  await insert(TABLE.patches, {
    id: String(nextId(TABLE.patches)), ts: new Date().toISOString(),
    error_code: errorCode, mcp_file: mcpFile, description,
    applied_count: 1, success_count: 0, confidence: 0.5,
  });
}

export async function incrementarExito(errorCode: string): Promise<void> {
  await insert(TABLE.patches, { error_code: errorCode, success_count: 1 });
}

export async function getPatches(): Promise<DbPatch[]> {
  return queryTable<DbPatch>(TABLE.patches);
}

// ─── ML Seguimiento ──────────────────────────────────────────────────────────

export async function registrarSeguimiento(
  errorCode: string, message: string, category: string, mcpLayer: string, patch: string, intentoId: number,
): Promise<void> {
  await insert(TABLE.seguimiento, {
    id: String(nextId(TABLE.seguimiento)), ts: new Date().toISOString(),
    error_code: errorCode, error_message: message.slice(0, 500), category,
    mcp_layer: mcpLayer, patch_applied: patch, solucionado: false,
    intento_origen: intentoId, intento_verificacion: 0, notas: '',
  });
}

export async function marcarSolucionado(errorCode: string, category: string, intentoVerificacion: number): Promise<void> {
  await insert(TABLE.seguimiento, { error_code: errorCode, category, solucionado: true, intento_verificacion: intentoVerificacion });
}

export async function marcarNoSolucionado(errorCode: string, category: string, intentoVerificacion: number, nota: string): Promise<void> {
  await insert(TABLE.seguimiento, { error_code: errorCode, category, solucionado: false, intento_verificacion: intentoVerificacion, notas: nota });
}

export async function getPendientes(): Promise<DbSeguimiento[]> {
  return queryTable<DbSeguimiento>(TABLE.seguimiento);
}

export async function getResumen(): Promise<Array<{ category: string; total: number; resueltos: number; pendientes: number }>> {
  return queryTable(TABLE.seguimiento);
}
