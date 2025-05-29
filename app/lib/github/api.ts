import type { Project } from '~/lib/stores/projects';

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  default_branch: string;
  owner: {
    login: string;
    type: string;
  };
  private: boolean;
  created_at: string;
  updated_at: string;
}

export interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

export class GitHubApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

export class GitHubApi {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `https://api.github.com${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Bolt-App',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new GitHubApiError(
        `GitHub API error: ${response.status} ${response.statusText} - ${errorData}`,
        response.status
      );
    }

    return response.json();
  }

  async getRepo(owner: string, repo: string): Promise<GitHubRepo> {
    return this.request<GitHubRepo>(`/repos/${owner}/${repo}`);
  }

  async getBranches(owner: string, repo: string): Promise<GitHubBranch[]> {
    return this.request<GitHubBranch[]>(`/repos/${owner}/${repo}/branches`);
  }

  async getDefaultBranch(owner: string, repo: string): Promise<string> {
    const repo_data = await this.getRepo(owner, repo);
    return repo_data.default_branch;
  }

  async validateAccess(owner: string, repo: string): Promise<boolean> {
    try {
      await this.getRepo(owner, repo);
      return true;
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) {
        return false;
      }
      throw error;
    }
  }

  async createProjectFromRepo(owner: string, repo: string): Promise<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>> {
    const repoData = await this.getRepo(owner, repo);
    
    return {
      name: repoData.name,
      description: repoData.description || undefined,
      gitUrl: repoData.clone_url,
      owner: repoData.owner.login,
      repo: repoData.name,
      defaultBranch: repoData.default_branch,
    };
  }
}

// Utility functions for parsing GitHub URLs and repo strings
export function parseGitHubUrl(input: string): { owner: string; repo: string } | null {
  // Handle full GitHub URLs
  const urlPatterns = [
    /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/.*)?$/,
    /^git@github\.com:([^\/]+)\/([^\/]+?)(?:\.git)?$/,
  ];

  for (const pattern of urlPatterns) {
    const match = input.match(pattern);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
  }

  // Handle owner/repo format
  const repoPattern = /^([^\/\s]+)\/([^\/\s]+)$/;
  const repoMatch = input.match(repoPattern);
  if (repoMatch) {
    return { owner: repoMatch[1], repo: repoMatch[2] };
  }

  return null;
}

export function isValidGitHubInput(input: string): boolean {
  return parseGitHubUrl(input) !== null;
}

export function normalizeRepoInput(input: string): string {
  const parsed = parseGitHubUrl(input);
  return parsed ? `${parsed.owner}/${parsed.repo}` : input;
}