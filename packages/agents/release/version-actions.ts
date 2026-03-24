import { join } from 'node:path';
import { updateJson, type ProjectGraph, type Tree } from '@nx/devkit';
import type { VersionActions } from 'nx/release';
import type { NxReleaseVersionConfiguration } from 'nx/src/config/nx-json';

// Re-export afterAllProjectsVersioned from @nx/js so lock-file updates still work
export { afterAllProjectsVersioned } from '@nx/js/src/release/version-actions';

/**
 * Custom Nx VersionActions for the agents package.
 *
 * Extends the default JS version actions to also sync the version into:
 *   - .claude-plugin/plugin.json  (Claude Code plugin manifest)
 *   - skills/ocr/SKILL.md         (skill frontmatter metadata)
 *
 * This runs automatically during `nx release` as part of the version step,
 * so both files are always included in the release commit.
 */
export default class AgentsVersionActions implements VersionActions {
  releaseGroup: any;
  projectGraphNode: any;
  finalConfigForProject: any;
  manifestsToUpdate: { manifestPath: string; preserveLocalDependencyProtocols: boolean }[] = [];

  validManifestFilenames = ['package.json'];

  private jsActions: any;

  constructor(releaseGroup: any, projectGraphNode: any, finalConfigForProject: any) {
    this.releaseGroup = releaseGroup;
    this.projectGraphNode = projectGraphNode;
    this.finalConfigForProject = finalConfigForProject;
  }

  private async getJsActions() {
    if (!this.jsActions) {
      const { default: JsVersionActions } = await import('@nx/js/src/release/version-actions');
      this.jsActions = new JsVersionActions(
        this.releaseGroup,
        this.projectGraphNode,
        this.finalConfigForProject,
      );
    }
    return this.jsActions;
  }

  async init(tree: Tree): Promise<void> {
    const js = await this.getJsActions();
    await js.init(tree);
    this.manifestsToUpdate = js.manifestsToUpdate;
  }

  async validate(tree: Tree): Promise<void> {
    const js = await this.getJsActions();
    return js.validate(tree);
  }

  async readCurrentVersionFromSourceManifest(tree: Tree) {
    const js = await this.getJsActions();
    return js.readCurrentVersionFromSourceManifest(tree);
  }

  async readCurrentVersionFromRegistry(
    tree: Tree,
    metadata: NxReleaseVersionConfiguration['currentVersionResolverMetadata'],
  ) {
    const js = await this.getJsActions();
    return js.readCurrentVersionFromRegistry(tree, metadata);
  }

  async readDependencies(tree: Tree, projectGraph: ProjectGraph) {
    const js = await this.getJsActions();
    return js.readDependencies(tree, projectGraph);
  }

  async readCurrentVersionOfDependency(
    tree: Tree,
    projectGraph: ProjectGraph,
    dependencyProjectName: string,
  ) {
    const js = await this.getJsActions();
    return js.readCurrentVersionOfDependency(tree, projectGraph, dependencyProjectName);
  }

  async calculateNewVersion(
    currentVersion: string | null,
    newVersionInput: string,
    newVersionInputReason: string,
    newVersionInputReasonData: Record<string, unknown>,
    preid: string,
  ) {
    const js = await this.getJsActions();
    return js.calculateNewVersion(
      currentVersion,
      newVersionInput,
      newVersionInputReason,
      newVersionInputReasonData,
      preid,
    );
  }

  async updateProjectVersion(tree: Tree, newVersion: string): Promise<string[]> {
    const js = await this.getJsActions();
    const logMessages: string[] = await js.updateProjectVersion(tree, newVersion);

    const projectRoot: string = this.projectGraphNode.data.root;

    // Sync plugin.json
    const pluginJsonPath = join(projectRoot, '.claude-plugin', 'plugin.json');
    if (tree.exists(pluginJsonPath)) {
      updateJson(tree, pluginJsonPath, (json: Record<string, unknown>) => {
        json.version = newVersion;
        return json;
      });
      logMessages.push(
        `✍️  New version ${newVersion} written to ${pluginJsonPath}`,
      );
    }

    // Sync SKILL.md frontmatter
    const skillMdPath = join(projectRoot, 'skills', 'ocr', 'SKILL.md');
    if (tree.exists(skillMdPath)) {
      const content = tree.read(skillMdPath, 'utf-8')!;
      const updated = content.replace(
        /^(\s*version:\s*)"[^"]*"/m,
        `$1"${newVersion}"`,
      );
      tree.write(skillMdPath, updated);
      logMessages.push(
        `✍️  New version ${newVersion} written to ${skillMdPath}`,
      );
    }

    return logMessages;
  }

  async updateProjectDependencies(
    tree: Tree,
    projectGraph: ProjectGraph,
    dependenciesToUpdate: Record<string, string>,
  ): Promise<string[]> {
    const js = await this.getJsActions();
    return js.updateProjectDependencies(tree, projectGraph, dependenciesToUpdate);
  }
}
