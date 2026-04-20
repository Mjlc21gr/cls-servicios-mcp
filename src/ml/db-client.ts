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

// ─── Internal State ──────────────────────────────────────────────────────────

const DEFAULT_API_BASE = 'https://r4yl4sit9d.execute-api.us-east-1.amazonaws.com/dev/api/v1';
const DEFAULT_STORE = 'MCP CLS - CLEVER';
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
  if (!_config) throw new Error('DB not configured. Call configureDb() first.');

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
  // Format: YYYYMMDD_HHMMSS_SEQ (readable, sortable, unique per session)
  const now = new Date();
  const date = now.toISOString().replace(/[-:T]/g, '').slice(0, 14); // 20260420113000
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
  const data = await res.json();
  return (Array.isArray(data) ? data : [data]) as T[];
}

/**
 * Get a valid auth token (for use by MCP tools that need direct API access).
 */
export async function getAuthToken(): Promise<string> {
  return getToken();
}

// ─── Intentos ────────────────────────────────────────────────────────────────

/**
 * Create a new optimization attempt record.
 * Returns the generated ID.
 */
export async function crearIntento(
  totalErrors: number,
  buildOk: boolean,
  iteration: number,
  patches: string,
  notes: string,
): Promise<number> {
  const id = nextId('INTENTOS');
  await insert('INTENTOS', {
    id: String(id),
    ts: new Date().toISOString(),
    total_errors: totalErrors,
    build_ok: buildOk,
    render_ok: false,
    iteration,
    patches_applied: patches,
    notes,
  });
  return id;
}

/**
 * Update fields on an existing attempt.
 */
export async function updateIntento(id: number, fields: Partial<DbIntento>): Promise<void> {
  await insert('INTENTOS', { id: String(id), ...fields });
}

// ─── Errores ─────────────────────────────────────────────────────────────────

/**
 * Insert a compilation error linked to an attempt.
 */
export async function insertError(
  intentoId: number,
  code: string,
  message: string,
  category: string,
  mcpLayer: string,
): Promise<void> {
  await insert('ERRORES', {
    id: String(nextId('ERRORES')),
    intento_id: intentoId,
    ts: new Date().toISOString(),
    code,
    message: message.slice(0, 500),
    file_path: '',
    category,
    mcp_layer: mcpLayer,
    fixed: false,
  });
}

/**
 * Get unfixed errors (grouped by code for patching decisions).
 */
export async function getErrors(): Promise<DbError[]> {
  return queryTable<DbError>('errores');
}

/**
 * Get all errors (for ML training).
 */
export async function getAllErrors(): Promise<DbError[]> {
  return queryTable<DbError>('errores');
}

// ─── Patches ─────────────────────────────────────────────────────────────────

/**
 * Log a patch that was applied.
 */
export async function logPatch(errorCode: string, mcpFile: string, description: string): Promise<void> {
  await insert('PATCHES', {
    id: String(nextId('PATCHES')),
    ts: new Date().toISOString(),
    error_code: errorCode,
    mcp_file: mcpFile,
    description,
    applied_count: 1,
    success_count: 0,
    confidence: 0.5,
  });
}

/**
 * Increment success counter for a patch (error was resolved after applying it).
 */
export async function incrementarExito(errorCode: string): Promise<void> {
  await insert('PATCHES', { error_code: errorCode, success_count: 1 });
}

// ─── ML Seguimiento ──────────────────────────────────────────────────────────

/**
 * Register an error in the ML tracking table when a patch is applied.
 */
export async function registrarSeguimiento(
  errorCode: string,
  message: string,
  category: string,
  mcpLayer: string,
  patch: string,
  intentoId: number,
): Promise<void> {
  await insert('ML_SEGUIMIENTO', {
    id: String(nextId('ML_SEGUIMIENTO')),
    ts: new Date().toISOString(),
    error_code: errorCode,
    error_message: message.slice(0, 500),
    category,
    mcp_layer: mcpLayer,
    patch_applied: patch,
    solucionado: false,
    intento_origen: intentoId,
    intento_verificacion: 0,
    notas: '',
  });
}

/**
 * Mark an error as resolved — it no longer appears in the build.
 */
export async function marcarSolucionado(
  errorCode: string,
  category: string,
  intentoVerificacion: number,
): Promise<void> {
  await insert('ML_SEGUIMIENTO', {
    error_code: errorCode,
    category,
    solucionado: true,
    intento_verificacion: intentoVerificacion,
  });
}

/**
 * Mark an error as NOT resolved — ML must try a different strategy.
 */
export async function marcarNoSolucionado(
  errorCode: string,
  category: string,
  intentoVerificacion: number,
  nota: string,
): Promise<void> {
  await insert('ML_SEGUIMIENTO', {
    error_code: errorCode,
    category,
    solucionado: false,
    intento_verificacion: intentoVerificacion,
    notas: nota,
  });
}

/**
 * Get errors that were patched but not yet verified.
 */
export async function getPendientes(): Promise<DbSeguimiento[]> {
  return queryTable<DbSeguimiento>('ml_seguimiento');
}

/**
 * Get summary of ML tracking (totals by category).
 */
export async function getResumen(): Promise<Array<{ category: string; total: number; resueltos: number; pendientes: number }>> {
  return queryTable('ml_seguimiento');
}
