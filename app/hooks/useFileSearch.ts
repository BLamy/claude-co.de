import { useState, useCallback, useRef } from 'react';
import { webcontainer } from '~/lib/webcontainer';
import { WORK_DIR } from '~/utils/constants';

export interface FileSearchResult {
  file: string;
  relativePath: string;
}

export function useFileSearch() {
  const [results, setResults] = useState<FileSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const search = useCallback(async (pattern: string) => {
    if (!pattern.trim()) {
      setResults([]);
      return;
    }

    // Cancel any ongoing search
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsSearching(true);
    setError(null);

    try {
      const container = await webcontainer;
      const containerWithInternal = container as any;
      
      if (!containerWithInternal.internal?.fileSearch) {
        throw new Error('File search not available');
      }

      // Convert simple patterns to glob patterns
      let searchPattern = pattern;
      if (!pattern.includes('*') && !pattern.includes('/')) {
        // Simple filename search - make it fuzzy
        searchPattern = `**/*${pattern}*`;
      }

      // Try multiple working directories to find files
      let searchResults: string[] = [];
      const workingDirs = ['.', WORK_DIR, '/home/project'];
      
      for (const workDir of workingDirs) {
        try {
          searchResults = await containerWithInternal.internal.fileSearch(searchPattern, workDir, {
            excludes: [
              '**/node_modules/**',
              '**/.git/**',
              '**/dist/**',
              '**/build/**',
              '**/.bolt/**',
              '**/.timetravel/**',
            ],
          });
          
          console.log(`[useFileSearch] Found ${searchResults.length} files using workDir: ${workDir}`);
          if (searchResults.length > 0) {
            break;
          }
        } catch (err) {
          console.log(`[useFileSearch] Error with workDir ${workDir}:`, err);
        }
      }

      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      const fileSearchResults: FileSearchResult[] = searchResults.map((filePath: string) => {
        const relativePath = filePath.startsWith(WORK_DIR) 
          ? filePath.substring(WORK_DIR.length + 1) 
          : filePath;
        
        return {
          file: filePath,
          relativePath,
        };
      });

      // Sort by relevance - exact matches first, then by path length
      fileSearchResults.sort((a, b) => {
        const aName = a.relativePath.toLowerCase();
        const bName = b.relativePath.toLowerCase();
        const searchLower = pattern.toLowerCase();
        
        // Exact filename match gets highest priority
        const aExact = aName.includes(searchLower);
        const bExact = bName.includes(searchLower);
        
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        
        // Then by path length (shorter paths first)
        return a.relativePath.length - b.relativePath.length;
      });

      setResults(fileSearchResults.slice(0, 20)); // Limit to 20 results
    } catch (err) {
      if (!abortControllerRef.current?.signal.aborted) {
        console.error('File search failed:', err);
        setError('File search failed. Please try again.');
      }
    } finally {
      setIsSearching(false);
    }
  }, []);

  const clearSearch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setResults([]);
    setError(null);
    setIsSearching(false);
  }, []);

  return {
    results,
    isSearching,
    error,
    search,
    clearSearch,
  };
}