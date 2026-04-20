# MCP ML Optimizer

Sistema de Machine Learning que lee errores de compilacion de Angular desde PostgreSQL, los clasifica con Random Forest, y parchea el MCP para corregirlos. Usa Ollama (LLM local) como herramienta de sugerencia cuando los patches predefinidos no alcanzan.

## Estructura

```
mcp-ml-optimizer/
├── pyproject.toml          # Config del proyecto Python
├── requirements.txt        # Dependencias: scikit-learn, psycopg2, numpy
├── schema_v2.sql           # Schema PostgreSQL (intentos, errores, patches, ml_seguimiento)
├── README.md               # Este archivo
└── mcp_ml_optimizer/
    ├── __init__.py
    ├── db.py               # Capa de acceso a PostgreSQL
    ├── classifier.py       # Random Forest que clasifica errores
    ├── patcher.py          # Patches predefinidos + LLM fallback
    ├── llm.py              # Conexion a Ollama (LLM local)
    └── main.py             # Orquestador del ciclo automatico
```

## Archivos

### db.py
Conexion a PostgreSQL localhost:5432/mcp_optimizer. Funciones:
- `get_errors()` — Lee errores no resueltos agrupados por categoria
- `get_all_errors()` — Todos los errores para entrenar el ML
- `crear_intento()` — Registra cada intento de transformacion + build
- `log_patch()` — Registra cada patch aplicado al MCP
- `registrar_seguimiento()` — Registra en ml_seguimiento cuando el ML aplica un patch
- `marcar_solucionado()` — Marca un error como resuelto despues de verificar

### classifier.py
Random Forest que mapea `error_code + message → mcp_layer`. Tiene:
- `RULES` — Diccionario de reglas deterministas (TS2663 → class-context-layer, NG8001 → primeng-mapper, etc.)
- `ErrorClassifier.train()` — Entrena el modelo desde los datos de PostgreSQL
- `ErrorClassifier.classify()` — Clasifica un error: primero reglas, luego ML si no hay regla

### patcher.py
20+ funciones de patch que modifican el MCP source directamente. Cada una:
1. Lee el archivo del MCP
2. Busca un marker (ej: `// MLFIX-INLINE`) para no aplicar dos veces
3. Busca el string exacto a reemplazar
4. Escribe el archivo modificado
5. Registra en PostgreSQL

Patches principales:
- `fix_this_scope` — Agrega reescritura de `this.` para variables de estado
- `fix_inline_template` — Fuerza templateUrl externo cuando hay backticks
- `fix_template_quotes` — Escapa comillas dobles en ternarios de templates
- `fix_service_import_path` — Corrige profundidad de import de servicios
- `fix_missing_types` — Fuerza generacion de types.ts
- `fix_setter_method` — Genera metodos setter para signals en templates
- `fix_primeng_button` — ButtonDirective → Button para PrimeNG 19
- `fix_primeng_auto_import` — Auto-importa componentes PrimeNG del template
- `fix_rewrite_guard` — Incluye props en la guarda de safeRewriteBody
- `fix_types_copy_source` — Copia types.ts del source React al output
- `fix_callback_to_output_binding` — Convierte [onX] a (onX) para outputs

Cuando ningun patch predefinido funciona, el ML pide sugerencia al LLM (Ollama).
El ML valida la sugerencia antes de aplicarla:
- El string `old` debe existir en el source
- El cambio debe ser minimo (max 500 chars)
- No debe borrar funciones
- El MCP debe compilar despues del cambio
- Si falla, el ML revierte automaticamente

### llm.py
Conexion a Ollama local (http://localhost:11434). Modelo: qwen2.5-coder:1.5b (~8s por respuesta).
- `sugerir_fix()` — Recibe error + codigo MCP, devuelve `{old, new, explanation}`
- `is_available()` — Verifica si Ollama esta corriendo con el modelo
- El LLM NO escribe archivos. Solo sugiere. El ML decide.

### main.py
Ciclo automatico:
1. Limpia output anterior
2. Ejecuta MCP (node migrate-cli.js)
3. Instala dependencias Angular
4. Ejecuta ng build
5. Parsea errores del build
6. Guarda errores en PostgreSQL
7. ML clasifica y busca patches
8. Si no hay patches → LLM sugiere → ML valida
9. Aplica patches al MCP → recompila
10. Repite hasta 0 errores o max iteraciones

## Ejecucion

```bash
# Requisitos
pip install scikit-learn psycopg2-binary numpy

# PostgreSQL debe estar corriendo en localhost:5432
# Ollama debe estar corriendo con qwen2.5-coder:1.5b

# Ejecutar ciclo completo
cd mcp-ml-optimizer
python -m mcp_ml_optimizer.main
```

## Variables de entorno

```
MCP_ROOT    — Ruta al proyecto MCP (default: cls-servicios-mcp)
REACT_SRC   — Ruta al proyecto React source
ANGULAR_OUT — Ruta donde se genera el proyecto Angular
```

## Base de datos

```
intentos        — Cada intento de transformacion + build
errores         — Errores de compilacion clasificados
patches         — Patches aplicados al MCP
ml_seguimiento  — Tracking de errores: solucionado si/no
```

## Como agregar un nuevo patch

1. Crear funcion en `patcher.py`:
```python
def fix_mi_error():
    f = LAYER_FILE["code-emitter"]  # archivo MCP a modificar
    c = _read(f)
    M = "// MLFIX-MINOMBRE"
    if _has(c, M):
        return False, "already applied"
    old = "string exacto a buscar"
    new = f"{M}\nstring de reemplazo"
    if old in c:
        _write(f, c.replace(old, new, 1))
        db.log_patch("TS1234", f, "descripcion")
        return True, "descripcion"
    return False, "target not found"
```

2. Agregar a `ALL_FIXES`:
```python
ALL_FIXES = [
    ...
    ("mi_categoria", fix_mi_error),
]
```

3. Agregar regla en `classifier.py` si es un codigo nuevo:
```python
RULES = {
    ...
    "TS1234": ("mi_categoria", "code-emitter"),
}
```
