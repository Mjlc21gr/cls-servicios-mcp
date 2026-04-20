/**
 * Default configurations for the ML subsystem.
 */

import type { LlmConfig } from './llm-client.js';

/**
 * Default Gemini configuration.
 * Uses gemini-2.0-flash for fast, cost-effective code fixes.
 */
export const GEMINI_DEFAULT: LlmConfig = {
  url: 'https://generativelanguage.googleapis.com/v1beta/models',
  model: 'gemini-2.0-flash',
  apiKey: process.env['GEMINI_API_KEY'] ?? 'AIzaSyASdSVOkvCg5WNpLedTH98bIgVs1EqizHk',
  type: 'gemini',
};

/**
 * Default Ollama configuration (local).
 */
export const OLLAMA_DEFAULT: LlmConfig = {
  url: 'http://localhost:11434/api/generate',
  model: 'qwen2.5-coder:1.5b',
  type: 'ollama',
};
