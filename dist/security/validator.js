const MAX_INPUT_SIZE = 500 * 1024; // 500 KB
/**
 * Injection patterns that cause immediate rejection.
 * Each entry has a regex and a human-readable description.
 */
const INJECTION_PATTERNS = [
    {
        pattern: /\beval\s*\(/,
        description: 'Use of eval() is not allowed',
    },
    {
        pattern: /\bnew\s+Function\s*\(/,
        description: 'Use of Function constructor is not allowed',
    },
    {
        pattern: /\bimport\s*\(\s*(['"`])https?:\/\//,
        description: 'Dynamic imports from external URLs are not allowed',
    },
];
/**
 * Warning patterns that don't reject but produce security warnings.
 */
const WARNING_PATTERNS = [
    {
        pattern: /dangerouslySetInnerHTML/g,
        name: 'dangerouslySetInnerHTML',
        message: 'Usage of dangerouslySetInnerHTML detected — will be converted to [innerHTML] with DomSanitizer',
    },
    {
        pattern: /document\.write\s*\(/g,
        name: 'document.write',
        message: 'Usage of document.write detected — this is unsafe and should be avoided',
    },
];
/**
 * Validates React source code before processing through the conversion pipeline.
 *
 * Validation order:
 * 1. Size check (> 500 KB → reject)
 * 2. Injection pattern check (eval, Function constructor, external dynamic imports → reject)
 * 3. Warning pattern detection (dangerouslySetInnerHTML, document.write → warn)
 * 4. Return sanitizedCode if valid
 */
export function validateInput(sourceCode) {
    const errors = [];
    const warnings = [];
    // 1. Size check
    const byteSize = Buffer.byteLength(sourceCode, 'utf-8');
    if (byteSize > MAX_INPUT_SIZE) {
        errors.push({
            type: 'size',
            message: `Input size (${byteSize} bytes) exceeds the maximum allowed size of ${MAX_INPUT_SIZE} bytes (500 KB)`,
        });
        return { isValid: false, errors, warnings };
    }
    // 2. Injection pattern check
    for (const { pattern, description } of INJECTION_PATTERNS) {
        if (pattern.test(sourceCode)) {
            errors.push({
                type: 'security',
                message: description,
            });
        }
    }
    if (errors.length > 0) {
        return { isValid: false, errors, warnings };
    }
    // 3. Warning pattern detection
    const lines = sourceCode.split('\n');
    for (const { pattern, name, message } of WARNING_PATTERNS) {
        // Reset regex state for global patterns
        pattern.lastIndex = 0;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(name)) {
                warnings.push({
                    line: i + 1,
                    pattern: name,
                    message,
                    severity: 'warning',
                });
            }
        }
    }
    // 4. Valid — return sanitized code
    return {
        isValid: true,
        errors,
        warnings,
        sanitizedCode: sourceCode,
    };
}
//# sourceMappingURL=validator.js.map