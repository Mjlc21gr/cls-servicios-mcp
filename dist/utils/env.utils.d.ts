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
import type { GitHubRepoConfig } from '../models/pipeline.model.js';
/** Todas las variables de entorno que el MCP reconoce */
export declare const ENV_KEYS: {
    readonly SOURCE_GITHUB_TOKEN: "MCP_SOURCE_GITHUB_TOKEN";
    readonly SOURCE_GITHUB_OWNER: "MCP_SOURCE_GITHUB_OWNER";
    readonly SOURCE_GITHUB_REPO: "MCP_SOURCE_GITHUB_REPO";
    readonly SOURCE_GITHUB_BRANCH: "MCP_SOURCE_GITHUB_BRANCH";
    readonly SOURCE_GITHUB_BASE_PATH: "MCP_SOURCE_GITHUB_BASE_PATH";
    readonly DEST_GITHUB_TOKEN: "MCP_DEST_GITHUB_TOKEN";
    readonly DEST_GITHUB_OWNER: "MCP_DEST_GITHUB_OWNER";
    readonly DEST_GITHUB_REPO: "MCP_DEST_GITHUB_REPO";
    readonly DEST_GITHUB_BRANCH: "MCP_DEST_GITHUB_BRANCH";
    readonly STRICT_MODE: "MCP_STRICT_MODE";
    readonly DRY_RUN: "MCP_DRY_RUN";
    readonly MAX_COMPLEXITY: "MCP_MAX_COMPLEXITY";
    readonly MAX_FILE_SIZE_KB: "MCP_MAX_FILE_SIZE_KB";
    readonly REQUIRE_TESTS: "MCP_REQUIRE_TESTS";
    readonly MIN_TEST_COVERAGE: "MCP_MIN_TEST_COVERAGE";
    readonly API_BASE_URL: "MCP_API_BASE_URL";
};
/**
 * Lee una variable de entorno. Retorna el default si no existe.
 * Si no hay default y es requerida, retorna undefined (el caller decide).
 */
export declare function getEnv(key: string): string | undefined;
/**
 * Lee una variable de entorno requerida. Lanza error si no existe.
 */
export declare function requireEnv(key: string): string;
/**
 * Lee un booleano de entorno.
 */
export declare function getEnvBool(key: string): boolean;
/**
 * Lee un número de entorno.
 */
export declare function getEnvNumber(key: string): number;
/**
 * Construye la config del repo origen desde env vars.
 * Los parámetros explícitos tienen prioridad sobre env vars.
 */
export declare function buildSourceRepoConfig(overrides?: {
    owner?: string;
    repo?: string;
    branch?: string;
    token?: string;
    basePath?: string;
}): GitHubRepoConfig;
/**
 * Construye la config del repo destino desde env vars.
 * Los parámetros explícitos tienen prioridad sobre env vars.
 */
export declare function buildDestRepoConfig(overrides?: {
    owner?: string;
    repo?: string;
    branch?: string;
    token?: string;
}): GitHubRepoConfig;
/**
 * Muestra el estado actual de las variables de entorno (sin tokens).
 * Útil para debug.
 */
export declare function getEnvStatus(): Record<string, string>;
//# sourceMappingURL=env.utils.d.ts.map