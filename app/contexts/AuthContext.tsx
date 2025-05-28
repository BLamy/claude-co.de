// src/contexts/AuthContext.tsx
import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { LoginPage } from '~/components/LoginPage';
import { webcontainer } from '~/lib/webcontainer';
import { encryptData, decryptData, deriveKey, bufferToBase64URLString, base64URLStringToBuffer } from './crypto-utils';

export class WebAuthnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebAuthnError';
  }
}

interface StoredCredentials {
  type: 'apiKey' | 'claude';
  encryptedValue: string;
  userIdentifier: string;
}

interface AuthContextType {
  /** Indicates if the user is currently authenticated */
  isAuthenticated: boolean;

  /** The stored credentials, null if not authenticated */
  credentials: { type: 'apiKey' | 'claude'; value: string } | null;

  /** Any error message related to authentication */
  error: string | null;

  /** Indicates if an authentication operation is in progress */
  isLoading: boolean;

  /** Indicates if the WebContainer is ready */
  isWebContainerReady: boolean;

  /** Function to authenticate with credentials */
  authenticate: (credentials: { type: 'apiKey' | 'claude'; value: string }) => Promise<void>;

  /** Function to log the user out */
  logout: () => void;
}

// Create the context with an undefined initial value to enforce provider usage
const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Provides authentication state and functions to its children.
 * Manages user authentication and credential storage.
 */
export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [credentials, setCredentials] = useState<{ type: 'apiKey' | 'claude'; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isWebContainerReady, setIsWebContainerReady] = useState(false);
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false);

  // Check for stored credentials on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('encryptedCredentials');
      setHasStoredCredentials(!!stored);
      
      if (stored) {
        // Auto-trigger biometric auth if credentials exist
        attemptBiometricLogin();
      }
    }
  }, []);

  // Monitor WebContainer readiness
  useEffect(() => {
    const checkWebContainer = async () => {
      try {
        const instance = await webcontainer;
        if (instance) {
          window.wc = instance;
          setIsWebContainerReady(true);
        }
      } catch (err) {
        console.error('WebContainer not ready:', err);
      }
    };

    checkWebContainer();
  }, []);

  const attemptBiometricLogin = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const storedData = localStorage.getItem('encryptedCredentials');
      if (!storedData) {
        throw new Error('No stored credentials found');
      }

      const stored: StoredCredentials = JSON.parse(storedData);

      // Trigger WebAuthn authentication
      const assertion = await startAuthentication();
      const keyBasisBuffer = base64URLStringToBuffer(assertion.rawId);
      const key = await deriveKey(keyBasisBuffer);

      // Decrypt the stored credentials
      const decryptedValue = await decryptData(key, stored.encryptedValue);
      
      // For Claude type, the decrypted value might be the full config JSON
      let claudeConfig = null;
      let finalValue = decryptedValue;
      
      if (stored.type === 'claude') {
        try {
          claudeConfig = JSON.parse(decryptedValue);
          console.log('[Auth] Decrypted Claude config for biometric login');
          
          // Restore the config file
          await restoreClaudeConfig(claudeConfig);
          
          // Use the original format for credentials
          finalValue = decryptedValue;
        } catch (e) {
          // If it's not JSON, treat as regular auth code
          console.log('[Auth] Decrypted regular auth code for biometric login');
        }
      }
      
      setCredentials({
        type: stored.type,
        value: finalValue,
      });
    } catch (err) {
      console.error('Biometric login failed:', err);
      setError('Biometric authentication failed. Please login again.');
      // Clear invalid stored credentials
      localStorage.removeItem('encryptedCredentials');
      setHasStoredCredentials(false);
    } finally {
      setIsLoading(false);
    }
  }, []);


  const restoreClaudeConfig = async (claudeConfig: any) => {
    try {
      const instance = await webcontainer;
      if (!instance) throw new Error('WebContainer not ready');

      console.log('[Auth] Restoring Claude config to ~/.claude.json...');
      
      // Write the config back to the file system
      await instance.fs.writeFile('claude.json', JSON.stringify(claudeConfig, null, 2));
      await instance.spawn('mv', ['claude.json', '/home/.claude.json']);


      console.log('[Auth] Claude config restored successfully');
    } catch (err) {
      console.error('[Auth] Failed to restore Claude config:', err);
      // Don't throw here as this is not critical for authentication
    }
  };

  const getClaudeUserEmail = async (): Promise<string> => {
    try {
      const instance = await webcontainer;
      if (!instance) throw new Error('WebContainer not ready');

      console.log('[Auth] Reading Claude user email from ~/.claude.json...');

      // Read the .claude.json file from the home directory
      const claudeConfigContent = await instance.fs.readFile('/home/.claude.json', 'utf-8');
      const claudeConfig = JSON.parse(claudeConfigContent);
      
      if (claudeConfig?.oauthAccount?.emailAddress) {
        console.log('[Auth] Found user email:', claudeConfig.oauthAccount.emailAddress);
        return claudeConfig.oauthAccount.emailAddress;
      } else {
        console.warn('[Auth] No email found in .claude.json, using fallback');
        return `user@${window.location.hostname}`;
      }
    } catch (err) {
      console.error('Failed to read Claude user email:', err);
      // Return fallback email if reading fails
      return `user@${window.location.hostname}`;
    }
  };

  const authenticate = useCallback(async (creds: { type: 'apiKey' | 'claude'; value: string }) => {
    try {
      setIsLoading(true);
      setError(null);

      let userEmail = `user@${window.location.hostname}`; // fallback
      let claudeConfig = null;

      if (creds.type === 'claude') {
        try {
          // The value might be a JSON string containing the full Claude config
          claudeConfig = JSON.parse(creds.value);
          userEmail = claudeConfig?.oauthAccount?.emailAddress || userEmail;
          console.log('[Auth] Using Claude config from LoginPage, email:', userEmail);
        } catch (e) {
          // If it's not JSON, treat it as a regular auth code and read from file
          console.log('[Auth] Auth code provided, reading from .claude.json...');
          userEmail = await getClaudeUserEmail();
          
          // Read the full config for storage
          const instance = await webcontainer;
          if (instance) {
            const claudeConfigContent = await instance.fs.readFile('/home/.claude.json', 'utf-8');
            claudeConfig = JSON.parse(claudeConfigContent);
          }
        }
      }

      // Set credentials with the original auth code
      setCredentials(creds);

      // Create a new passkey if this is the first login
      if (!hasStoredCredentials) {
        const credential = await startRegistration(userEmail);
        
        // Derive encryption key from the credential
        const keyBasisBuffer = base64URLStringToBuffer(credential.rawId);
        const key = await deriveKey(keyBasisBuffer);

        // For Claude type, encrypt the full config; for API key, encrypt the key
        const valueToEncrypt = creds.type === 'claude' && claudeConfig 
          ? JSON.stringify(claudeConfig) 
          : creds.value;
        
        const encryptedValue = await encryptData(key, valueToEncrypt);

        // Store encrypted credentials
        const toStore: StoredCredentials = {
          type: creds.type,
          encryptedValue,
          userIdentifier: credential.rawId,
        };

        localStorage.setItem('encryptedCredentials', JSON.stringify(toStore));
        setHasStoredCredentials(true);
        
        console.log('[Auth] Credentials encrypted and stored with WebAuthn');
      }

      // If it's a Claude authentication, restore the config file for future use
      if (creds.type === 'claude' && claudeConfig) {
        await restoreClaudeConfig(claudeConfig);
      }
    } catch (err) {
      console.error('Authentication failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Authentication failed. Please try again.';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [hasStoredCredentials]);

  const logout = useCallback(() => {
    setCredentials(null);
    setError(null);
    setIsLoading(false);
    localStorage.removeItem('encryptedCredentials');
    setHasStoredCredentials(false);
  }, []);

  const contextValue: AuthContextType = {
    isAuthenticated: credentials !== null,
    credentials,
    error,
    isLoading,
    isWebContainerReady,
    authenticate,
    logout,
  };

  // Show login page if not authenticated
  if (!credentials && !hasStoredCredentials) {
    return (
      <AuthContext.Provider value={contextValue}>
        <LoginPage 
          onAuthenticate={authenticate}
          isWebContainerReady={isWebContainerReady}
        />
      </AuthContext.Provider>
    );
  }

  // Show biometric prompt if credentials are stored
  if (!credentials && hasStoredCredentials) {
    return (
      <AuthContext.Provider value={contextValue}>
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Welcome back!</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Use your biometrics to access Bolt
            </p>
            {error && (
              <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
            )}
            <button
              onClick={attemptBiometricLogin}
              disabled={isLoading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors"
            >
              {isLoading ? 'Authenticating...' : 'Unlock with Biometrics'}
            </button>
            <button
              onClick={() => {
                localStorage.removeItem('encryptedCredentials');
                setHasStoredCredentials(false);
              }}
              className="block mx-auto mt-4 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Use a different account
            </button>
          </div>
        </div>
      </AuthContext.Provider>
    );
  }

  // Render children when authenticated
  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Hook to easily consume authentication context.
 * Throws an error if used outside of an AuthProvider.
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};

// WebAuthn functions
export async function startRegistration(email: string) {
  if (!window.PublicKeyCredential) {
    throw new WebAuthnError('WebAuthn is not supported in this browser');
  }

  const userId = crypto.getRandomValues(new Uint8Array(16));
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: {
      name: 'Bolt',
      id: window.location.hostname,
    },
    user: {
      id: userId,
      name: email,
      displayName: email,
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 }, // ES256
      { type: 'public-key', alg: -257 }, // RS256
    ],
    timeout: 60000,
    attestation: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'required',
    },
  };

  try {
    const credential = (await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions,
    })) as PublicKeyCredential;

    const response = credential.response as AuthenticatorAttestationResponse;

    return {
      id: credential.id,
      rawId: bufferToBase64URLString(credential.rawId),
      response: {
        clientDataJSON: bufferToBase64URLString(response.clientDataJSON),
        attestationObject: bufferToBase64URLString(response.attestationObject),
      },
      type: credential.type,
    };
  } catch (error) {
    throw new WebAuthnError(`Failed to create credential: ${error}`);
  }
}

export async function startAuthentication() {
  if (!window.PublicKeyCredential) {
    throw new WebAuthnError('WebAuthn is not supported in this browser');
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
    challenge,
    timeout: 60000,
    userVerification: 'required',
    rpId: window.location.hostname,
  };

  try {
    const assertion = (await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions,
    })) as PublicKeyCredential;

    const response = assertion.response as AuthenticatorAssertionResponse;

    return {
      id: assertion.id,
      rawId: bufferToBase64URLString(assertion.rawId),
      response: {
        authenticatorData: bufferToBase64URLString(response.authenticatorData),
        clientDataJSON: bufferToBase64URLString(response.clientDataJSON),
        signature: bufferToBase64URLString(response.signature),
        userHandle: response.userHandle ? bufferToBase64URLString(response.userHandle) : null,
      },
      type: assertion.type,
    };
  } catch (error) {
    throw new WebAuthnError(`Failed to authenticate: ${error}`);
  }
}