# CLS Servicios MCP — Source

Pipeline de transformacion React → Angular 20 + PrimeNG 19. Convierte proyectos React/Remix en proyectos Angular standalone con signals, PrimeNG, y Tailwind CSS.

## Estructura

```
src/
├── server.ts                    # Servidor MCP con 11 tools
├── stdio-server.ts              # Wrapper StdioServerTransport
├── http-server.ts               # Servidor HTTP alternativo
├── cli.ts                       # CLI simple (archivo por archivo)
├── migrate-cli.ts               # CLI de migracion completa de proyecto
├── index.ts                     # Exports principales
├── types.ts                     # Interfaces: ComponentIR, JSXNode, JSXAttribute, etc.
│
├── analyzers/
│   └── react-component.analyzer.ts   # Analiza componentes React con AST
│
├── emitter/
│   └── code-emitter.ts               # Genera archivos .ts, .html, .scss, .spec.ts
│
├── generators/
│   ├── component.generator.ts         # Genera componentes Angular desde analisis
│   ├── module-generator.ts            # Genera modulos Native Federation
│   ├── primeng-mapper.generator.ts    # Mapea UI a PrimeNG
│   ├── service.generator.ts           # Genera servicios desde analisis
│   ├── shell-generator.ts             # Genera shell app de microfrontend
│   └── theme-injector.generator.ts    # Inyecta tema Seguros Bolivar
│
├── github/
│   └── github-client.ts              # Cliente GitHub para pull/push
│
├── mappings/
│   ├── primeng-components.map.ts      # Mapeo React UI → PrimeNG (50+ componentes)
│   └── seguros-bolivar-theme.map.ts   # Tokens de diseno corporativo
│
├── models/
│   ├── angular-output.model.ts        # Tipos del output Angular
│   ├── pipeline.model.ts             # Config del pipeline (pasos, gates, reglas)
│   ├── primeng-mapping.model.ts       # Tipos de mapeo PrimeNG
│   └── react-analysis.model.ts        # Tipos del analisis React
│
├── pipeline/
│   ├── ast-parser.ts                  # Parser AST de React (JSX → IR)
│   ├── class-component-converter.ts   # Convierte class components a funcionales
│   ├── class-context-layer.ts         # Post-proceso: this., deduplicacion, imports
│   ├── logic-service-converter.ts     # Convierte hooks a servicios Angular
│   ├── output-validator.ts            # Valida completitud del output
│   ├── pipeline-engine.ts             # Motor del pipeline con gates
│   ├── pipeline-types.ts              # Tipos del pipeline
│   ├── primeng-mapper.ts              # Mapea componentes a PrimeNG en el IR
│   ├── primeng-sanitizer.ts           # Limpia imports PrimeNG 19
│   ├── project-orchestrator.ts        # Orquestador principal de migracion
│   ├── project-scaffolder.ts          # Genera angular.json, tsconfig, etc.
│   ├── project-scanner.ts             # Escanea proyecto React
│   ├── route-generator.ts             # Genera app.routes.ts
│   ├── signal-fixer.ts                # Arregla signals en templates + auto-import PrimeNG
│   ├── state-mapper.ts                # useState→signal, useEffect→effect, etc.
│   ├── style-aggregator.ts            # Agrega estilos globales
│   ├── style-preservator.ts           # Preserva estilos del source
│   ├── template-generator.ts          # JSX → template Angular HTML
│   ├── template-integrity-layer.ts    # Limpia templates: Framer Motion, quotes, etc.
│   ├── ui-semantic-engine.ts          # Motor semantico de UI
│   └── universal-router-mapper.ts     # Detecta rutas de React Router
│
├── security/
│   └── validator.ts                   # Valida input: eval, Function, size
│
└── utils/
    ├── env.utils.ts                   # Variables de entorno
    ├── naming.utils.ts                # toKebabCase, toPascalCase, buildModulePaths
    └── type-mapper.utils.ts           # Mapeo tipos React → Angular
```

## Flujo de transformacion

```
React Source
    │
    ▼
[project-scanner.ts]        Escanea archivos: componentes, hooks, estilos, configs
    │
    ▼
[ast-parser.ts]             Parsea JSX → ComponentIR (Intermediate Representation)
    │
    ▼
[class-component-converter] Pre-procesa class components → funcionales
    │
    ▼
[state-mapper.ts]           useState→signal, useEffect→effect, useMemo→computed
    │
    ▼
[template-generator.ts]     JSX tree → Angular template HTML
    │
    ▼
[primeng-mapper.ts]         Mapea componentes React UI → PrimeNG
    │
    ▼
[code-emitter.ts]           Genera .component.ts con imports, signals, methods
    │
    ▼
[logic-service-converter]   Convierte hooks (useServices) → @Injectable services
    │
    ▼
[signal-fixer.ts]           Arregla signal reads en templates + auto-import PrimeNG
    │
    ▼
[class-context-layer.ts]    Post-proceso: this., deduplicacion, type imports
    │
    ▼
[template-integrity-layer]  Limpia: Framer Motion, quotes, callback bindings
    │
    ▼
[primeng-sanitizer.ts]      PrimeNG 19: ButtonModule→Button, p-dropdown→p-select
    │
    ▼
[project-scaffolder.ts]     Genera angular.json, tsconfig, main.ts, app.config.ts
    │
    ▼
[route-generator.ts]        Genera app.routes.ts con lazy loading
    │
    ▼
Angular Output (compilable)
```

## Ejecucion

```bash
# Compilar MCP
npm run build

# Transformar un proyecto
node dist/migrate-cli.js <ruta-react> <ruta-angular> <nombre-modulo>

# Ejemplo
node dist/migrate-cli.js "C:\proyecto-react" "C:\proyecto-angular" "mi-app"
```

## Archivos clave y que hacen

### ast-parser.ts
Parsea codigo React con AST. Extrae:
- `useState` → StateDefinition (variableName, setterName, type, initialValue)
- `useEffect` → EffectDefinition (body, dependencies, cleanup)
- `useMemo` → MemoDefinition
- `useCallback` → CallbackDefinition
- `useRef` → RefDefinition
- `useContext` → ContextDefinition
- Custom hooks → CustomHookDefinition
- JSX tree → JSXNode[] con atributos, eventos, children
- Props → PropDefinition[]

El `.map()` de React se convierte en `@for` de Angular. El parser extrae el nombre del parametro del map (ej: `services.map((service) => ...)` → `@for (service of services)`).

### code-emitter.ts
Genera el archivo `.component.ts` desde el ComponentIR:
- Imports de Angular core (Component, signal, inject, etc.)
- Imports de PrimeNG
- Imports de servicios
- @Component decorator con selector, standalone, imports, templateUrl
- Signals con inferencia de tipo por nombre
- Setter methods para signals usados en templates
- Methods con reescritura de body (this., setters, refs)

`safeRewriteBody()` es la funcion critica — reescribe el body de cada metodo:
1. `setX(value)` → `this.x.set(value)`
2. `setX(prev => ...)` → `this.x.update(prev => ...)`
3. Bare state reads: `fallido === 'si'` → `this.fallido() === 'si'`
4. DOM refs: `ref.current` → `this.ref()?.nativeElement`
5. Hook calls: `saveService(data)` → `this.services.saveService(data)`
6. Prop reads: `onChange(data)` → `this.onChange.emit(data)` (para outputs)
7. Type narrowing: `e.target.files` → `(e.target as HTMLInputElement).files`

### class-context-layer.ts
Post-procesamiento del codigo generado:
- RULE 0: Elimina signals huerfanos de hook destructuring
- RULE 1: Arregla `this.` scope en method bodies
- RULE 2: Consolida identificadores duplicados (signal vs method, signal vs @Input)
- RULE 2b: Arregla referencias de template a servicios inyectados
- RULE 2c: Agrega imports de tipos faltantes (ServiceType, Service)
- RULE 3: Limpia `: any` → `: unknown`
- RULE 4-7: Limpieza de clases duplicadas, imports React, async/await

### template-generator.ts
Convierte JSX tree a Angular template HTML:
- Tags React → PrimeNG/HTML (`Card` → `p-card`, `Button` → `p-button`)
- Eventos: `onClick` → `(click)`, `onChange` → `(change)`
- className → class, htmlFor → for
- Framer Motion attributes → eliminados
- `.map()` → `@for` con nombre de variable correcto
- Ternarios → `@if/@else`
- Iconos Lucide → `<i class="pi pi-xxx">`

### signal-fixer.ts
Arregla signals en templates y auto-importa PrimeNG:
- `[(ngModel)]="signal"` → `[ngModel]="signal()" (ngModelChange)="signal.set($event)" [ngModelOptions]="{standalone:true}"`
- `{{ signal }}` → `{{ signal() }}`
- `@if (signal)` → `@if (signal())`
- Auto-importa PrimeNG components (p-card→Card, p-tag→Tag, etc.) en @Component.imports
- Agrega MessageService como provider cuando p-toast esta presente
- Agrega FormsModule cuando ngModel esta presente

### project-scaffolder.ts
Genera archivos de configuracion:
- `angular.json` con polyfills: ['zone.js'], styles array con primeicons
- `tsconfig.json` y `tsconfig.app.json`
- `main.ts` con bootstrapApplication
- `app.config.ts` con provideRouter, provideHttpClient, providePrimeNG
- `app.component.ts` raiz con RouterOutlet
- `styles.scss` con directivas Tailwind
- `tailwind.config.js`
- `postcss.config.js`

### project-orchestrator.ts
Orquestador principal. Coordina todo el flujo:
1. Escanea proyecto React
2. Ordena componentes topologicamente
3. Transforma cada componente por el pipeline
4. Convierte hooks a servicios
5. Agrega estilos
6. Genera scaffold (angular.json, etc.)
7. Genera rutas
8. Aplica signal-fixer, primeng-sanitizer
9. Aplica class-context-layer, template-integrity-layer
10. Genera types.ts
11. Escribe archivos al disco

### logic-service-converter.ts
Convierte hooks de React (`useServices`) a servicios Angular (`@Injectable`):
- Extrae signals, computed, effects del hook body
- Genera clase con `signal()`, `computed()`, `inject()`
- Arregla closure de `computed()` (el `};` antes de `});`)
- Agrega `this.services.update()` y `localStorage` en saveService

## Como agregar reglas o condiciones

### Agregar un mapeo React → PrimeNG
Editar `src/mappings/primeng-components.map.ts`:
```typescript
MyReactComponent: {
  reactComponent: 'MyReactComponent',
  primeNgComponent: 'MyPrimeComponent',
  primeNgModule: 'MyPrimeModule',
  importPath: 'primeng/mycomponent',
  selector: 'p-mycomponent',
  templateExample: '<p-mycomponent />',
  requiredInputs: [],
},
```

### Agregar un tag React → HTML/PrimeNG en templates
Editar `src/pipeline/template-generator.ts`, objeto `REACT_TAG_TO_ANGULAR`:
```typescript
'MyComponent': 'p-mycomponent',
```

### Agregar auto-import de PrimeNG
Editar `src/pipeline/signal-fixer.ts`, objeto `PRIMENG_TAG_TO_IMPORT`:
```typescript
'p-mycomponent': { name: 'MyComponent', path: 'primeng/mycomponent' },
```

### Agregar una regla de limpieza de template
Editar `src/pipeline/template-integrity-layer.ts`, dentro de `validateTemplateIntegrity()`:
```typescript
// Fix N: mi regla
html = html.replace(/patron-a-buscar/g, 'reemplazo');
```

### Agregar inferencia de tipo para signals
Editar `src/emitter/code-emitter.ts`, dentro del bloque de signals:
```typescript
if (/miPatron/i.test(sig.name)) {
  sigType = 'miTipo'; sigInit = 'miDefault';
}
```

### Agregar una regla de post-proceso
Editar `src/pipeline/class-context-layer.ts`, dentro de `validateClassContext()`:
```typescript
// ─── RULE N: mi regla ───
ts = ts.replace(/patron/g, 'reemplazo');
```

### Despues de cualquier cambio
```bash
npm run build    # Recompila el MCP
# Luego transformar de nuevo para verificar
node dist/migrate-cli.js <source> <output> <module>
```
