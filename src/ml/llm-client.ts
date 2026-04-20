/**
 * LLM Client — Suggests fixes for compilation errors.
 *
 * The LLM only SUGGESTS. It never writes files or executes commands.
 * The ML system validates and decides whether to apply the suggestion.
 *
 * Supports:
 *   - Ollama (local, default)
 *   - OpenAI-compatible APIs (remote)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LlmFix {
  old: string;
  new: string;
  explanation: string;
}

export interface LlmConfig {
  /** Full URL to the LLM endpoint */
  url: string;
  /** Model name (e.g. gemini-2.0-flash, qwen2.5-coder:1.5b) */
  model: string;
  /** API key (required for Gemini/OpenAI, optional for Ollama) */
  apiKey?: string;
  /** Backend type */
  type: 'ollama' | 'openai' | 'gemini';
}

// ─── Internal State ──────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 180_000; // 3 minutes for LLM generation
const AVAILABILITY_TIMEOUT_MS = 3_000;

let _config: LlmConfig | null = null;

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * Configure the LLM client. Must be called before using sugerirFix.
 */
export function configureLlm(config: LlmConfig): void {
  _config = config;
}

/**
 * Check if an LLM is configured.
 */
export function isLlmConfigured(): boolean {
  return _config !== null;
}

// ─── LLM Backends ────────────────────────────────────────────────────────────

async function callOllama(prompt: string, maxTokens = 512): Promise<string | null> {
  if (!_config) return null;
  try {
    const res = await fetch(_config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: _config.model,
        prompt,
        stream: false,
        options: { temperature: 0.1, num_predict: maxTokens },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json() as { response?: string };
    return data.response ?? null;
  } catch {
    return null;
  }
}

async function callOpenAI(prompt: string, maxTokens = 512): Promise<string | null> {
  if (!_config) return null;
  try {
    const res = await fetch(_config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${_config.apiKey ?? ''}`,
      },
      body: JSON.stringify({
        model: _config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

async function callGemini(prompt: string, maxTokens = 512): Promise<string | null> {
  if (!_config) return null;
  try {
    const url = `${_config.url}/${_config.model}:generateContent?key=${_config.apiKey ?? ''}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: maxTokens,
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

async function callLlm(prompt: string, maxTokens = 512): Promise<string | null> {
  if (!_config) return null;
  switch (_config.type) {
    case 'gemini': return callGemini(prompt, maxTokens);
    case 'openai': return callOpenAI(prompt, maxTokens);
    default: return callOllama(prompt, maxTokens);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Ask the LLM to suggest a minimal fix for a TypeScript compilation error.
 *
 * Returns a fix suggestion or null if the LLM can't help.
 * The caller is responsible for validating and applying the fix.
 */
export async function sugerirFix(
  errorCode: string,
  errorMessage: string,
  mcpSourceSnippet: string,
  filePath: string,
): Promise<LlmFix | null> {
  const prompt = `You fix TypeScript compilation errors in an Angular code generator.

Error: ${errorCode}: ${errorMessage}
File: ${filePath}

Source code (DO NOT change anything unrelated to the error):
\`\`\`typescript
${mcpSourceSnippet.slice(0, 2000)}
\`\`\`

Suggest the SMALLEST possible fix. Respond ONLY with JSON:
{"old": "exact string to replace", "new": "replacement", "explanation": "why"}

RULES:
- old must exist EXACTLY in the source
- Change ONLY what fixes this specific error
- Keep it minimal

JSON:`;

  const resp = await callLlm(prompt);
  if (!resp) return null;

  try {
    const start = resp.indexOf('{');
    const end = resp.lastIndexOf('}') + 1;
    if (start < 0 || end <= start) return null;

    const fix = JSON.parse(resp.slice(start, end)) as LlmFix;
    if (fix.old && fix.new && fix.old !== fix.new) return fix;
  } catch {
    // JSON parse failed — LLM returned invalid response
  }

  return null;
}

/**
 * Check if the configured LLM backend is available and has a suitable model.
 */
export async function isAvailable(): Promise<boolean> {
  if (!_config) return false;

  try {
    if (_config.type === 'ollama') {
      const base = _config.url.replace('/api/generate', '');
      const res = await fetch(`${base}/api/tags`, {
        signal: AbortSignal.timeout(AVAILABILITY_TIMEOUT_MS),
      });
      if (!res.ok) return false;
      const data = await res.json() as { models?: Array<{ name?: string }> };
      const models = data.models ?? [];
      return models.some(
        m => m.name?.includes('qwen') || m.name?.includes('codellama') || m.name?.includes(_config!.model),
      );
    }

    if (_config.type === 'gemini') {
      // Gemini: available if we have an API key, verify with a models list call
      if (!_config.apiKey) return false;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${_config.apiKey}`,
        { signal: AbortSignal.timeout(AVAILABILITY_TIMEOUT_MS) },
      );
      return res.ok;
    }

    // OpenAI: available if we have an API key
    return !!_config.apiKey;
  } catch {
    return false;
  }
}
