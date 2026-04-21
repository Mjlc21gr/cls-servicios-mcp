/**
 * Cliente para la API de Google Apps Script.
 * Usa una cuenta de servicio (Service Account) para leer el contenido
 * de un proyecto Apps Script por su script ID.
 *
 * Requisitos:
 * - La Apps Script API debe estar habilitada en el proyecto GCP
 * - El Apps Script debe estar compartido con el email de la cuenta de servicio
 * - Las credenciales se pasan via variable de entorno GOOGLE_SERVICE_ACCOUNT_JSON
 *   (ruta al archivo JSON) o GOOGLE_SERVICE_ACCOUNT_KEY (JSON inline)
 *
 * SEGURIDAD: Nunca hardcodear credenciales. Siempre usar variables de entorno.
 */
import { GoogleAuth } from 'google-auth-library';

const APPS_SCRIPT_API_BASE = 'https://script.googleapis.com/v1/projects';
const SCOPES = [
  'https://www.googleapis.com/auth/script.projects.readonly',
];

export interface AppScriptFile {
  readonly name: string;
  readonly type: 'SERVER_JS' | 'HTML' | 'JSON';
  readonly source: string;
}

export interface AppScriptProject {
  readonly scriptId: string;
  readonly title: string;
  readonly files: readonly AppScriptFile[];
}

interface AppsScriptContentResponse {
  readonly files?: ReadonlyArray<{
    readonly name: string;
    readonly type: string;
    readonly source: string;
    readonly functionSet?: unknown;
  }>;
}

interface AppsScriptMetadataResponse {
  readonly scriptId?: string;
  readonly title?: string;
}

/**
 * Parsea las credenciales de la cuenta de servicio desde variables de entorno.
 * Prioridad:
 *   1. GOOGLE_SERVICE_ACCOUNT_KEY → JSON string directo
 *   2. GOOGLE_SERVICE_ACCOUNT_JSON → ruta a archivo .json
 */
function resolveCredentials(): Record<string, unknown> {
  const keyJson = process.env['GOOGLE_SERVICE_ACCOUNT_KEY'];
  if (keyJson) {
    try {
      return JSON.parse(keyJson) as Record<string, unknown>;
    } catch {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_KEY contiene JSON inválido. ' +
        'Verifica que el valor sea el contenido completo del archivo de credenciales.',
      );
    }
  }

  const filePath = process.env['GOOGLE_SERVICE_ACCOUNT_JSON'];
  if (filePath) {
    // google-auth-library resuelve GOOGLE_APPLICATION_CREDENTIALS automáticamente
    process.env['GOOGLE_APPLICATION_CREDENTIALS'] = filePath;
    return {}; // GoogleAuth lo lee del archivo
  }

  throw new Error(
    'No se encontraron credenciales de cuenta de servicio.\n' +
    'Define una de estas variables de entorno:\n' +
    '  GOOGLE_SERVICE_ACCOUNT_KEY  → JSON string con las credenciales\n' +
    '  GOOGLE_SERVICE_ACCOUNT_JSON → Ruta al archivo .json de credenciales',
  );
}

/**
 * Crea un cliente autenticado con la cuenta de servicio.
 */
async function getAuthClient(): Promise<GoogleAuth> {
  const credentials = resolveCredentials();

  const hasDirectKey = Object.keys(credentials).length > 0;

  const auth = new GoogleAuth({
    ...(hasDirectKey ? { credentials } : {}),
    scopes: SCOPES,
  });

  return auth;
}

/**
 * Lee el contenido completo de un proyecto Apps Script por su script ID.
 */
export async function readAppScriptProject(scriptId: string): Promise<AppScriptProject> {
  const auth = await getAuthClient();
  const client = await auth.getClient();

  // 1. Obtener metadata del proyecto
  const metaUrl = `${APPS_SCRIPT_API_BASE}/${scriptId}`;
  const metaResponse = await client.request<AppsScriptMetadataResponse>({ url: metaUrl });
  const title = metaResponse.data.title ?? scriptId;

  // 2. Obtener contenido (archivos)
  const contentUrl = `${APPS_SCRIPT_API_BASE}/${scriptId}/content`;
  const contentResponse = await client.request<AppsScriptContentResponse>({ url: contentUrl });

  const rawFiles = contentResponse.data.files ?? [];

  const files: AppScriptFile[] = rawFiles
    .filter((f) => f.type === 'SERVER_JS' || f.type === 'HTML' || f.type === 'JSON')
    .map((f) => ({
      name: f.type === 'SERVER_JS' ? `${f.name}.gs` :
            f.type === 'HTML' ? `${f.name}.html` :
            `${f.name}.json`,
      type: f.type as AppScriptFile['type'],
      source: f.source,
    }));

  return { scriptId, title, files };
}

/**
 * Convierte los archivos del proyecto a un Record<string, string>
 * compatible con analyzeAppScript().
 */
export function projectToFileMap(project: AppScriptProject): Record<string, string> {
  const fileMap: Record<string, string> = {};
  for (const file of project.files) {
    fileMap[file.name] = file.source;
  }
  return fileMap;
}
