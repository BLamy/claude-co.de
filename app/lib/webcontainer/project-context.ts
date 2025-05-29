import type { WebContainer } from '@webcontainer/api';
import type { Project, Thread } from '~/lib/stores/projects';
import { useGitHubSettings } from '~/lib/hooks/useGitHubSettings';

export interface ProjectContext {
  project: Project;
  thread: Thread;
  isSetup: boolean;
}

export class WebContainerProjectManager {
  private webcontainer: WebContainer;
  private currentContext: ProjectContext | null = null;

  constructor(webcontainer: WebContainer) {
    this.webcontainer = webcontainer;
  }

  async setupProjectContext(project: Project, thread: Thread): Promise<void> {
    // Clear existing files
    await this.clearWorkspace();

    // Ensure .bolt/bin directory exists and git script is available
    await this._ensureBoltTools();

    // Clone the repository
    await this._cloneRepository(project, thread.branch);

    // Set up the environment
    await this._setupEnvironment(project, thread);

    this.currentContext = {
      project,
      thread,
      isSetup: true,
    };
  }

  private async clearWorkspace(): Promise<void> {
    try {
      // Remove all files except .git (if we want to preserve git history)
      const files = await this.webcontainer.fs.readdir('/', { withFileTypes: true });
      
      for (const file of files) {
        if (file.name !== '.git' && file.name !== 'node_modules') {
          await this.webcontainer.fs.rm(file.name, { recursive: true, force: true });
        }
      }
    } catch (error) {
      console.warn('Failed to clear workspace:', error);
    }
  }

  private async _ensureBoltTools(): Promise<void> {
    try {
      // create .bolt/bin directory if it doesn't exist
      await this.webcontainer.fs.mkdir('.bolt', { recursive: true });
      await this.webcontainer.fs.mkdir('.bolt/bin', { recursive: true });

      // write the git.ts script
      const gitScript = `#!/usr/bin/env node

// Use dynamic import for isomorphic-git to ensure ES module compatibility
let git;

// Import fs using a more ES module friendly approach
import * as fs from 'fs';

const command = process.argv[2];
const args = process.argv.slice(3);

// Helper function to dynamically import the http module when needed
async function getHttp() {
  return (await import('isomorphic-git/http/node/index.js')).default;
}

async function main() {
  // Dynamically import isomorphic-git at runtime
  git = (await import('isomorphic-git')).default;
  
  const dir = process.cwd();

  try {
    switch (command) {
      case 'init':
        await git.init({ fs, dir });
        console.log('Initialized empty Git repository');
        break;

      case 'add':
        const filepath = args[0] || '.';
        await git.add({ fs, dir, filepath });
        console.log(\`Added \${filepath} to staging area\`);
        break;

      case 'commit':
        let message = '';
        if (args[0] === '-m' && args[1]) {
          message = args[1];
        } else if (args[0] && !args[0].startsWith('-')) {
          message = args[0];
        } else {
          console.error('Please provide a commit message with -m flag');
          process.exit(1);
        }
        const sha = await git.commit({
          fs,
          dir,
          message,
          author: {
            name: 'WebContainer User',
            email: 'user@webcontainer.local'
          }
        });
        console.log(\`Created commit \${sha}\`);
        break;

      case 'clone':
        const url = args[0];
        const branch = args[1]; // Optional branch argument
        if (!url) {
          console.error('Please provide a repository URL to clone');
          break;
        }
        
        console.log(\`Cloning \${url}\${branch ? \` (branch: \${branch})\` : ''}...\`);
        try {
          const http = await getHttp();
          await git.clone({
            fs,
            http,
            dir,
            url,
            ref: branch || 'main',
            singleBranch: true,
            depth: 1
          });
          console.log('Cloned successfully');
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          console.error('Clone failed:', err.message);
        }
        break;

      case 'fetch':
        const fetchRemote = args[0] || 'origin';
        const fetchRef = args[1];
        try {
          const http = await getHttp();
          await git.fetch({
            fs,
            http,
            dir,
            remote: fetchRemote,
            ref: fetchRef
          });
          console.log(\`Fetched from \${fetchRemote}\${fetchRef ? \` (\${fetchRef})\` : ''}\`);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          console.error('Fetch failed:', err.message);
        }
        break;

      case 'checkout':
        const checkoutRef = args[0];
        if (!checkoutRef) {
          console.error('Please provide a branch or commit to checkout');
          break;
        }
        try {
          await git.checkout({
            fs,
            dir,
            ref: checkoutRef
          });
          console.log(\`Switched to \${checkoutRef}\`);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          console.error('Checkout failed:', err.message);
        }
        break;

      case 'branch':
        const newBranchName = args[0];
        const fromRef = args[1];
        if (!newBranchName) {
          // List branches
          try {
            const branches = await git.listBranches({ fs, dir });
            console.log('Branches:');
            branches.forEach(branch => console.log(\`  \${branch}\`));
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            console.error('Failed to list branches:', err.message);
          }
        } else {
          // Create new branch
          try {
            await git.branch({
              fs,
              dir,
              ref: newBranchName,
              checkout: fromRef ? false : true,
              start: fromRef
            });
            console.log(\`Created branch \${newBranchName}\${fromRef ? \` from \${fromRef}\` : ''}\`);
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            console.error('Branch creation failed:', err.message);
          }
        }
        break;

      case 'config':
        const configKey = args[0];
        const configValue = args[1];
        if (!configKey) {
          console.error('Please provide a config key');
          break;
        }
        try {
          if (configValue) {
            // Set config value
            await git.setConfig({
              fs,
              dir,
              path: configKey,
              value: configValue
            });
            console.log(\`Set \${configKey} = \${configValue}\`);
          } else {
            // Get config value
            const value = await git.getConfig({
              fs,
              dir,
              path: configKey
            });
            console.log(\`\${configKey} = \${value}\`);
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          console.error('Config operation failed:', err.message);
        }
        break;

      case 'status':
        const status = await git.statusMatrix({ fs, dir });
        const fileStatuses = status.map(([filepath, head, workdir, stage]) => {
          let status = '';
          if (head === 0 && workdir === 2) status = 'added';
          if (head === 1 && workdir === 2) status = 'modified';
          if (head === 1 && workdir === 0) status = 'deleted';
          if (head === 1 && stage === 2) status = 'staged';
          return \`\${status.padEnd(10)} \${filepath}\`;
        });
        console.log(fileStatuses.join('\\n'));
        break;

      default:
        console.log(\`
Available commands:
  init                    Initialize a new git repository
  add [<path>]           Add file contents to the staging area
  commit -m <message>    Record changes to the repository
  status                 Show the working tree status
  clone <url> [<branch>] Clone a repository into a new directory
  fetch [<remote>] [<ref>]  Download objects and refs from another repository
  checkout <ref>         Switch branches or restore working tree files
  branch [<name>] [<from>]  List, create, or delete branches
  config <key> [<value>] Get or set repository or global options
\`);
        break;
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();`;

      await this.webcontainer.fs.writeFile('.bolt/bin/git.ts', gitScript);
      
      // make the script executable
      await this.webcontainer.spawn('chmod', ['+x', '.bolt/bin/git.ts']);

      console.log('Bolt tools initialized successfully');
    } catch (error) {
      console.warn('Failed to ensure bolt tools:', error);
    }
  }

  private async _cloneRepository(project: Project, branch: string): Promise<void> {
    try {
      // use our custom git script for cloning
      const cloneProcess = await this.webcontainer.spawn('node', ['.bolt/bin/git.ts', 'clone', project.gitUrl, branch]);

      await cloneProcess.exit;

      console.log(`Repository cloned successfully: ${project.gitUrl} (${branch})`);
    } catch (error) {
      console.error('Failed to clone repository:', error);
      throw new Error(`Failed to clone repository: ${error}`);
    }
  }

  private async _setupEnvironment(_project: Project, _thread: Thread): Promise<void> {
    try {
      // check if package.json exists and install dependencies
      try {
        await this.webcontainer.fs.readFile('package.json', 'utf-8');
        console.log('Installing dependencies...');
        
        const installProcess = await this.webcontainer.spawn('npm', ['install']);
        await installProcess.exit;
        
        console.log('Dependencies installed successfully');
      } catch {
        console.log('No package.json found, skipping dependency installation');
      }

      // set up git config (optional) - using our custom git script
      try {
        await this.webcontainer.spawn('node', ['.bolt/bin/git.ts', 'config', 'user.email', 'user@bolt.dev']);
        await this.webcontainer.spawn('node', ['.bolt/bin/git.ts', 'config', 'user.name', 'Bolt User']);
      } catch (error) {
        console.warn('Failed to set git config:', error);
      }

      console.log('Environment setup completed');
    } catch (error) {
      console.error('Failed to setup environment:', error);
      throw new Error(`Failed to setup environment: ${error}`);
    }
  }

  getCurrentContext(): ProjectContext | null {
    return this.currentContext;
  }

  async switchBranch(branchName: string): Promise<void> {
    if (!this.currentContext) {
      throw new Error('No project context available');
    }

    try {
      // fetch the branch if it doesn't exist locally
      await this.webcontainer.spawn('node', ['.bolt/bin/git.ts', 'fetch', 'origin', branchName]);
      
      // switch to the branch
      const checkoutProcess = await this.webcontainer.spawn('node', ['.bolt/bin/git.ts', 'checkout', branchName]);
      await checkoutProcess.exit;

      // update the current context
      this.currentContext = {
        ...this.currentContext,
        thread: {
          ...this.currentContext.thread,
          branch: branchName,
        },
      };

      console.log(`Switched to branch: ${branchName}`);
    } catch (error) {
      console.error('Failed to switch branch:', error);
      throw new Error(`Failed to switch branch: ${error}`);
    }
  }

  async createBranch(branchName: string, fromBranch?: string): Promise<void> {
    try {
      if (fromBranch) {
        await this.webcontainer.spawn('node', ['.bolt/bin/git.ts', 'branch', branchName, fromBranch]);
        await this.webcontainer.spawn('node', ['.bolt/bin/git.ts', 'checkout', branchName]);
      } else {
        await this.webcontainer.spawn('node', ['.bolt/bin/git.ts', 'branch', branchName]);
        await this.webcontainer.spawn('node', ['.bolt/bin/git.ts', 'checkout', branchName]);
      }

      console.log(`Created and switched to branch: ${branchName}`);
    } catch (error) {
      console.error('Failed to create branch:', error);
      throw new Error(`Failed to create branch: ${error}`);
    }
  }

  async commitChanges(message: string): Promise<void> {
    try {
      await this.webcontainer.spawn('node', ['.bolt/bin/git.ts', 'add', '.']);
      await this.webcontainer.spawn('node', ['.bolt/bin/git.ts', 'commit', '-m', message]);
      
      console.log('Changes committed successfully');
    } catch (error) {
      console.error('Failed to commit changes:', error);
      throw new Error(`Failed to commit changes: ${error}`);
    }
  }

  async pushChanges(): Promise<void> {
    if (!this.currentContext) {
      throw new Error('No project context available');
    }

    try {
      const pushProcess = await this.webcontainer.spawn('node', [
        '.bolt/bin/git.ts',
        'push',
        this.currentContext.project.gitUrl,
        'origin',
        this.currentContext.thread.branch,
      ]);
      await pushProcess.exit;

      console.log('Changes pushed successfully');
    } catch (error) {
      console.error('Failed to push changes:', error);
      throw new Error(`Failed to push changes: ${error}`);
    }
  }
}