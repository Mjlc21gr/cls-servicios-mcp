/**
 * Generador de Angular Services desde análisis de fetch/axios en React.
 * Produce .service.ts y .model.ts siguiendo estándar CLS.
 * Base URL: /servicios-core/api/v1/
 */
import type { ReactComponentAnalysis } from '../models/react-analysis.model.js';
export declare function generateServiceFromAnalysis(analysis: ReactComponentAnalysis, moduleName: string): {
    serviceCode: string;
    serviceSpec: string;
    modelCode: string;
} | null;
//# sourceMappingURL=service.generator.d.ts.map