# -*- coding: utf-8 -*-
"""
Ciclo automatico:
  transformar -> compilar -> serve -> guardar errores -> ML parchea -> MCP se actualiza
"""

import os, re, sys, shutil, subprocess, time, urllib.request

from . import db
from .classifier import ErrorClassifier
from .patcher import apply_patches_for_errors, apply_all, rebuild, MCP_ROOT

SRC = os.environ.get("REACT_SRC", r"C:\Users\Lorena Alayon\Downloads\remix_-seguros-bolívar---app-proveedores")
OUT = os.environ.get("ANGULAR_OUT", r"C:\Users\Lorena Alayon\Downloads\angular-seguros-bolivar-proveedores")
MOD = "app-proveedores"
MAX_ITER = 5


def cmd(c, cwd=None, timeout=300):
    r = subprocess.run(c, shell=True, cwd=cwd, capture_output=True,
                       encoding="utf-8", errors="replace", timeout=timeout)
    return r.returncode == 0, (r.stdout or "") + "\n" + (r.stderr or "")


def parse_errors(output):
    # Strip ANSI color codes first
    clean = re.sub(r'\x1b\[[0-9;]*m', '', output)
    clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', clean)
    errs = []
    for m in re.finditer(r'ERROR\]?\s+(?:(TS-?\d+|NG\d+):\s*)?(.+?)(?:\[plugin|$)', clean, re.MULTILINE):
        code = m.group(1) or "UNKNOWN"
        errs.append({"code": code, "message": m.group(2).strip()[:300]})
    seen = set()
    unique = []
    for e in errs:
        key = e["code"] + e["message"][:50]
        if key not in seen:
            seen.add(key)
            unique.append(e)
    return unique


def main():
    print("=" * 50)
    print("  CICLO AUTOMATICO")
    print("  transformar > compilar > serve > errores > ML")
    print("=" * 50)

    clf = ErrorClassifier()

    for iteration in range(1, MAX_ITER + 1):
        print(f"\n--- ITERACION {iteration}/{MAX_ITER} ---")

        # 1. Limpiar output
        if os.path.exists(OUT):
            shutil.rmtree(OUT, ignore_errors=True)
        print("[1] Limpio")

        # 2. Transformar
        print("[2] Transformando...")
        cli = os.path.join(MCP_ROOT, "dist", "migrate-cli.js")
        ok, out = cmd(f'node "{cli}" "{SRC}" "{OUT}" "{MOD}"')
        if not ok:
            print(f"    FALLO: {out[:200]}")
            continue
        print("    OK")

        # 3. Instalar deps
        print("[3] Instalando deps...")
        subprocess.run("npm install", cwd=OUT, shell=True,
                       capture_output=True, timeout=180)
        subprocess.run(
            "npm install @angular-devkit/build-angular@^20.0.0 "
            "@angular/compiler@^20.0.0 @angular/compiler-cli@^20.0.0 "
            "typescript@~5.8.0 --save-dev",
            cwd=OUT, shell=True, capture_output=True, timeout=180)
        subprocess.run("npx ng analytics disable", cwd=OUT, shell=True,
                       capture_output=True, timeout=30)
        print("    OK")

        # 4. Compilar
        print("[4] Compilando (ng build)...")
        bout_file = os.path.join(OUT, "_build_out.txt")
        berr_file = os.path.join(OUT, "_build_err.txt")
        with open(bout_file, "w") as fo, open(berr_file, "w") as fe:
            p = subprocess.run(
                "npx ng build",
                cwd=OUT, stdout=fo, stderr=fe, timeout=300, shell=True,
            )
        bout = ""
        if os.path.exists(bout_file):
            bout += open(bout_file, encoding="utf-8", errors="replace").read()
        if os.path.exists(berr_file):
            bout += "\n" + open(berr_file, encoding="utf-8", errors="replace").read()
        errs = parse_errors(bout)
        has_complete = "bundle generation complete" in bout.lower() or "generation complete" in bout.lower()
        build_ok = (len(errs) == 0 and has_complete) or (p.returncode == 0 and len(errs) == 0)
        if len(errs) > 0:
            build_ok = False
        print(f"    {'OK - 0 errores' if build_ok else f'FALLO - {len(errs)} errores'}")

        # 5. Guardar errores en DB
        intento_id = db.crear_intento(len(errs), build_ok, iteration, "", f"Iter {iteration}")
        for e in errs:
            cat, layer, _ = clf.classify(e["code"], e["message"])
            db.execute(
                "INSERT INTO errores (intento_id, code, message, category, mcp_layer) VALUES (%s,%s,%s,%s,%s)",
                (intento_id, e["code"], e["message"][:500], cat, layer))
        print(f"[5] {len(errs)} errores guardados en DB")

        if build_ok:
            # 6. Serve test
            print("[6] Levantando servidor (ng serve)...")
            srv = subprocess.Popen(
                f'cmd /c "cd /d \\"{OUT}\\" && npx ng serve --port 4201 2>&1"',
                shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            time.sleep(20)
            render_ok = False
            try:
                html = urllib.request.urlopen("http://localhost:4201", timeout=10).read().decode()
                render_ok = "app-root" in html
                if render_ok:
                    print("    Servidor OK - app-root presente")
                else:
                    print("    Servidor responde pero sin app-root")
            except Exception as ex:
                print(f"    No responde: {ex}")
            finally:
                srv.terminate()
                try: srv.wait(timeout=5)
                except: srv.kill()

            db.execute("UPDATE intentos SET render_ok=%s WHERE id=%s", (render_ok, intento_id))

            if render_ok:
                print(f"\n{'='*50}")
                print(f"  EXITO - Build OK + Serve OK en iteracion {iteration}")
                print(f"{'='*50}")
                return True
            else:
                print("    Build OK pero serve fallo - continuando...")
                continue

        # 7. ML se activa
        print("[7] ML analizando errores...")
        clf.train()
        db_errors = db.get_errors()
        if not db_errors:
            print("    Sin errores en DB")
            continue

        for e in db_errors[:5]:
            print(f"    {e['code']} ({e['category']}) -> {e['mcp_layer']}")

        # 8. ML parchea MCP
        print("[8] ML parcheando MCP...")
        applied = apply_patches_for_errors(db_errors)
        print(f"    {len(applied)} patches aplicados")

        if applied:
            print("[9] Recompilando MCP...")
            ok, err = rebuild()
            if ok:
                print("    MCP actualizado OK")
                db.execute("UPDATE intentos SET patches_applied=%s WHERE id=%s",
                           (",".join(n for n, _ in applied), intento_id))
            else:
                print(f"    MCP rebuild FALLO: {err}")
        else:
            print("    Sin patches nuevos disponibles")

    print(f"\nMax iteraciones ({MAX_ITER}) alcanzadas")
    return False


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
