import type { TransformedComponent } from './pipeline-types.js';
/**
 * Post-processes generated Angular components to fix signal compatibility:
 *
 * 1. Replace `[(ngModel)]="signalName"` with split `[ngModel]` + `(ngModelChange)`
 * 2. Ensure signal reads use `()` in interpolations, @if, @for, [prop] bindings
 * 3. Add missing signal declarations for template references
 * 4. Ensure FormsModule is imported when ngModel is used
 */
export declare function fixSignals(components: ReadonlyMap<string, TransformedComponent>): Map<string, TransformedComponent>;
//# sourceMappingURL=signal-fixer.d.ts.map