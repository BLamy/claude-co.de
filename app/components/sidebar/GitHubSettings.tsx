import { useState } from 'react';
import { useGitHubSettings } from '~/lib/hooks/useGitHubSettings';
import { Dialog, DialogButton, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { IconButton } from '~/components/ui/IconButton';

interface GitHubSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GitHubSettings({ isOpen, onClose }: GitHubSettingsProps) {
  const { settings, updateToken, clearToken, validateToken, isConfigured } = useGitHubSettings();
  const [token, setToken] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!token.trim()) {
      setValidationError('Token is required');
      return;
    }

    setIsValidating(true);
    setValidationError(null);

    try {
      const isValid = await validateToken(token);
      if (isValid) {
        await updateToken(token);
        setToken('');
        // Close dialog to trigger potential create project flow
        onClose();
      } else {
        setValidationError('Invalid token or insufficient permissions');
      }
    } catch (error) {
      setValidationError('Failed to validate token');
    } finally {
      setIsValidating(false);
    }
  };

  const handleClear = async () => {
    await clearToken();
    setToken('');
    onClose();
  };

  return (
    <DialogRoot open={isOpen}>
      <Dialog onBackdrop={onClose} onClose={onClose}>
        <DialogTitle>GitHub Settings</DialogTitle>
        <DialogDescription asChild>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-bolt-elements-textSecondary mb-2">
                Configure your GitHub personal access token to enable project creation from repositories.
              </p>
              {isConfigured && settings.username && (
                <p className="text-sm text-green-600 dark:text-green-400">
                  ✓ Connected as @{settings.username}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                Personal Access Token
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={isConfigured ? "Enter new token to update" : "ghp_..."}
                className="w-full px-3 py-2 border border-bolt-elements-borderColor rounded-md bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
              />
              <p className="text-xs text-bolt-elements-textTertiary mt-1">
                Required scopes: <code>repo</code> (for private repos), <code>public_repo</code> (for public repos)
              </p>
            </div>

            {validationError && (
              <div className="text-sm text-red-600 dark:text-red-400">
                {validationError}
              </div>
            )}

            <div className="text-xs text-bolt-elements-textTertiary space-y-1">
              <p>To create a personal access token:</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Go to GitHub Settings → Developer settings → Personal access tokens</li>
                <li>Click "Generate new token (classic)"</li>
                <li>Select the required scopes (repo or public_repo)</li>
                <li>Copy the token and paste it above</li>
              </ol>
            </div>
          </div>
        </DialogDescription>
        
        <div className="px-5 pb-4 bg-bolt-elements-background-depth-2 flex gap-2 justify-end">
          <DialogButton type="secondary" onClick={onClose}>
            Cancel
          </DialogButton>
          {isConfigured && (
            <DialogButton type="danger" onClick={handleClear}>
              Remove Token
            </DialogButton>
          )}
          <DialogButton 
            type="primary" 
            onClick={handleSave}
            disabled={isValidating || !token.trim()}
          >
            {isValidating ? 'Validating...' : isConfigured ? 'Update Token' : 'Save Token'}
          </DialogButton>
        </div>
      </Dialog>
    </DialogRoot>
  );
}