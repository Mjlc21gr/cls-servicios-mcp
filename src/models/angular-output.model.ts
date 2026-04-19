/**
 * Modelos para la salida de componentes Angular generados.
 * Siguen el estándar CLS de nomenclatura y arquitectura.
 */

export interface AngularSignal {
  readonly name: string;
  readonly type: string;
  readonly initialValue: string;
  readonly isComputed: boolean;
  readonly computation?: string;
}

export interface AngularInput {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly defaultValue: string | null;
}

export interface AngularOutput {
  readonly name: string;
  readonly eventType: string;
}

export interface AngularEffect {
  readonly phase: 'constructor' | 'ngOnInit' | 'ngOnDestroy' | 'effect';
  readonly body: string;
  readonly cleanupBody?: string;
}

export interface AngularServiceMethod {
  readonly name: string;
  readonly httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  readonly endpoint: string;
  readonly requestType: string | null;
  readonly responseType: string;
  readonly params: readonly string[];
}

export interface AngularServiceDefinition {
  readonly serviceName: string;
  readonly fileName: string;
  readonly baseUrl: string;
  readonly methods: readonly AngularServiceMethod[];
  readonly models: readonly AngularModelDefinition[];
}

export interface AngularModelDefinition {
  readonly interfaceName: string;
  readonly fileName: string;
  readonly properties: readonly AngularModelProperty[];
}

export interface AngularModelProperty {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
}

export interface AngularComponentOutput {
  readonly componentName: string;
  readonly selector: string;
  readonly modulePath: string;
  readonly files: AngularGeneratedFiles;
}

export interface AngularGeneratedFiles {
  readonly componentTs: string;
  readonly componentHtml: string;
  readonly componentScss: string;
  readonly componentSpec: string;
  readonly serviceTs?: string;
  readonly serviceSpec?: string;
  readonly modelTs?: string;
}

export interface MigrationResult {
  readonly sourceComponent: string;
  readonly outputPath: string;
  readonly components: readonly AngularComponentOutput[];
  readonly services: readonly AngularServiceDefinition[];
  readonly models: readonly AngularModelDefinition[];
  readonly warnings: readonly string[];
}
