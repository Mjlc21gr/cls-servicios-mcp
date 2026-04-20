# -*- coding: utf-8 -*-
"""Database access layer."""

import psycopg2

CONFIG = dict(
    host="localhost", port=5432,
    user="postgres", password="postgres",
    database="mcp_optimizer",
)


def connect():
    return psycopg2.connect(**CONFIG)


def query(sql, params=None):
    conn = connect()
    cur = conn.cursor()
    cur.execute(sql, params or ())
    cols = [d[0] for d in cur.description] if cur.description else []
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    cur.close()
    conn.close()
    return rows


def execute(sql, params=None):
    conn = connect()
    cur = conn.cursor()
    cur.execute(sql, params or ())
    conn.commit()
    cur.close()
    conn.close()


def scalar(sql, params=None):
    rows = query(sql, params)
    return rows[0][list(rows[0].keys())[0]] if rows else None


# ── Errores ──

def get_errors():
    return query("""
        SELECT code, message, category, mcp_layer, COUNT(*) as total
        FROM errores WHERE fixed = false
        GROUP BY code, message, category, mcp_layer
        ORDER BY total DESC
    """)


def get_all_errors():
    return query("SELECT code, message, category, mcp_layer FROM errores ORDER BY id")


# ── Seguimiento ML ──

def registrar_seguimiento(error_code, message, category, mcp_layer, patch, intento_id):
    """Registra un error en ml_seguimiento cuando el ML aplica un patch."""
    execute("""
        INSERT INTO ml_seguimiento (error_code, error_message, category, mcp_layer, patch_applied, intento_origen)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (error_code, message[:500], category, mcp_layer, patch, intento_id))


def marcar_solucionado(error_code, category, intento_verificacion):
    """Marca como solucionado cuando el error ya no aparece en el build."""
    execute("""
        UPDATE ml_seguimiento SET solucionado = true, intento_verificacion = %s
        WHERE error_code = %s AND category = %s AND solucionado = false
    """, (intento_verificacion, error_code, category))


def marcar_no_solucionado(error_code, category, intento_verificacion, nota):
    """Marca como NO solucionado — el ML debe buscar otra estrategia."""
    execute("""
        UPDATE ml_seguimiento SET intento_verificacion = %s, notas = %s
        WHERE error_code = %s AND category = %s AND solucionado = false
    """, (intento_verificacion, nota, error_code, category))


def get_pendientes():
    """Errores que el ML parcheo pero aun no se verificaron."""
    return query("SELECT * FROM ml_seguimiento WHERE solucionado = false ORDER BY id")


def get_resumen():
    """Resumen de seguimiento."""
    return query("""
        SELECT category, COUNT(*) as total,
               SUM(CASE WHEN solucionado THEN 1 ELSE 0 END) as resueltos,
               SUM(CASE WHEN NOT solucionado THEN 1 ELSE 0 END) as pendientes
        FROM ml_seguimiento GROUP BY category ORDER BY pendientes DESC
    """)


# ── Intentos ──

def crear_intento(total_errors, build_ok, iteration, patches, notes):
    conn = connect()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO intentos (total_errors, build_ok, iteration, patches_applied, notes)
        VALUES (%s, %s, %s, %s, %s) RETURNING id
    """, (total_errors, build_ok, iteration, patches, notes))
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return row[0] if row else 1


# ── Patches ──

def log_patch(error_code, mcp_file, description):
    execute("""
        INSERT INTO patches (error_code, mcp_file, description, applied_count)
        VALUES (%s, %s, %s, 1)
    """, (error_code, mcp_file, description))


def incrementar_exito(error_code):
    execute("UPDATE patches SET success_count = success_count + 1 WHERE error_code = %s", (error_code,))
