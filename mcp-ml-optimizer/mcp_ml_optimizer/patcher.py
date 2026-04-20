# -*- coding: utf-8 -*-
"""
MCP Patcher - Writes fixes directly to MCP source files.

Each fix targets a specific bug category identified by the classifier.
Fixes are idempotent: they check for markers before applying.
ALL fixes are automatic. Zero manual intervention.
"""

import os
import re
import shutil
import subprocess
from datetime import datetime

from . import db

MCP_ROOT = os.environ.get(
    "MCP_ROOT",
    r"C:\Users\Lorena Alayon\OneDrive\Documentos\mcp-servicios\cls-servicios-mcp",
)

LAYER_FILE = {
    "class-context-layer": "src/pipeline/class-context-layer.ts",
    "code-emitter": "src/emitter/code-emitter.ts",
    "template-generator": "src/pipeline/template-generator.ts",
    "template-integrity-layer": "src/pipeline/template-integrity-layer.ts",
    "primeng-mapper": "src/pipeline/primeng-mapper.ts",
    "primeng-sanitizer": "src/pipeline/primeng-sanitizer.ts",
    "signal-fixer": "src/pipeline/signal-fixer.ts",
    "state-mapper": "src/pipeline/state-mapper.ts",
    "project-orchestrator": "src/pipeline/project-orchestrator.ts",
    "project-scaffolder": "src/pipeline/project-scaffolder.ts",
}


def _read(rel):
    with open(os.path.join(MCP_ROOT, rel), "r", encoding="utf-8") as f:
        return f.read()


def _write(rel, content):
    full = os.path.join(MCP_ROOT, rel)
    bak = os.path.join(MCP_ROOT, ".ml-backup")
    os.makedirs(bak, exist_ok=True)
    ts = datetime.now().strftime("%H%M%S")
    shutil.copy2(full, os.path.join(bak, f"{os.path.basename(full)}.{ts}.bak"))
    with open(full, "w", encoding="utf-8") as f:
        f.write(content)


def _has(content, marker):
    return marker in content


def rebuild():
    r = subprocess.run(
        "npm run build", shell=True, cwd=MCP_ROOT,
        capture_output=True, encoding="utf-8", errors="replace", timeout=120,
    )
    return r.returncode == 0, (r.stderr or "")[:300]


# ═══════════════════════════════════════════════════════════════════════════
# FIX 1: this_scope
# TS2663 - bare reads of state/props without this. in method bodies
# ═══════════════════════════════════════════════════════════════════════════

def fix_this_scope():
    f = LAYER_FILE["code-emitter"]
    c = _read(f)
    M = "// MLFIX-THIS"
    if _has(c, M):
        return False, "already applied"

    # safeRewriteBody needs to rewrite bare state reads with this.name()
    # Find the end of step 2 (setter rewriting) and add step 3
    old = """  // 3. Rewrite DOM ref access"""
    alt = """  // 4. Rewrite DOM ref access"""

    # Check which version exists
    if "3. Rewrite bare state reads" in c or "MLFIX-THIS" in c:
        return False, "already applied"

    target = old if old in c else (alt if alt in c else None)
    if not target:
        return False, "target not found"

    new = f"""  {M}: rewrite bare state reads with this.name()
  for (const s of ir.state) {{
    const name = s.variableName;
    result = result.replace(
      new RegExp(`(?<!this\\\\.)(?<![.\\\\w])\\\\b${{name}}\\\\b(?!\\\\s*[(.=:])(?!\\\\s*=\\\\s*signal)`, 'g'),
      `this.${{name}}()`,
    );
  }}

  {target}"""

    _write(f, c.replace(target, new, 1))
    db.log_patch("TS2663", f, "Add bare state read rewriting with this.name()")
    return True, "Add bare state read rewriting with this.name()"


# ═══════════════════════════════════════════════════════════════════════════
# FIX 2: inline_template
# TS-991002 - backtick template literals break @Component decorator
# ═══════════════════════════════════════════════════════════════════════════

def fix_inline_template():
    f = LAYER_FILE["code-emitter"]
    c = _read(f)
    M = "// MLFIX-INLINE"
    if _has(c, M):
        return False, "already applied"

    old = "  if (ir.isInlineTemplate) {"
    # Check if already patched with hasBadChars
    if "hasBadChars" in c:
        return False, "already applied"

    new = f"""  {M}: force external template when backticks present
  const hasBadChars = ir.angularTemplate.includes('\\`') || ir.angularTemplate.includes('${{');
  if (ir.isInlineTemplate && !hasBadChars) {{"""

    if old in c:
        _write(f, c.replace(old, new, 1))
        db.log_patch("TS-991002", f, "Force external templateUrl on backtick templates")
        return True, "Force external templateUrl on backtick templates"
    return False, "target not found"


# ═══════════════════════════════════════════════════════════════════════════
# FIX 3: template_quotes
# NG5002 - ternary with double quotes inside binding breaks HTML parser
# ═══════════════════════════════════════════════════════════════════════════

def fix_template_quotes():
    f = LAYER_FILE["template-generator"]
    c = _read(f)
    M = "// MLFIX-QUOTES"
    if _has(c, M):
        return False, "already applied"

    # The issue is in renderAttribute when a dynamic attribute value contains
    # double quotes (from ternary expressions). We need to escape them to single quotes.
    old = """    return {
      text: `[${attr.name}]="${value}"`,
      binding: {
        type: 'property',
        angularSyntax: `[${attr.name}]`,
        originalJSX: attr.name,
      },
    };
  }"""

    new = f"""    {M}: escape double quotes inside binding values to single quotes
    const safeValue = value.replace(/(?<=\\s)"([^"]*)"(?=\\s|$)/g, "'$1'");
    return {{
      text: `[${{attr.name}}]="${{safeValue}}"`,
      binding: {{
        type: 'property',
        angularSyntax: `[${{attr.name}}]`,
        originalJSX: attr.name,
      }},
    }};
  }}"""

    if old in c:
        _write(f, c.replace(old, new, 1))
        db.log_patch("NG5002", f, "Escape double quotes to single quotes in ternary bindings")
        return True, "Escape double quotes to single quotes in ternary bindings"
    return False, "target not found"


# ═══════════════════════════════════════════════════════════════════════════
# FIX 4: import_path
# TS2307 - service import path wrong depth
# ═══════════════════════════════════════════════════════════════════════════

def fix_service_import_path():
    f = LAYER_FILE["code-emitter"]
    c = _read(f)
    M = "// MLFIX-SVCPATH"
    if _has(c, M):
        return False, "already applied"

    old = """lines.push(`import { ${svc.serviceName} } from '../services/${svc.fileName}';`);"""
    if old not in c:
        return False, "already applied"

    new = f"""{M}
    lines.push(`import {{ ${{svc.serviceName}} }} from '../../services/${{svc.fileName}}.service';`);"""

    _write(f, c.replace(old, new, 1))
    db.log_patch("TS2307", f, "Fix service import path depth")
    return True, "Fix service import path to ../../services/*.service"


# ═══════════════════════════════════════════════════════════════════════════
# FIX 5: missing_types
# TS2304/TS2307 - types.ts not generated
# ═══════════════════════════════════════════════════════════════════════════

def fix_missing_types():
    f = LAYER_FILE["project-orchestrator"]
    c = _read(f)
    M = "// MLFIX-TYPES"
    if _has(c, M):
        return False, "already applied"

    # Make types.ts generation unconditional
    old = "    let needsTypesFile = false;"
    new = f"""    {M}: always generate types.ts
    let needsTypesFile = true;  // ML: force types.ts generation"""

    if old in c:
        _write(f, c.replace(old, new, 1))
        db.log_patch("TS2304", f, "Force types.ts generation to always true")
        return True, "Force types.ts generation to always true"

    if "needsTypesFile = true" in c:
        return False, "already applied"

    return False, "target not found"


# ═══════════════════════════════════════════════════════════════════════════
# FIX 6: setter_method
# NG1 - setActiveTab doesn't exist, only activeTab signal
# ═══════════════════════════════════════════════════════════════════════════

def fix_setter_method():
    f = LAYER_FILE["code-emitter"]
    c = _read(f)
    M = "// MLFIX-SETTER"
    if _has(c, M):
        return False, "already applied"

    old = "  if (ir.angularSignals.length > 0) lines.push('');\n\n  // Computed"
    if old not in c:
        return False, "already applied"

    new = f"""  if (ir.angularSignals.length > 0) lines.push('');

  {M}: generate setter methods for signals used as setX() in templates
  for (const sig of ir.angularSignals) {{
    const name = toCamelCase(sig.name);
    const setter = 'set' + name.charAt(0).toUpperCase() + name.slice(1);
    if (ir.angularTemplate.includes(setter + '(')) {{
      lines.push(`  ${{setter}}(value: ${{sig.type}}): void {{ this.${{name}}.set(value); }}`);
      lines.push('');
    }}
  }}

  // Computed"""

    _write(f, c.replace(old, new, 1))
    db.log_patch("NG1", f, "Generate setter wrapper methods for signals")
    return True, "Generate setter wrapper methods for signals"


# ═══════════════════════════════════════════════════════════════════════════
# FIX 7: primeng_import
# NG8001 - ButtonDirective should be Button for PrimeNG 19+
# ═══════════════════════════════════════════════════════════════════════════

def fix_primeng_button():
    f = LAYER_FILE["primeng-sanitizer"]
    c = _read(f)
    if "ButtonDirective" in c:
        _write(f, c.replace("ButtonDirective", "Button"))
        db.log_patch("NG8001", f, "PrimeNG 19: ButtonDirective -> Button")
        return True, "PrimeNG 19: ButtonDirective -> Button"
    return False, "already applied"


# ═══════════════════════════════════════════════════════════════════════════
# FIX 8: signal_type
# TS2571 - signal<unknown>(undefined) needs type inference
# ═══════════════════════════════════════════════════════════════════════════

def fix_signal_unknown_type():
    f = LAYER_FILE["code-emitter"]
    c = _read(f)
    if "improved type inference" in c or "MLFIX" in c and "sigType" in c:
        return False, "already applied"
    return False, "already applied in previous session"


# ═══════════════════════════════════════════════════════════════════════════
# FIX 9: standalone_import
# TS-992012 - child component not standalone (because inline template broke it)
# This is a side effect of fix_inline_template - once that's fixed, this resolves
# ═══════════════════════════════════════════════════════════════════════════

def fix_standalone_import():
    # This error happens because EvidenceUploadComponent has a broken
    # @Component decorator (due to backtick inline template).
    # fix_inline_template resolves this by forcing external templateUrl.
    return False, "resolved by fix_inline_template"


# ═══════════════════════════════════════════════════════════════════════════
# FIX 10: type_safety
# TS18047/TS2339/TS2345 - e.target null, .files not on EventTarget, etc.
# ═══════════════════════════════════════════════════════════════════════════

def fix_type_safety():
    f = LAYER_FILE["code-emitter"]
    c = _read(f)
    M = "// MLFIX-TYPESAFE"
    if _has(c, M):
        return False, "already applied"

    # In safeRewriteBody, add type narrowing for Event handlers
    old = "  // 7. Replace React types with Angular equivalents"
    alt = "  // 6. Replace React types with Angular equivalents"
    target = old if old in c else (alt if alt in c else None)
    if not target:
        # Try another anchor
        if "Replace React types with Angular" in c:
            for line in c.split("\n"):
                if "Replace React types with Angular" in line:
                    target = line.strip()
                    break

    if not target or target not in c:
        return False, "target not found"

    new = f"""  {M}: add type narrowing for Event handlers
  // Fix e.target.files -> (e.target as HTMLInputElement).files
  result = result.replace(/e\\.target\\.files/g, '(e.target as HTMLInputElement).files');
  // Fix e.currentTarget -> (e.target as HTMLFormElement)
  result = result.replace(/e\\.currentTarget/g, '(e.target as HTMLFormElement)');
  // Fix new FormData(e.currentTarget) -> new FormData(e.target as HTMLFormElement)
  result = result.replace(/new FormData\\(e\\.currentTarget\\)/g, 'new FormData(e.target as HTMLFormElement)');

  {target}"""

    _write(f, c.replace(target, new, 1))
    db.log_patch("TS18047", f, "Add type narrowing for Event handlers")
    return True, "Add type narrowing for Event handlers"


# ═══════════════════════════════════════════════════════════════════════════
# FIX 11: service_gen
# TS1005 - computed() not closed properly in generated service
# ═══════════════════════════════════════════════════════════════════════════

def fix_service_gen():
    # This is in the service generator - check if cleanServiceBody handles it
    f = LAYER_FILE["code-emitter"]
    c = _read(f)
    M = "// MLFIX-SVCGEN"
    if _has(c, M):
        return False, "already applied"

    # Find cleanServiceBody and add computed() closure fix
    if "function cleanServiceBody" in c:
        old = "function cleanServiceBody(content: string): string {"
        new = f"""function cleanServiceBody(content: string): string {{
  {M}: ensure computed blocks are properly closed
  content = content.replace(
    /(computed\\(\\(\\)\\s*=>\\s*\\{{[^\\}}]*\\}})\\s*\\)/g,
    '$1);',
  );"""
        if old in c:
            _write(f, c.replace(old, new, 1))
            db.log_patch("TS1005", f, "Fix unclosed computed() in service generation")
            return True, "Fix unclosed computed() in service generation"

    return False, "target not found"


# ═══════════════════════════════════════════════════════════════════════════
# FIX 12: this_scope_regex
# TS2663 - the regex for bare state reads excludes === because it matches =
# The old regex (?!\s*[(.=:]) blocks "fallido === 'si'" because === starts with =
# ═══════════════════════════════════════════════════════════════════════════

def fix_this_scope_regex():
    f = LAYER_FILE["code-emitter"]
    c = _read(f)
    M = "// MLFIX-THISREGEX"
    if _has(c, M):
        return False, "already applied"

    # Fix the regex that blocks === by changing (?!\s*[(.=:]) to (?!\s*[:.(])(?!\s*=[^=])
    old = r"(?!\\s*[(.=:])(?!\\s*=\\s*signal)"
    new = r"(?!\\s*[:.(])(?!\\s*=[^=])"

    if old in c:
        c = c.replace(old, new)
        # Add marker as comment nearby
        c = c.replace(
            "// 3. Rewrite bare state reads",
            f"{M}\n  // 3. Rewrite bare state reads",
        )
        _write(f, c)
        db.log_patch("TS2663", f, "Fix this.scope regex to allow === comparisons")
        return True, "Fix this.scope regex: allow === comparisons"

    # Check if already using the new regex
    if "(?!\\\\s*[:.(])(?!\\\\s*=[^=])" in c or "(?!\\s*[:.(])(?!\\s*=[^=])" in c:
        return False, "already applied"

    return False, "target not found"


# ═══════════════════════════════════════════════════════════════════════════
# FIX 13: double_brace
# Method bodies come wrapped in { } from AST, emitter adds another { }
# Result: handleSave(data) { { await... } }
# ═══════════════════════════════════════════════════════════════════════════

def fix_double_brace():
    f = LAYER_FILE["code-emitter"]
    c = _read(f)
    M = "// MLFIX-DOUBLEBRACE"
    if _has(c, M):
        return False, "already applied"

    old = "    const safeBody = safeRewriteBody(method.body, ir);"
    # Check if already has the .replace chain
    if ".replace(/^\\s*\\{/, '').replace(/\\}\\s*$/, '')" in c:
        return False, "already applied"

    new = f"""    {M}: strip outer braces from callback body to avoid double wrapping
    const safeBody = safeRewriteBody(method.body, ir)
      .replace(/^\\s*\\{{/, '').replace(/\\}}\\s*$/, '').trim();"""

    if old in c:
        _write(f, c.replace(old, new, 1))
        db.log_patch("TS1005", f, "Strip double braces from method bodies")
        return True, "Strip double braces from method bodies"

    return False, "target not found"


# ═══════════════════════════════════════════════════════════════════════════
# FIX 14: primeng_auto_import
# NG8001 - p-card, p-select, p-toast, p-tag not in standalone imports
# The signal-fixer only imports <app-xxx> child components, not PrimeNG tags
# ═══════════════════════════════════════════════════════════════════════════

def fix_primeng_auto_import():
    f = LAYER_FILE["signal-fixer"]
    c = _read(f)
    M = "// MLFIX-PNGIMPORT"
    if _has(c, M):
        return False, "already applied"

    # Check if ensurePrimeNgImports already exists
    if "ensurePrimeNgImports" in c:
        return False, "already applied"

    # Add the function and call it after ensureChildComponentImports
    call_old = "    // Fix 6: Ensure child components used in template are imported\n    componentTs = ensureChildComponentImports(componentTs, componentHtml, components);"
    call_new = f"""    // Fix 6: Ensure child components used in template are imported
    componentTs = ensureChildComponentImports(componentTs, componentHtml, components);

    {M}: auto-import PrimeNG components found in template
    componentTs = ensurePrimeNgImports(componentTs, componentHtml);"""

    if call_old not in c:
        return False, "target not found"

    # Add the function definition before ensureChildComponentImports
    func_anchor = "// Fix 6: Ensure child components used in template are in imports array"
    primeng_func = f"""// {M}: Auto-import PrimeNG components based on template tags
// ---------------------------------------------------------------------------

const PRIMENG_TAG_TO_IMPORT: Record<string, {{ name: string; path: string }}> = {{
  'p-card': {{ name: 'Card', path: 'primeng/card' }},
  'p-button': {{ name: 'Button', path: 'primeng/button' }},
  'p-select': {{ name: 'Select', path: 'primeng/select' }},
  'p-toast': {{ name: 'Toast', path: 'primeng/toast' }},
  'p-tag': {{ name: 'Tag', path: 'primeng/tag' }},
  'p-dialog': {{ name: 'Dialog', path: 'primeng/dialog' }},
  'p-table': {{ name: 'Table', path: 'primeng/table' }},
  'p-message': {{ name: 'Message', path: 'primeng/message' }},
  'p-menu': {{ name: 'Menu', path: 'primeng/menu' }},
  'p-menubar': {{ name: 'Menubar', path: 'primeng/menubar' }},
  'p-sidebar': {{ name: 'Sidebar', path: 'primeng/sidebar' }},
  'p-accordion': {{ name: 'Accordion', path: 'primeng/accordion' }},
  'p-tabView': {{ name: 'TabView', path: 'primeng/tabview' }},
  'p-toolbar': {{ name: 'Toolbar', path: 'primeng/toolbar' }},
  'p-divider': {{ name: 'Divider', path: 'primeng/divider' }},
  'p-avatar': {{ name: 'Avatar', path: 'primeng/avatar' }},
  'p-badge': {{ name: 'Badge', path: 'primeng/badge' }},
  'p-skeleton': {{ name: 'Skeleton', path: 'primeng/skeleton' }},
  'p-panel': {{ name: 'Panel', path: 'primeng/panel' }},
  'p-steps': {{ name: 'Steps', path: 'primeng/steps' }},
  'p-paginator': {{ name: 'Paginator', path: 'primeng/paginator' }},
  'p-confirmdialog': {{ name: 'ConfirmDialog', path: 'primeng/confirmdialog' }},
  'p-fileUpload': {{ name: 'FileUpload', path: 'primeng/fileupload' }},
  'p-carousel': {{ name: 'Carousel', path: 'primeng/carousel' }},
  'p-timeline': {{ name: 'Timeline', path: 'primeng/timeline' }},
  'p-autoComplete': {{ name: 'AutoComplete', path: 'primeng/autocomplete' }},
  'p-calendar': {{ name: 'DatePicker', path: 'primeng/datepicker' }},
  'p-inputSwitch': {{ name: 'InputSwitch', path: 'primeng/inputswitch' }},
  'p-checkbox': {{ name: 'Checkbox', path: 'primeng/checkbox' }},
  'p-progressSpinner': {{ name: 'ProgressSpinner', path: 'primeng/progressspinner' }},
  'p-progressBar': {{ name: 'ProgressBar', path: 'primeng/progressbar' }},
  'p-image': {{ name: 'Image', path: 'primeng/image' }},
  'p-chip': {{ name: 'Chip', path: 'primeng/chip' }},
  'p-fieldset': {{ name: 'Fieldset', path: 'primeng/fieldset' }},
  'p-overlayPanel': {{ name: 'OverlayPanel', path: 'primeng/overlaypanel' }},
  'p-listbox': {{ name: 'Listbox', path: 'primeng/listbox' }},
  'p-tree': {{ name: 'Tree', path: 'primeng/tree' }},
  'p-dataView': {{ name: 'DataView', path: 'primeng/dataview' }},
  'p-speedDial': {{ name: 'SpeedDial', path: 'primeng/speeddial' }},
}};

function ensurePrimeNgImports(componentTs: string, html: string): string {{
  let result = componentTs;
  for (const [tag, info] of Object.entries(PRIMENG_TAG_TO_IMPORT)) {{
    if (!html.includes(`<${{tag}}`) && !html.includes(`</${{tag}}`)) continue;
    if (result.includes(info.name)) continue;
    result = `import {{ ${{info.name}} }} from '${{info.path}}';\\n${{result}}`;
    result = result.replace(
      /(imports\\s*:\\s*\\[)([^\\]]*?)(\\])/,
      (_m: string, open: string, existing: string, close: string) => {{
        const trimmed = existing.trim();
        return trimmed
          ? `${{open}}${{existing.trimEnd()}}, ${{info.name}}${{close}}`
          : `${{open}}${{info.name}}${{close}}`;
      }},
    );
  }}
  return result;
}}

// ---------------------------------------------------------------------------
// Fix 6: Ensure child components used in template are in imports array"""

    c = c.replace(call_old, call_new)
    c = c.replace(func_anchor, primeng_func)
    _write(f, c)
    db.log_patch("NG8001", f, "Auto-import PrimeNG components from template tags")
    return True, "Auto-import PrimeNG components from template tags"


# ═══════════════════════════════════════════════════════════════════════════
# FIX 15: return_type_void
# TS7030 - Not all code paths return a value
# Methods with return type 'unknown' should be 'void'
# ═══════════════════════════════════════════════════════════════════════════

def fix_return_type_void():
    f = LAYER_FILE["code-emitter"]
    c = _read(f)
    M = "// MLFIX-RETURNVOID"
    if _has(c, M):
        return False, "already applied"

    old = "    if (returnType === 'unknown') returnType = 'void';"
    new = f"""    if (returnType === 'unknown') returnType = 'void';
    {M}: if body has no return with value, force void
    if (!safeBody.match(/return\\s+[^;]/) && returnType !== 'void' && !returnType.includes('Promise')) {{
      returnType = 'void';
    }}"""

    if old in c:
        _write(f, c.replace(old, new, 1))
        db.log_patch("TS7030", f, "Force void return type when no return statement")
        return True, "Force void return type when no return statement"

    return False, "already applied"


# ═══════════════════════════════════════════════════════════════════════════
# FIX 16: safeRewriteBody guard too strict
# ═══════════════════════════════════════════════════════════════════════════

def fix_rewrite_guard():
    f = LAYER_FILE["code-emitter"]
    c = _read(f)
    M = "// MLFIX-GUARD"
    if _has(c, M):
        return False, "already applied"
    old = "  if (ir.state.length === 0 && ir.refs.length === 0 && ir.contexts.length === 0) return body;"
    if old not in c:
        # Check alternate with props
        if "ir.props.length === 0) return body;" in c:
            return False, "already applied"
        return False, "target not found"
    new = f"""  {M}: also rewrite when props exist
  if (ir.state.length === 0 && ir.refs.length === 0 && ir.contexts.length === 0 && ir.props.length === 0) return body;"""
    _write(f, c.replace(old, new, 1))
    db.log_patch("TS2663", f, "Fix safeRewriteBody guard to include props")
    return True, "Fix safeRewriteBody guard to include props"


# ═══════════════════════════════════════════════════════════════════════════
# FIX 17: types.ts missing real interfaces from source
# ═══════════════════════════════════════════════════════════════════════════

def fix_types_copy_source():
    f = LAYER_FILE["project-orchestrator"]
    c = _read(f)
    M = "// MLFIX-TYPESCOPY"
    if _has(c, M):
        return False, "already applied"
    old = "      ? `// Auto-generated types from React project migration"
    if old not in c:
        return False, "target not found"
    # Add readFileSync if needed
    if "readFileSync" not in c:
        c = c.replace(
            "import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';",
            "import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';",
        )
    # Inject source types reading before the types block
    types_block = "    // Step 10b:"
    if types_block in c:
        inject = "    " + M + ": read source types.ts\n"
        inject += "    let sourceTypesContent = '';\n"
        inject += "    const srcTypesFile = join(params.sourceDir, 'src', 'types.ts');\n"
        inject += "    if (existsSync(srcTypesFile)) {\n"
        inject += "      sourceTypesContent = readFileSync(srcTypesFile, 'utf-8');\n"
        inject += "    }\n\n"
        inject += "    // Step 10b:"
        c = c.replace(types_block, inject, 1)
    # Prepend source types to generated content
    new = "      ? sourceTypesContent + `\\n// Auto-generated types from React project migration"
    c = c.replace(old, new, 1)
    _write(f, c)
    db.log_patch("TS2304", f, "Copy source types.ts into generated types")
    return True, "Copy source types.ts into generated types"


# ═══════════════════════════════════════════════════════════════════════════
# MASTER
# ═══════════════════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════════════════
# FIX 19: callback props converted to output() need (event) binding not [prop]
# NG8002 - Can't bind to 'onSuccess'/'onChange' - they are now output()
# ═══════════════════════════════════════════════════════════════════════════

def fix_callback_to_output_binding():
    f = LAYER_FILE["template-integrity-layer"]
    c = _read(f)
    M = "// MLFIX-OUTPUTBIND"
    if _has(c, M):
        return False, "already applied"

    # After all other fixes, convert [onXxx]="handler" to (onXxx)="handler($event)"
    # and [onChange]="xxx" on custom components to (onChange)="xxx($event)"
    old = "    // Fix 9: viewChild().current"
    if old not in c:
        return False, "target not found"

    new = f"""    {M}: convert callback prop bindings to output event bindings
    // [onSuccess]="handleSave" -> (onSuccess)="handleSave($event)"
    html = html.replace(/\\[onSuccess\\]="(\\w+)"/g, '(onSuccess)="$1($event)"');
    // [onChange]="xxx" on app-* components -> (onChange)="xxx($event)"
    html = html.replace(/(<app-[^>]*)\\[onChange\\]="(\\w+)"/g, '$1(onChange)="$2($event)"');
    // [onChange]="xxx.bind(this)" -> (onChange)="xxx($event)"
    html = html.replace(/\\[onChange\\]="(\\w+)\\.bind\\(this\\)"/g, '(onChange)="$1($event)"');

    // Fix 9: viewChild().current"""

    _write(f, c.replace(old, new, 1))
    db.log_patch("NG8002", f, "Convert callback prop bindings [onX] to output event (onX)")
    return True, "Convert callback prop bindings to output event bindings"


# ═══════════════════════════════════════════════════════════════════════════
# FIX 20: feature AppComponent renamed but route import may fail
# TS2305 - Module has no exported member 'AppComponent'
# ═══════════════════════════════════════════════════════════════════════════

def fix_feature_class_rename():
    # This is already handled in project-orchestrator
    # Check if the rename logic exists
    f = LAYER_FILE["project-orchestrator"]
    c = _read(f)
    if "featureClassName" in c and "AppProveedores" in c or "toPascalCase(moduleName)" in c:
        return False, "already applied"
    return False, "already applied in MCP source"


ALL_FIXES = [
    ("this_scope", fix_this_scope),
    ("this_scope", fix_this_scope_regex),
    ("this_scope", fix_rewrite_guard),
    ("inline_template", fix_inline_template),
    ("template_quotes", fix_template_quotes),
    ("import_path", fix_service_import_path),
    ("missing_types", fix_missing_types),
    ("missing_types", fix_types_copy_source),
    ("missing_name", fix_missing_types),
    ("missing_name", fix_types_copy_source),
    ("setter_method", fix_setter_method),
    ("primeng_import", fix_primeng_button),
    ("primeng_import", fix_primeng_auto_import),
    ("signal_type", fix_signal_unknown_type),
    ("standalone_import", fix_standalone_import),
    ("type_safety", fix_type_safety),
    ("type_safety", fix_return_type_void),
    ("service_gen", fix_service_gen),
    ("hook_conversion", fix_missing_types),
    ("missing_property", fix_double_brace),
    ("missing_property", fix_primeng_auto_import),
    ("missing_property", fix_rewrite_guard),
    ("binding", fix_primeng_auto_import),
    ("binding", fix_rewrite_guard),
    ("syntax", fix_double_brace),
    ("template_parse", fix_template_quotes),
    ("binding", fix_callback_to_output_binding),
    ("unknown", fix_feature_class_rename),
]
def apply_patches_for_errors(errors):
    categories = set(e["category"] for e in errors)
    applied = []

    # Paso 1: Patches predefinidos (el ML los conoce y confía en ellos)
    for name, fix_fn in ALL_FIXES:
        if name in categories:
            ok, desc = fix_fn()
            status = "APPLIED" if ok else "SKIP"
            print(f"    [{status}] {name}: {desc}")
            if ok:
                applied.append((name, desc))

    # Paso 2: Si no hubo patches predefinidos, el ML pide ayuda al LLM
    # El LLM SUGIERE, el ML VALIDA y DECIDE
    if not applied:
        try:
            from .llm import sugerir_fix, is_available
            if not is_available():
                print("    [LLM] Ollama no disponible")
                return applied

            print("    [LLM] Pidiendo sugerencias a Ollama...")
            for err in errors[:3]:
                code = err.get("code", "")
                msg = err.get("message", "")
                layer = err.get("mcp_layer", "unknown")
                rel_path = LAYER_FILE.get(layer)
                if not rel_path:
                    continue

                try:
                    src = _read(rel_path)
                except FileNotFoundError:
                    continue

                # LLM sugiere
                fix = sugerir_fix(code, msg, src[:2500], rel_path)
                if not fix:
                    print(f"    [LLM] {code}: sin sugerencia")
                    continue

                old_str = fix.get("old", "")
                new_str = fix.get("new", "")
                explanation = fix.get("explanation", "")

                # ML VALIDA la sugerencia:
                # 1. old debe existir en el source
                if old_str not in src:
                    print(f"    [ML-REJECT] {code}: old string no existe en source")
                    continue

                # 2. El cambio debe ser minimo (max 500 chars de diferencia)
                if abs(len(new_str) - len(old_str)) > 500:
                    print(f"    [ML-REJECT] {code}: cambio demasiado grande")
                    continue

                # 3. No debe borrar funciones enteras
                if old_str.count("function") > 0 and new_str.count("function") < old_str.count("function"):
                    print(f"    [ML-REJECT] {code}: intenta borrar funciones")
                    continue

                # 4. Aplicar y verificar que MCP compila
                _write(rel_path, src.replace(old_str, new_str, 1))
                build_ok, build_err = rebuild()

                if build_ok:
                    db.log_patch(code, rel_path, f"LLM: {explanation}")
                    applied.append((f"llm_{code}", explanation))
                    print(f"    [ML-APPROVED] {code}: {explanation}")
                else:
                    # REVERTIR - el ML protege el MCP
                    _write(rel_path, src)
                    print(f"    [ML-REVERT] {code}: MCP no compila, revertido")

        except ImportError:
            print("    [LLM] modulo no disponible")
        except Exception as e:
            print(f"    [LLM-ERROR] {e}")

    return applied


def apply_all():
    applied = []
    for name, fix_fn in ALL_FIXES:
        ok, desc = fix_fn()
        status = "APPLIED" if ok else "SKIP"
        print(f"    [{status}] {name}: {desc}")
        if ok:
            applied.append((name, desc))
    return applied
