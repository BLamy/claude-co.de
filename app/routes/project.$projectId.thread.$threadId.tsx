import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { useLoaderData, useNavigate } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { Chat, ChatImpl } from '~/components/chat/Chat.client';
import { useProjects } from '~/lib/hooks/useProjects';
import { useWebContainerProject } from '~/lib/hooks/useWebContainerProject';
import { currentThread } from '~/lib/stores/projects';
import { toast } from 'react-toastify';

export async function loader({ params }: LoaderFunctionArgs) {
  const { projectId, threadId } = params;
  
  if (!projectId || !threadId) {
    throw new Response('Project ID and Thread ID are required', { status: 400 });
  }

  return json({ projectId, threadId });
}

export default function ProjectThreadPage() {
  console.log('[ProjectThreadPage] Component rendering');
  const { projectId, threadId } = useLoaderData<typeof loader>();
  console.log('[ProjectThreadPage] Loader data:', { projectId, threadId });
  const navigate = useNavigate();
  const { projects, threads, setCurrentProject, setCurrentThread, loading } = useProjects();
  const [currentProject, setCurrentProjectState] = useState<typeof projects[0] | null>(null);
  const [currentThread, setCurrentThreadState] = useState<typeof threads[0] | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasCheckedProjects, setHasCheckedProjects] = useState(false);

  // Use the webcontainer project setup hook
  const { isSetup: isWebContainerSetup, isLoading: isWebContainerLoading, error: webContainerError } = useWebContainerProject(
    currentProject,
    currentThread
  );

  useEffect(() => {
    console.log(`[ProjectThreadPage] Effect running - loading: ${loading}, projectId: ${projectId}, projects count: ${projects.length}`);
    
    // Wait for projects to load before checking
    if (loading) {
      console.log('[ProjectThreadPage] Still loading projects, waiting...');
      return;
    }

    // Only run this logic once after loading is complete
    if (isReady) {
      console.log('[ProjectThreadPage] Already processed, skipping...');
      return;
    }

    // Find the project and thread
    const project = projects.find(p => p.id === projectId);
    const thread = threads.find(t => t.id === threadId);

    console.log(`[ProjectThreadPage] Looking for project ${projectId}, found:`, project ? 'yes' : 'no');
    console.log('[ProjectThreadPage] Available projects:', projects.map(p => ({ id: p.id, name: p.name })));

    if (!project && !hasCheckedProjects) {
      console.error(`Project not found on first check: ${projectId}. Available projects:`, projects.map(p => p.id));
      // Give it more time for projects to load - sometimes the store updates are delayed
      setTimeout(() => {
        setHasCheckedProjects(true);
      }, 1000);
      return;
    }

    if (!project && hasCheckedProjects) {
      console.error(`Project still not found after delay: ${projectId}. Available projects:`, projects.map(p => p.id));
      toast.error('Project not found');
      navigate('/', { replace: true });
      return;
    }

    if (!thread) {
      console.error(`Thread not found: ${threadId}. Available threads:`, threads.map(t => t.id));
      toast.error('Thread not found');
      navigate('/', { replace: true });
      return;
    }

    if (thread.projectId !== project.id) {
      console.error(`Thread ${threadId} belongs to project ${thread.projectId}, not ${project.id}`);
      toast.error('Thread does not belong to this project');
      navigate('/', { replace: true });
      return;
    }

    // Set the current project and thread in store and local state
    setCurrentProject(project);
    setCurrentThread(thread);
    setCurrentProjectState(project);
    setCurrentThreadState(thread);
    setIsReady(true);

    console.log(`Switched to project: ${project.name}, thread: ${thread.name} (${thread.branch})`);
  }, [projectId, threadId, projects, threads, loading, hasCheckedProjects, isReady, navigate]);

  // Show error if webcontainer setup failed
  if (webContainerError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-lg font-medium text-red-500 mb-2">
            Failed to setup project
          </div>
          <div className="text-sm text-bolt-elements-textSecondary">
            {webContainerError}
          </div>
          <button
            onClick={() => navigate('/', { replace: true })}
            className="mt-4 px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-md hover:bg-bolt-elements-button-primary-backgroundHover"
          >
            Go back to projects
          </button>
        </div>
      </div>
    );
  }

  // Show loading states
  if (loading || !isReady || isWebContainerLoading || !isWebContainerSetup) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-lg font-medium text-bolt-elements-textPrimary mb-2">
            {loading ? 'Loading projects...' : isWebContainerLoading ? 'Setting up project...' : 'Loading project...'}
          </div>
          <div className="text-sm text-bolt-elements-textSecondary">
            {loading ? 'Fetching project data from database' : 
             isWebContainerLoading ? 'Cloning repository and setting up environment' : 
             'Preparing webcontainer'}
          </div>
        </div>
      </div>
    );
  }

  return <ThreadChat thread={currentThread} project={currentProject} />;
}

// Component that provides thread messages to the Chat component
function ThreadChat({ thread, project }: { thread: any; project: any }) {
  const { updateThreadMessages } = useProjects();
  const currentThreadData = useStore(currentThread);
  
  // Use thread messages as initial messages
  const initialMessages = currentThreadData?.messages || [];
  
  // Handler to save messages back to the thread
  const storeMessageHistory = async (messages: Message[]) => {
    if (currentThreadData) {
      await updateThreadMessages(currentThreadData.id, messages);
    }
  };

  return (
    <ChatImpl 
      initialMessages={initialMessages} 
      storeMessageHistory={storeMessageHistory}
    />
  );
}