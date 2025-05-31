import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve, extname } from 'path';
import type { Plugin, ViteDevServer } from 'vite';
import { transpile } from 'typescript';

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

    async load(id: string): Promise<string | undefined> {
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

          async function readDirRecursive(dir: string, currentTree: Record<string, any>): Promise<void> {
            console.log(`[webcontainer-files plugin] Reading directory: ${dir}`);

            try {
              const entries = readdirSync(dir, { withFileTypes: true });

              for (const entry of entries) {
                const fullPath = join(dir, entry.name);

                if (entry.isDirectory()) {
                  // create directory node
                  currentTree[entry.name] = { directory: {} };

                  // continue recursion with the directory's contents
                  await readDirRecursive(fullPath, currentTree[entry.name].directory);
                } else {
                  // create file node
                  const fileExtension = extname(entry.name);
                  let contents = readFileSync(fullPath, 'utf-8');
                  let fileName = entry.name;

                  // compile TypeScript files to JavaScript
                  if (fileExtension === '.ts') {
                    try {
                      contents = transpile(contents, {
                        target: 5, // es2015
                        module: 1, // commonJS
                      });

                      // change file extension from .ts to .js
                      fileName = entry.name.replace(/\.ts$/, '.js');
                      console.log(`[webcontainer-files plugin] Compiled TypeScript file: ${entry.name} -> ${fileName}`);
                    } catch (err) {
                      console.error(`[webcontainer-files plugin] Error compiling TypeScript file ${entry.name}:`, err);

                      // fallback to original content if compilation fails
                    }
                  }

                  currentTree[fileName] = {
                    file: {
                      name: fileName,
                      contents,
                    },
                  };
                  console.log(`[webcontainer-files plugin] Added file: ${fileName}`);
                }
              }
            } catch (err) {
              console.error(`[webcontainer-files plugin] Error reading directory ${dir}:`, err);
            }
          }

          await readDirRecursive(webcontainerDir, filesTree);

          console.log(`[webcontainer-files plugin] Generated filesTree with ${Object.keys(filesTree).length} entries`);
          
          // Debug: log the full structure
          console.log('[webcontainer-files plugin] Full filesTree structure:', JSON.stringify(filesTree, null, 2));

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
