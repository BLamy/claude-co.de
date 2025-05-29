import { atom } from 'nanostores';
import type { Message } from 'ai';

export interface Project {
  id: string;
  name: string;
  description?: string;
  gitUrl: string;
  owner: string;
  repo: string;
  defaultBranch: string;
  createdAt: string;
  updatedAt: string;
}

export interface Thread {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  branch: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

// Current project and thread state
export const currentProject = atom<Project | null>(null);
export const currentThread = atom<Thread | null>(null);

// All projects and threads
export const projects = atom<Project[]>([]);
export const threads = atom<Thread[]>([]);

// Loading states
export const isLoadingProjects = atom<boolean>(false);
export const isLoadingThreads = atom<boolean>(false);


// Helper functions
export function getProjectThreads(projectId: string): Thread[] {
  return threads.get().filter(thread => thread.projectId === projectId);
}

export function setCurrentProject(project: Project | null) {
  currentProject.set(project);
  if (!project) {
    currentThread.set(null);
  }
}

export function setCurrentThread(thread: Thread | null) {
  currentThread.set(thread);
  if (thread) {
    const project = projects.get().find(p => p.id === thread.projectId);
    if (project) {
      currentProject.set(project);
    }
  }
}

export function addProject(project: Project) {
  projects.set([...projects.get(), project]);
}

export function updateProject(projectId: string, updates: Partial<Project>) {
  const allProjects = projects.get();
  const index = allProjects.findIndex(p => p.id === projectId);
  if (index >= 0) {
    allProjects[index] = { ...allProjects[index], ...updates, updatedAt: new Date().toISOString() };
    projects.set([...allProjects]);
    
    // Update current project if it's the one being updated
    const current = currentProject.get();
    if (current && current.id === projectId) {
      currentProject.set(allProjects[index]);
    }
  }
}

export function removeProject(projectId: string) {
  const allProjects = projects.get();
  projects.set(allProjects.filter(p => p.id !== projectId));
  
  // Remove all threads for this project
  const allThreads = threads.get();
  threads.set(allThreads.filter(t => t.projectId !== projectId));
  
  // Clear current state if needed
  const current = currentProject.get();
  if (current && current.id === projectId) {
    currentProject.set(null);
    currentThread.set(null);
  }
}

export function addThread(thread: Thread) {
  threads.set([...threads.get(), thread]);
}

export function updateThread(threadId: string, updates: Partial<Thread>) {
  const allThreads = threads.get();
  const index = allThreads.findIndex(t => t.id === threadId);
  if (index >= 0) {
    allThreads[index] = { ...allThreads[index], ...updates, updatedAt: new Date().toISOString() };
    threads.set([...allThreads]);
    
    // Update current thread if it's the one being updated
    const current = currentThread.get();
    if (current && current.id === threadId) {
      currentThread.set(allThreads[index]);
    }
  }
}

export function removeThread(threadId: string) {
  const allThreads = threads.get();
  threads.set(allThreads.filter(t => t.id !== threadId));
  
  // Clear current thread if needed
  const current = currentThread.get();
  if (current && current.id === threadId) {
    currentThread.set(null);
  }
}

// Generate unique IDs
export function generateProjectId(): string {
  return `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateThreadId(): string {
  return `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}