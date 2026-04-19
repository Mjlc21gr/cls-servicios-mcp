// =============================================================================
// Class Component Pre-Processor
// Converts React class components to functional equivalents via regex.
// This is a pre-processor to make class components parseable by the AST pipeline.
// =============================================================================
/**
 * Detects whether source code contains a React class component.
 */
function isClassComponent(source) {
    return /class\s+\w+\s+extends\s+(React\.Component|Component)\b/.test(source);
}
/**
 * Extracts the class component name from the source.
 */
function extractClassName(source) {
    const match = source.match(/class\s+(\w+)\s+extends\s+(React\.Component|Component)/);
    return match?.[1] ?? 'UnknownComponent';
}
/**
 * Parses `this.state = { key: value, ... }` from a constructor and returns
 * an array of { name, defaultValue } pairs.
 */
function extractStateVars(source) {
    const stateAssignMatch = source.match(/this\.state\s*=\s*\{([^}]+)\}/);
    if (!stateAssignMatch)
        return [];
    const stateBody = stateAssignMatch[1];
    const vars = [];
    // Match patterns like `x: 0` or `name: ''` or `items: []` or `flag: true`
    const propRegex = /(\w+)\s*:\s*([^,}]+)/g;
    let propMatch;
    while ((propMatch = propRegex.exec(stateBody)) !== null) {
        vars.push({
            name: propMatch[1].trim(),
            defaultValue: propMatch[2].trim(),
        });
    }
    return vars;
}
/**
 * Capitalizes the first letter of a string.
 */
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
/**
 * Generates useState declarations from extracted state variables.
 */
function generateUseStateDeclarations(stateVars) {
    return stateVars
        .map((v) => `const [${v.name}, set${capitalize(v.name)}] = useState(${v.defaultValue});`)
        .join('\n  ');
}
/**
 * Replaces `this.setState({ key: value })` with the corresponding setter call.
 * Handles simple object form: `this.setState({ x: 1 })` → `setX(1)`
 */
function replaceSetStateCalls(source, stateVars) {
    let result = source;
    const notes = [];
    // Handle functional setState: this.setState(prev => ({ ...prev, x: prev.x + 1 }))
    // Convert to: setX(prev => prev + 1)
    for (const v of stateVars) {
        const funcPattern = new RegExp(`this\\.setState\\(\\s*(\\w+)\\s*=>\\s*\\(\\{[^}]*${v.name}\\s*:\\s*([^,}]+)[^)]*\\}\\)\\s*\\)`, 'g');
        const funcMatch = funcPattern.exec(result);
        if (funcMatch) {
            const paramName = funcMatch[1];
            let valueExpr = funcMatch[2].trim();
            // Replace prev.x references with just prev
            valueExpr = valueExpr.replace(new RegExp(`${paramName}\\.${v.name}`, 'g'), paramName);
            result = result.replace(funcMatch[0], `set${capitalize(v.name)}(${paramName} => ${valueExpr})`);
            notes.push(`Converted functional setState for '${v.name}' to set${capitalize(v.name)} updater`);
        }
    }
    // Handle simple object setState: this.setState({ x: 1 })
    for (const v of stateVars) {
        const simplePattern = new RegExp(`this\\.setState\\(\\s*\\{[^}]*${v.name}\\s*:\\s*([^,}]+)[^}]*\\}\\s*\\)`, 'g');
        result = result.replace(simplePattern, (_match, value) => {
            notes.push(`Converted setState({ ${v.name}: ... }) to set${capitalize(v.name)}()`);
            return `set${capitalize(v.name)}(${value.trim()})`;
        });
    }
    return { result, notes };
}
/**
 * Converts lifecycle methods to useEffect hooks.
 */
function convertLifecycleMethods(source) {
    let result = source;
    const notes = [];
    // componentDidMount() { ... } → useEffect(() => { ... }, []);
    result = result.replace(/componentDidMount\s*\(\s*\)\s*\{([\s\S]*?)\n\s*\}/, (_match, body) => {
        notes.push('Converted componentDidMount to useEffect with empty dependency array');
        return `useEffect(() => {${body}\n  }, []);`;
    });
    // componentWillUnmount() { ... } → useEffect(() => { return () => { ... }; }, []);
    result = result.replace(/componentWillUnmount\s*\(\s*\)\s*\{([\s\S]*?)\n\s*\}/, (_match, body) => {
        notes.push('Converted componentWillUnmount to useEffect cleanup function');
        return `useEffect(() => {\n    return () => {${body}\n    };\n  }, []);`;
    });
    // componentDidUpdate(prevProps) { ... } → useEffect(() => { ... });
    result = result.replace(/componentDidUpdate\s*\(\s*\w*\s*\)\s*\{([\s\S]*?)\n\s*\}/, (_match, body) => {
        notes.push('Converted componentDidUpdate to useEffect without dependency array');
        return `useEffect(() => {${body}\n  });`;
    });
    return { result, notes };
}
/**
 * Replaces `this.props.x` references with just `x` (destructured props).
 */
function convertPropsAccess(source) {
    const propNames = [];
    const notes = [];
    // Find all this.props.X references
    const propsRegex = /this\.props\.(\w+)/g;
    let match;
    while ((match = propsRegex.exec(source)) !== null) {
        if (!propNames.includes(match[1])) {
            propNames.push(match[1]);
        }
    }
    let result = source;
    if (propNames.length > 0) {
        result = result.replace(/this\.props\.(\w+)/g, '$1');
        notes.push(`Converted this.props access to destructured props: ${propNames.join(', ')}`);
    }
    return { result, propNames, notes };
}
/**
 * Extracts the render() method body (the return statement content).
 */
function extractRenderBody(source) {
    const renderMatch = source.match(/render\s*\(\s*\)\s*\{([\s\S]*)\}/);
    if (!renderMatch)
        return null;
    const body = renderMatch[1];
    // Find the return statement
    const returnMatch = body.match(/return\s*\(([\s\S]*)\)\s*;?\s*$/);
    if (returnMatch)
        return returnMatch[1].trim();
    const simpleReturn = body.match(/return\s+([\s\S]*?)\s*;?\s*$/);
    if (simpleReturn)
        return simpleReturn[1].trim();
    return body.trim();
}
/**
 * Unwraps React.memo(Component) → just the inner component.
 */
function unwrapReactMemo(source) {
    const memoPattern = /(?:export\s+default\s+)?React\.memo\(\s*(\w+)\s*\)/g;
    const hasMemo = memoPattern.test(source);
    if (!hasMemo)
        return { result: source, unwrapped: false };
    let result = source.replace(/(?:export\s+default\s+)?React\.memo\(\s*(\w+)\s*\)\s*;?/g, '');
    // Also handle inline memo wrapping: const X = React.memo(function/arrow)
    result = result.replace(/const\s+(\w+)\s*=\s*React\.memo\(\s*(function|\()/g, 'const $1 = $2');
    // Remove trailing ) from memo wrapper
    result = result.replace(/React\.memo\(\s*/g, '');
    return { result, unwrapped: true };
}
/**
 * Unwraps React.forwardRef((props, ref) => ...) → just the inner function.
 */
function unwrapForwardRef(source) {
    const forwardRefPattern = /React\.forwardRef\(/;
    if (!forwardRefPattern.test(source))
        return { result: source, unwrapped: false };
    let result = source;
    // Remove React.forwardRef( wrapper and its closing )
    result = result.replace(/(?:export\s+default\s+)?React\.forwardRef\(\s*/g, '');
    // Remove the trailing ) that closes forwardRef — find the last unmatched )
    // Simple approach: remove trailing );
    result = result.replace(/\)\s*;?\s*$/, '');
    return { result, unwrapped: true };
}
/**
 * Converts a React class component source to a functional component equivalent.
 *
 * This is a regex-based pre-processor — not AST-based. It handles common patterns
 * to make class components parseable by the existing AST pipeline.
 */
export function convertClassToFunctional(source) {
    // If not a class component, return as-is
    if (!isClassComponent(source)) {
        return {
            originalSource: source,
            convertedSource: source,
            wasClassComponent: false,
            conversionNotes: [],
        };
    }
    const notes = [];
    let converted = source;
    // Step 1: Unwrap React.memo
    const memoResult = unwrapReactMemo(converted);
    converted = memoResult.result;
    if (memoResult.unwrapped) {
        notes.push('Unwrapped React.memo wrapper');
    }
    // Step 2: Unwrap React.forwardRef
    const forwardRefResult = unwrapForwardRef(converted);
    converted = forwardRefResult.result;
    if (forwardRefResult.unwrapped) {
        notes.push('Unwrapped React.forwardRef wrapper');
    }
    // Step 3: Extract component name
    const componentName = extractClassName(converted);
    notes.push(`Detected class component: ${componentName}`);
    // Step 4: Extract state variables
    const stateVars = extractStateVars(converted);
    const useStateDecls = generateUseStateDeclarations(stateVars);
    if (stateVars.length > 0) {
        notes.push(`Extracted ${stateVars.length} state variable(s): ${stateVars.map((v) => v.name).join(', ')}`);
    }
    // Step 5: Replace this.setState calls
    const setStateResult = replaceSetStateCalls(converted, stateVars);
    converted = setStateResult.result;
    notes.push(...setStateResult.notes);
    // Step 6: Convert lifecycle methods
    const lifecycleResult = convertLifecycleMethods(converted);
    converted = lifecycleResult.result;
    notes.push(...lifecycleResult.notes);
    // Step 7: Convert this.props.x → x
    const propsResult = convertPropsAccess(converted);
    converted = propsResult.result;
    notes.push(...propsResult.notes);
    // Step 8: Replace this.state.x → x (after useState extraction)
    for (const v of stateVars) {
        const stateAccessPattern = new RegExp(`this\\.state\\.${v.name}`, 'g');
        if (stateAccessPattern.test(converted)) {
            converted = converted.replace(stateAccessPattern, v.name);
            notes.push(`Replaced this.state.${v.name} with ${v.name}`);
        }
    }
    // Step 9: Extract render body
    const renderBody = extractRenderBody(converted);
    // Step 10: Build the functional component
    const propsParam = propsResult.propNames.length > 0
        ? `{ ${propsResult.propNames.join(', ')} }`
        : 'props';
    const hookLines = [];
    if (useStateDecls) {
        hookLines.push(useStateDecls);
    }
    // Extract converted lifecycle hooks (useEffect calls) from the converted source
    const effectMatches = converted.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[.*?\]\);|useEffect\(\(\) => \{[\s\S]*?\}\);/g);
    if (effectMatches) {
        hookLines.push(...effectMatches);
    }
    const bodyContent = hookLines.length > 0
        ? `\n  ${hookLines.join('\n\n  ')}\n\n  return (\n    ${renderBody ?? '/* render body not found */'}\n  );\n`
        : `\n  return (\n    ${renderBody ?? '/* render body not found */'}\n  );\n`;
    const functionalComponent = `export default function ${componentName}(${propsParam}) {${bodyContent}}`;
    // Preserve imports from the original source (lines starting with import)
    const importLines = source
        .split('\n')
        .filter((line) => line.trimStart().startsWith('import '))
        .join('\n');
    // Add React hooks imports if needed
    const hooksNeeded = [];
    if (stateVars.length > 0)
        hooksNeeded.push('useState');
    if (effectMatches && effectMatches.length > 0)
        hooksNeeded.push('useEffect');
    let hooksImport = '';
    if (hooksNeeded.length > 0) {
        // Check if React import already exists and modify it, or add new one
        const hasReactImport = importLines.includes("from 'react'") || importLines.includes('from "react"');
        if (!hasReactImport) {
            hooksImport = `import React, { ${hooksNeeded.join(', ')} } from 'react';\n`;
        }
    }
    const finalSource = [hooksImport, importLines, '', functionalComponent].filter(Boolean).join('\n');
    notes.push('Converted class declaration to functional component');
    return {
        originalSource: source,
        convertedSource: finalSource,
        wasClassComponent: true,
        conversionNotes: notes,
    };
}
//# sourceMappingURL=class-component-converter.js.map