export interface RecentProject {
  owner: string;
  repo: string;
  url: string;
  visitedAt: string;
}

const STORAGE_KEY = 'bolt-recent-projects';
const MAX_RECENT_PROJECTS = 10;

export function getRecentProjects(): RecentProject[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    
    const projects = JSON.parse(stored) as RecentProject[];
    return projects.slice(0, MAX_RECENT_PROJECTS);
  } catch (error) {
    console.error('Failed to load recent projects:', error);
    return [];
  }
}

export function addRecentProject(owner: string, repo: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    const projects = getRecentProjects();
    const url = `https://github.com/${owner}/${repo}`;
    
    // Remove existing entry if present
    const filtered = projects.filter(p => !(p.owner === owner && p.repo === repo));
    
    // Add new entry at the beginning
    const newProject: RecentProject = {
      owner,
      repo,
      url,
      visitedAt: new Date().toISOString(),
    };
    
    const updated = [newProject, ...filtered].slice(0, MAX_RECENT_PROJECTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save recent project:', error);
  }
}

export function clearRecentProjects(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear recent projects:', error);
  }
}