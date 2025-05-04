import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import type { Plugin, ViteDevServer } from 'vite';

interface WebcontainerFilesPluginOptions {
  moduleId?: string;
  directory?: string;
}

// accept options object, provide default
export default function webcontainerFilesPlugin(options: WebcontainerFilesPluginOptions = {}): Plugin {
  // determine the virtual module ID from options or default
  const virtualModuleId = options.moduleId || 'virtual:webcontainer-files';
  const resolvedVirtualModuleId = '\0' + virtualModuleId;

  // determine the target directory from options or default
  const targetDirectory = options.directory || './webcontainer-files';

  return {
    name: 'webcontainer-files',
    enforce: 'pre', // make sure it runs before other plugins

    resolveId(id: string): string | undefined {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }

      return undefined;
    },

    load(id: string): string | undefined {
      if (id === resolvedVirtualModuleId) {
        const rootDir = process.cwd();
        console.log(`[webcontainer-files plugin] Root directory: ${rootDir}`);

        // resolve the target directory relative to rootDir
        const webcontainerDir = resolve(rootDir, targetDirectory);
        const filesTree: Record<string, any> = {};

        console.log(`[webcontainer-files plugin] Loading files from: ${webcontainerDir}`);

        try {
          if (!existsSync(webcontainerDir)) {
            console.error(`[webcontainer-files plugin] Directory does not exist: ${webcontainerDir}`);
            return `export const files = {};`;
          }

          function readDirRecursive(dir: string, currentTree: Record<string, any>): void {
            console.log(`[webcontainer-files plugin] Reading directory: ${dir}`);

            try {
              const entries = readdirSync(dir, { withFileTypes: true });

              for (const entry of entries) {
                const fullPath = join(dir, entry.name);

                if (entry.isDirectory()) {
                  // create directory node
                  currentTree[entry.name] = { directory: {} };

                  // continue recursion with the directory's contents
                  readDirRecursive(fullPath, currentTree[entry.name].directory);
                } else {
                  // create file node
                  const contents = readFileSync(fullPath, 'utf-8');
                  currentTree[entry.name] = {
                    file: {
                      contents,
                    },
                  };
                  console.log(`[webcontainer-files plugin] Added file: ${entry.name}`);
                }
              }
            } catch (err) {
              console.error(`[webcontainer-files plugin] Error reading directory ${dir}:`, err);
            }
          }

          readDirRecursive(webcontainerDir, filesTree);

          console.log(`[webcontainer-files plugin] Generated filesTree with ${Object.keys(filesTree).length} entries`);

          return `export const files = ${JSON.stringify(filesTree, null, 2)};`;
        } catch (error: unknown) {
          console.error(`[webcontainer-files plugin] Error loading files:`, error);
          return `export const files = {}; // Error: ${(error as Error).message}`;
        }
      }

      return undefined;
    },

    configureServer(server: ViteDevServer): void {
      // watch for changes in the webcontainer directory
      const rootDir = process.cwd();

      // resolve the target directory for the watcher
      server.watcher.add(resolve(rootDir, targetDirectory, '**/*'));
    },
  };
}
