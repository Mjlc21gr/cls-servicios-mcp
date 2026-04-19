/**
 * Modelos del Pipeline de Migración.
 * Define los pasos, gates de validación, y estado del flujo.
 * Cada paso tiene un gate: si no pasa, el pipeline se detiene sin cambios.
 */
export const DEFAULT_PIPELINE_RULES = {
    maxComponentComplexity: 20,
    requireTests: true,
    minTestCoverage: 90,
    forbiddenPatterns: ['any', 'console.log', 'debugger', 'TODO:'],
    requiredPrimeNgComponents: true,
    requireClsTheme: true,
    requireStrictTypes: true,
    maxFileSizeKb: 50,
    allowedAngularVersions: ['17', '18', '19'],
};
export const PIPELINE_STEPS = [
    'github_pull',
    'analyze_react',
    'validate_structure',
    'map_to_angular',
    'inject_primeng_ui',
    'inject_cls_theme',
    'generate_services',
    'validate_output',
    'lint_check',
    'generate_tests',
    'github_push',
];
//# sourceMappingURL=pipeline.model.js.map