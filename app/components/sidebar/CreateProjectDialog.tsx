import { useState } from 'react';
import { useProjects } from '~/lib/hooks/useProjects';
import { useGitHubSettings } from '~/lib/hooks/useGitHubSettings';
import { Dialog, DialogButton, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { isValidGitHubInput } from '~/lib/github/api';

interface CreateProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated?: (projectId: string) => void;
}

export function CreateProjectDialog({ isOpen, onClose, onProjectCreated }: CreateProjectDialogProps) {
  const { createProjectFromGitHub, normalizeRepoInput } = useProjects();
  const { isConfigured } = useGitHubSettings();
  const [repoInput, setRepoInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!repoInput.trim()) {
      setError('Repository URL or name is required');
      return;
    }

    if (!isValidGitHubInput(repoInput)) {
      setError('Invalid repository format. Use "owner/repo" or full GitHub URL');
      return;
    }

    if (!isConfigured) {
      setError('GitHub token not configured. Please configure it first.');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const project = await createProjectFromGitHub(repoInput);
      if (project) {
        setRepoInput('');
        onClose();
        onProjectCreated?.(project.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  const handleInputChange = (value: string) => {
    setRepoInput(value);
    setError(null);
  };

  const normalizedInput = repoInput ? normalizeRepoInput(repoInput) : '';

  return (
    <DialogRoot open={isOpen}>
      <Dialog onBackdrop={onClose} onClose={onClose}>
        <DialogTitle>Create New Project</DialogTitle>
        <DialogDescription asChild>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-bolt-elements-textSecondary mb-4">
                Add a GitHub repository as a new project. You can work on different branches as separate threads.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                GitHub Repository
              </label>
              <input
                type="text"
                value={repoInput}
                onChange={(e) => handleInputChange(e.target.value)}
                placeholder="owner/repo or https://github.com/owner/repo"
                className="w-full px-3 py-2 border border-bolt-elements-borderColor rounded-md bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
                disabled={isCreating}
              />
              {normalizedInput && normalizedInput !== repoInput && (
                <p className="text-xs text-bolt-elements-textTertiary mt-1">
                  Will create project for: <code>{normalizedInput}</code>
                </p>
              )}
            </div>

            {error && (
              <div className="text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            {!isConfigured && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  GitHub token not configured. Please configure your GitHub token in settings first.
                </p>
              </div>
            )}

            <div className="text-xs text-bolt-elements-textTertiary space-y-1">
              <p>Supported formats:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><code>owner/repository</code></li>
                <li><code>https://github.com/owner/repository</code></li>
                <li><code>git@github.com:owner/repository.git</code></li>
              </ul>
            </div>
          </div>
        </DialogDescription>
        
        <div className="px-5 pb-4 bg-bolt-elements-background-depth-2 flex gap-2 justify-end">
          <DialogButton type="secondary" onClick={onClose}>
            Cancel
          </DialogButton>
          <DialogButton 
            type="primary" 
            onClick={handleCreate}
            disabled={isCreating || !repoInput.trim() || !isValidGitHubInput(repoInput) || !isConfigured}
          >
            {isCreating ? 'Creating...' : 'Create Project'}
          </DialogButton>
        </div>
      </Dialog>
    </DialogRoot>
  );
}