import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import type { NodePath, Node } from '@babel/traverse';
import type * as t from '@babel/types';
import {
  ComponentIR,
  PropDefinition,
  StateDefinition,
  EffectDefinition,
  MemoDefinition,
  CallbackDefinition,
  RefDefinition,
  ContextDefinition,
  CustomHookDefinition,
  MethodDefinition,
  JSXNode,
  JSXAttribute,
  JSXExpression,
  TypeInterfaceDefinition,
  SecurityWarning,
  ParameterDefinition,
} from '../types.js';

// Handle default export interop for @babel/traverse
const traverse = (typeof _traverse === 'function' ? _traverse : (_traverse as any).default) as typeof _traverse;

// Built-in React hooks
const BUILTIN_HOOKS = new Set([
  'useState', 'useEffect', 'useMemo', 'useCallback',
  'useRef', 'useContext', 'useReducer', 'useLayoutEffect',
  'useImperativeHandle', 'useDebugValue', 'useDeferredValue',
  'useTransition', 'useId', 'useSyncExternalStore',
  'useInsertionEffect', 'useOptimistic', 'useActionState',
  'useFormStatus',
]);

// Security patterns to detect
const SECURITY_PATTERNS: { pattern: RegExp; name: string; message: string; severity: 'warning' | 'error' }[] = [
  {
    pattern: /dangerouslySetInnerHTML/,
    name: 'dangerouslySetInnerHTML',
    message: 'Usage of dangerouslySetInnerHTML detected — will be converted to [innerHTML] with DomSanitizer',
    severity: 'warning',
  },
  {
    pattern: /\beval\s*\(/,
    name: 'eval',
    message: 'Usage of eval() detected in render context — this is a security risk',
    severity: 'error',
  },
  {
    pattern: /document\.write\s*\(/,
    name: 'document.write',
    message: 'Usage of document.write detected — this is unsafe and should be avoided',
    severity: 'warning',
  },
];


/**
 * Converts a PascalCase component name to kebab-case file name.
 * e.g., MyComponent → my-component
 */
function toKebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * Extracts source code for a given AST node from the original source.
 */
function getSourceCode(node: Node, sourceCode: string): string {
  if (node.start != null && node.end != null) {
    return sourceCode.slice(node.start, node.end);
  }
  return '';
}

/**
 * Converts a TypeScript type annotation AST node to a string representation.
 */
function typeAnnotationToString(annotation: t.TSTypeAnnotation | t.TypeAnnotation | t.Noop | null | undefined, sourceCode: string): string {
  if (!annotation || annotation.type === 'Noop') return 'any';
  if (annotation.type === 'TSTypeAnnotation') {
    return getSourceCode(annotation.typeAnnotation, sourceCode) || 'any';
  }
  return 'any';
}

/**
 * Converts a type parameter to string.
 */
function typeParamToString(typeParam: t.TSType | undefined, sourceCode: string): string {
  if (!typeParam) return 'any';
  return getSourceCode(typeParam, sourceCode) || 'any';
}

/**
 * Detects security warnings in source code by line.
 */
function detectSecurityWarnings(sourceCode: string): SecurityWarning[] {
  const warnings: SecurityWarning[] = [];
  const lines = sourceCode.split('\n');

  for (let i = 0; i < lines.length; i++) {
    for (const { pattern, name, message, severity } of SECURITY_PATTERNS) {
      if (pattern.test(lines[i])) {
        warnings.push({
          line: i + 1,
          pattern: name,
          message,
          severity,
        });
      }
    }
  }

  return warnings;
}

/**
 * Checks if an identifier is PascalCase (starts with uppercase letter).
 */
function isPascalCase(name: string): boolean {
  return /^[A-Z]/.test(name);
}


/**
 * Converts a JSX element AST node to a JSXNode IR representation.
 */
function convertJSXElement(node: t.JSXElement, sourceCode: string, importedComponents: Set<string>): JSXNode {
  const opening = node.openingElement;
  let tag = '';

  if (opening.name.type === 'JSXIdentifier') {
    tag = opening.name.name;
  } else if (opening.name.type === 'JSXMemberExpression') {
    tag = getSourceCode(opening.name, sourceCode);
  } else if (opening.name.type === 'JSXNamespacedName') {
    tag = `${opening.name.namespace.name}:${opening.name.name.name}`;
  }

  const attributes: JSXAttribute[] = opening.attributes
    .filter((attr): attr is t.JSXAttribute => attr.type === 'JSXAttribute')
    .map(attr => convertJSXAttribute(attr, sourceCode));

  const children = convertJSXChildren(node.children, sourceCode, importedComponents);

  return {
    tag,
    attributes,
    children,
    isComponent: isPascalCase(tag) && importedComponents.has(tag),
  };
}

/**
 * Converts a JSX attribute AST node to a JSXAttribute IR.
 */
function convertJSXAttribute(attr: t.JSXAttribute, sourceCode: string): JSXAttribute {
  const name = attr.name.type === 'JSXIdentifier'
    ? attr.name.name
    : `${attr.name.namespace.name}:${attr.name.name.name}`;

  const isEventHandler = /^on[A-Z]/.test(name);

  if (!attr.value) {
    // Boolean attribute like <input disabled />
    return { name, value: 'true', isEventHandler, isDynamic: false };
  }

  if (attr.value.type === 'StringLiteral') {
    return { name, value: attr.value.value, isEventHandler, isDynamic: false };
  }

  if (attr.value.type === 'JSXExpressionContainer') {
    const expr = attr.value.expression;
    if (expr.type === 'JSXEmptyExpression') {
      return { name, value: '', isEventHandler, isDynamic: true };
    }
    const exprSource = getSourceCode(expr, sourceCode);
    return { name, value: exprSource, isEventHandler, isDynamic: true };
  }

  if (attr.value.type === 'JSXElement') {
    return { name, value: getSourceCode(attr.value, sourceCode), isEventHandler, isDynamic: true };
  }

  return { name, value: getSourceCode(attr.value, sourceCode), isEventHandler, isDynamic: true };
}

/**
 * Converts JSX children to an array of JSXNode | JSXExpression | string.
 */
function convertJSXChildren(
  children: t.JSXElement['children'],
  sourceCode: string,
  importedComponents: Set<string>,
): (JSXNode | JSXExpression | string)[] {
  const result: (JSXNode | JSXExpression | string)[] = [];

  for (const child of children) {
    if (child.type === 'JSXText') {
      const text = child.value.trim();
      if (text) {
        result.push(text);
      }
    } else if (child.type === 'JSXElement') {
      result.push(convertJSXElement(child, sourceCode, importedComponents));
    } else if (child.type === 'JSXFragment') {
      // Flatten fragment children
      result.push(...convertJSXChildren(child.children, sourceCode, importedComponents));
    } else if (child.type === 'JSXExpressionContainer') {
      const expr = child.expression;
      if (expr.type === 'JSXEmptyExpression') continue;
      const jsxExpr = convertJSXExpression(expr, sourceCode, importedComponents);
      if (jsxExpr) {
        result.push(jsxExpr);
      }
    } else if (child.type === 'JSXSpreadChild') {
      result.push({
        type: 'interpolation',
        expression: getSourceCode(child.expression, sourceCode),
      });
    }
  }

  return result;
}


/**
 * Converts a JSX expression to a JSXExpression IR.
 */
function convertJSXExpression(
  expr: t.Expression,
  sourceCode: string,
  importedComponents: Set<string>,
): JSXExpression | null {
  // Ternary: cond ? <A/> : <B/>
  if (expr.type === 'ConditionalExpression') {
    const condition = getSourceCode(expr.test, sourceCode);
    const consequentChildren = extractJSXFromExpression(expr.consequent, sourceCode, importedComponents);
    const alternateChildren = extractJSXFromExpression(expr.alternate, sourceCode, importedComponents);

    return {
      type: 'ternary',
      expression: condition,
      children: consequentChildren.length > 0 ? consequentChildren : undefined,
      alternate: alternateChildren.length > 0 ? alternateChildren : undefined,
    };
  }

  // Logical AND: cond && <X/>
  if (expr.type === 'LogicalExpression' && expr.operator === '&&') {
    const condition = getSourceCode(expr.left, sourceCode);
    const children = extractJSXFromExpression(expr.right, sourceCode, importedComponents);

    return {
      type: 'conditional',
      expression: condition,
      children: children.length > 0 ? children : undefined,
    };
  }

  // .map() call: arr.map(x => <X/>)
  if (
    expr.type === 'CallExpression' &&
    expr.callee.type === 'MemberExpression' &&
    expr.callee.property.type === 'Identifier' &&
    expr.callee.property.name === 'map'
  ) {
    const arrayExpr = getSourceCode(expr.callee.object, sourceCode);
    const mapCallback = expr.arguments[0];
    let children: JSXNode[] = [];

    if (mapCallback && (mapCallback.type === 'ArrowFunctionExpression' || mapCallback.type === 'FunctionExpression')) {
      const body = mapCallback.body;
      if (body.type === 'JSXElement') {
        children = [convertJSXElement(body, sourceCode, importedComponents)];
      } else if (body.type === 'BlockStatement') {
        // Look for return statement with JSX
        for (const stmt of body.body) {
          if (stmt.type === 'ReturnStatement' && stmt.argument?.type === 'JSXElement') {
            children = [convertJSXElement(stmt.argument, sourceCode, importedComponents)];
            break;
          }
          if (stmt.type === 'ReturnStatement' && stmt.argument?.type === 'ParenthesizedExpression') {
            const inner = stmt.argument.expression;
            if (inner.type === 'JSXElement') {
              children = [convertJSXElement(inner, sourceCode, importedComponents)];
              break;
            }
          }
        }
      } else if (body.type === 'ParenthesizedExpression' && body.expression.type === 'JSXElement') {
        children = [convertJSXElement(body.expression, sourceCode, importedComponents)];
      }
    }

    return {
      type: 'map',
      expression: arrayExpr,
      children: children.length > 0 ? children : undefined,
    };
  }

  // Default: interpolation
  return {
    type: 'interpolation',
    expression: getSourceCode(expr, sourceCode),
  };
}

/**
 * Extracts JSXNode[] from an expression (handles JSXElement, JSXFragment, parenthesized).
 */
function extractJSXFromExpression(
  expr: t.Expression,
  sourceCode: string,
  importedComponents: Set<string>,
): JSXNode[] {
  if (expr.type === 'JSXElement') {
    return [convertJSXElement(expr, sourceCode, importedComponents)];
  }
  if (expr.type === 'JSXFragment') {
    const result: JSXNode[] = [];
    for (const child of expr.children) {
      if (child.type === 'JSXElement') {
        result.push(convertJSXElement(child, sourceCode, importedComponents));
      }
    }
    return result;
  }
  if (expr.type === 'ParenthesizedExpression') {
    return extractJSXFromExpression(expr.expression, sourceCode, importedComponents);
  }
  return [];
}


/**
 * Extracts parameters from a function's params for ParameterDefinition[].
 */
function extractParameters(params: (t.Identifier | t.Pattern | t.RestElement)[], sourceCode: string): ParameterDefinition[] {
  const result: ParameterDefinition[] = [];
  for (const param of params) {
    if (param.type === 'Identifier') {
      result.push({
        name: param.name,
        type: typeAnnotationToString(param.typeAnnotation as t.TSTypeAnnotation | null, sourceCode),
      });
    } else if (param.type === 'RestElement' && param.argument.type === 'Identifier') {
      result.push({
        name: `...${param.argument.name}`,
        type: typeAnnotationToString(param.argument.typeAnnotation as t.TSTypeAnnotation | null, sourceCode),
      });
    }
  }
  return result;
}

/**
 * Extracts props from a component function's parameters.
 * Handles: (props: MyProps), ({ name, age }: MyProps), ({ name = 'default' })
 */
function extractProps(
  params: (t.Identifier | t.Pattern | t.RestElement)[],
  sourceCode: string,
  typeInterfaces: TypeInterfaceDefinition[],
  ast: t.File,
): PropDefinition[] {
  if (params.length === 0) return [];

  const firstParam = params[0];
  const props: PropDefinition[] = [];

  // Get the type annotation from the parameter
  let propsTypeName: string | null = null;

  if (firstParam.type === 'Identifier' && firstParam.typeAnnotation) {
    const typeAnn = firstParam.typeAnnotation;
    if (typeAnn.type === 'TSTypeAnnotation') {
      const tsType = typeAnn.typeAnnotation;
      if (tsType.type === 'TSTypeReference' && tsType.typeName.type === 'Identifier') {
        propsTypeName = tsType.typeName.name;
      }
    }
  }

  if (firstParam.type === 'ObjectPattern') {
    // Check type annotation on the object pattern
    if (firstParam.typeAnnotation && firstParam.typeAnnotation.type === 'TSTypeAnnotation') {
      const tsType = firstParam.typeAnnotation.typeAnnotation;
      if (tsType.type === 'TSTypeReference' && tsType.typeName.type === 'Identifier') {
        propsTypeName = tsType.typeName.name;
      }
    }

    // Extract individual props from destructuring
    for (const prop of firstParam.properties) {
      if (prop.type === 'ObjectProperty') {
        const key = prop.key;
        let name = '';
        if (key.type === 'Identifier') {
          name = key.name;
        } else if (key.type === 'StringLiteral') {
          name = key.value;
        }

        let type = 'any';
        let defaultValue: string | undefined;
        let isRequired = true;

        // Check if value is an AssignmentPattern (has default value)
        if (prop.value.type === 'AssignmentPattern') {
          isRequired = false;
          defaultValue = getSourceCode(prop.value.right, sourceCode);
          // Type from the left side
          if (prop.value.left.type === 'Identifier' && prop.value.left.typeAnnotation) {
            type = typeAnnotationToString(prop.value.left.typeAnnotation as t.TSTypeAnnotation, sourceCode);
          }
        } else if (prop.value.type === 'Identifier' && prop.value.typeAnnotation) {
          type = typeAnnotationToString(prop.value.typeAnnotation as t.TSTypeAnnotation, sourceCode);
        }

        // If we have a props type name, try to find the type from the interface
        if (propsTypeName && type === 'any') {
          type = findPropTypeFromInterface(propsTypeName, name, ast, sourceCode) || 'any';
        }

        // Check optionality from the interface/type definition if we have one
        if (propsTypeName && isRequired) {
          const isOptionalInInterface = isPropOptionalInInterface(propsTypeName, name, ast);
          if (isOptionalInInterface) {
            isRequired = false;
          }
        }

        props.push({ name, type, defaultValue, isRequired });
      }
    }
  } else if (firstParam.type === 'Identifier' && propsTypeName) {
    // props: MyProps — extract from the interface definition
    const interfaceProps = extractPropsFromInterface(propsTypeName, ast, sourceCode);
    props.push(...interfaceProps);
  }

  // Collect type interface definitions
  if (propsTypeName) {
    collectTypeInterface(propsTypeName, ast, sourceCode, typeInterfaces);
  }

  return props;
}

/**
 * Finds a prop type from an interface/type definition in the AST.
 */
function findPropTypeFromInterface(interfaceName: string, propName: string, ast: t.File, sourceCode: string): string | null {
  for (const node of ast.program.body) {
    if (node.type === 'TSInterfaceDeclaration' && node.id.name === interfaceName) {
      for (const member of node.body.body) {
        if (member.type === 'TSPropertySignature' && member.key.type === 'Identifier' && member.key.name === propName) {
          if (member.typeAnnotation && member.typeAnnotation.type === 'TSTypeAnnotation') {
            return getSourceCode(member.typeAnnotation.typeAnnotation, sourceCode);
          }
        }
      }
    }
    if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'TSInterfaceDeclaration' && node.declaration.id.name === interfaceName) {
      for (const member of node.declaration.body.body) {
        if (member.type === 'TSPropertySignature' && member.key.type === 'Identifier' && member.key.name === propName) {
          if (member.typeAnnotation && member.typeAnnotation.type === 'TSTypeAnnotation') {
            return getSourceCode(member.typeAnnotation.typeAnnotation, sourceCode);
          }
        }
      }
    }
    if (node.type === 'TSTypeAliasDeclaration' && node.id.name === interfaceName) {
      if (node.typeAnnotation.type === 'TSTypeLiteral') {
        for (const member of node.typeAnnotation.members) {
          if (member.type === 'TSPropertySignature' && member.key.type === 'Identifier' && member.key.name === propName) {
            if (member.typeAnnotation && member.typeAnnotation.type === 'TSTypeAnnotation') {
              return getSourceCode(member.typeAnnotation.typeAnnotation, sourceCode);
            }
          }
        }
      }
    }
  }
  return null;
}


/**
 * Checks if a prop is optional in an interface/type definition.
 */
function isPropOptionalInInterface(interfaceName: string, propName: string, ast: t.File): boolean {
  for (const node of ast.program.body) {
    const decl = node.type === 'ExportNamedDeclaration' ? node.declaration : node;
    if (!decl) continue;

    if (decl.type === 'TSInterfaceDeclaration' && decl.id.name === interfaceName) {
      for (const member of decl.body.body) {
        if (member.type === 'TSPropertySignature' && member.key.type === 'Identifier' && member.key.name === propName) {
          return !!member.optional;
        }
      }
    }

    if (decl.type === 'TSTypeAliasDeclaration' && decl.id.name === interfaceName) {
      if (decl.typeAnnotation.type === 'TSTypeLiteral') {
        for (const member of decl.typeAnnotation.members) {
          if (member.type === 'TSPropertySignature' && member.key.type === 'Identifier' && member.key.name === propName) {
            return !!member.optional;
          }
        }
      }
    }
  }
  return false;
}

/**
 * Extracts props from an interface/type definition.
 */
function extractPropsFromInterface(interfaceName: string, ast: t.File, sourceCode: string): PropDefinition[] {
  const props: PropDefinition[] = [];

  for (const node of ast.program.body) {
    const decl = node.type === 'ExportNamedDeclaration' ? node.declaration : node;
    if (!decl) continue;

    if (decl.type === 'TSInterfaceDeclaration' && decl.id.name === interfaceName) {
      for (const member of decl.body.body) {
        if (member.type === 'TSPropertySignature' && member.key.type === 'Identifier') {
          const type = member.typeAnnotation?.type === 'TSTypeAnnotation'
            ? getSourceCode(member.typeAnnotation.typeAnnotation, sourceCode)
            : 'any';
          props.push({
            name: member.key.name,
            type: type || 'any',
            isRequired: !member.optional,
          });
        }
      }
    }

    if (decl.type === 'TSTypeAliasDeclaration' && decl.id.name === interfaceName) {
      if (decl.typeAnnotation.type === 'TSTypeLiteral') {
        for (const member of decl.typeAnnotation.members) {
          if (member.type === 'TSPropertySignature' && member.key.type === 'Identifier') {
            const type = member.typeAnnotation?.type === 'TSTypeAnnotation'
              ? getSourceCode(member.typeAnnotation.typeAnnotation, sourceCode)
              : 'any';
            props.push({
              name: member.key.name,
              type: type || 'any',
              isRequired: !member.optional,
            });
          }
        }
      }
    }
  }

  return props;
}

/**
 * Collects a type interface definition from the AST.
 */
function collectTypeInterface(name: string, ast: t.File, sourceCode: string, typeInterfaces: TypeInterfaceDefinition[]): void {
  // Avoid duplicates
  if (typeInterfaces.some(ti => ti.name === name)) return;

  for (const node of ast.program.body) {
    const decl = node.type === 'ExportNamedDeclaration' ? node.declaration : node;
    if (!decl) continue;

    if (
      (decl.type === 'TSInterfaceDeclaration' && decl.id.name === name) ||
      (decl.type === 'TSTypeAliasDeclaration' && decl.id.name === name)
    ) {
      typeInterfaces.push({
        name,
        body: getSourceCode(decl, sourceCode),
      });
      return;
    }
  }
}

/**
 * Checks if a function body contains JSX return.
 */
function hasJSXReturn(body: t.BlockStatement | t.Expression): boolean {
  if (body.type !== 'BlockStatement') {
    return body.type === 'JSXElement' || body.type === 'JSXFragment';
  }

  for (const stmt of body.body) {
    if (stmt.type === 'ReturnStatement' && stmt.argument) {
      const arg = stmt.argument;
      if (arg.type === 'JSXElement' || arg.type === 'JSXFragment') return true;
      if (arg.type === 'ParenthesizedExpression') {
        const inner = arg.expression;
        if (inner.type === 'JSXElement' || inner.type === 'JSXFragment') return true;
      }
    }
  }
  return false;
}

/**
 * Finds the JSX return expression from a function body.
 */
function findJSXReturn(body: t.BlockStatement | t.Expression): t.JSXElement | t.JSXFragment | null {
  if (body.type !== 'BlockStatement') {
    if (body.type === 'JSXElement' || body.type === 'JSXFragment') return body;
    return null;
  }

  for (const stmt of body.body) {
    if (stmt.type === 'ReturnStatement' && stmt.argument) {
      const arg = stmt.argument;
      if (arg.type === 'JSXElement' || arg.type === 'JSXFragment') return arg;
      if (arg.type === 'ParenthesizedExpression') {
        const inner = arg.expression;
        if (inner.type === 'JSXElement' || inner.type === 'JSXFragment') return inner;
      }
    }
  }
  return null;
}


/**
 * Parses a React component source code and extracts a ComponentIR.
 *
 * @param sourceCode - The React JSX/TSX source code
 * @returns ComponentIR with all AST_Parser fields populated
 * @throws Error if the source code has invalid JSX syntax (with line number)
 * @throws Error if no valid React component is found
 */
export function parseReactComponent(sourceCode: string): ComponentIR {
  // 1. Parse the source code with Babel
  let ast: t.File;
  try {
    ast = parse(sourceCode, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: false,
    });
  } catch (err: any) {
    const line = err.loc?.line ?? 0;
    const message = err.message || 'Unknown syntax error';
    throw new Error(`Syntax error at line ${line}: ${message}`);
  }

  // 2. Collect imported PascalCase identifiers (potential child components)
  const importedIdentifiers = new Map<string, string>(); // name → source
  const importedComponents = new Set<string>();

  for (const node of ast.program.body) {
    if (node.type === 'ImportDeclaration') {
      for (const specifier of node.specifiers) {
        const localName = specifier.local.name;
        if (isPascalCase(localName)) {
          importedIdentifiers.set(localName, node.source.value);
          importedComponents.add(localName);
        }
      }
    }
  }

  // 3. Find the exported React component function
  let componentName = '';
  let componentFunction: t.FunctionDeclaration | t.ArrowFunctionExpression | t.FunctionExpression | null = null;
  let componentParams: (t.Identifier | t.Pattern | t.RestElement)[] = [];

  // Check for: export default function MyComponent(...)
  // Check for: export function MyComponent(...)
  // Check for: export default MyComponent (where MyComponent is defined elsewhere)
  // Check for: const MyComponent = (...) => { ... }; export default MyComponent;

  for (const node of ast.program.body) {
    if (node.type === 'ExportDefaultDeclaration') {
      const decl = node.declaration;
      if (decl.type === 'FunctionDeclaration' && decl.id) {
        if (hasJSXReturn(decl.body)) {
          componentName = decl.id.name;
          componentFunction = decl;
          componentParams = decl.params;
          break;
        }
      } else if (decl.type === 'ArrowFunctionExpression' || decl.type === 'FunctionExpression') {
        if (hasJSXReturn(decl.body)) {
          componentFunction = decl;
          componentParams = decl.params;
          // Try to infer name from variable
          componentName = 'DefaultComponent';
          break;
        }
      } else if (decl.type === 'Identifier') {
        // export default MyComponent — find the declaration
        const name = decl.name;
        const found = findFunctionDeclaration(name, ast);
        if (found && hasJSXReturn(found.body)) {
          componentName = name;
          componentFunction = found;
          componentParams = found.params;
          break;
        }
      }
    }

    if (node.type === 'ExportNamedDeclaration') {
      const decl = node.declaration;
      if (decl?.type === 'FunctionDeclaration' && decl.id) {
        if (hasJSXReturn(decl.body)) {
          componentName = decl.id.name;
          componentFunction = decl;
          componentParams = decl.params;
          // Don't break — prefer default export if found later
        }
      }
      if (decl?.type === 'VariableDeclaration') {
        for (const declarator of decl.declarations) {
          if (declarator.id.type === 'Identifier' && declarator.init) {
            const init = declarator.init;
            if (
              (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') &&
              hasJSXReturn(init.body)
            ) {
              componentName = declarator.id.name;
              componentFunction = init;
              componentParams = init.params;
            }
          }
        }
      }
    }
  }

  if (!componentFunction || !componentName) {
    throw new Error('No valid React component found: no export of a function that returns JSX');
  }

  // 4. Extract component data by traversing the function body
  const state: StateDefinition[] = [];
  const effects: EffectDefinition[] = [];
  const memos: MemoDefinition[] = [];
  const callbacks: CallbackDefinition[] = [];
  const refs: RefDefinition[] = [];
  const contexts: ContextDefinition[] = [];
  const customHooks: CustomHookDefinition[] = [];
  const methods: MethodDefinition[] = [];
  const typeInterfaces: TypeInterfaceDefinition[] = [];
  const childComponentsUsed = new Set<string>();

  // Extract props
  const props = extractProps(componentParams, sourceCode, typeInterfaces, ast);

  // Traverse the component function body
  const functionBody = componentFunction.body;
  if (functionBody.type === 'BlockStatement') {
    for (const stmt of functionBody.body) {
      processStatement(stmt, sourceCode, state, effects, memos, callbacks, refs, contexts, customHooks, methods, ast, typeInterfaces);
    }
  }

  // 5. Build JSX tree
  const jsxReturn = findJSXReturn(componentFunction.body);
  let jsxTree: JSXNode;

  if (jsxReturn) {
    if (jsxReturn.type === 'JSXElement') {
      jsxTree = convertJSXElement(jsxReturn, sourceCode, importedComponents);
    } else {
      // JSXFragment — wrap in a virtual fragment node
      jsxTree = {
        tag: 'Fragment',
        attributes: [],
        children: convertJSXChildren(jsxReturn.children, sourceCode, importedComponents),
        isComponent: false,
      };
    }
  } else {
    jsxTree = { tag: 'div', attributes: [], children: [], isComponent: false };
  }

  // 6. Detect child components used in JSX
  collectChildComponentsFromJSX(jsxTree, importedComponents, childComponentsUsed);

  // 7. Detect security warnings
  const securityWarnings = detectSecurityWarnings(sourceCode);

  // 8. Collect all type interfaces referenced in the file
  collectAllTypeInterfaces(ast, sourceCode, typeInterfaces);

  // 9. Build and return the ComponentIR
  return {
    componentName,
    fileName: toKebabCase(componentName),
    props,
    state,
    effects,
    memos,
    callbacks,
    refs,
    contexts,
    customHooks,
    methods,
    childComponents: Array.from(childComponentsUsed),
    jsxTree,
    typeInterfaces,

    // Angular-side fields — initialized empty (populated by State_Mapper)
    angularSignals: [],
    angularEffects: [],
    angularComputed: [],
    angularInjections: [],
    angularServices: [],
    angularViewChildren: [],
    classProperties: [],
    componentMethods: [],

    // Template fields — initialized empty (populated by Template_Generator)
    angularTemplate: '',
    isInlineTemplate: true,
    templateBindings: [],

    // PrimeNG fields — initialized empty (populated by PrimeNG_Mapper)
    primeNgImports: [],
    securityWarnings,
  };
}


/**
 * Finds a function declaration or variable-assigned function by name in the AST.
 */
function findFunctionDeclaration(
  name: string,
  ast: t.File,
): t.FunctionDeclaration | t.ArrowFunctionExpression | t.FunctionExpression | null {
  for (const node of ast.program.body) {
    if (node.type === 'FunctionDeclaration' && node.id?.name === name) {
      return node;
    }
    if (node.type === 'VariableDeclaration') {
      for (const decl of node.declarations) {
        if (decl.id.type === 'Identifier' && decl.id.name === name && decl.init) {
          if (decl.init.type === 'ArrowFunctionExpression' || decl.init.type === 'FunctionExpression') {
            return decl.init;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Processes a statement inside the component function body to extract hooks, methods, etc.
 */
function processStatement(
  stmt: t.Statement,
  sourceCode: string,
  state: StateDefinition[],
  effects: EffectDefinition[],
  memos: MemoDefinition[],
  callbacks: CallbackDefinition[],
  refs: RefDefinition[],
  contexts: ContextDefinition[],
  customHooks: CustomHookDefinition[],
  methods: MethodDefinition[],
  ast: t.File,
  typeInterfaces: TypeInterfaceDefinition[],
): void {
  // Variable declarations: const [x, setX] = useState(...), const ref = useRef(...), etc.
  if (stmt.type === 'VariableDeclaration') {
    for (const decl of stmt.declarations) {
      if (!decl.init || decl.init.type !== 'CallExpression') {
        // Check for function/arrow function methods
        if (decl.id.type === 'Identifier' && decl.init) {
          if (decl.init.type === 'ArrowFunctionExpression' || decl.init.type === 'FunctionExpression') {
            // Only add as method if it doesn't return JSX (not a sub-component)
            if (!hasJSXReturn(decl.init.body)) {
              methods.push({
                name: decl.id.name,
                parameters: extractParameters(decl.init.params, sourceCode),
                returnType: typeAnnotationToString(decl.init.returnType as t.TSTypeAnnotation | null, sourceCode),
                body: getSourceCode(decl.init.body, sourceCode),
              });
            }
          }
        }
        continue;
      }

      const callExpr = decl.init;
      const callee = callExpr.callee;
      let hookName = '';

      if (callee.type === 'Identifier') {
        hookName = callee.name;
      } else if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
        hookName = callee.property.name;
      }

      if (!hookName) continue;

      switch (hookName) {
        case 'useState':
          extractUseState(decl, callExpr, sourceCode, state);
          break;
        case 'useEffect':
        case 'useLayoutEffect':
          extractUseEffect(callExpr, sourceCode, effects);
          break;
        case 'useMemo':
          extractUseMemo(decl, callExpr, sourceCode, memos);
          break;
        case 'useCallback':
          extractUseCallback(decl, callExpr, sourceCode, callbacks);
          break;
        case 'useRef':
          extractUseRef(decl, callExpr, sourceCode, refs);
          break;
        case 'useContext':
          extractUseContext(decl, callExpr, sourceCode, contexts);
          break;
        default:
          // Custom hook: starts with "use" and not a built-in
          if (hookName.startsWith('use') && !BUILTIN_HOOKS.has(hookName)) {
            extractCustomHook(decl, callExpr, hookName, sourceCode, customHooks);
          }
          break;
      }
    }
  }

  // Function declarations inside the component
  if (stmt.type === 'FunctionDeclaration' && stmt.id) {
    if (!hasJSXReturn(stmt.body)) {
      methods.push({
        name: stmt.id.name,
        parameters: extractParameters(stmt.params, sourceCode),
        returnType: typeAnnotationToString(stmt.returnType as t.TSTypeAnnotation | null, sourceCode),
        body: getSourceCode(stmt.body, sourceCode),
      });
    }
  }

  // Expression statements: useEffect(() => {...}, [deps])
  if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'CallExpression') {
    const callExpr = stmt.expression;
    const callee = callExpr.callee;
    let hookName = '';

    if (callee.type === 'Identifier') {
      hookName = callee.name;
    }

    if (hookName === 'useEffect' || hookName === 'useLayoutEffect') {
      extractUseEffect(callExpr, sourceCode, effects);
    }
  }
}


/**
 * Extracts useState hook: const [value, setValue] = useState<Type>(initialValue)
 */
function extractUseState(
  decl: t.VariableDeclarator,
  callExpr: t.CallExpression,
  sourceCode: string,
  state: StateDefinition[],
): void {
  if (decl.id.type !== 'ArrayPattern' || decl.id.elements.length < 2) return;

  const [valueEl, setterEl] = decl.id.elements;
  if (!valueEl || valueEl.type !== 'Identifier') return;
  if (!setterEl || setterEl.type !== 'Identifier') return;

  const variableName = valueEl.name;
  const setterName = setterEl.name;

  // Extract type from generic: useState<string>(...)
  let type = 'any';
  if (callExpr.typeParameters && callExpr.typeParameters.type === 'TSTypeParameterInstantiation' && callExpr.typeParameters.params.length > 0) {
    type = typeParamToString(callExpr.typeParameters.params[0], sourceCode);
  }

  // Extract initial value
  let initialValue = '';
  if (callExpr.arguments.length > 0) {
    initialValue = getSourceCode(callExpr.arguments[0], sourceCode);
    // Infer type from initial value if not explicitly provided
    if (type === 'any') {
      type = inferTypeFromValue(callExpr.arguments[0]);
    }
  }

  state.push({ variableName, setterName, type, initialValue });
}

/**
 * Extracts useEffect hook: useEffect(() => { ... }, [dep1, dep2])
 */
function extractUseEffect(
  callExpr: t.CallExpression,
  sourceCode: string,
  effects: EffectDefinition[],
): void {
  if (callExpr.arguments.length === 0) return;

  const callback = callExpr.arguments[0];
  let body = '';
  let cleanupFunction: string | undefined;

  if (callback.type === 'ArrowFunctionExpression' || callback.type === 'FunctionExpression') {
    body = getSourceCode(callback.body, sourceCode);

    // Detect cleanup function (return statement in effect body)
    if (callback.body.type === 'BlockStatement') {
      for (const stmt of callback.body.body) {
        if (stmt.type === 'ReturnStatement' && stmt.argument) {
          cleanupFunction = getSourceCode(stmt.argument, sourceCode);
        }
      }
    }
  } else {
    body = getSourceCode(callback, sourceCode);
  }

  // Extract dependencies
  const dependencies: string[] = [];
  if (callExpr.arguments.length > 1) {
    const depsArg = callExpr.arguments[1];
    if (depsArg.type === 'ArrayExpression') {
      for (const el of depsArg.elements) {
        if (el) {
          dependencies.push(getSourceCode(el, sourceCode));
        }
      }
    }
  }

  effects.push({ body, dependencies, cleanupFunction });
}

/**
 * Extracts useMemo hook: const value = useMemo(() => compute(), [deps])
 */
function extractUseMemo(
  decl: t.VariableDeclarator,
  callExpr: t.CallExpression,
  sourceCode: string,
  memos: MemoDefinition[],
): void {
  if (decl.id.type !== 'Identifier') return;

  const variableName = decl.id.name;
  let type = 'any';

  if (callExpr.typeParameters && callExpr.typeParameters.type === 'TSTypeParameterInstantiation' && callExpr.typeParameters.params.length > 0) {
    type = typeParamToString(callExpr.typeParameters.params[0], sourceCode);
  }

  let computeFunction = '';
  if (callExpr.arguments.length > 0) {
    computeFunction = getSourceCode(callExpr.arguments[0], sourceCode);
  }

  const dependencies: string[] = [];
  if (callExpr.arguments.length > 1) {
    const depsArg = callExpr.arguments[1];
    if (depsArg.type === 'ArrayExpression') {
      for (const el of depsArg.elements) {
        if (el) dependencies.push(getSourceCode(el, sourceCode));
      }
    }
  }

  memos.push({ variableName, computeFunction, dependencies, type });
}

/**
 * Extracts useCallback hook: const handler = useCallback((e) => { ... }, [deps])
 */
function extractUseCallback(
  decl: t.VariableDeclarator,
  callExpr: t.CallExpression,
  sourceCode: string,
  callbacks: CallbackDefinition[],
): void {
  if (decl.id.type !== 'Identifier') return;

  const functionName = decl.id.name;
  let body = '';
  let parameters: ParameterDefinition[] = [];

  if (callExpr.arguments.length > 0) {
    const callback = callExpr.arguments[0];
    if (callback.type === 'ArrowFunctionExpression' || callback.type === 'FunctionExpression') {
      body = getSourceCode(callback.body, sourceCode);
      parameters = extractParameters(callback.params, sourceCode);
    } else {
      body = getSourceCode(callback, sourceCode);
    }
  }

  const dependencies: string[] = [];
  if (callExpr.arguments.length > 1) {
    const depsArg = callExpr.arguments[1];
    if (depsArg.type === 'ArrayExpression') {
      for (const el of depsArg.elements) {
        if (el) dependencies.push(getSourceCode(el, sourceCode));
      }
    }
  }

  callbacks.push({ functionName, body, parameters, dependencies });
}


/**
 * Extracts useRef hook: const ref = useRef<Type>(initialValue)
 */
function extractUseRef(
  decl: t.VariableDeclarator,
  callExpr: t.CallExpression,
  sourceCode: string,
  refs: RefDefinition[],
): void {
  if (decl.id.type !== 'Identifier') return;

  const variableName = decl.id.name;
  let type = 'any';

  if (callExpr.typeParameters && callExpr.typeParameters.type === 'TSTypeParameterInstantiation' && callExpr.typeParameters.params.length > 0) {
    type = typeParamToString(callExpr.typeParameters.params[0], sourceCode);
  }

  let initialValue = 'null';
  if (callExpr.arguments.length > 0) {
    initialValue = getSourceCode(callExpr.arguments[0], sourceCode);
  }

  // Heuristic: if type contains HTML element types or initial value is null, it's likely a DOM ref
  const isDomRef = isDomRefType(type, initialValue);

  refs.push({ variableName, initialValue, isDomRef, type });
}

/**
 * Heuristic to determine if a useRef is a DOM ref.
 */
function isDomRefType(type: string, initialValue: string): boolean {
  const domTypes = [
    'HTMLElement', 'HTMLDivElement', 'HTMLInputElement', 'HTMLButtonElement',
    'HTMLFormElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLAnchorElement',
    'HTMLImageElement', 'HTMLCanvasElement', 'HTMLVideoElement', 'HTMLAudioElement',
    'SVGElement', 'Element',
  ];

  for (const domType of domTypes) {
    if (type.includes(domType)) return true;
  }

  // If initial value is null and type is 'any', it's likely a DOM ref
  if (initialValue === 'null' && type === 'any') return true;

  return false;
}

/**
 * Extracts useContext hook: const value = useContext(MyContext)
 */
function extractUseContext(
  decl: t.VariableDeclarator,
  callExpr: t.CallExpression,
  sourceCode: string,
  contexts: ContextDefinition[],
): void {
  if (decl.id.type !== 'Identifier') return;

  const variableName = decl.id.name;
  let contextName = '';
  let type = 'any';

  if (callExpr.arguments.length > 0) {
    contextName = getSourceCode(callExpr.arguments[0], sourceCode);
  }

  if (callExpr.typeParameters && callExpr.typeParameters.type === 'TSTypeParameterInstantiation' && callExpr.typeParameters.params.length > 0) {
    type = typeParamToString(callExpr.typeParameters.params[0], sourceCode);
  }

  contexts.push({ variableName, contextName, type });
}

/**
 * Extracts a custom hook call.
 */
function extractCustomHook(
  decl: t.VariableDeclarator,
  callExpr: t.CallExpression,
  hookName: string,
  sourceCode: string,
  customHooks: CustomHookDefinition[],
): void {
  // Generate Angular service name: useMyHook → MyHookService
  const serviceName = hookName.replace(/^use/, '') + 'Service';

  const parameters: ParameterDefinition[] = callExpr.arguments.map((arg, i) => ({
    name: `arg${i}`,
    type: 'any',
  }));

  let returnType = 'any';
  if (decl.id.type === 'Identifier' && decl.id.typeAnnotation) {
    returnType = typeAnnotationToString(decl.id.typeAnnotation as t.TSTypeAnnotation, sourceCode);
  }

  const body = getSourceCode(callExpr, sourceCode);

  customHooks.push({
    hookName,
    serviceName,
    parameters,
    returnType,
    internalHooks: [], // Would need deeper analysis to determine
    body,
  });
}

/**
 * Infers a TypeScript type from a value expression.
 */
function inferTypeFromValue(node: t.Node): string {
  switch (node.type) {
    case 'StringLiteral':
      return 'string';
    case 'NumericLiteral':
      return 'number';
    case 'BooleanLiteral':
      return 'boolean';
    case 'NullLiteral':
      return 'any';
    case 'ArrayExpression':
      return 'any[]';
    case 'ObjectExpression':
      return 'Record<string, any>';
    case 'TemplateLiteral':
      return 'string';
    default:
      return 'any';
  }
}

/**
 * Recursively collects child component names used in the JSX tree.
 */
function collectChildComponentsFromJSX(
  node: JSXNode,
  importedComponents: Set<string>,
  used: Set<string>,
): void {
  if (node.isComponent && importedComponents.has(node.tag)) {
    used.add(node.tag);
  }

  for (const child of node.children) {
    if (typeof child === 'string') continue;
    if ('tag' in child) {
      collectChildComponentsFromJSX(child, importedComponents, used);
    } else if ('children' in child && child.children) {
      for (const c of child.children) {
        if (typeof c !== 'string' && 'tag' in c) {
          collectChildComponentsFromJSX(c, importedComponents, used);
        }
      }
    }
    if ('alternate' in child && child.alternate) {
      for (const c of child.alternate) {
        if (typeof c !== 'string' && 'tag' in c) {
          collectChildComponentsFromJSX(c, importedComponents, used);
        }
      }
    }
  }
}

/**
 * Collects all type interface/type alias definitions from the AST.
 */
function collectAllTypeInterfaces(
  ast: t.File,
  sourceCode: string,
  typeInterfaces: TypeInterfaceDefinition[],
): void {
  for (const node of ast.program.body) {
    const decl = node.type === 'ExportNamedDeclaration' ? node.declaration : node;
    if (!decl) continue;

    if (decl.type === 'TSInterfaceDeclaration') {
      if (!typeInterfaces.some(ti => ti.name === decl.id.name)) {
        typeInterfaces.push({
          name: decl.id.name,
          body: getSourceCode(decl, sourceCode),
        });
      }
    }

    if (decl.type === 'TSTypeAliasDeclaration') {
      if (!typeInterfaces.some(ti => ti.name === decl.id.name)) {
        typeInterfaces.push({
          name: decl.id.name,
          body: getSourceCode(decl, sourceCode),
        });
      }
    }
  }
}
