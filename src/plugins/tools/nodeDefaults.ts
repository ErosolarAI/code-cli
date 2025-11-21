import { registerToolPlugin } from './registry.js';
import { createLocalFilesystemToolPlugin } from './filesystem/localFilesystemPlugin.js';
import { createEditToolPlugin } from './edit/editPlugin.js';
import { createLocalSearchToolPlugin } from './search/localSearchPlugin.js';
import { createGlobToolPlugin } from './glob/globPlugin.js';
import { createLocalBashToolPlugin } from './bash/localBashPlugin.js';

let registered = false;

export function registerDefaultNodeToolPlugins(): void {
  if (registered) {
    return;
  }

  registerToolPlugin(createLocalFilesystemToolPlugin());
  registerToolPlugin(createEditToolPlugin());
  registerToolPlugin(createLocalSearchToolPlugin());
  registerToolPlugin(createGlobToolPlugin());
  registerToolPlugin(createLocalBashToolPlugin());

  registered = true;
}
