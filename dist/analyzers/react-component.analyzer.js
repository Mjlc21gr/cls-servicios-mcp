/**
 * Analizador de componentes React usando Babel AST.
 * Extrae hooks, props, JSX, efectos y dependencias de UI.
 */
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';
import { inferTypeFromValue } from '../utils/type-mapper.utils.js';
// ESM compat: @babel/traverse exports default differently depending on bundler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const traverse = (_traverse.default ?? _traverse);
const UI_LIBRARY_PATTERNS = {
    '@mui/material': /^@mui\//,
    '@chakra-ui/react': /^@chakra-ui\//,
    'antd': /^antd/,
    '@angular/material': /^@angular\/material/,
    'tailwindcss': /tailwind/,
    'react-bootstrap': /^react-bootstrap/,
    'primereact': /^primereact/,
};
export function analyzeReactComponent(sourceCode, fileName) {
    const ast = parse(sourceCode, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript', 'decorators-legacy'],
    });
    const stateHooks = [];
    const effects = [];
    const props = [];
    const callbacks = [];
    const memos = [];
    const refs = [];
    const contexts = [];
    const uiLibraries = [];
    const imports = [];
    const customHooks = [];
    let componentName = 'UnknownComponent';
    let isDefaultExport = false;
    let jsxTemplate = '';
    traverse(ast, {
        // Capturar imports
        ImportDeclaration(path) {
            const source = path.node.source.value;
            imports.push(source);
            // Detectar librerías de UI
            for (const [libName, pattern] of Object.entries(UI_LIBRARY_PATTERNS)) {
                if (pattern.test(source)) {
                    const components = path.node.specifiers
                        .filter((s) => t.isImportSpecifier(s))
                        .map((s) => (t.isIdentifier(s.imported) ? s.imported.name : ''));
                    const existing = uiLibraries.find((u) => u.library === libName);
                    if (existing) {
                        existing.components.push(...components);
                    }
                    else {
                        uiLibraries.push({ library: libName, components, version: null });
                    }
                }
            }
        },
        // Detectar componentes funcionales
        VariableDeclarator(path) {
            if (!t.isIdentifier(path.node.id))
                return;
            const init = path.node.init;
            // const Component = () => { ... } o React.FC
            if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) {
                const name = path.node.id.name;
                if (/^[A-Z]/.test(name)) {
                    componentName = name;
                    extractPropsFromParams(init.params, props);
                }
            }
        },
        // function Component() { ... }
        FunctionDeclaration(path) {
            if (path.node.id && /^[A-Z]/.test(path.node.id.name)) {
                componentName = path.node.id.name;
                extractPropsFromParams(path.node.params, props);
            }
        },
        // export default
        ExportDefaultDeclaration() {
            isDefaultExport = true;
        },
        // Detectar hooks
        CallExpression(path) {
            if (!t.isIdentifier(path.node.callee))
                return;
            const hookName = path.node.callee.name;
            switch (hookName) {
                case 'useState':
                    extractUseState(path.node, stateHooks);
                    break;
                case 'useEffect':
                    extractUseEffect(path.node, effects, sourceCode);
                    break;
                case 'useCallback':
                    extractUseCallback(path.node, callbacks, sourceCode);
                    break;
                case 'useMemo':
                    extractUseMemo(path.node, memos, sourceCode);
                    break;
                case 'useRef':
                    extractUseRef(path.node, refs);
                    break;
                case 'useContext':
                    extractUseContext(path, contexts);
                    break;
                default:
                    if (/^use[A-Z]/.test(hookName) && !['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useContext', 'useReducer'].includes(hookName)) {
                        customHooks.push(hookName);
                    }
            }
        },
        // Capturar JSX de retorno
        ReturnStatement(path) {
            if (t.isJSXElement(path.node.argument) || t.isJSXFragment(path.node.argument)) {
                const start = path.node.argument.start ?? 0;
                const end = path.node.argument.end ?? 0;
                jsxTemplate = sourceCode.slice(start, end);
            }
        },
    });
    return {
        componentName,
        fileName,
        isDefaultExport,
        props,
        stateHooks,
        effects,
        callbacks,
        memos,
        refs,
        contexts,
        uiLibraries,
        jsxTemplate,
        imports,
        customHooks,
    };
}
// --- Extractores de hooks ---
function extractPropsFromParams(params, props) {
    if (params.length === 0)
        return;
    const firstParam = params[0];
    // Destructured props: ({ name, age }: Props)
    if (t.isObjectPattern(firstParam)) {
        for (const prop of firstParam.properties) {
            if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                const typeAnnotation = getTypeAnnotation(prop.value);
                props.push({
                    name: prop.key.name,
                    type: typeAnnotation,
                    required: !t.isAssignmentPattern(prop.value),
                    defaultValue: t.isAssignmentPattern(prop.value)
                        ? extractNodeSource(prop.value.right)
                        : null,
                });
            }
        }
    }
    // Interface/Type props via type annotation
    if (t.isIdentifier(firstParam) && firstParam.typeAnnotation) {
        if (t.isTSTypeAnnotation(firstParam.typeAnnotation)) {
            const typeRef = firstParam.typeAnnotation.typeAnnotation;
            if (t.isTSTypeReference(typeRef) && t.isIdentifier(typeRef.typeName)) {
                props.push({
                    name: '_propsInterface',
                    type: typeRef.typeName.name,
                    required: true,
                    defaultValue: null,
                });
            }
        }
    }
}
function extractUseState(node, stateHooks) {
    const parent = node._parentPath?.node;
    // Intentar obtener del contexto de VariableDeclarator
    const args = node.arguments;
    const initialValue = args.length > 0 ? extractNodeSource(args[0]) : 'undefined';
    const type = args.length > 0 ? inferTypeFromValue(initialValue) : 'unknown';
    // El nombre se extrae del patrón de destructuración [name, setName]
    // Esto se maneja a nivel de traverse, aquí solo registramos el valor
    stateHooks.push({
        name: `state_${stateHooks.length}`,
        setter: `setState_${stateHooks.length}`,
        initialValue,
        type,
    });
}
function extractUseEffect(node, effects, source) {
    const callback = node.arguments[0];
    const deps = node.arguments[1];
    let dependencies = [];
    let isOnMount = false;
    let isOnDestroy = false;
    if (t.isArrayExpression(deps)) {
        dependencies = deps.elements
            .filter((el) => t.isIdentifier(el))
            .map((el) => el.name);
        isOnMount = deps.elements.length === 0;
    }
    let body = '';
    let hasCleanup = false;
    if (t.isArrowFunctionExpression(callback) || t.isFunctionExpression(callback)) {
        const start = callback.body.start ?? 0;
        const end = callback.body.end ?? 0;
        body = source.slice(start, end);
        // Detectar cleanup (return function)
        if (t.isBlockStatement(callback.body)) {
            const lastStmt = callback.body.body[callback.body.body.length - 1];
            if (t.isReturnStatement(lastStmt) && lastStmt.argument) {
                hasCleanup = true;
                isOnDestroy = isOnMount; // [] con cleanup = mount + destroy
            }
        }
    }
    effects.push({ dependencies, hasCleanup, body, isOnMount, isOnDestroy });
}
function extractUseCallback(node, callbacks, source) {
    const callback = node.arguments[0];
    const deps = node.arguments[1];
    let dependencies = [];
    if (t.isArrayExpression(deps)) {
        dependencies = deps.elements
            .filter((el) => t.isIdentifier(el))
            .map((el) => el.name);
    }
    let params = [];
    let body = '';
    if (t.isArrowFunctionExpression(callback) || t.isFunctionExpression(callback)) {
        params = callback.params
            .filter((p) => t.isIdentifier(p))
            .map((p) => p.name);
        const start = callback.body.start ?? 0;
        const end = callback.body.end ?? 0;
        body = source.slice(start, end);
    }
    callbacks.push({
        name: `callback_${callbacks.length}`,
        params,
        body,
        dependencies,
    });
}
function extractUseMemo(node, memos, source) {
    const factory = node.arguments[0];
    const deps = node.arguments[1];
    let dependencies = [];
    if (t.isArrayExpression(deps)) {
        dependencies = deps.elements
            .filter((el) => t.isIdentifier(el))
            .map((el) => el.name);
    }
    let computation = '';
    if (t.isArrowFunctionExpression(factory) || t.isFunctionExpression(factory)) {
        const start = factory.body.start ?? 0;
        const end = factory.body.end ?? 0;
        computation = source.slice(start, end);
    }
    memos.push({
        name: `memo_${memos.length}`,
        computation,
        dependencies,
        type: 'unknown',
    });
}
function extractUseRef(node, refs) {
    const args = node.arguments;
    const initialValue = args.length > 0 ? extractNodeSource(args[0]) : 'null';
    const type = args.length > 0 ? inferTypeFromValue(initialValue) : 'unknown';
    refs.push({
        name: `ref_${refs.length}`,
        initialValue,
        type,
    });
}
function extractUseContext(path, contexts) {
    const args = path.node.arguments;
    if (args.length > 0 && t.isIdentifier(args[0])) {
        contexts.push({
            contextName: args[0].name,
            variableName: `context_${contexts.length}`,
        });
    }
}
function getTypeAnnotation(node) {
    if (t.isIdentifier(node) && node.typeAnnotation) {
        if (t.isTSTypeAnnotation(node.typeAnnotation)) {
            return extractTSType(node.typeAnnotation.typeAnnotation);
        }
    }
    if (t.isAssignmentPattern(node)) {
        return getTypeAnnotation(node.left);
    }
    return 'unknown';
}
function extractTSType(node) {
    if (t.isTSStringKeyword(node))
        return 'string';
    if (t.isTSNumberKeyword(node))
        return 'number';
    if (t.isTSBooleanKeyword(node))
        return 'boolean';
    if (t.isTSAnyKeyword(node))
        return 'unknown'; // Prohibido any → unknown
    if (t.isTSVoidKeyword(node))
        return 'void';
    if (t.isTSTypeReference(node) && t.isIdentifier(node.typeName)) {
        return node.typeName.name;
    }
    if (t.isTSArrayType(node)) {
        return `${extractTSType(node.elementType)}[]`;
    }
    return 'unknown';
}
function extractNodeSource(node) {
    if (t.isStringLiteral(node))
        return `'${node.value}'`;
    if (t.isNumericLiteral(node))
        return String(node.value);
    if (t.isBooleanLiteral(node))
        return String(node.value);
    if (t.isNullLiteral(node))
        return 'null';
    if (t.isIdentifier(node))
        return node.name;
    if (t.isArrayExpression(node))
        return '[]';
    if (t.isObjectExpression(node))
        return '{}';
    return 'undefined';
}
//# sourceMappingURL=react-component.analyzer.js.map