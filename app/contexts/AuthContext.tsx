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
      
      setCredentials({
        type: stored.type,
        value: decryptedValue,
      });

      // If it's Claude Code, complete the authentication flow
      if (stored.type === 'claude') {
        await completeClaudeCodeAuth(decryptedValue);
      }
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

  const completeClaudeCodeAuth = async (authCode: string) => {
    try {
      const instance = await webcontainer;
      if (!instance) throw new Error('WebContainer not ready');

      console.log('[Auth] Starting Claude Code authentication process...');

      // Complete the Claude Code authentication
      const process = await instance.spawn('npx', ['-y', '@anthropic-ai/claude-code']);
      
      // Monitor the output
      let output = '';
      process.output.pipeTo(
        new WritableStream({
          write(data) {
            output += data;
            console.log('[Claude Code]', data);
          },
        }),
      );

      // Send the auth code to the process
      const writer = process.input.getWriter();
      console.log('[Auth] Sending authorization code to Claude Code...');
      await writer.write(authCode + '\n');
      await writer.close();

      // Wait for the process to complete
      const exitCode = await process.exit;
      console.log('[Auth] Claude Code process exited with code:', exitCode);

      if (exitCode !== 0) {
        throw new Error(`Claude Code authentication failed with exit code ${exitCode}`);
      }
    } catch (err) {
      console.error('Failed to complete Claude Code auth:', err);
      throw err;
    }
  };

  const authenticate = useCallback(async (creds: { type: 'apiKey' | 'claude'; value: string }) => {
    try {
      setIsLoading(true);
      setError(null);

      // Create a new passkey if this is the first login
      if (!hasStoredCredentials) {
        // Generate a unique email-like identifier for the passkey
        const identifier = `user@${window.location.hostname}`;
        const credential = await startRegistration(identifier);
        
        // Derive encryption key from the credential
        const keyBasisBuffer = base64URLStringToBuffer(credential.rawId);
        const key = await deriveKey(keyBasisBuffer);

        // Encrypt the credentials
        const encryptedValue = await encryptData(key, creds.value);

        // Store encrypted credentials
        const toStore: StoredCredentials = {
          type: creds.type,
          encryptedValue,
          userIdentifier: credential.rawId,
        };

        localStorage.setItem('encryptedCredentials', JSON.stringify(toStore));
        setHasStoredCredentials(true);
      }

      setCredentials(creds);

      // Complete Claude Code authentication if needed
      if (creds.type === 'claude') {
        await completeClaudeCodeAuth(creds.value);
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