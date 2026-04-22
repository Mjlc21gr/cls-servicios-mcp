# @cls-bolivar/mcp-front-migrate

MCP Server para migración automática de micro-frontends **React → Angular 20 + PrimeNG 21 + Tailwind v4** con signals, HTML semántico, y ML optimizer integrado.

## Instalación

```bash
npm install @cls-bolivar/mcp-front-migrate
```

## Comandos CLI

```bash
# Convertir un solo componente React → Angular
cls-migrate convert MiComponente.tsx
cls-migrate convert MiComponente.tsx -o ./salida

# Migrar un proyecto completo
cls-migrate project ./mi-react ./mi-angular -m mi-app

# Ejecutar el ML optimizer (corrige errores automáticamente)
cls-migrate optimize --react ./mi-react --output ./mi-angular -m mi-app \
  --client-id "ID" --client-secret "SECRET"

# Ver estado de la DB (errores, patches, seguimiento)
cls-migrate status

# Analizar un componente sin generar código
cls-migrate analyze MiComponente.tsx

# Iniciar el MCP server
cls-migrate serve          # modo stdio (para IDEs)
cls-migrate serve-http     # modo HTTP (puerto 3000)
```

## Uso como MCP Server

**stdio (Kiro, Cursor, etc.):**
```json
{
  "mcpServers": {
    "cls-front-migrate": {
      "command": "npx",
      "args": ["-y", "@cls-bolivar/mcp-front-migrate", "cls-front-migrate"]
    }
  }
}
```

**HTTP:**
```bash
cls-front-migrate-http
# → http://localhost:3200/mcp
```


---

## Pipeline de Transformación — Etapas por Categoría

### CATEGORÍA 1: ESCANEO Y PREPARACIÓN

| # | Archivo | Función |
|---|---------|---------|
| 1 | `project-scanner.ts` | Escanea el proyecto React recursivamente. Clasifica archivos en: componentes, servicios, estilos, configs, assets. Detecta package manager, build tool, UI libraries, state management. Construye grafo de dependencias. |
| 2 | `class-component-converter.ts` | Convierte class components de React a funcionales (hooks). Necesario para que el AST parser pueda extraer useState, useEffect, etc. |
| 3 | Topological sort (Kahn) | Ordena componentes por dependencias — hojas primero, padres después. Si hay ciclos, los resuelve fail-forward. |

### CATEGORÍA 2: TRANSFORMACIÓN POR COMPONENTE

| # | Archivo | Función |
|---|---------|---------|
| 4 | `security/validator.ts` | Valida el código fuente. Detecta XSS, injection, `dangerouslySetInnerHTML`, patrones prohibidos. Sanitiza el input antes de procesarlo. |
| 5 | `ast-parser.ts` | Parsea React con Babel AST. Extrae el IR (Intermediate Representation): props, state (useState), effects (useEffect), memos (useMemo), callbacks (useCallback), refs (useRef), contexts (useContext), custom hooks, JSX tree completo, type interfaces. |
| 6 | `state-mapper.ts` | Convierte el IR de React a Angular: `useState` → `signal()`, `useMemo` → `computed()`, `useCallback` → método de clase, `useRef` → `viewChild()` / propiedad, `useContext` → `inject()`. Genera `angularSignals`, `angularEffects`, `angularComputed`, `angularInjections`. |
| 7 | `template-generator.ts` | Convierte el JSX tree a template Angular: `{cond && <X>}` → `@if`, `{arr.map()}` → `@for`, `{cond ? A : B}` → `@if/@else`. Mapea 80+ componentes React a HTML semántico/PrimeNG. Convierte eventos (`onClick` → `(click)`), bindings (`className` → `[class]`), atributos dinámicos. |
| 8 | `primeng-mapper.ts` | Reemplaza HTML nativo por PrimeNG 21 standalone: `button` → `p-button`, `select` → `p-select`, `input[text]` → `pInputText`, `textarea` → `pTextarea`, `table` → `p-table`, `dialog` → `p-dialog`. Detecta automáticamente qué imports PrimeNG necesita cada componente. 40+ componentes mapeados. |
| 9 | `code-emitter.ts` | Genera los archivos Angular finales: `.component.ts` (con signals, inject, métodos, decoradores), `.component.html` (template externo o inline), `.component.scss`, `.component.spec.ts`, servicios. Reescribe bodies de métodos: setter calls → `.set()`, updater → `.update()`, refs → `viewChild()`, props → `input()`/`output()`. |

### CATEGORÍA 3: REINGENIERÍA ESTRUCTURAL

| # | Archivo | Función |
|---|---------|---------|
| 10 | `ui-semantic-engine.ts` | Colapsa árboles de componentes React UI a PrimeNG equivalentes. shadcn Select tree → `p-select` con `[options]`. shadcn Card tree → `p-card` con header/section/footer. MUI TextField → `pInputText`. Antd Form.Item → `fieldset`. Lucide icons → PrimeIcons. Framer Motion → CSS transitions. |
| 11 | `semantic-html-engine.ts` | Elimina `<div>` innecesarios y los reemplaza con HTML semántico: `<nav>`, `<header>`, `<footer>`, `<main>`, `<aside>`, `<article>`, `<section>`, `<fieldset>`. Detecta roles por class names, ARIA roles, y posición estructural. Elimina wrappers vacíos. |
| 12 | `universal-router-mapper.ts` | Convierte React Router (rutas, `<Route>`, `<Switch>`, `useNavigate`) a `app.routes.ts` Angular con lazy loading (`loadComponent`). Detecta rutas anidadas, redirects, wildcards. |
| 13 | `logic-service-converter.ts` | Convierte custom hooks de React (`useXxx`) a servicios Angular con `@Injectable` + `inject()`. Mapea el return del hook a métodos/propiedades del servicio. |
| 14 | `style-preservator.ts` | Detecta el approach de estilos del proyecto React: CSS imports, CSS Modules, styled-components, emotion, MUI makeStyles. Extrae estilos por componente. Preserva CSS variables. |

### CATEGORÍA 4: POST-PROCESAMIENTO Y VALIDACIÓN

| # | Archivo | Función |
|---|---------|---------|
| 15 | `style-aggregator.ts` | Agrega estilos de todas las fuentes por componente. Resuelve CSS imports relativos. Convierte CSS Modules a SCSS con `:host`. Extrae styled-components/emotion a SCSS. Convierte propiedades JS (camelCase) a Tailwind classes donde es posible. Genera global styles. |
| 16 | `signal-fixer.ts` | Corrige signal reads en templates: `[(ngModel)]="x"` → `[ngModel]="x()" (ngModelChange)="x.set($event)"`. Agrega `()` a signals en interpolaciones `{{ }}`, `@if`, `@for`, `[prop]`. |
| 17 | `primeng-sanitizer.ts` | Limpia atributos HTML no válidos en componentes PrimeNG (ej: `required` en `p-select`). Corrige nombres de componentes (ButtonDirective → Button). |
| 18 | `class-context-layer.ts` | Corrige scope de `this` en métodos de clase. Asegura que signal reads usen `this.signal()`. Corrige acceso a propiedades inyectadas. |
| 19 | `template-integrity-layer.ts` | Valida que los bindings del template correspondan a propiedades reales del componente. Detecta bindings huérfanos, eventos sin handler, propiedades no declaradas. |

### CATEGORÍA 5: ENSAMBLAJE DEL PROYECTO

| # | Archivo | Función |
|---|---------|---------|
| 20 | `project-scaffolder.ts` | Genera el skeleton del proyecto Angular 20: `package.json` (Angular 20.3, PrimeNG 21.0.2, Tailwind 4.1.18, TypeScript 5.9), `angular.json` (@angular/build:application), `app.config.ts` (zoneless, PrimeNG con definePreset + cssLayer), `.postcssrc.json`, `tailwind.css`, `tsconfig.json`, `index.html`, `styles.scss`. |
| 21 | `route-generator.ts` | Genera `app.routes.ts` final con lazy loading, rutas anidadas, redirects. Renombra AppComponent del feature para evitar colisión con el root. |
| 22 | `output-validator.ts` | Validación estática del proyecto generado: completitud de componentes, dependencias en package.json, referencias de rutas válidas, no `any`, standalone components, no archivos vacíos. |
| 23 | Escritura de archivos | Escribe todos los archivos al `outputDir`. Copia assets estáticos del proyecto React. |

### CATEGORÍA 6: COMPILACIÓN Y REGISTRO

| # | Archivo | Función |
|---|---------|---------|
| 24 | `compilation-validator.ts` | Ejecuta `npm install` + `ng build` sobre el proyecto generado. Parsea errores de TypeScript (TS2339, TS2307...), Angular (NG8001, NG8002...), PostCSS, SCSS, y módulos no encontrados. |
| 25 | `ml/classifier.ts` | Clasifica cada error por categoría (`this_scope`, `binding`, `primeng_import`, `type_safety`, `postcss_config`...) y capa MCP responsable (`code-emitter`, `template-generator`, `primeng-mapper`, `project-scaffolder`...). Reglas determinísticas + modelo de frecuencia entrenado desde historial. |
| 26 | `ml/db-client.ts` | Guarda errores en la API REST remota (AWS API Gateway). Tablas: `intentos` (cada ejecución), `errores` (cada error clasificado), `patches` (fixes aplicados), `ml-seguimiento` (tracking de resolución). Auth con token JWT. |

### CATEGORÍA 7: ML AUTO-CORRECCIÓN

| # | Archivo | Función |
|---|---------|---------|
| 27 | `ml/classifier.ts` | Entrena modelo de frecuencia desde historial de errores en la DB. Para cada código de error, encuentra la categoría + capa MCP más frecuente. Confianza: 1.0 (regla), 0.9 (prefijo), 0.7 (frecuencia), 0.0 (desconocido). |
| 28 | `ml/patcher.ts` | Aplica fixes predefinidos al código fuente del MCP. Cada fix es idempotente (verifica markers antes de aplicar). 20+ fixes para: this scope, inline templates, service imports, types, PrimeNG, signals, PostCSS. Crea backup antes de cada cambio. |
| 29 | `ml/llm-client.ts` | Consulta Gemini 2.0 Flash (default), OpenAI, u Ollama local. Envía contexto completo: código MCP + código React + código Angular generado + error. El LLM sugiere `{old, new, explanation}`. El ML valida que `old` exista, que el cambio sea pequeño, y que el MCP compile después. |
| 30 | `ml/optimizer.ts` | Ciclo completo: transformar → compilar → clasificar errores → buscar fix en historial → si no hay, preguntar al LLM → aplicar fix → rebuild MCP → re-transformar → verificar si el error desapareció → marcar como solucionado o revertir. Máximo 10 iteraciones. Nunca rompe lo que ya funciona. |


---

## Flujo Visual

```
React Source (.tsx/.jsx)
    │
    ▼
┌─────────────────────────────────────────────────┐
│  CATEGORÍA 1: ESCANEO                           │
│  scanner → class converter → topological sort   │
└─────────────────────┬───────────────────────────┘
                      │
    ▼ (por cada componente, en orden de dependencias)
┌─────────────────────────────────────────────────┐
│  CATEGORÍA 2: TRANSFORMACIÓN                    │
│  validator → AST parser → state mapper →        │
│  template generator → PrimeNG mapper →          │
│  code emitter                                   │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│  CATEGORÍA 3: REINGENIERÍA                      │
│  UI semantic → semantic HTML → router mapper →  │
│  hook→service converter → style preservator     │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│  CATEGORÍA 4: POST-PROCESAMIENTO                │
│  style aggregator → signal fixer →              │
│  PrimeNG sanitizer → class context →            │
│  template integrity                             │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│  CATEGORÍA 5: ENSAMBLAJE                        │
│  scaffolder → route generator →                 │
│  output validator → write files                 │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│  CATEGORÍA 6: COMPILACIÓN                       │
│  npm install → ng build → parse errors →        │
│  classify → save to DB                          │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼ (si hay errores)
┌─────────────────────────────────────────────────┐
│  CATEGORÍA 7: ML AUTO-CORRECCIÓN                │
│  train classifier → try predefined fixes →      │
│  ask LLM (Gemini/GPT) → apply patch →           │
│  rebuild MCP → repeat from CATEGORÍA 1          │
└─────────────────────────────────────────────────┘
```

## Stack Generado

| Tecnología | Versión |
|------------|---------|
| Angular | 20.3.x |
| PrimeNG | 21.0.x |
| Tailwind CSS | 4.1.x |
| tailwindcss-primeui | 0.6.x |
| TypeScript | 5.9.x |
| Builder | @angular/build |
| Change Detection | Zoneless |
| Tests | Jest |

## Variables de Entorno

| Variable | Descripción |
|----------|-------------|
| `MCP_DB_CLIENT_ID` | Client ID para la API REST de la DB |
| `MCP_DB_CLIENT_SECRET` | Client Secret para la API REST de la DB |
| `GEMINI_API_KEY` | API key de Google Gemini (default incluida) |
| `OPENAI_API_KEY` | API key de OpenAI (alternativa a Gemini) |

## MCP Tools Disponibles

| Tool | Descripción |
|------|-------------|
| `convert_react_to_angular` | Convierte un componente React a Angular |
| `analyze_react_component` | Analiza componente React con AST |
| `map_to_angular_standalone` | Genera .component.ts/html/scss/spec.ts |
| `inject_primeng_ui` | Convierte UI a PrimeNG |
| `inject_cls_theme` | Aplica tema CLS |
| `generate_api_services` | Genera servicios desde API calls |
| `generate_microfrontend_shell` | Genera shell con Module Federation |
| `generate_angular_module` | Genera remote module |
| `migrate_full_project` | Migra proyecto completo |
| `run_migration_pipeline` | Pipeline con gates de validación |
| `validate_pipeline_config` | Valida config de repos GitHub |
| `ml_db_query` | Consulta la DB del ML |
| `ml_db_status` | Estado de la DB |

## Requisitos

- Node.js >= 18
- Angular CLI (para compilar el output)

## License

MIT
