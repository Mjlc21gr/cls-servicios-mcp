/**
 * Default configurations for the ML subsystem.
 *
 * SECURITY: No credentials are hardcoded. All secrets come from environment variables.
 *   - GEMINI_API_KEY: Required for Gemini LLM
 *   - MCP_DB_CLIENT_ID: Required for DB access
 *   - MCP_DB_CLIENT_SECRET: Required for DB access
 */

import type { LlmConfig } from './llm-client.js';

/**
 * Default Gemini configuration.
 * Reads API key from GEMINI_API_KEY environment variable.
 */
export const GEMINI_DEFAULT: LlmConfig = {
  url: 'https://generativelanguage.googleapis.com/v1beta/models',
  model: 'gemini-2.5-flash',
  apiKey: process.env['GEMINI_API_KEY'] ?? '',
  type: 'gemini',
};

/**
 * Default Ollama configuration (local, no credentials needed).
 */
export const OLLAMA_DEFAULT: LlmConfig = {
  url: 'http://localhost:11434/api/generate',
  model: 'qwen2.5-coder:1.5b',
  type: 'ollama',
};
