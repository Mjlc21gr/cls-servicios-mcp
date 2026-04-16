# Plan de Implementación: react-to-angular-mcp

## Descripción General

Implementación de un servidor MCP en Node.js + TypeScript que convierte código React (JSX/TSX) a Angular 19+ moderno. El pipeline de conversión se compone de cuatro módulos encadenados (AST_Parser → State_Mapper → Template_Generator → PrimeNG_Mapper) y el servidor expone tres herramientas vía protocolo stdio. Se utiliza Vitest como test runner y fast-check para property-based testing.

## Tareas

- [x] 1. Configurar estructura del proyecto e interfaces base
  - [x] 1.1 Inicializar proyecto Node.js + TypeScript con dependencias
    - Crear `package.json` con dependencias: `@modelcontextprotocol/sdk`, `@babel/parser`, `@babel/traverse`, `zod`
    - Crear `tsconfig.json` con configuración estricta de TypeScript y soporte ESM
    - Instalar dependencias de desarrollo: `vitest`, `fast-check`, `@types/babel__traverse`
    - Crear estructura de directorios: `src/pipeline/`, `src/generators/`, `src/security/`, `src/emitter/`, `tests/unit/`, `tests/properties/`, `tests/properties/generators/`, `tests/integration/`
    - _Requisitos: 1.1, 12.4_

  - [x] 1.2 Definir interfaces y modelos de datos del ComponentIR
    - Crear `src/types.ts` con todas las interfaces: `ComponentIR`, `PropDefinition`, `StateDefinition`, `EffectDefinition`, `MemoDefinition`, `CallbackDefinition`, `RefDefinition`, `ContextDefinition`, `CustomHookDefinition`, `JSXNode`, `JSXAttribute`, `JSXExpression`, `PrimeNGImport`, `SecurityWarning`, `SignalDefinition`, `ParameterDefinition`, `TypeInterfaceDefinition`
    - Crear `src/types.ts` con interfaces de configuración: `ShellConfig`, `RemoteRoute`, `ShellAppArtifact`, `ModuleConfig`, `ExposedComponent`, `RemoteAppArtifact`, `GeneratedComponent`, `AngularArtifact`, `ServiceFile`, `ValidationResult`, `ValidationError`
    - _Requisitos: 2.1, 3.1, 7.1, 8.1_

- [x] 2. Implementar el validador de seguridad
  - [x] 2.1 Implementar Security Validator (`src/security/validator.ts`)
    - Implementar función `validateInput(sourceCode: string): ValidationResult`
    - Rechazar entradas con patrones de inyección: `eval(`, `new Function(`, imports dinámicos de URLs externas
    - Limitar tamaño de entrada a 500 KB
    - Detectar y advertir sobre patrones inseguros: `dangerouslySetInnerHTML`, `document.write`
    - Retornar `sanitizedCode` cuando la entrada es válida
    - _Requisitos: 10.1, 10.4, 10.7_

  - [x] 2.2 Write property test for security validation (Propiedad 15)
    - **Propiedad 15: Rechazo de patrones de inyección de código**
    - **Valida: Requisitos 10.1**

  - [x] 2.3 Write unit tests for Security Validator
    - Test de rechazo de `eval`, `Function` constructor, imports dinámicos
    - Test de límite de 500 KB
    - Test de detección de `dangerouslySetInnerHTML` y `document.write`
    - _Requisitos: 10.1, 10.4, 10.7_

- [x] 3. Implementar el AST_Parser
  - [x] 3.1 Implementar AST_Parser (`src/pipeline/ast-parser.ts`)
    - Implementar función `parseReactComponent(sourceCode: string): ComponentIR`
    - Usar `@babel/parser` con plugins `jsx` y `typescript` para parsear código fuente
    - Usar `@babel/traverse` para recorrer el AST y extraer: nombre del componente, props con tipos, useState, useEffect, useMemo, useCallback, useRef, useContext, métodos, componentes hijos importados, y JSX tree
    - Preservar todas las anotaciones de tipo TypeScript y generar `TypeInterfaceDefinition[]`
    - Detectar patrones inseguros y agregar `SecurityWarning[]`
    - Retornar error descriptivo con línea y tipo si la sintaxis JSX es inválida
    - Retornar error si no se encuentra un componente React válido (sin export de función que retorne JSX)
    - _Requisitos: 3.1, 3.2, 3.3, 3.4, 2.2, 10.7_

  - [x] 3.2 Write property test for AST extraction completeness (Propiedad 2)
    - **Propiedad 2: Extracción completa del AST con preservación de tipos**
    - **Valida: Requisitos 3.1, 3.2, 3.3**

  - [x] 3.3 Write property test for invalid component rejection (Propiedad 3)
    - **Propiedad 3: Rechazo de código sin componente React válido**
    - **Valida: Requisitos 3.4**

  - [x] 3.4 Write property test for invalid JSX error (Propiedad 22)
    - **Propiedad 22: Error descriptivo para JSX inválido**
    - **Valida: Requisitos 2.2**

  - [x] 3.5 Write unit tests for AST_Parser
    - Test de extracción de props, hooks, métodos, componentes hijos
    - Test de preservación de tipos TypeScript
    - Test de error para sintaxis JSX inválida con línea y tipo
    - Test de error para código sin componente React válido
    - _Requisitos: 3.1, 3.2, 3.3, 3.4, 2.2_

- [x] 4. Checkpoint - Verificar que el parser y validador funcionan correctamente
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implementar el State_Mapper
  - [x] 5.1 Implementar State_Mapper (`src/pipeline/state-mapper.ts`)
    - Implementar función `mapStateToAngular(ir: ComponentIR): ComponentIR`
    - Convertir `useState` → `signal()` preservando tipo y valor inicial
    - Convertir `useEffect` con dependencias → `effect()`
    - Convertir `useMemo` → `computed()`
    - Convertir `useCallback` → método del componente Angular
    - Convertir `useRef` (DOM) → `viewChild()`, `useRef` (valor) → propiedad de clase
    - Convertir `useContext` → `inject()` con servicio Angular correspondiente
    - Convertir hooks personalizados (`useX`) → servicio inyectable `XService`
    - Poblar campos del IR: `angularSignals`, `angularEffects`, `angularComputed`, `angularInjections`, `angularServices`, `angularViewChildren`, `classProperties`, `componentMethods`
    - _Requisitos: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 5.2 Write property test for hook mapping (Propiedad 4)
    - **Propiedad 4: Mapeo correcto de hooks React a equivalentes Angular 19+**
    - **Valida: Requisitos 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7**

  - [x] 5.3 Write unit tests for State_Mapper
    - Test de cada mapeo individual: useState→signal, useEffect→effect, useMemo→computed, useCallback→método, useRef→viewChild/propiedad, useContext→inject
    - Test de hooks personalizados → servicio inyectable
    - _Requisitos: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 6. Implementar el Template_Generator
  - [x] 6.1 Implementar Template_Generator (`src/pipeline/template-generator.ts`)
    - Implementar función `generateAngularTemplate(ir: ComponentIR): ComponentIR`
    - Convertir condicionales JSX (`&&`, ternarios) → `@if` / `@else`
    - Convertir iteraciones JSX (`.map()`) → `@for` con cláusula `track` obligatoria
    - Convertir expresiones switch / múltiples condiciones → `@switch` / `@case`
    - Convertir event handlers: `onClick` → `(click)`, `onChange` → `(change)`, `onSubmit` → `(submit)`
    - Convertir atributos dinámicos: `className={expr}` → `[class]`, `style={obj}` → `[ngStyle]`, `disabled={bool}` → `[disabled]`
    - Preservar clases Tailwind CSS: `className="tw-classes"` → `class="tw-classes"`
    - Convertir clases CSS personalizadas a utilidades Tailwind cuando exista mapeo directo, o preservar como `styles` del componente
    - Usar interpolación estándar Angular `{{ }}` para todas las interpolaciones de texto
    - Determinar plantilla inline (< 50 líneas) vs archivo separado (≥ 50 líneas) y setear `isInlineTemplate`
    - _Requisitos: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 10.3, 11.3_

  - [x] 6.2 Write property test for control flow transformation (Propiedad 5)
    - **Propiedad 5: Transformación correcta de estructuras de control JSX**
    - **Valida: Requisitos 5.1, 5.2, 5.3**

  - [x] 6.3 Write property test for attribute and event binding transformation (Propiedad 6)
    - **Propiedad 6: Transformación correcta de atributos y event bindings JSX**
    - **Valida: Requisitos 5.4, 5.5**

  - [x] 6.4 Write property test for Tailwind class preservation (Propiedad 7)
    - **Propiedad 7: Preservación de clases Tailwind CSS**
    - **Valida: Requisitos 5.6**

  - [x] 6.5 Write property test for inline vs separate template threshold (Propiedad 8)
    - **Propiedad 8: Umbral de plantilla inline vs archivo separado**
    - **Valida: Requisitos 5.7**

  - [x] 6.6 Write property test for safe interpolations (Propiedad 17)
    - **Propiedad 17: Interpolaciones seguras en plantillas**
    - **Valida: Requisitos 10.3**

  - [x] 6.7 Write unit tests for Template_Generator
    - Test de cada transformación de control de flujo, event bindings, atributos dinámicos
    - Test de preservación de clases Tailwind
    - Test de umbral inline/separado
    - _Requisitos: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [x] 7. Implementar el PrimeNG_Mapper
  - [x] 7.1 Implementar PrimeNG_Mapper (`src/pipeline/primeng-mapper.ts`)
    - Implementar función `mapToPrimeNG(ir: ComponentIR): ComponentIR`
    - Reemplazar `<button>` → `<p-button>`, `<input type="text">` → `<input pInputText>`, `<select>` → `<p-dropdown>`, `<table>` → `<p-table>`, `<input type="checkbox">` → `<p-checkbox>`, `<textarea>` → `<textarea pInputTextarea>`, `<dialog>` → `<p-dialog>`
    - Preservar elementos HTML sin equivalente PrimeNG sin modificación
    - Agregar automáticamente importaciones de módulos PrimeNG al array `imports` del componente standalone
    - Poblar `primeNgImports` en el IR
    - _Requisitos: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_

  - [x] 7.2 Write property test for PrimeNG element mapping (Propiedad 10)
    - **Propiedad 10: Mapeo correcto de elementos HTML a PrimeNG**
    - **Valida: Requisitos 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.9**

  - [x] 7.3 Write property test for PrimeNG import consistency (Propiedad 11)
    - **Propiedad 11: Consistencia de importaciones PrimeNG**
    - **Valida: Requisitos 6.8**

  - [x] 7.4 Write unit tests for PrimeNG_Mapper
    - Test de cada mapeo HTML → PrimeNG
    - Test de preservación de elementos sin equivalente
    - Test de importaciones automáticas
    - _Requisitos: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_

- [x] 8. Checkpoint - Verificar que el pipeline de conversión completo funciona
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implementar el Code Emitter y generación de pruebas
  - [x] 9.1 Implementar Code Emitter (`src/emitter/code-emitter.ts`)
    - Implementar función `emitAngularArtifact(ir: ComponentIR): AngularArtifact`
    - Generar `.component.ts` como Standalone_Component con signals, inject(), control flow moderno, decorador `@Component` con imports de PrimeNG
    - Generar `.spec.ts` con pruebas unitarias usando TestBed: creación del componente, renderizado de plantilla, verificación de bindings, reactividad de signals (si aplica), manejo de eventos (si aplica)
    - Generar `tailwind.config.js` con preset de PrimeNG y escaneo de archivos del componente
    - Generar archivo `.component.html` separado cuando `isInlineTemplate` es false
    - Generar servicios Angular inyectables para hooks personalizados
    - Seguir convenciones de naming Angular: kebab-case para archivos, PascalCase para clases, camelCase para métodos
    - Incluir comentarios de mapeo en el código generado (e.g., `// Convertido de useState → signal()`)
    - Usar `DomSanitizer` para contenido dinámico inseguro (`[innerHTML]` con sanitización explícita)
    - _Requisitos: 2.1, 9.1, 9.2, 9.3, 9.4, 10.2, 10.3, 11.1, 11.2, 12.1, 12.2, 12.3, 12.4_

  - [x] 9.2 Write property test for artifact completeness (Propiedad 1)
    - **Propiedad 1: Completitud del artefacto de conversión**
    - **Valida: Requisitos 2.1, 9.1, 11.1**

  - [x] 9.3 Write property test for structural round-trip equivalence (Propiedad 9)
    - **Propiedad 9: Equivalencia estructural de ida y vuelta**
    - **Valida: Requisitos 5.8**

  - [x] 9.4 Write property test for generated spec coverage (Propiedad 14)
    - **Propiedad 14: Cobertura de pruebas generadas según contenido del componente**
    - **Valida: Requisitos 9.2, 9.3, 9.4**

  - [x] 9.5 Write property test for unsafe pattern mitigation (Propiedad 16)
    - **Propiedad 16: Detección y mitigación de patrones inseguros**
    - **Valida: Requisitos 10.7**

  - [x] 9.6 Write property test for Angular naming conventions (Propiedad 19)
    - **Propiedad 19: Convenciones de naming de Angular en código generado**
    - **Valida: Requisitos 12.1**

  - [x] 9.7 Write property test for mapping comments (Propiedad 20)
    - **Propiedad 20: Comentarios de mapeo en código generado**
    - **Valida: Requisitos 12.3**

  - [x] 9.8 Write property test for TypeScript syntactic validity (Propiedad 21)
    - **Propiedad 21: Validez sintáctica del TypeScript generado**
    - **Valida: Requisitos 12.4**

  - [x] 9.9 Write unit tests for Code Emitter
    - Test de generación de `.component.ts` con estructura standalone correcta
    - Test de generación de `.spec.ts` con pruebas de creación, renderizado, signals y eventos
    - Test de generación de `tailwind.config.js` con preset PrimeNG
    - Test de generación de `.component.html` separado para plantillas ≥ 50 líneas
    - Test de generación de servicios inyectables para hooks personalizados
    - Test de convenciones de naming (kebab-case archivos, PascalCase clases, camelCase métodos)
    - Test de comentarios de mapeo en código generado
    - Test de uso de `DomSanitizer` para contenido inseguro
    - _Requisitos: 2.1, 9.1, 9.2, 9.3, 9.4, 10.2, 11.1, 11.2, 12.1, 12.3, 12.4_

- [x] 10. Implementar el Shell Generator
  - [x] 10.1 Implementar Shell Generator (`src/generators/shell-generator.ts`)
    - Implementar función `generateShellApp(config: ShellConfig): ShellAppArtifact`
    - Generar `app.config.ts` con `provideRouter` y configuración de la aplicación
    - Generar `app.routes.ts` con rutas lazy usando `loadRemoteModule` de `@angular-architects/native-federation` para cada remoto
    - Generar `federation.config.js` con declaración de todos los remotos
    - Generar `tailwind.config.js` compartido como base para todos los remotos
    - Generar `app.component.ts` con `router-outlet`
    - Generar configuración CSP (Content Security Policy) para `index.html`
    - Manejar lista vacía de remotos generando estructura base lista para agregar remotos posteriormente
    - _Requisitos: 7.1, 7.2, 7.3, 7.4, 7.5, 10.6_

  - [x] 10.2 Write property test for Shell_App completeness (Propiedad 12)
    - **Propiedad 12: Completitud de Shell_App con rutas y federación**
    - **Valida: Requisitos 7.1, 7.2**

  - [x] 10.3 Write unit tests for Shell Generator
    - Test de generación de rutas lazy con `loadRemoteModule` para cada remoto
    - Test de `federation.config.js` con remotos declarados
    - Test de generación con lista vacía de remotos (estructura base)
    - Test de configuración Tailwind compartida
    - Test de configuración CSP en Shell_App
    - _Requisitos: 7.1, 7.2, 7.3, 7.4, 7.5, 10.6_

- [x] 11. Implementar el Module Generator
  - [x] 11.1 Implementar Module Generator (`src/generators/module-generator.ts`)
    - Implementar función `generateRemoteApp(config: ModuleConfig): RemoteAppArtifact`
    - Generar `federation.config.js` con `exposes` para cada componente listado
    - Generar `app.config.ts` para la Remote_App
    - Configurar componentes expuestos como Standalone_Component con PrimeNG y Tailwind CSS
    - Generar componentes placeholder standalone cuando el componente no existe en el proyecto
    - _Requisitos: 8.1, 8.2, 8.3, 8.4_

  - [x] 11.2 Write property test for Remote_App completeness (Propiedad 13)
    - **Propiedad 13: Completitud de Remote_App con federación**
    - **Valida: Requisitos 8.1, 8.2**

  - [x] 11.3 Write unit tests for Module Generator
    - Test de `federation.config.js` con `exposes` para cada componente
    - Test de generación de componentes placeholder standalone
    - Test de configuración de componentes con PrimeNG y Tailwind
    - _Requisitos: 8.1, 8.2, 8.3, 8.4_

- [x] 12. Checkpoint - Verificar que los generadores funcionan correctamente
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implementar el servidor MCP y registrar herramientas
  - [x] 13.1 Implementar servidor MCP (`src/server.ts`)
    - Crear instancia de `McpServer` con nombre `react-to-angular-mcp` y versión `1.0.0`
    - Configurar `StdioServerTransport` para comunicación stdio
    - Definir esquemas Zod para las tres herramientas: `convert_react_to_angular`, `generate_microfrontend_shell`, `generate_angular_module`
    - Registrar herramienta `convert_react_to_angular` con handler que ejecute el pipeline completo: Security Validator → AST_Parser → State_Mapper → Template_Generator → PrimeNG_Mapper → Code Emitter
    - Registrar herramienta `generate_microfrontend_shell` con handler que invoque Shell Generator
    - Registrar herramienta `generate_angular_module` con handler que invoque Module Generator
    - Implementar timeout de 30 segundos con `AbortController` para cada solicitud
    - Implementar manejo de errores: errores de validación Zod, errores de seguridad, errores de sintaxis, errores de timeout, errores internos del pipeline
    - Retornar errores en formato MCP estándar con `isError: true` y estructura `{ success, error: { type, message, details } }`
    - _Requisitos: 1.1, 1.2, 1.3, 1.4, 1.5, 2.3, 10.5_

  - [x] 13.2 Write property test for MCP schema validation (Propiedad 18)
    - **Propiedad 18: Validación de esquema de parámetros MCP**
    - **Valida: Requisitos 1.5**

  - [x] 13.3 Write unit tests for MCP Server
    - Test de listado de herramientas: verifica que `tools/list` retorna 3 herramientas con esquemas completos
    - Test de herramienta no registrada: verifica error MCP para herramienta inexistente
    - Test de pipeline secuencial: verifica orden de ejecución AST→State→Template→PrimeNG→Emitter
    - Test de timeout de 30 segundos
    - Test de formato de error MCP estándar
    - _Requisitos: 1.1, 1.2, 1.3, 1.4, 1.5, 2.3, 10.5_

- [x] 14. Crear generadores fast-check para property-based testing
  - [x] 14.1 Implementar generadores personalizados (`tests/properties/generators/`)
    - Crear `react-component.gen.ts`: generador de componentes React válidos con combinaciones aleatorias de hooks, props, métodos y estructura JSX
    - Crear `jsx-tree.gen.ts`: generador de árboles JSX con elementos HTML, componentes, condicionales, iteraciones y atributos
    - Crear `hooks.gen.ts`: generador de declaraciones useState, useEffect, useMemo, useCallback, useRef, useContext con tipos y valores aleatorios
    - Crear `config.gen.ts`: generador de `ShellConfig` y `ModuleConfig` con nombres y rutas aleatorias
    - Incluir generadores de código inválido (errores de sintaxis, sin componente React válido)
    - Incluir generadores de código con patrones inseguros (`eval`, `dangerouslySetInnerHTML`)
    - _Requisitos: Soporte para Propiedades 1-22_

- [x] 15. Checkpoint - Verificar que el servidor MCP y generadores de tests funcionan
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Implementar tests de integración
  - [x] 16.1 Write integration tests for MCP protocol (`tests/integration/mcp-protocol.test.ts`)
    - Test de comunicación stdio end-to-end: enviar solicitud JSON-RPC y recibir respuesta
    - Test de listado de herramientas vía protocolo MCP
    - Test de invocación de `convert_react_to_angular` con componente React válido
    - Test de invocación de `generate_microfrontend_shell` con configuración válida
    - Test de invocación de `generate_angular_module` con configuración válida
    - Test de error para herramienta no registrada vía protocolo
    - Test de error de validación de esquema vía protocolo
    - _Requisitos: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 16.2 Write integration tests for full conversion (`tests/integration/full-conversion.test.ts`)
    - Test de conversión completa de componente React con useState, useEffect y JSX condicional
    - Test de conversión completa de componente React con useContext, useMemo y iteraciones
    - Test de conversión completa de componente React con useRef, useCallback y event handlers
    - Test de conversión completa de componente React con hooks personalizados
    - Test de conversión de componente con elementos HTML que mapean a PrimeNG
    - Verificar que cada artefacto generado contiene los tres archivos esperados (.component.ts, .spec.ts, tailwind.config.js)
    - _Requisitos: 2.1, 2.3, 3.1, 4.1, 5.1, 6.1, 9.1, 11.1, 12.4_

- [x] 17. Integración final y punto de entrada
  - [x] 17.1 Crear punto de entrada ejecutable (`src/index.ts`)
    - Crear archivo de entrada que inicialice el servidor MCP y conecte el transporte stdio
    - Configurar `bin` en `package.json` para ejecución directa con `npx`
    - Agregar script `start` en `package.json`: `node dist/index.js`
    - Agregar script `build` en `package.json`: `tsc`
    - Agregar script `test` en `package.json`: `vitest --run`
    - _Requisitos: 1.1_

- [x] 18. Checkpoint final - Verificar que todo el sistema funciona correctamente
  - Ensure all tests pass, ask the user if questions arise.

## Notas

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Cada tarea referencia requisitos específicos para trazabilidad
- Los checkpoints aseguran validación incremental del progreso
- Los tests de propiedades validan las 22 propiedades de correctitud universales definidas en el diseño
- Los tests unitarios validan ejemplos específicos y edge cases
- Se usa TypeScript como lenguaje de implementación, consistente con el diseño
