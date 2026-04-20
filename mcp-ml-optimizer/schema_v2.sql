-- MCP ML Optimizer - PostgreSQL schema
-- Target: localhost:5432/mcp_optimizer

CREATE TABLE IF NOT EXISTS intentos (
    id SERIAL PRIMARY KEY,
    ts TIMESTAMPTZ DEFAULT NOW(),
    total_errors INTEGER DEFAULT 0,
    build_ok BOOLEAN DEFAULT FALSE,
    render_ok BOOLEAN DEFAULT FALSE,
    iteration INTEGER DEFAULT 1,
    patches_applied TEXT DEFAULT '',
    notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS errores (
    id SERIAL PRIMARY KEY,
    intento_id INTEGER REFERENCES intentos(id) ON DELETE CASCADE,
    ts TIMESTAMPTZ DEFAULT NOW(),
    code VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    file_path TEXT DEFAULT '',
    category VARCHAR(30) DEFAULT 'unknown',
    mcp_layer VARCHAR(80) DEFAULT 'unknown',
    fixed BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS patches (
    id SERIAL PRIMARY KEY,
    ts TIMESTAMPTZ DEFAULT NOW(),
    error_code VARCHAR(20) NOT NULL,
    mcp_file TEXT NOT NULL,
    description TEXT NOT NULL,
    applied_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    confidence REAL DEFAULT 0.5
);

CREATE INDEX IF NOT EXISTS idx_err_code ON errores(code);
CREATE INDEX IF NOT EXISTS idx_err_cat ON errores(category);
CREATE INDEX IF NOT EXISTS idx_err_fixed ON errores(fixed);
CREATE INDEX IF NOT EXISTS idx_patch_code ON patches(error_code);

-- Seguimiento ML: cada error pasa por aqui para saber si se resolvio o no
CREATE TABLE IF NOT EXISTS ml_seguimiento (
    id SERIAL PRIMARY KEY,
    ts TIMESTAMPTZ DEFAULT NOW(),
    error_code VARCHAR(20) NOT NULL,
    error_message TEXT NOT NULL,
    category VARCHAR(30) NOT NULL,
    mcp_layer VARCHAR(80) NOT NULL,
    patch_applied TEXT DEFAULT '',
    solucionado BOOLEAN DEFAULT FALSE,
    intento_origen INTEGER DEFAULT 0,
    intento_verificacion INTEGER DEFAULT 0,
    notas TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_seg_code ON ml_seguimiento(error_code);
CREATE INDEX IF NOT EXISTS idx_seg_sol ON ml_seguimiento(solucionado);
