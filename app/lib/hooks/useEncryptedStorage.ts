import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '~/contexts/AuthContext';
import { encryptData, decryptData, deriveKey, base64URLStringToBuffer } from '~/contexts/crypto-utils';

/**
 * Hook to use encrypted localStorage with WebAuthn-based encryption
 * This uses the same encryption approach as AuthContext
 */
export function useEncryptedStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => Promise<void>, boolean] {
  const { isAuthenticated } = useAuth();
  const [value, setValue] = useState<T>(initialValue);
  const [isLoading, setIsLoading] = useState(true);
  const storageKey = `encrypted_${key}`;

  // Get encryption key from stored credentials
  const getEncryptionKey = useCallback(async (): Promise<CryptoKey | null> => {
    if (!isAuthenticated || typeof window === 'undefined') {
      return null;
    }

    try {
      const storedData = localStorage.getItem('encryptedCredentials');
      if (!storedData) {
        return null;
      }

      const stored = JSON.parse(storedData);
      const keyBasisBuffer = base64URLStringToBuffer(stored.userIdentifier);
      const key = await deriveKey(keyBasisBuffer);
      return key;
    } catch (error) {
      console.error('Failed to get encryption key:', error);
      return null;
    }
  }, [isAuthenticated]);

  // Load value from localStorage on mount
  useEffect(() => {
    const loadValue = async () => {
      if (typeof window === 'undefined') {
        setIsLoading(false);
        return;
      }

      try {
        const encryptionKey = await getEncryptionKey();
        if (!encryptionKey) {
          setValue(initialValue);
          setIsLoading(false);
          return;
        }

        const item = localStorage.getItem(storageKey);
        if (item) {
          try {
            const decrypted = await decryptData(encryptionKey, item);
            const parsed = JSON.parse(decrypted);
            setValue(parsed);
          } catch (error) {
            console.error(`Failed to decrypt ${key}:`, error);
            setValue(initialValue);
          }
        } else {
          setValue(initialValue);
        }
      } catch (error) {
        console.error(`Failed to load encrypted value for ${key}:`, error);
        setValue(initialValue);
      } finally {
        setIsLoading(false);
      }
    };

    loadValue();
  }, [key, storageKey, initialValue, getEncryptionKey]);

  // Function to update the value
  const updateValue = useCallback(async (valueOrFn: T | ((prev: T) => T)) => {
    if (typeof window === 'undefined') {
      throw new Error('Cannot save encrypted data on server side');
    }

    const encryptionKey = await getEncryptionKey();
    if (!encryptionKey) {
      throw new Error('Cannot save encrypted data - encryption key not available');
    }

    const newValue = valueOrFn instanceof Function ? valueOrFn(value) : valueOrFn;

    try {
      const encrypted = await encryptData(encryptionKey, JSON.stringify(newValue));
      localStorage.setItem(storageKey, encrypted);
      setValue(newValue);
    } catch (error) {
      console.error(`Error saving encrypted value for ${key}:`, error);
      throw error;
    }
  }, [key, storageKey, value, getEncryptionKey]);

  return [value, updateValue, isLoading];
}