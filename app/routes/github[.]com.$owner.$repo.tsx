import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { useLoaderData, useNavigation } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { Workbench } from '~/components/workbench/Workbench.client';
import { workbenchStore } from '~/lib/stores/workbench';
import { webcontainer } from '~/lib/webcontainer';

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const title = data ? `${data.owner}/${data.repo} - Bolt` : 'Cloning Repository - Bolt';
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
    let isCancelled = false;

    async function cloneRepository() {
      if (cloneStatus !== 'idle') return;
      
      setCloneStatus('cloning');
      setCloneError(null);

      try {
        // Wait for webcontainer to be ready
        const container = await webcontainer;
        


        console.log(`Starting clone of ${repoUrl}...`);

        // Use the webcontainer's custom git implementation to clone
        console.log('Starting git clone with custom implementation...');
        const installIsomorphicGit = await container.spawn('pnpm', ['install', 'isomorphic-git'], {
          output: true,
          cwd: './.bolt/bin',
        });
        await installIsomorphicGit.exit;
        const cloneProcess = await container.spawn('node', ['./.bolt/bin/git.js', 'clone', repoUrl], {
          output: true,
        });

        let cloneOutput = '';
        
        // Listen for output to track progress
        cloneProcess.output.pipeTo(new WritableStream({
          write(data) {
            let text: string;
            if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
              text = new TextDecoder().decode(data);
            } else if (typeof data === 'string') {
              text = data;
            } else {
              text = String(data);
            }
            cloneOutput += text;
            console.log('Clone output:', text);
          },
        }));

        // Wait for the clone to complete
        const exitCode = await cloneProcess.exit;
        
        if (exitCode !== 0) {
          console.error('Git clone failed with output:', cloneOutput);
          throw new Error(`Git clone failed with exit code ${exitCode}. Output: ${cloneOutput}`);
        }

        // if (isCancelled) return;

        console.log('Repository cloned successfully!');
        
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