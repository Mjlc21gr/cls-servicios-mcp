/**
 * Cliente GitHub para el pipeline de migración.
 * Pull: trae código React desde repo origen + rama específica.
 * Push: envía código Angular migrado al repo destino + rama.
 */
import { Octokit } from '@octokit/rest';
import type { GitHubRepoConfig } from '../models/pipeline.model.js';

interface GitHubFile {
  readonly path: string;
  readonly content: string;
  readonly sha: string;
}

export class GitHubClient {
  private readonly octokit: Octokit;
  private readonly config: GitHubRepoConfig;

  constructor(config: GitHubRepoConfig) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.token });
  }

  /**
   * Verifica que el repo y la rama existan y sean accesibles.
   */
  async validateConnection(): Promise<{ valid: boolean; error?: string }> {
    try {
      await this.octokit.repos.get({
        owner: this.config.owner,
        repo: this.config.repo,
      });

      await this.octokit.repos.getBranch({
        owner: this.config.owner,
        repo: this.config.repo,
        branch: this.config.branch,
      });

      return { valid: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { valid: false, error: `GitHub: ${message}` };
    }
  }

  /**
   * Trae todos los archivos .tsx/.jsx de la rama configurada.
   * Filtra por basePath si está definido.
   */
  async pullReactFiles(): Promise<GitHubFile[]> {
    const files: GitHubFile[] = [];
    const basePath = this.config.basePath ?? 'src';

    try {
      const tree = await this.getTree(basePath);

      for (const item of tree) {
        if (item.type !== 'blob') continue;
        if (!item.path) continue;
        if (!/\.(tsx|jsx)$/.test(item.path)) continue;
        // Ignorar archivos de test/stories
        if (/\.(test|spec|stories)\.(tsx|jsx)$/.test(item.path)) continue;

        const content = await this.getFileContent(
          `${basePath}/${item.path}`
        );

        if (content) {
          files.push({
            path: item.path,
            content,
            sha: item.sha ?? '',
          });
        }
      }
    } catch (error) {
      throw new Error(
        `Error al traer archivos de ${this.config.owner}/${this.config.repo}@${this.config.branch}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return files;
  }

  /**
   * Sube archivos migrados al repo destino en una rama nueva o existente.
   * Crea un commit con todos los archivos de una vez.
   */
  async pushMigratedFiles(
    files: Record<string, string>,
    commitMessage: string
  ): Promise<{ success: boolean; commitSha?: string; error?: string }> {
    try {
      // 1. Obtener referencia de la rama
      const refData = await this.octokit.git.getRef({
        owner: this.config.owner,
        repo: this.config.repo,
        ref: `heads/${this.config.branch}`,
      });
      const baseSha = refData.data.object.sha;

      // 2. Obtener el tree base
      const baseCommit = await this.octokit.git.getCommit({
        owner: this.config.owner,
        repo: this.config.repo,
        commit_sha: baseSha,
      });

      // 3. Crear blobs para cada archivo
      const treeItems: Array<{
        path: string;
        mode: '100644';
        type: 'blob';
        sha: string;
      }> = [];

      for (const [filePath, content] of Object.entries(files)) {
        const blob = await this.octokit.git.createBlob({
          owner: this.config.owner,
          repo: this.config.repo,
          content: Buffer.from(content).toString('base64'),
          encoding: 'base64',
        });

        treeItems.push({
          path: filePath,
          mode: '100644',
          type: 'blob',
          sha: blob.data.sha,
        });
      }

      // 4. Crear nuevo tree
      const newTree = await this.octokit.git.createTree({
        owner: this.config.owner,
        repo: this.config.repo,
        base_tree: baseCommit.data.tree.sha,
        tree: treeItems,
      });

      // 5. Crear commit
      const newCommit = await this.octokit.git.createCommit({
        owner: this.config.owner,
        repo: this.config.repo,
        message: commitMessage,
        tree: newTree.data.sha,
        parents: [baseSha],
      });

      // 6. Actualizar referencia de la rama
      await this.octokit.git.updateRef({
        owner: this.config.owner,
        repo: this.config.repo,
        ref: `heads/${this.config.branch}`,
        sha: newCommit.data.sha,
      });

      return { success: true, commitSha: newCommit.data.sha };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Push fallido: ${message}` };
    }
  }

  /**
   * Crea una rama nueva desde la rama base configurada.
   */
  async createBranch(newBranchName: string): Promise<{ success: boolean; error?: string }> {
    try {
      const ref = await this.octokit.git.getRef({
        owner: this.config.owner,
        repo: this.config.repo,
        ref: `heads/${this.config.branch}`,
      });

      await this.octokit.git.createRef({
        owner: this.config.owner,
        repo: this.config.repo,
        ref: `refs/heads/${newBranchName}`,
        sha: ref.data.object.sha,
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `No se pudo crear rama ${newBranchName}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async getTree(path: string): Promise<Array<{ path?: string; type?: string; sha?: string }>> {
    try {
      const response = await this.octokit.git.getTree({
        owner: this.config.owner,
        repo: this.config.repo,
        tree_sha: `${this.config.branch}:${path}`,
        recursive: 'true',
      });
      return response.data.tree;
    } catch {
      return [];
    }
  }

  private async getFileContent(path: string): Promise<string | null> {
    try {
      const response = await this.octokit.repos.getContent({
        owner: this.config.owner,
        repo: this.config.repo,
        path,
        ref: this.config.branch,
      });

      if ('content' in response.data && response.data.content) {
        return Buffer.from(response.data.content, 'base64').toString('utf-8');
      }
      return null;
    } catch {
      return null;
    }
  }
}
