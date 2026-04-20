# -*- coding: utf-8 -*-
"""
LLM - Herramienta del ML. Solo sugiere, no aplica.

El LLM recibe un error de la DB y el codigo MCP relevante,
y devuelve una SUGERENCIA de fix. El ML decide si aplicarla.

Reglas:
- El LLM NO escribe archivos
- El LLM NO ejecuta comandos
- El LLM solo devuelve {old, new, explanation}
- El ML valida que old existe en el source
- El ML valida que el cambio es minimo
- El ML valida que el MCP compila despues del cambio
- Si algo falla, el ML revierte
"""

import json
import urllib.request

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "qwen2.5-coder:1.5b"


def _call_ollama(prompt, max_tokens=512):
    """Llamada raw a Ollama. Retorna string o None."""
    try:
        data = json.dumps({
            "model": MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.1, "num_predict": max_tokens},
        }).encode("utf-8")
        req = urllib.request.Request(OLLAMA_URL, data=data,
                                     headers={"Content-Type": "application/json"})
        resp = urllib.request.urlopen(req, timeout=180)
        return json.loads(resp.read().decode("utf-8")).get("response", "")
    except Exception:
        return None


def sugerir_fix(error_code, error_message, mcp_source_snippet, file_path):
    """
    El LLM analiza un error y sugiere un fix MINIMO.

    Retorna: dict {old, new, explanation} o None
    El ML decide si aplicarlo.
    """
    prompt = f"""You fix TypeScript compilation errors in an Angular code generator.

Error: {error_code}: {error_message}
File: {file_path}

Source code (DO NOT change anything unrelated to the error):
```typescript
{mcp_source_snippet[:2000]}
```

Suggest the SMALLEST possible fix. Respond ONLY with JSON:
{{"old": "exact string to replace", "new": "replacement", "explanation": "why"}}

RULES:
- old must exist EXACTLY in the source
- Change ONLY what fixes this specific error
- Do NOT restructure code
- Do NOT add features
- Keep it minimal

JSON:"""

    resp = _call_ollama(prompt)
    if not resp:
        return None

    try:
        start = resp.find("{")
        end = resp.rfind("}") + 1
        if start >= 0 and end > start:
            fix = json.loads(resp[start:end])
            if "old" in fix and "new" in fix and fix["old"] != fix["new"]:
                return fix
    except (json.JSONDecodeError, KeyError):
        pass
    return None


def is_available():
    """Check if Ollama is running."""
    try:
        resp = urllib.request.urlopen("http://localhost:11434/api/tags", timeout=3)
        data = json.loads(resp.read().decode("utf-8"))
        return any(m.get("name", "").startswith("qwen") or m.get("name", "").startswith("codellama")
                   for m in data.get("models", []))
    except Exception:
        return False
