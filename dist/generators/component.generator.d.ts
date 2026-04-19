/**
 * Generador de Angular Standalone Components desde análisis React.
 * Produce .component.ts, .component.html, .component.scss, .component.spec.ts
 * Usa Signals obligatoriamente. OnPush por defecto.
 */
import type { ReactComponentAnalysis } from '../models/react-analysis.model.js';
import type { AngularGeneratedFiles } from '../models/angular-output.model.js';
export declare function generateAngularComponent(analysis: ReactComponentAnalysis, moduleName: string): AngularGeneratedFiles;
//# sourceMappingURL=component.generator.d.ts.map