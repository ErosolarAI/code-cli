import { registerToolPlugin } from './registry.js';
import { createLocalFilesystemToolPlugin } from './filesystem/localFilesystemPlugin.js';
import { createEditToolPlugin } from './edit/editPlugin.js';
import { createNotebookToolPlugin } from './notebook/notebookPlugin.js';
import { createLocalSearchToolPlugin } from './search/localSearchPlugin.js';
import { createGlobToolPlugin } from './glob/globPlugin.js';
import { createLocalBashToolPlugin } from './bash/localBashPlugin.js';
import { createLocalRepoChecksPlugin } from './checks/localRepoChecksPlugin.js';
import { createCodeAnalysisToolPlugin } from './codeAnalysis/codeAnalysisPlugin.js';
import { createDevToolPlugin } from './development/devPlugin.js';
import { createCodeQualityToolPlugin } from './codeQuality/codeQualityPlugin.js';
import { createRefactoringToolPlugin } from './refactoring/refactoringPlugin.js';
import { createDependencyToolPlugin } from './dependency/dependencyPlugin.js';
import { createPentestToolPlugin } from './security/pentestPlugin.js';
import { createTestingToolPlugin } from './testing/testingPlugin.js';
import { createTaskManagementToolPlugin } from './taskManagement/taskManagementPlugin.js';
import { createInteractionToolPlugin } from './interaction/interactionPlugin.js';
import { createWebToolPlugin } from './web/webPlugin.js';
import { createAgentSpawningToolPlugin } from './agentSpawning/agentSpawningPlugin.js';
import { createEnhancedGitToolPlugin } from './enhancedGit/enhancedGitPlugin.js';
import { createMcpToolPlugin } from './mcp/mcpPlugin.js';
import { createMissionToolPlugin } from './mission/missionPlugin.js';

let registered = false;

export function registerDefaultNodeToolPlugins(): void {
  if (registered) {
    return;
  }

  registerToolPlugin(createLocalFilesystemToolPlugin());
  registerToolPlugin(createEditToolPlugin());
  registerToolPlugin(createNotebookToolPlugin());
  registerToolPlugin(createLocalSearchToolPlugin());
  registerToolPlugin(createGlobToolPlugin());
  registerToolPlugin(createLocalBashToolPlugin());
  registerToolPlugin(createLocalRepoChecksPlugin());
  registerToolPlugin(createCodeAnalysisToolPlugin());
  registerToolPlugin(createDevToolPlugin());
  registerToolPlugin(createCodeQualityToolPlugin());
  registerToolPlugin(createRefactoringToolPlugin());
  registerToolPlugin(createDependencyToolPlugin());
  registerToolPlugin(createPentestToolPlugin());
  registerToolPlugin(createTestingToolPlugin());
  registerToolPlugin(createTaskManagementToolPlugin());
  registerToolPlugin(createInteractionToolPlugin());
  registerToolPlugin(createWebToolPlugin());
  registerToolPlugin(createAgentSpawningToolPlugin());
  registerToolPlugin(createEnhancedGitToolPlugin());
  registerToolPlugin(createMcpToolPlugin());
  registerToolPlugin(createMissionToolPlugin());

  registered = true;
}
