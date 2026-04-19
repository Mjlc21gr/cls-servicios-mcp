/**
 * Modelos para el análisis de componentes React.
 * Representan la estructura extraída del AST de JSX/TSX.
 */

export interface ReactStateHook {
  readonly name: string;
  readonly setter: string;
  readonly initialValue: string;
  readonly type: string;
}

export interface ReactEffectHook {
  readonly dependencies: readonly string[];
  readonly hasCleanup: boolean;
  readonly body: string;
  readonly isOnMount: boolean;
  readonly isOnDestroy: boolean;
}

export interface ReactProp {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly defaultValue: string | null;
}

export interface ReactCallback {
  readonly name: string;
  readonly params: readonly string[];
  readonly body: string;
  readonly dependencies: readonly string[];
}

export interface ReactMemo {
  readonly name: string;
  readonly computation: string;
  readonly dependencies: readonly string[];
  readonly type: string;
}

export interface ReactRef {
  readonly name: string;
  readonly initialValue: string;
  readonly type: string;
}

export interface ReactContextUsage {
  readonly contextName: string;
  readonly variableName: string;
}

export interface UILibraryUsage {
  readonly library: string;
  readonly components: readonly string[];
  readonly version: string | null;
}

export interface ReactComponentAnalysis {
  readonly componentName: string;
  readonly fileName: string;
  readonly isDefaultExport: boolean;
  readonly props: readonly ReactProp[];
  readonly stateHooks: readonly ReactStateHook[];
  readonly effects: readonly ReactEffectHook[];
  readonly callbacks: readonly ReactCallback[];
  readonly memos: readonly ReactMemo[];
  readonly refs: readonly ReactRef[];
  readonly contexts: readonly ReactContextUsage[];
  readonly uiLibraries: readonly UILibraryUsage[];
  readonly jsxTemplate: string;
  readonly imports: readonly string[];
  readonly customHooks: readonly string[];
}
