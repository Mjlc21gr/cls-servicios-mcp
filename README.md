# @cls-bolivar/mcp-front-migrate

MCP Server para migración automática de micro-frontends **React → Angular 20** con PrimeNG 19, signals, y ML optimizer integrado.

## Instalación

```bash
npm install @cls-bolivar/mcp-front-migrate
```

## Uso como MCP Server (stdio)

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

## Uso como MCP Server (HTTP)

```bash
cls-front-migrate-http
# → http://localhost:3200/mcp
```

```json
{
  "mcpServers": {
    "cls-front-migrate": {
      "url": "http://localhost:3200/mcp"
    }
  }
}
```

## CLI

```bash
# Migrar componentes individuales
mcp-front-migrate migrate -s ./react-app -d ./angular-app -m mi-modulo

# Migrar proyecto completo
cls-migrate-project ./react-source ./angular-output nombre-modulo

# Solo analizar
mcp-front-migrate analyze -s ./src/MyComponent.tsx
```

## API Programática

```typescript
import {
  analyzeReactComponent,
  generateAngularComponent,
  migrateFullProject,
  runOptimizer,
  configureDb,
  configureLlm,
} from '@cls-bolivar/mcp-front-migrate';

// Analizar un componente React
const analysis = analyzeReactComponent(sourceCode, 'MyComponent.tsx');

// Generar componente Angular
const files = generateAngularComponent(analysis, 'mi-modulo');

// Migrar proyecto completo
const result = await migrateFullProject(reactSource, angularDest, 'mi-modulo');
```

## ML Optimizer

El optimizador ML corrige errores de compilación automáticamente:

```typescript
import { runOptimizer, configureDb, configureLlm } from '@cls-bolivar/mcp-front-migrate';

const result = await runOptimizer({
  mcpRoot: '/path/to/mcp',
  reactSource: '/path/to/react',
  angularOutput: '/path/to/angular',
  moduleName: 'mi-app',
  maxIterations: 5,
  db: { clientId: 'xxx', clientSecret: 'xxx' },
  llm: { url: 'http://localhost:11434/api/generate', model: 'qwen2.5-coder:1.5b', type: 'ollama' },
});
```

## Features

- Pipeline completo React → Angular 20 standalone
- Mapeo automático a PrimeNG 19
- Signals (`useState` → `signal()`, `useEffect` → `effect()`)
- Generación de servicios desde hooks
- Tema Seguros Bolívar integrado
- ML optimizer con 20+ fixes automáticos
- Soporte LLM (Ollama / OpenAI) para fixes dinámicos
- Registro en base de datos de errores y patches

## MCP Tools disponibles

| Tool | Descripción |
|------|-------------|
| `analyze_react_component` | Analiza componente React con AST |
| `generate_angular_component` | Genera componente Angular desde análisis |
| `migrate_full_project` | Migra proyecto completo |
| `map_to_primeng` | Mapea UI a PrimeNG |
| `generate_service` | Genera servicio Angular |
| `generate_shell_app` | Genera shell de microfrontend |
| `generate_remote_app` | Genera remote module |
| `validate_input` | Valida input de seguridad |
| `ml_optimize` | Ejecuta ciclo ML optimizer |
| `ml_classify_error` | Clasifica un error |
| `ml_status` | Estado del ML |

## Requisitos

- Node.js >= 18
- TypeScript 5.x (para compilación del MCP)
- Angular CLI (para compilar el output)

## License

MIT
