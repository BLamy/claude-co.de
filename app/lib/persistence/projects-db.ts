import { createScopedLogger } from '~/utils/logger';
import type { Project, Thread } from '~/lib/stores/projects';
import { getDB, initSchema, createDBOperations } from '~/lib/pglite/db-core';
import { PROJECTS_SCHEMA, type ProjectsSchema } from './projects-schema';
import type { DBOperations } from '~/lib/pglite/types';
import type { Message } from 'ai';

const logger = createScopedLogger('ProjectsDB');

let dbOperations: DBOperations<ProjectsSchema> | null = null;

// Initialize the projects database
export async function initProjectsDatabase(): Promise<DBOperations<ProjectsSchema>> {
  if (dbOperations) {
    return dbOperations;
  }

  // Check if we're on the client side
  if (typeof window === 'undefined') {
    throw new Error('Database can only be initialized on the client side');
  }

  try {
    console.log('[ProjectsDB] Starting database initialization...');
    const db = await getDB('bolt-projects-db');
    console.log('[ProjectsDB] Database instance created successfully');
    
    await initSchema(db, PROJECTS_SCHEMA);
    console.log('[ProjectsDB] Database schema initialized successfully');
    
    dbOperations = createDBOperations(db, PROJECTS_SCHEMA, false, true);
    console.log('[ProjectsDB] Database operations created successfully');
    
    return dbOperations;
  } catch (error) {
    logger.error('Failed to initialize projects database:', error);
    console.error('[ProjectsDB] Database initialization failed:', error);
    throw error;
  }
}

// Get database operations
async function getDbOps(): Promise<DBOperations<ProjectsSchema>> {
  if (!dbOperations) {
    dbOperations = await initProjectsDatabase();
  }
  return dbOperations;
}

// CRUD operations for projects
export async function getAllProjects(): Promise<Project[]> {
  console.log('[ProjectsDB] Getting all projects...');
  const ops = await getDbOps();
  console.log('[ProjectsDB] Database operations ready');
  
  const rows = await ops.projects.findMany({ orderBy: { created_at: 'desc' } });
  console.log('[ProjectsDB] Found', rows.length, 'projects in database');
  
  // Convert from DB format to app format
  const projects = rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    gitUrl: row.git_url,
    owner: row.owner,
    repo: row.repo,
    defaultBranch: row.default_branch,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
  
  console.log('[ProjectsDB] Returning', projects.length, 'projects:', projects.map(p => p.id));
  return projects;
}

export async function getProject(id: string): Promise<Project | null> {
  const ops = await getDbOps();
  const row = await ops.projects.findUnique({ id });
  
  if (!row) {
    return null;
  }
  
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    gitUrl: row.git_url,
    owner: row.owner,
    repo: row.repo,
    defaultBranch: row.default_branch,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function saveProject(project: Project): Promise<void> {
  const ops = await getDbOps();
  const existing = await ops.projects.findUnique({ id: project.id });
  
  // Convert to DB format
  const dbProject = {
    id: project.id,
    name: project.name,
    description: project.description || '',
    git_url: project.gitUrl,
    owner: project.owner,
    repo: project.repo,
    default_branch: project.defaultBranch,
    created_at: project.createdAt,
    updated_at: project.updatedAt
  };
  
  if (existing) {
    await ops.projects.update({
      where: { id: project.id },
      data: dbProject
    });
  } else {
    await ops.projects.create(dbProject);
  }
}

export async function deleteProject(id: string): Promise<void> {
  const ops = await getDbOps();
  
  // Delete all threads for this project first
  if (ops.threads.deleteMany) {
    await ops.threads.deleteMany({ where: { project_id: id } });
  }
  
  // Then delete the project
  await ops.projects.delete({ id });
}

// CRUD operations for threads
export async function getAllThreads(): Promise<Thread[]> {
  const ops = await getDbOps();
  const rows = await ops.threads.findMany({ orderBy: { created_at: 'desc' } });
  
  // Convert from DB format to app format
  return rows.map(row => ({
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    branch: row.branch,
    messages: row.messages ? JSON.parse(row.messages) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function getThreadsByProject(projectId: string): Promise<Thread[]> {
  const ops = await getDbOps();
  const rows = await ops.threads.findMany({ 
    where: { project_id: projectId },
    orderBy: { created_at: 'desc' }
  });
  
  // Convert from DB format to app format
  return rows.map(row => ({
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    branch: row.branch,
    messages: row.messages ? JSON.parse(row.messages) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function getThread(id: string): Promise<Thread | null> {
  const ops = await getDbOps();
  const row = await ops.threads.findUnique({ id });
  
  if (!row) {
    return null;
  }
  
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    branch: row.branch,
    messages: row.messages ? JSON.parse(row.messages) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function saveThread(thread: Thread): Promise<void> {
  const ops = await getDbOps();
  const existing = await ops.threads.findUnique({ id: thread.id });
  
  // Convert to database format
  const dbThread = {
    id: thread.id,
    project_id: thread.projectId,
    name: thread.name,
    description: thread.description || '',
    branch: thread.branch,
    messages: JSON.stringify(thread.messages || []),
    created_at: thread.createdAt,
    updated_at: thread.updatedAt
  };
  
  if (existing) {
    await ops.threads.update({
      where: { id: thread.id },
      data: dbThread
    });
  } else {
    await ops.threads.create(dbThread);
  }
}

export async function deleteThread(id: string): Promise<void> {
  const ops = await getDbOps();
  await ops.threads.delete({ id });
}

// Utility functions
export async function findProjectByRepo(owner: string, repo: string): Promise<Project | null> {
  const ops = await getDbOps();
  const rows = await ops.projects.findMany({ 
    where: { owner, repo } 
  });
  
  if (rows.length === 0) {
    return null;
  }
  
  const row = rows[0];
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    gitUrl: row.git_url,
    owner: row.owner,
    repo: row.repo,
    defaultBranch: row.default_branch,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}