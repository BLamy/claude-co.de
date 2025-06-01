import { useState, useCallback, useEffect } from 'react';
import { webcontainer } from '~/lib/webcontainer';
import { WORK_DIR } from '~/utils/constants';

export interface ProjectFile {
  name: string;
  path: string;
  relativePath: string;
  type: 'file' | 'directory';
}

export function useProjectFiles() {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scanDirectory = useCallback(async (dirPath: string, basePath: string = ''): Promise<ProjectFile[]> => {
    const foundFiles: ProjectFile[] = [];
    
    try {
      const container = await webcontainer;
      const entries = await container.fs.readdir(dirPath);
      
      for (const entry of entries) {
        // Skip hidden files and common exclude patterns
        if (entry.startsWith('.') || 
            entry === 'node_modules' || 
            entry === 'dist' || 
            entry === 'build' ||
            entry === '__pycache__') {
          continue;
        }

        const fullPath = dirPath === '.' ? entry : `${dirPath}/${entry}`;
        const relativePath = basePath ? `${basePath}/${entry}` : entry;
        const absolutePath = `${WORK_DIR}/${relativePath}`;

        try {
          // Try to read as directory first
          await container.fs.readdir(fullPath);
          
          // If successful, it's a directory
          foundFiles.push({
            name: entry,
            path: absolutePath,
            relativePath,
            type: 'directory'
          });

          // Recursively scan subdirectories (limit depth to avoid infinite loops)
          if (basePath.split('/').length < 5) {
            const subFiles = await scanDirectory(fullPath, relativePath);
            foundFiles.push(...subFiles);
          }
        } catch {
          // If readdir fails, it's a file
          foundFiles.push({
            name: entry,
            path: absolutePath,
            relativePath,
            type: 'file'
          });
        }
      }
    } catch (err) {
      console.error(`Error scanning directory ${dirPath}:`, err);
    }

    return foundFiles;
  }, []);

  const loadProjectFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('[useProjectFiles] Starting file discovery...');
      const projectFiles = await scanDirectory('.');
      
      // Filter to only include files (not directories) and sort them
      const fileList = projectFiles
        .filter(item => item.type === 'file')
        .sort((a, b) => {
          // Sort by directory depth first (shallow files first), then alphabetically
          const aDepth = a.relativePath.split('/').length;
          const bDepth = b.relativePath.split('/').length;
          
          if (aDepth !== bDepth) {
            return aDepth - bDepth;
          }
          
          return a.relativePath.localeCompare(b.relativePath);
        });

      console.log(`[useProjectFiles] Found ${fileList.length} files`);
      setFiles(fileList);
    } catch (err) {
      console.error('[useProjectFiles] Error loading project files:', err);
      setError(err instanceof Error ? err.message : 'Failed to load project files');
    } finally {
      setIsLoading(false);
    }
  }, [scanDirectory]);

  const searchFiles = useCallback((query: string): ProjectFile[] => {
    if (!query.trim()) {
      return files;
    }

    const lowercaseQuery = query.toLowerCase();
    
    return files.filter(file => {
      const fileName = file.name.toLowerCase();
      const relativePath = file.relativePath.toLowerCase();
      
      // Check if the query matches the filename or any part of the path
      return fileName.includes(lowercaseQuery) || 
             relativePath.includes(lowercaseQuery) ||
             // Fuzzy match - check if all characters of query appear in order
             fuzzyMatch(fileName, lowercaseQuery) ||
             fuzzyMatch(relativePath, lowercaseQuery);
    }).sort((a, b) => {
      // Sort results by relevance
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const query = lowercaseQuery;
      
      // Exact name matches first
      if (aName === query && bName !== query) return -1;
      if (aName !== query && bName === query) return 1;
      
      // Then name starts with query
      if (aName.startsWith(query) && !bName.startsWith(query)) return -1;
      if (!aName.startsWith(query) && bName.startsWith(query)) return 1;
      
      // Then name contains query
      if (aName.includes(query) && !bName.includes(query)) return -1;
      if (!aName.includes(query) && bName.includes(query)) return 1;
      
      // Finally by path length (shorter first)
      return a.relativePath.length - b.relativePath.length;
    });
  }, [files]);

  // Load files on mount
  useEffect(() => {
    loadProjectFiles();
  }, [loadProjectFiles]);

  return {
    files,
    isLoading,
    error,
    searchFiles,
    refreshFiles: loadProjectFiles,
  };
}

// Simple fuzzy matching - checks if all characters of needle appear in haystack in order
function fuzzyMatch(haystack: string, needle: string): boolean {
  let needleIndex = 0;
  
  for (let i = 0; i < haystack.length && needleIndex < needle.length; i++) {
    if (haystack[i] === needle[needleIndex]) {
      needleIndex++;
    }
  }
  
  return needleIndex === needle.length;
}