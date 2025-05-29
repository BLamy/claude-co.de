import { useState, useEffect } from 'react';
import { useProjects } from '~/lib/hooks/useProjects';
import { useGitHubSettings } from '~/lib/hooks/useGitHubSettings';
import { Dialog, DialogButton, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import type { Project } from '~/lib/stores/projects';

interface CreateThreadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onThreadCreated?: (threadId: string) => void;
}

export function CreateThreadDialog({ isOpen, onClose, project, onThreadCreated }: CreateThreadDialogProps) {
  const { createThread } = useProjects();
  const { getApi } = useGitHubSettings();
  const [threadName, setThreadName] = useState('');
  const [selectedBranch, setSelectedBranch] = useState(project.defaultBranch);
  const [availableBranches, setAvailableBranches] = useState<string[]>([project.defaultBranch]);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBranches = async () => {
    const api = getApi();
    if (!api) return;

    setIsLoadingBranches(true);
    try {
      const branches = await api.getBranches(project.owner, project.repo);
      const branchNames = branches.map(b => b.name);
      setAvailableBranches(branchNames);
      
      // Keep selected branch if it exists, otherwise use default
      if (!branchNames.includes(selectedBranch)) {
        setSelectedBranch(project.defaultBranch);
      }
    } catch (err) {
      console.error('Failed to load branches:', err);
      // Keep default branch if loading fails
    } finally {
      setIsLoadingBranches(false);
    }
  };

  const handleCreate = async () => {
    if (!threadName.trim()) {
      setError('Thread name is required');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const thread = await createThread(project.id, threadName.trim(), selectedBranch);
      if (thread) {
        setThreadName('');
        onClose();
        onThreadCreated?.(thread.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create thread');
    } finally {
      setIsCreating(false);
    }
  };

  // Load branches when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadBranches();
    }
  }, [isOpen]);

  return (
    <DialogRoot open={isOpen}>
      <Dialog onBackdrop={onClose} onClose={onClose}>
        <DialogTitle>Create New Thread</DialogTitle>
        <DialogDescription asChild>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-bolt-elements-textSecondary mb-2">
                Create a new thread for <strong>{project.name}</strong>. Each thread works on a specific branch.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                Thread Name
              </label>
              <input
                type="text"
                value={threadName}
                onChange={(e) => {
                  setThreadName(e.target.value);
                  setError(null);
                }}
                placeholder="e.g., Feature implementation, Bug fix, etc."
                className="w-full px-3 py-2 border border-bolt-elements-borderColor rounded-md bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
                disabled={isCreating}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                Git Branch
              </label>
              <div className="flex gap-2">
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="flex-1 px-3 py-2 border border-bolt-elements-borderColor rounded-md bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
                  disabled={isCreating || isLoadingBranches}
                >
                  {availableBranches.map(branch => (
                    <option key={branch} value={branch}>
                      {branch} {branch === project.defaultBranch ? '(default)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={loadBranches}
                  disabled={isLoadingBranches || isCreating}
                  className="px-3 py-2 text-sm bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md hover:bg-bolt-elements-background-depth-3 disabled:opacity-50"
                >
                  {isLoadingBranches ? '...' : '↻'}
                </button>
              </div>
              <p className="text-xs text-bolt-elements-textTertiary mt-1">
                The webcontainer will be configured for this branch when you switch to this thread.
              </p>
            </div>

            {error && (
              <div className="text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
          </div>
        </DialogDescription>
        
        <div className="px-5 pb-4 bg-bolt-elements-background-depth-2 flex gap-2 justify-end">
          <DialogButton type="secondary" onClick={onClose}>
            Cancel
          </DialogButton>
          <DialogButton 
            type="primary" 
            onClick={handleCreate}
            disabled={isCreating || !threadName.trim()}
          >
            {isCreating ? 'Creating...' : 'Create Thread'}
          </DialogButton>
        </div>
      </Dialog>
    </DialogRoot>
  );
}