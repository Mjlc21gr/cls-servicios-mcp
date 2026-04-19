import type { ScannedFile } from './pipeline-types.js';
export interface GeneratedService {
    readonly fileName: string;
    readonly className: string;
    readonly content: string;
}
/**
 * Convert a React custom hook file to an Angular Injectable service.
 * Extracts the REAL logic from the hook body.
 */
export declare function convertHookToService(hookFile: ScannedFile, typesContent: string): GeneratedService | null;
//# sourceMappingURL=logic-service-converter.d.ts.map