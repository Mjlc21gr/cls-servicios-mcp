import type { GitHubRepoConfig } from '../models/pipeline.model.js';
interface GitHubFile {
    readonly path: string;
    readonly content: string;
    readonly sha: string;
}
export declare class GitHubClient {
    private readonly octokit;
    private readonly config;
    constructor(config: GitHubRepoConfig);
    /**
     * Verifica que el repo y la rama existan y sean accesibles.
     */
    validateConnection(): Promise<{
        valid: boolean;
        error?: string;
    }>;
    /**
     * Trae todos los archivos .tsx/.jsx de la rama configurada.
     * Filtra por basePath si está definido.
     */
    pullReactFiles(): Promise<GitHubFile[]>;
    /**
     * Sube archivos migrados al repo destino en una rama nueva o existente.
     * Crea un commit con todos los archivos de una vez.
     */
    pushMigratedFiles(files: Record<string, string>, commitMessage: string): Promise<{
        success: boolean;
        commitSha?: string;
        error?: string;
    }>;
    /**
     * Crea una rama nueva desde la rama base configurada.
     */
    createBranch(newBranchName: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    private getTree;
    private getFileContent;
}
export {};
//# sourceMappingURL=github-client.d.ts.map