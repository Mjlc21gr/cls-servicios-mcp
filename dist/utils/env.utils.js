/**
 * Utilidades de variables de entorno.
 * Centraliza la lectura de credenciales y configuración desde process.env.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  PARA CAMBIAR CREDENCIALES:                                     │
 * │  Editar el archivo .env en la raíz del proyecto                 │
 * │  o exportar las variables en tu shell antes de ejecutar.        │
 * │                                                                 │
 * │  PARA AGREGAR NUEVAS VARIABLES:                                 │
 * │  1. Agregar la key en ENV_KEYS                                  │
 * │  2. Agregar el default en ENV_DEFAULTS (opcional)               │
 * │  3. Usar getEnv('MI_NUEVA_VAR') donde se necesite               │
 * └─────────────────────────────────────────────────────────────────┘
 */
/** Todas las variables de entorno que el MCP reconoce */
export const ENV_KEYS = {
    // GitHub - Repo Origen (React)
    SOURCE_GITHUB_TOKEN: 'MCP_SOURCE_GITHUB_TOKEN',
    SOURCE_GITHUB_OWNER: 'MCP_SOURCE_GITHUB_OWNER',
    SOURCE_GITHUB_REPO: 'MCP_SOURCE_GITHUB_REPO',
    SOURCE_GITHUB_BRANCH: 'MCP_SOURCE_GITHUB_BRANCH',
    SOURCE_GITHUB_BASE_PATH: 'MCP_SOURCE_GITHUB_BASE_PATH',
    // GitHub - Repo Destino (Angular/Shell)
    DEST_GITHUB_TOKEN: 'MCP_DEST_GITHUB_TOKEN',
    DEST_GITHUB_OWNER: 'MCP_DEST_GITHUB_OWNER',
    DEST_GITHUB_REPO: 'MCP_DEST_GITHUB_REPO',
    DEST_GITHUB_BRANCH: 'MCP_DEST_GITHUB_BRANCH',
    // Pipeline
    STRICT_MODE: 'MCP_STRICT_MODE',
    DRY_RUN: 'MCP_DRY_RUN',
    MAX_COMPLEXITY: 'MCP_MAX_COMPLEXITY',
    MAX_FILE_SIZE_KB: 'MCP_MAX_FILE_SIZE_KB',
    REQUIRE_TESTS: 'MCP_REQUIRE_TESTS',
    MIN_TEST_COVERAGE: 'MCP_MIN_TEST_COVERAGE',
    // API
    API_BASE_URL: 'MCP_API_BASE_URL',
    // Google Apps Script (Service Account)
    GOOGLE_SERVICE_ACCOUNT_KEY: 'GOOGLE_SERVICE_ACCOUNT_KEY',
    GOOGLE_SERVICE_ACCOUNT_JSON: 'GOOGLE_SERVICE_ACCOUNT_JSON',
};
/** Valores por defecto cuando la variable no está definida */
const ENV_DEFAULTS = {
    [ENV_KEYS.SOURCE_GITHUB_BRANCH]: 'main',
    [ENV_KEYS.SOURCE_GITHUB_BASE_PATH]: 'src',
    [ENV_KEYS.DEST_GITHUB_BRANCH]: 'develop',
    [ENV_KEYS.STRICT_MODE]: 'true',
    [ENV_KEYS.DRY_RUN]: 'false',
    [ENV_KEYS.MAX_COMPLEXITY]: '20',
    [ENV_KEYS.MAX_FILE_SIZE_KB]: '50',
    [ENV_KEYS.REQUIRE_TESTS]: 'true',
    [ENV_KEYS.MIN_TEST_COVERAGE]: '90',
    [ENV_KEYS.API_BASE_URL]: '/servicios-core/api/v1',
};
/**
 * Lee una variable de entorno. Retorna el default si no existe.
 * Si no hay default y es requerida, retorna undefined (el caller decide).
 */
export function getEnv(key) {
    return process.env[key] ?? ENV_DEFAULTS[key];
}
/**
 * Lee una variable de entorno requerida. Lanza error si no existe.
 */
export function requireEnv(key) {
    const value = getEnv(key);
    if (!value) {
        throw new Error(`Variable de entorno requerida no definida: ${key}\n` +
            `Defínela en .env o expórtala: export ${key}="valor"`);
    }
    return value;
}
/**
 * Lee un booleano de entorno.
 */
export function getEnvBool(key) {
    const value = getEnv(key);
    return value === 'true' || value === '1';
}
/**
 * Lee un número de entorno.
 */
export function getEnvNumber(key) {
    const value = getEnv(key);
    return value ? parseInt(value, 10) : 0;
}
/**
 * Construye la config del repo origen desde env vars.
 * Los parámetros explícitos tienen prioridad sobre env vars.
 */
export function buildSourceRepoConfig(overrides) {
    return {
        owner: overrides?.owner || requireEnv(ENV_KEYS.SOURCE_GITHUB_OWNER),
        repo: overrides?.repo || requireEnv(ENV_KEYS.SOURCE_GITHUB_REPO),
        branch: overrides?.branch || getEnv(ENV_KEYS.SOURCE_GITHUB_BRANCH) || 'main',
        token: overrides?.token || requireEnv(ENV_KEYS.SOURCE_GITHUB_TOKEN),
        basePath: overrides?.basePath || getEnv(ENV_KEYS.SOURCE_GITHUB_BASE_PATH),
    };
}
/**
 * Construye la config del repo destino desde env vars.
 * Los parámetros explícitos tienen prioridad sobre env vars.
 */
export function buildDestRepoConfig(overrides) {
    return {
        owner: overrides?.owner || requireEnv(ENV_KEYS.DEST_GITHUB_OWNER),
        repo: overrides?.repo || requireEnv(ENV_KEYS.DEST_GITHUB_REPO),
        branch: overrides?.branch || getEnv(ENV_KEYS.DEST_GITHUB_BRANCH) || 'develop',
        token: overrides?.token || requireEnv(ENV_KEYS.DEST_GITHUB_TOKEN),
    };
}
/**
 * Muestra el estado actual de las variables de entorno (sin tokens).
 * Útil para debug.
 */
export function getEnvStatus() {
    const status = {};
    for (const [label, key] of Object.entries(ENV_KEYS)) {
        const value = process.env[key];
        if (label.includes('TOKEN')) {
            status[label] = value ? '✅ configurado' : '❌ no definido';
        }
        else {
            status[label] = value ?? ENV_DEFAULTS[key] ?? '❌ no definido';
        }
    }
    return status;
}
//# sourceMappingURL=env.utils.js.map