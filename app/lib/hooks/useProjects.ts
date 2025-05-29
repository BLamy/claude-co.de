import { useCallback, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { toast } from 'react-toastify';
import { 
  projects, 
  threads, 
  currentProject, 
  currentThread,
  isLoadingProjects,
  isLoadingThreads,
  generateProjectId,
  generateThreadId,
  addProject,
  updateProject,
  removeProject,
  addThread,
  updateThread,
  removeThread,
  setCurrentProject,
  setCurrentThread,
  getProjectThreads,
  type Project,
  type Thread
} from '~/lib/stores/projects';
import { 
  initProjectsDatabase,
  getAllProjects,
  getAllThreads,
  saveProject,
  saveThread,
  deleteProject,
  deleteThread,
  findProjectByRepo
} from '~/lib/persistence/projects-db';
import { useGitHubSettings } from './useGitHubSettings';
import { parseGitHubUrl, normalizeRepoInput } from '~/lib/github/api';

const persistenceEnabled = !import.meta.env.VITE_DISABLE_PERSISTENCE;

// Add a flag to prevent multiple simultaneous loads
let isLoadingInProgress = false;
// Track if we've already loaded projects in this session
let hasLoadedProjects = false;

export function useProjects() {
  const allProjects = useStore(projects);
  const allThreads = useStore(threads);
  const current = useStore(currentProject);
  const currentThreadValue = useStore(currentThread);
  const loading = useStore(isLoadingProjects);
  const threadsLoading = useStore(isLoadingThreads);
  const { getApi } = useGitHubSettings();

  // Load projects and threads from database
  const loadProjects = useCallback(async () => {
    if (isLoadingInProgress) {
      console.log('[useProjects] loadProjects: already in progress, skipping');
      return;
    }
    if (!persistenceEnabled || typeof window === 'undefined') {
      console.log('[useProjects] loadProjects: persistence disabled or not on client, setting loading false');
      isLoadingProjects.set(false);
      return;
    }

    console.log('[useProjects] loadProjects: starting load process');
    isLoadingInProgress = true;

    try {
      isLoadingProjects.set(true);
      console.log('[useProjects] loadProjects: set loading to true');
      
      // Add timeout to prevent infinite loading - race with the actual loading
      const loadingPromise = (async () => {
        // Initialize database if needed
        console.log('[useProjects] loadProjects: initializing database...');
        await initProjectsDatabase();
        console.log('[useProjects] loadProjects: database initialized');
        
        const [projectsData, threadsData] = await Promise.all([
          getAllProjects(),
          getAllThreads()
        ]);

        console.log('[useProjects] loadProjects: got', projectsData.length, 'projects and', threadsData.length, 'threads');
        projects.set(projectsData);
        threads.set(threadsData);
        hasLoadedProjects = true;
        console.log('[useProjects] loadProjects: set project and thread data in stores');
        return { projectsData, threadsData };
      })();

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Database loading timeout after 5 seconds'));
        }, 5000);
      });

      await Promise.race([loadingPromise, timeoutPromise]);
    } catch (error) {
      console.error('Failed to load projects:', error);
      // Set empty arrays so the app can continue
      projects.set([]);
      threads.set([]);
      hasLoadedProjects = true; // Prevent retries
      // Only show toast on client side
      if (typeof window !== 'undefined') {
        toast.error('Failed to load projects: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
    } finally {
      isLoadingProjects.set(false);
      isLoadingInProgress = false;
      console.log('[useProjects] loadProjects: completed, loading set to false');
    }
  }, []);

  // Create a new project from GitHub repo
  const createProjectFromGitHub = useCallback(async (input: string): Promise<Project | null> => {
    const api = getApi();
    if (!api) {
      toast.error('GitHub token not configured');
      return null;
    }

    const parsed = parseGitHubUrl(input);
    if (!parsed) {
      toast.error('Invalid GitHub repository format');
      return null;
    }

    try {
      // Check if project already exists
      if (persistenceEnabled && typeof window !== 'undefined') {
        const existing = await findProjectByRepo(parsed.owner, parsed.repo);
        if (existing) {
          toast.error('Project already exists');
          return existing;
        }
      }

      // Validate access and get repo data
      const projectData = await api.createProjectFromRepo(parsed.owner, parsed.repo);
      
      const project: Project = {
        id: generateProjectId(),
        ...projectData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Save to database and store
      if (persistenceEnabled && typeof window !== 'undefined') {
        await saveProject(project);
      }
      addProject(project);

      // Create a default thread for the project
      const defaultThread: Thread = {
        id: generateThreadId(),
        projectId: project.id,
        name: 'Main',
        branch: project.defaultBranch,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Save thread to database and store
      if (persistenceEnabled && typeof window !== 'undefined') {
        await saveThread(defaultThread);
      }
      addThread(defaultThread);

      // Projects are already in sync since we added them to the store above

      toast.success(`Project "${project.name}" created successfully`);
      return project;
    } catch (error) {
      console.error('Failed to create project:', error);
      toast.error(`Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }, [getApi]);

  // Create a new thread in a project
  const createThread = useCallback(async (projectId: string, name: string, branch: string = 'main'): Promise<Thread | null> => {
    const project = allProjects.find(p => p.id === projectId);
    if (!project) {
      toast.error('Project not found');
      return null;
    }

    try {
      const thread: Thread = {
        id: generateThreadId(),
        projectId,
        name,
        branch,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Save to database and store
      if (persistenceEnabled && typeof window !== 'undefined') {
        await saveThread(thread);
      }
      addThread(thread);

      toast.success(`Thread "${name}" created successfully`);
      return thread;
    } catch (error) {
      console.error('Failed to create thread:', error);
      toast.error('Failed to create thread');
      return null;
    }
  }, [allProjects]);

  // Update thread messages
  const updateThreadMessages = useCallback(async (threadId: string, messages: any[]) => {
    try {
      const updates = { messages };
      updateThread(threadId, updates);

      if (persistenceEnabled && typeof window !== 'undefined') {
        const thread = allThreads.find(t => t.id === threadId);
        if (thread) {
          await saveThread({ ...thread, ...updates });
        }
      }
    } catch (error) {
      console.error('Failed to update thread messages:', error);
      toast.error('Failed to save messages');
    }
  }, [allThreads]);

  // Delete a project and all its threads
  const deleteProjectAndThreads = useCallback(async (projectId: string) => {
    try {
      if (persistenceEnabled && typeof window !== 'undefined') {
        await deleteProject(projectId);
      }
      removeProject(projectId);
      toast.success('Project deleted successfully');
    } catch (error) {
      console.error('Failed to delete project:', error);
      toast.error('Failed to delete project');
    }
  }, []);

  // Delete a thread
  const deleteThreadById = useCallback(async (threadId: string) => {
    try {
      if (persistenceEnabled && typeof window !== 'undefined') {
        await deleteThread(threadId);
      }
      removeThread(threadId);
      toast.success('Thread deleted successfully');
    } catch (error) {
      console.error('Failed to delete thread:', error);
      toast.error('Failed to delete thread');
    }
  }, []);

  // Switch to a different project/thread (this will trigger webcontainer reload)
  const switchToThread = useCallback(async (threadId: string) => {
    console.log('[useProjects] switchToThread called with:', threadId);
    const thread = allThreads.find(t => t.id === threadId);
    if (!thread) {
      console.error('[useProjects] Thread not found:', threadId);
      toast.error('Thread not found');
      return;
    }

    const project = allProjects.find(p => p.id === thread.projectId);
    if (!project) {
      console.error('[useProjects] Project not found for thread:', thread.projectId);
      toast.error('Project not found');
      return;
    }

    console.log('[useProjects] Found project and thread, navigating...');
    // Set current project and thread
    setCurrentProject(project);
    setCurrentThread(thread);

    // Hard navigation to reload webcontainer with new project
    const url = new URL(window.location.href);
    url.pathname = `/project/${project.id}/thread/${thread.id}`;
    console.log('[useProjects] Navigating to:', url.toString());
    window.location.href = url.toString();
  }, [allProjects, allThreads]);

  // Load projects only once when the app starts
  useEffect(() => {
    if (!hasLoadedProjects && persistenceEnabled && typeof window !== 'undefined') {
      console.log('[useProjects] Initial load of projects');
      hasLoadedProjects = true;
      loadProjects();
    }
  }, []); // Empty dependency array - only run once

  return {
    // State
    projects: allProjects,
    threads: allThreads,
    currentProject: current,
    currentThread: currentThreadValue,
    loading,
    threadsLoading,

    // Actions
    loadProjects,
    createProjectFromGitHub,
    createThread,
    updateThreadMessages,
    deleteProject: deleteProjectAndThreads,
    deleteThread: deleteThreadById,
    switchToThread,
    
    // Setters
    setCurrentProject,
    setCurrentThread,

    // Helpers
    getProjectThreads: (projectId: string) => getProjectThreads(projectId),
    normalizeRepoInput,
  };
}