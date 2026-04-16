export interface ParameterDefinition {
    name: string;
    type: string;
}
export interface TypeInterfaceDefinition {
    name: string;
    body: string;
}
export interface PropDefinition {
    name: string;
    type: string;
    defaultValue?: string;
    isRequired: boolean;
}
export interface StateDefinition {
    variableName: string;
    setterName: string;
    type: string;
    initialValue: string;
}
export interface EffectDefinition {
    body: string;
    dependencies: string[];
    cleanupFunction?: string;
}
export interface MemoDefinition {
    variableName: string;
    computeFunction: string;
    dependencies: string[];
    type: string;
}
export interface CallbackDefinition {
    functionName: string;
    body: string;
    parameters: ParameterDefinition[];
    dependencies: string[];
}
export interface RefDefinition {
    variableName: string;
    initialValue: string;
    isDomRef: boolean;
    type: string;
}
export interface ContextDefinition {
    variableName: string;
    contextName: string;
    type: string;
}
export interface CustomHookDefinition {
    hookName: string;
    serviceName: string;
    parameters: ParameterDefinition[];
    returnType: string;
    internalHooks: string[];
    body: string;
}
export interface MethodDefinition {
    name: string;
    parameters: ParameterDefinition[];
    returnType: string;
    body: string;
}
export interface JSXNode {
    tag: string;
    attributes: JSXAttribute[];
    children: (JSXNode | JSXExpression | string)[];
    isComponent: boolean;
}
export interface JSXAttribute {
    name: string;
    value: string | JSXExpression;
    isEventHandler: boolean;
    isDynamic: boolean;
}
export interface JSXExpression {
    type: 'conditional' | 'ternary' | 'map' | 'switch' | 'interpolation';
    expression: string;
    children?: JSXNode[];
    alternate?: JSXNode[];
}
export interface PrimeNGImport {
    moduleName: string;
    importPath: string;
}
export interface SecurityWarning {
    line: number;
    pattern: string;
    message: string;
    severity: 'warning' | 'error';
}
export interface SignalDefinition {
    name: string;
    type: string;
    initialValue: string;
    originalStateName: string;
}
export interface AngularEffectDefinition {
    body: string;
    dependencies: string[];
    cleanupFunction?: string;
}
export interface ComputedDefinition {
    name: string;
    type: string;
    computeFunction: string;
    dependencies: string[];
}
export interface InjectionDefinition {
    propertyName: string;
    serviceName: string;
    type: string;
}
export interface ServiceDefinition {
    serviceName: string;
    fileName: string;
    methods: AngularMethodDefinition[];
    injections: InjectionDefinition[];
}
export interface ViewChildDefinition {
    propertyName: string;
    selector: string;
    type: string;
}
export interface ClassPropertyDefinition {
    name: string;
    type: string;
    initialValue: string;
}
export interface AngularMethodDefinition {
    name: string;
    parameters: ParameterDefinition[];
    returnType: string;
    body: string;
}
export interface BindingDefinition {
    type: 'event' | 'property' | 'interpolation' | 'twoWay';
    angularSyntax: string;
    originalJSX: string;
}
export interface ComponentIR {
    componentName: string;
    fileName: string;
    props: PropDefinition[];
    state: StateDefinition[];
    effects: EffectDefinition[];
    memos: MemoDefinition[];
    callbacks: CallbackDefinition[];
    refs: RefDefinition[];
    contexts: ContextDefinition[];
    customHooks: CustomHookDefinition[];
    methods: MethodDefinition[];
    childComponents: string[];
    jsxTree: JSXNode;
    typeInterfaces: TypeInterfaceDefinition[];
    angularSignals: SignalDefinition[];
    angularEffects: AngularEffectDefinition[];
    angularComputed: ComputedDefinition[];
    angularInjections: InjectionDefinition[];
    angularServices: ServiceDefinition[];
    angularViewChildren: ViewChildDefinition[];
    classProperties: ClassPropertyDefinition[];
    componentMethods: AngularMethodDefinition[];
    angularTemplate: string;
    isInlineTemplate: boolean;
    templateBindings: BindingDefinition[];
    primeNgImports: PrimeNGImport[];
    securityWarnings: SecurityWarning[];
}
export interface RemoteRoute {
    name: string;
    path: string;
    remoteEntry: string;
    exposedModule: string;
}
export interface ShellConfig {
    appName: string;
    remotes: RemoteRoute[];
}
export interface ShellAppArtifact {
    appConfig: string;
    appRoutes: string;
    federationConfig: string;
    tailwindConfig: string;
    appComponent: string;
    cspMeta: string;
}
export interface ExposedComponent {
    name: string;
    path: string;
}
export interface ModuleConfig {
    moduleName: string;
    components: ExposedComponent[];
}
export interface GeneratedComponent {
    componentFile: string;
    specFile: string;
    isPlaceholder: boolean;
}
export interface RemoteAppArtifact {
    federationConfig: string;
    components: GeneratedComponent[];
    appConfig: string;
}
export interface ServiceFile {
    fileName: string;
    content: string;
}
export interface AngularArtifact {
    componentFile: string;
    specFile: string;
    tailwindConfig: string;
    templateFile?: string;
    services: ServiceFile[];
    securityWarnings: SecurityWarning[];
}
export interface ValidationError {
    type: 'syntax' | 'security' | 'size' | 'timeout' | 'invalid_component';
    message: string;
    line?: number;
    column?: number;
}
export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings: SecurityWarning[];
    sanitizedCode?: string;
}
//# sourceMappingURL=types.d.ts.map