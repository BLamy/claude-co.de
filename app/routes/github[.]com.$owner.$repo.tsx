import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { useLoaderData, useNavigation } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { Workbench } from '~/components/workbench/Workbench.client';
import { workbenchStore } from '~/lib/stores/workbench';
import { webcontainer } from '~/lib/webcontainer';
import { addRecentProject } from '~/lib/stores/recent-projects';

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const title = data ? `${data.owner}/${data.repo} - claude-co.de` : 'Cloning Repository - claude-co.de';
  return [
    { title },
    { name: 'description', content: `Development environment for ${data?.owner}/${data?.repo}` },
  ];
};

export async function loader({ params }: LoaderFunctionArgs) {
  const { owner, repo } = params;
  
  if (!owner || !repo) {
    throw new Response('Owner and repo are required', { status: 400 });
  }

  return json({
    owner,
    repo,
    repoUrl: `https://github.com/${owner}/${repo}.git`,
  });
}

export default function GitHubRepo() {
  const { owner, repo, repoUrl } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const [cloneStatus, setCloneStatus] = useState<'idle' | 'cloning' | 'success' | 'error'>('idle');
  const [cloneError, setCloneError] = useState<string | null>(null);

  useEffect(() => {
    // Save to recent projects when component mounts
    addRecentProject(owner, repo);
  }, [owner, repo]);

  useEffect(() => {
    let isCancelled = false;

    async function cloneRepository() {
      if (cloneStatus !== 'idle') return;
      
      setCloneStatus('cloning');
      setCloneError(null);

      try {
        // Wait for webcontainer to be ready
        const container = await webcontainer;
        


        console.log(`Starting clone of ${repoUrl}...`);

        // First, install isomorphic-git in the .bolt/bin directory
        console.log('Installing isomorphic-git...');
        const installProcess = await container.spawn('npm', ['install', 'isomorphic-git@1.24.5'], {
          output: true,
          cwd: './.bolt/bin',
        });
        
        const installExitCode = await installProcess.exit;
        if (installExitCode !== 0) {
          throw new Error(`Failed to install isomorphic-git with exit code ${installExitCode}`);
        }
        
        // Use the webcontainer's custom git implementation to clone
        const cloneProcess = await container.spawn('node', ['./.bolt/bin/git.js', 'clone', repoUrl.replace(/\.git$/, '')], {
          output: true,
        });
        console.log('Starting git clone with custom implementation...');

        let cloneOutput = '';
        
        // Listen for output to track progress
        cloneProcess.output.pipeTo(new WritableStream({
          write(data) {
            console.log('Clone output:', data);

            let text: string;
            if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
              text = new TextDecoder().decode(data);
            } else if (typeof data === 'string') {
              text = data;
            } else {
              text = String(data);
            }
            cloneOutput += text;
          },
        }));

        // Wait for the clone to complete
        const exitCode2 = await cloneProcess.exit;
        
        if (exitCode2 !== 0) {
          console.error('Git clone failed with output:', cloneOutput);
          throw new Error(`Git clone failed with exit code ${exitCode2}. Output: ${cloneOutput}`);
        }

        // if (isCancelled) return;

        console.log('Repository cloned successfully!');
        
        // Post-clone setup: Update package.json and run pnpm link
        try {
          console.log('Checking for package.json...');
          const packageJsonPath = './package.json';
          
          // Check if package.json exists
          try {
            const packageJsonContent = await container.fs.readFile(packageJsonPath, 'utf-8');
            const packageJson = JSON.parse(packageJsonContent);
            
            console.log('Found package.json, updating bin configuration...');
            
            // Add or update the bin field
            if (!packageJson.bin) {
              packageJson.bin = {};
            }
            packageJson.bin.git = './.bolt/bin/git.js';
            packageJson.bin.grep = './.bolt/bin/grep.js';
            
            // Write the updated package.json
            await container.fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
            console.log('Updated package.json with git and grep bin entries');
            
            // Create .gitignore with .bolt/ entry if it doesn't exist or append to existing
            try {
              let gitignoreContent = '';
              try {
                gitignoreContent = await container.fs.readFile('./.gitignore', 'utf-8');
              } catch {
                // .gitignore doesn't exist, create it
              }
              
              if (!gitignoreContent.includes('.bolt/')) {
                gitignoreContent += gitignoreContent ? '\n.bolt/\n' : '.bolt/\n';
                await container.fs.writeFile('./.gitignore', gitignoreContent);
                console.log('Added .bolt/ to .gitignore');
              } else {
                console.log('.bolt/ already in .gitignore');
              }
            } catch (gitignoreError) {
              console.error('Failed to update .gitignore:', gitignoreError);
            }
            
            // Run pnpm link
            console.log('Running pnpm link...');
            const linkProcess = await container.spawn('pnpm', ['link', '.'], {
              output: true,
            });
            
            let linkOutput = '';
            linkProcess.output.pipeTo(new WritableStream({
              write(data) {
                const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
                linkOutput += text;
                console.log('pnpm link output:', text);
              },
            }));
            
            const linkExitCode = await linkProcess.exit;
            if (linkExitCode !== 0) {
              console.error('pnpm link failed:', linkOutput);
            } else {
              console.log('pnpm link completed successfully');
            }
          } catch (readError) {
            console.log('No package.json found in cloned repository, skipping git setup');
          }
        } catch (setupError) {
          console.error('Post-clone setup failed:', setupError);
          // Don't fail the entire clone operation if post-setup fails
        }
        
        // Refresh the workbench to show the new files
        workbenchStore.setShowWorkbench(true);
        
        setCloneStatus('success');
      } catch (error) {
        // if (isCancelled) return;
        
        console.error('Failed to clone repository:', error);
        setCloneError(error instanceof Error ? error.message : 'Unknown error occurred');
        setCloneStatus('error');
      }
    }

    cloneRepository();

    return () => {
      isCancelled = true;
    };
  }, [owner, repo, repoUrl, cloneStatus]);

  const isLoading = navigation.state === 'loading' || cloneStatus === 'cloning';

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-bolt-elements-background-depth-1">
        <div className="flex flex-col items-center gap-4 p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-bolt-brand"></div>
          <div className="text-center">
            <h2 className="text-xl font-semibold text-bolt-elements-textPrimary mb-2">
              Cloning Repository
            </h2>
            <p className="text-bolt-elements-textSecondary">
              {cloneStatus === 'cloning' 
                ? `Cloning ${owner}/${repo} into your workspace...`
                : 'Loading repository...'
              }
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (cloneStatus === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-bolt-elements-background-depth-1">
        <div className="flex flex-col items-center gap-4 p-8 max-w-md text-center">
          <div className="text-red-500 text-4xl">⚠️</div>
          <div>
            <h2 className="text-xl font-semibold text-bolt-elements-textPrimary mb-2">
              Failed to Clone Repository
            </h2>
            <p className="text-bolt-elements-textSecondary mb-4">
              Could not clone {owner}/{repo}
            </p>
            {cloneError && (
              <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950 p-3 rounded border">
                {cloneError}
              </p>
            )}
          </div>
          <button
            onClick={() => {
              setCloneStatus('idle');
              setCloneError(null);
            }}
            className="px-4 py-2 bg-bolt-brand text-white rounded hover:bg-bolt-brand/90 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full">
      <ClientOnly fallback={<div>Loading workspace...</div>}>
        {() => <Workbench chatStarted={true} />}
      </ClientOnly>
    </div>
  );
}