import { GitHubApi } from '~/lib/github/api';
import { useEncryptedStorage } from './useEncryptedStorage';

export interface GitHubSettings {
  token?: string;
  username?: string;
  lastValidated?: string;
}

export function useGitHubSettings() {
  const [settings, setSettings, isLoading] = useEncryptedStorage<GitHubSettings>('github-settings', {});

  const updateToken = async (token: string) => {
    await setSettings(prev => ({
      ...prev,
      token,
      lastValidated: new Date().toISOString(),
    }));
  };

  const clearToken = async () => {
    await setSettings({
      token: undefined,
      username: undefined,
      lastValidated: undefined,
    });
  };

  const validateToken = async (token?: string): Promise<boolean> => {
    const tokenToValidate = token || settings.token;
    if (!tokenToValidate) return false;

    try {
      const api = new GitHubApi(tokenToValidate);
      // Try to fetch user info to validate token
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${tokenToValidate}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      if (response.ok) {
        const user = await response.json();
        await setSettings(prev => ({
          ...prev,
          token: tokenToValidate,
          username: user.login,
          lastValidated: new Date().toISOString(),
        }));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Token validation failed:', error);
      return false;
    }
  };

  const getApi = (): GitHubApi | null => {
    if (!settings.token) return null;
    return new GitHubApi(settings.token);
  };

  return {
    settings,
    updateToken,
    clearToken,
    validateToken,
    getApi,
    isConfigured: !!settings.token,
    hasValidToken: !!settings.token && !!settings.lastValidated,
    isLoading,
  };
}