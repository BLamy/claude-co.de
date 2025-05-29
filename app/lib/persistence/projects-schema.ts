// Database schema for projects and threads
export const PROJECTS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    git_url TEXT NOT NULL,
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    default_branch TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    branch TEXT NOT NULL,
    messages TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_threads_project_id ON threads(project_id);
  CREATE INDEX IF NOT EXISTS idx_projects_owner_repo ON projects(owner, repo);
`;

// Type-safe parsed schema (will be inferred by PGlite type parser)
export type ProjectsSchema = {
  projects: {
    id: string;
    name: string;
    description: string;
    git_url: string;
    owner: string;
    repo: string;
    default_branch: string;
    created_at: string;
    updated_at: string;
  };
  threads: {
    id: string;
    project_id: string;
    name: string;
    description: string;
    branch: string;
    messages: string;
    created_at: string;
    updated_at: string;
  };
};