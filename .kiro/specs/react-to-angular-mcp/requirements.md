# Documento de Requisitos

## Introducción

Este documento define los requisitos para un servidor MCP (Model Context Protocol) que convierte código React (generado por Google AI u otras fuentes) a código Angular moderno (v19+). El servidor expone herramientas que transforman componentes React completos en componentes Angular standalone utilizando PrimeNG para UI, Tailwind CSS para estilos, y una arquitectura de micro frontends basada en Native Federation. El sistema está diseñado para ser consumido por clientes AI (Google AI Studio, Cursor, Windsurf, Claude) a través del protocolo stdio.

## Glosario

- **MCP_Server**: Servidor Node.js + TypeScript que implementa el protocolo Model Context Protocol, expone herramientas de conversión y se comunica con clientes AI vía stdio.
- **Conversion_Engine**: Motor interno del MCP_Server compuesto por cuatro módulos encadenados (AST_Parser, State_Mapper, Template_Generator, PrimeNG_Mapper) que transforman código React en código Angular.
- **AST_Parser**: Módulo que analiza código JSX/TSX mediante un árbol de sintaxis abstracta y extrae props, estado, hooks, métodos y estructura del componente React.
- **State_Mapper**: Módulo que transforma patrones de estado de React (useState, useEffect, useContext, useMemo, useCallback, useRef) a sus equivalentes en Angular 19+ (signal(), effect(), inject(), computed(), funciones, viewChild()).
- **Template_Generator**: Módulo que convierte plantillas JSX a plantillas Angular con bindings correctos ((click)=, [value]=, @if, @for, @switch).
- **PrimeNG_Mapper**: Módulo que detecta elementos HTML nativos y los reemplaza por sus equivalentes de PrimeNG (por ejemplo, `<button>` → `<p-button>`, `<input>` → `pInputText`, `<select>` → `<p-dropdown>`).
- **Shell_App**: Aplicación Angular host que utiliza Native Federation para cargar dinámicamente micro frontends remotos mediante rutas lazy.
- **Remote_App**: Aplicación Angular independiente que expone componentes standalone como micro frontend, configurada con Module Federation.
- **Native_Federation**: Implementación de Module Federation para Angular que permite cargar módulos remotos en tiempo de ejecución sin dependencia de Webpack.
- **Standalone_Component**: Componente Angular que no requiere NgModule, disponible desde Angular 14+ y estándar en Angular 19+.
- **Cliente_AI**: Herramienta de inteligencia artificial (Google AI Studio, Cursor, Windsurf, Claude) que se conecta al MCP_Server vía protocolo stdio.
- **Código_Fuente_React**: Código JSX o TSX de un componente React que sirve como entrada para la conversión.
- **Artefacto_Angular**: Conjunto de archivos generados por la conversión: archivo de componente (.component.ts), archivo de pruebas (.spec.ts), configuración de federación (federation.config.js) y configuración de Tailwind (tailwind.config.js).

## Requisitos

### Requisito 1: Servidor MCP y Comunicación stdio

**Historia de Usuario:** Como desarrollador que utiliza un Cliente_AI, quiero conectarme al MCP_Server vía protocolo stdio, para poder enviar código React y recibir código Angular convertido directamente desde mi herramienta de AI.

#### Criterios de Aceptación

1. THE MCP_Server SHALL implementar el protocolo Model Context Protocol sobre transporte stdio conforme a la especificación MCP vigente.
2. THE MCP_Server SHALL exponer exactamente tres herramientas: `convert_react_to_angular`, `generate_microfrontend_shell` y `generate_angular_module`.
3. WHEN un Cliente_AI envía una solicitud de listado de herramientas, THE MCP_Server SHALL responder con la definición completa (nombre, descripción, esquema de parámetros) de las tres herramientas disponibles.
4. WHEN un Cliente_AI envía una solicitud con un nombre de herramienta no registrado, THE MCP_Server SHALL responder con un error MCP estándar indicando que la herramienta no existe.
5. WHEN el MCP_Server recibe una solicitud con parámetros que no cumplen el esquema definido, THE MCP_Server SHALL responder con un error de validación que describa los campos inválidos.

### Requisito 2: Herramienta convert_react_to_angular

**Historia de Usuario:** Como desarrollador, quiero convertir un componente React completo a Angular 19+ con un solo comando, para poder migrar código generado por AI sin reescribirlo manualmente.

#### Criterios de Aceptación

1. WHEN la herramienta `convert_react_to_angular` recibe Código_Fuente_React válido, THE Conversion_Engine SHALL generar un Artefacto_Angular compuesto por: un archivo `.component.ts` (componente standalone), un archivo `.spec.ts` (pruebas unitarias) y un archivo `tailwind.config.js`.
2. WHEN la herramienta `convert_react_to_angular` recibe Código_Fuente_React que contiene sintaxis JSX inválida, THE AST_Parser SHALL retornar un error descriptivo indicando la línea y el tipo de error de sintaxis.
3. THE Conversion_Engine SHALL procesar la conversión ejecutando los módulos en orden secuencial: AST_Parser, State_Mapper, Template_Generator, PrimeNG_Mapper.

### Requisito 3: Análisis AST de Código React

**Historia de Usuario:** Como desarrollador, quiero que el sistema analice correctamente la estructura de mis componentes React, para que la conversión preserve toda la lógica y estructura del componente original.

#### Criterios de Aceptación

1. WHEN el AST_Parser recibe Código_Fuente_React, THE AST_Parser SHALL extraer: nombre del componente, props con sus tipos TypeScript, variables de estado (useState), efectos (useEffect), refs (useRef), callbacks (useCallback), valores memorizados (useMemo), contextos (useContext), y métodos definidos en el componente.
2. WHEN el AST_Parser recibe un componente funcional React con TypeScript, THE AST_Parser SHALL preservar todas las anotaciones de tipo y generar interfaces TypeScript equivalentes en el Artefacto_Angular.
3. WHEN el AST_Parser recibe un componente que importa otros componentes React, THE AST_Parser SHALL registrar las dependencias de componentes hijos para su inclusión en el array `imports` del Standalone_Component generado.
4. IF el AST_Parser recibe código que no contiene un componente React válido (sin export de función que retorne JSX), THEN THE AST_Parser SHALL retornar un error indicando que no se encontró un componente React válido en el código proporcionado.

### Requisito 4: Mapeo de Estado React a Angular 19+

**Historia de Usuario:** Como desarrollador, quiero que los patrones de estado de React se conviertan a los equivalentes modernos de Angular 19+, para que el código generado utilice las mejores prácticas actuales de Angular.

#### Criterios de Aceptación

1. WHEN el State_Mapper encuentra una declaración `useState`, THE State_Mapper SHALL convertirla a una declaración `signal()` de Angular 19+, preservando el tipo y valor inicial.
2. WHEN el State_Mapper encuentra una declaración `useEffect` con dependencias, THE State_Mapper SHALL convertirla a una llamada `effect()` de Angular 19+.
3. WHEN el State_Mapper encuentra una declaración `useMemo`, THE State_Mapper SHALL convertirla a una declaración `computed()` de Angular 19+.
4. WHEN el State_Mapper encuentra una declaración `useCallback`, THE State_Mapper SHALL convertirla a un método del componente Angular.
5. WHEN el State_Mapper encuentra una declaración `useRef`, THE State_Mapper SHALL convertirla a `viewChild()` cuando referencia un elemento DOM, o a una variable de clase cuando almacena un valor mutable.
6. WHEN el State_Mapper encuentra una declaración `useContext`, THE State_Mapper SHALL convertirla a una llamada `inject()` con el servicio Angular correspondiente.
7. WHEN el State_Mapper encuentra un hook personalizado (función que comienza con "use" y utiliza hooks internos), THE State_Mapper SHALL generar un servicio Angular inyectable equivalente.


### Requisito 5: Generación de Plantillas Angular

**Historia de Usuario:** Como desarrollador, quiero que las plantillas JSX se conviertan correctamente a plantillas Angular con la sintaxis moderna de control de flujo, para que el código generado sea idiomático y funcional.

#### Criterios de Aceptación

1. WHEN el Template_Generator encuentra expresiones condicionales JSX (operador ternario o `&&`), THE Template_Generator SHALL convertirlas a bloques `@if` / `@else` de Angular 19+.
2. WHEN el Template_Generator encuentra iteraciones JSX (`.map()` sobre arrays), THE Template_Generator SHALL convertirlas a bloques `@for` de Angular 19+ con la cláusula `track` obligatoria.
3. WHEN el Template_Generator encuentra expresiones `switch` o múltiples condiciones mutuamente excluyentes, THE Template_Generator SHALL convertirlas a bloques `@switch` / `@case` de Angular 19+.
4. WHEN el Template_Generator encuentra event handlers JSX (`onClick`, `onChange`, `onSubmit`), THE Template_Generator SHALL convertirlos a event bindings Angular (`(click)`, `(change)`, `(submit)`).
5. WHEN el Template_Generator encuentra atributos JSX dinámicos (`className={expr}`, `style={obj}`, `disabled={bool}`), THE Template_Generator SHALL convertirlos a property bindings Angular (`[class]`, `[ngStyle]`, `[disabled]`).
6. WHEN el Template_Generator encuentra `className` con clases de Tailwind CSS, THE Template_Generator SHALL preservar todas las clases Tailwind en el atributo `class` del elemento Angular generado.
7. THE Template_Generator SHALL generar plantillas inline dentro del decorador `@Component` para componentes con menos de 50 líneas de plantilla, y archivos `.component.html` separados para plantillas de 50 líneas o más.
8. FOR ALL Código_Fuente_React válido, convertir a Angular y luego analizar la estructura del Artefacto_Angular generado SHALL producir un componente con la misma cantidad de elementos interactivos, bindings de datos y estructuras de control que el componente React original (propiedad de ida y vuelta estructural).

### Requisito 6: Mapeo de Componentes PrimeNG

**Historia de Usuario:** Como desarrollador, quiero que los elementos HTML nativos se reemplacen automáticamente por componentes PrimeNG equivalentes, para que la interfaz generada tenga un aspecto profesional y consistente.

#### Criterios de Aceptación

1. WHEN el PrimeNG_Mapper encuentra un elemento `<button>` en la plantilla, THE PrimeNG_Mapper SHALL reemplazarlo por `<p-button>` con los atributos correspondientes mapeados.
2. WHEN el PrimeNG_Mapper encuentra un elemento `<input>` de tipo texto, THE PrimeNG_Mapper SHALL agregar la directiva `pInputText` al elemento.
3. WHEN el PrimeNG_Mapper encuentra un elemento `<select>`, THE PrimeNG_Mapper SHALL reemplazarlo por `<p-dropdown>` con las opciones mapeadas.
4. WHEN el PrimeNG_Mapper encuentra un elemento `<table>`, THE PrimeNG_Mapper SHALL reemplazarlo por `<p-table>` con columnas y datos mapeados.
5. WHEN el PrimeNG_Mapper encuentra un elemento `<input type="checkbox">`, THE PrimeNG_Mapper SHALL reemplazarlo por `<p-checkbox>`.
6. WHEN el PrimeNG_Mapper encuentra un elemento `<textarea>`, THE PrimeNG_Mapper SHALL agregar la directiva `pInputTextarea` al elemento.
7. WHEN el PrimeNG_Mapper encuentra un elemento `<dialog>` o un modal, THE PrimeNG_Mapper SHALL reemplazarlo por `<p-dialog>`.
8. THE PrimeNG_Mapper SHALL agregar automáticamente las importaciones de módulos PrimeNG necesarios al array `imports` del Standalone_Component generado.
9. WHEN el PrimeNG_Mapper encuentra un elemento HTML que no tiene equivalente directo en PrimeNG, THE PrimeNG_Mapper SHALL preservar el elemento HTML original sin modificación.

### Requisito 7: Herramienta generate_microfrontend_shell

**Historia de Usuario:** Como arquitecto de software, quiero generar una aplicación Shell Angular con Native Federation configurada, para poder orquestar múltiples micro frontends remotos con carga dinámica.

#### Criterios de Aceptación

1. WHEN la herramienta `generate_microfrontend_shell` recibe un nombre de aplicación y una lista de rutas remotas, THE MCP_Server SHALL generar una Shell_App Angular standalone con rutas lazy configuradas para cada remoto.
2. THE Shell_App generada SHALL incluir configuración de Native Federation (`federation.config.js`) con los remotos declarados.
3. THE Shell_App generada SHALL incluir un mecanismo de carga dinámica de remotos usando `loadRemoteModule` de `@angular-architects/native-federation`.
4. WHEN la herramienta `generate_microfrontend_shell` recibe una lista vacía de rutas remotas, THE MCP_Server SHALL generar la Shell_App con la estructura base lista para agregar remotos posteriormente.
5. THE Shell_App generada SHALL incluir configuración de Tailwind CSS compartida como base para todos los remotos.

### Requisito 8: Herramienta generate_angular_module

**Historia de Usuario:** Como desarrollador, quiero generar la configuración de un micro frontend remoto Angular, para poder exponer componentes convertidos como módulos independientes cargables por la Shell_App.

#### Criterios de Aceptación

1. WHEN la herramienta `generate_angular_module` recibe un nombre de módulo y una lista de componentes a exponer, THE MCP_Server SHALL generar una Remote_App Angular con configuración de Native Federation que exponga los componentes especificados.
2. THE Remote_App generada SHALL incluir un archivo `federation.config.js` con la configuración de `exposes` para cada componente listado.
3. THE Remote_App generada SHALL configurar los componentes expuestos como Standalone_Component con PrimeNG y Tailwind CSS.
4. WHEN la herramienta `generate_angular_module` recibe un nombre de componente que no existe en el proyecto, THE MCP_Server SHALL generar un componente placeholder standalone con la estructura base lista para implementación.

### Requisito 9: Generación de Pruebas Unitarias

**Historia de Usuario:** Como desarrollador, quiero que cada componente convertido incluya pruebas unitarias, para poder verificar que la conversión es correcta y mantener la calidad del código.

#### Criterios de Aceptación

1. WHEN el Conversion_Engine genera un Artefacto_Angular, THE Conversion_Engine SHALL generar un archivo `.spec.ts` con pruebas unitarias usando el framework de testing de Angular (TestBed).
2. THE archivo `.spec.ts` generado SHALL incluir pruebas para: creación del componente, renderizado de la plantilla, y verificación de bindings de datos.
3. WHEN el componente convertido contiene signals, THE archivo `.spec.ts` generado SHALL incluir pruebas que verifiquen la reactividad de los signals.
4. WHEN el componente convertido contiene event handlers, THE archivo `.spec.ts` generado SHALL incluir pruebas que verifiquen la emisión y manejo de eventos.

### Requisito 10: Seguridad

**Historia de Usuario:** Como arquitecto de seguridad, quiero que el servidor MCP y el código generado cumplan con prácticas de seguridad robustas, para proteger la aplicación contra vulnerabilidades comunes.

#### Criterios de Aceptación

1. THE MCP_Server SHALL validar y sanitizar todo Código_Fuente_React recibido antes de procesarlo, rechazando entradas que contengan patrones de inyección de código (eval, Function constructor, import dinámico de URLs externas).
2. THE Conversion_Engine SHALL generar componentes Angular que utilicen el sanitizador de Angular (DomSanitizer) para todo contenido dinámico que se inserte en el DOM.
3. THE Template_Generator SHALL escapar todas las interpolaciones de texto en las plantillas generadas utilizando la interpolación estándar de Angular `{{ }}` que aplica sanitización automática.
4. THE MCP_Server SHALL limitar el tamaño del Código_Fuente_React de entrada a un máximo de 500 KB por solicitud.
5. THE MCP_Server SHALL limitar el tiempo de procesamiento de cada solicitud a un máximo de 30 segundos, cancelando la operación y retornando un error de timeout si se excede.
6. THE Shell_App generada SHALL incluir configuración de Content Security Policy (CSP) apropiada para micro frontends.
7. WHEN el AST_Parser detecta patrones potencialmente inseguros en el Código_Fuente_React (uso de `dangerouslySetInnerHTML`, `eval`, `document.write`), THE AST_Parser SHALL emitir una advertencia en la respuesta indicando el riesgo de seguridad y generar código Angular seguro equivalente usando `[innerHTML]` con sanitización explícita.

### Requisito 11: Configuración de Tailwind CSS

**Historia de Usuario:** Como desarrollador, quiero que el código Angular generado esté configurado con Tailwind CSS, para poder utilizar clases de utilidad para el diseño visual de los componentes.

#### Criterios de Aceptación

1. WHEN el Conversion_Engine genera un Artefacto_Angular, THE Conversion_Engine SHALL generar un archivo `tailwind.config.js` configurado para escanear los archivos del componente generado.
2. THE `tailwind.config.js` generado SHALL incluir la configuración del preset de PrimeNG para compatibilidad visual entre Tailwind y PrimeNG.
3. WHEN el Código_Fuente_React contiene clases CSS personalizadas (no de Tailwind), THE Template_Generator SHALL convertirlas a clases de utilidad de Tailwind equivalentes cuando exista un mapeo directo, o preservarlas como clases CSS personalizadas en un bloque `styles` del componente.

### Requisito 12: Calidad del Código Generado

**Historia de Usuario:** Como desarrollador, quiero que el código Angular generado siga las mejores prácticas y convenciones de Angular 19+, para que sea mantenible y profesional.

#### Criterios de Aceptación

1. THE Conversion_Engine SHALL generar código TypeScript que siga la guía de estilo oficial de Angular (nombres en kebab-case para archivos, PascalCase para clases, camelCase para métodos y propiedades).
2. THE Conversion_Engine SHALL generar Standalone_Component que utilicen la API moderna de Angular 19+: signals, control flow syntax (@if, @for, @switch), e inyección funcional (inject()).
3. THE Conversion_Engine SHALL incluir comentarios en el código generado que indiquen el mapeo realizado (por ejemplo: `// Convertido de useState → signal()`).
4. FOR ALL conversiones realizadas, el Artefacto_Angular generado SHALL ser código TypeScript sintácticamente válido que compile sin errores con la configuración estricta de TypeScript de Angular.
