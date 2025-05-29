import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { webcontainer } from '~/lib/webcontainer';
import { WORK_DIR } from '~/utils/constants';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SearchPanel');

interface FileSearchResult {
  file: string;
}

interface SearchPanelProps {
  onFileSelect?: (filePath: string) => void;
}

export const SearchPanel = memo(({ onFileSelect }: SearchPanelProps) => {
  const [filePattern, setFilePattern] = useState('');
  const [fileResults, setFileResults] = useState<FileSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const performFileSearch = useCallback(async (pattern: string) => {
    if (!pattern.trim()) {
      setFileResults([]);
      return;
    }

    // cancel any ongoing search
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsSearching(true);
    setError(null);

    try {
      const container = await webcontainer;
      const results = await container.internal.fileSearch(pattern, WORK_DIR, {
        excludes: [
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**',
          '**/build/**',
          '**/.bolt/**',
          '**/.timetravel/**',
        ],
      });

      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      const fileSearchResults: FileSearchResult[] = results.map((filePath) => ({
        file: filePath.startsWith(WORK_DIR) ? filePath.substring(WORK_DIR.length + 1) : filePath,
      }));

      setFileResults(fileSearchResults);
    } catch (err) {
      if (!abortControllerRef.current?.signal.aborted) {
        logger.error('File search failed:', err);
        setError('File search failed. Please try again.');
      }
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleFileClick = useCallback(
    (filePath: string) => {
      if (onFileSelect) {
        onFileSelect(`${WORK_DIR}/${filePath}`);
      }
    },
    [onFileSelect],
  );

  // debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (filePattern.trim()) {
        performFileSearch(filePattern);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [filePattern, performFileSearch]);

  return (
    <div className="h-full flex flex-col">
      {/* Search Controls */}
      <div className="p-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
        <div className="space-y-2">
          <div className="relative">
            <input
              type="text"
              placeholder="Search files (e.g., *.js, **/*.tsx)..."
              value={filePattern}
              onChange={(e) => setFilePattern(e.target.value)}
              className="w-full px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary placeholder-bolt-elements-textSecondary text-sm focus:outline-none focus:border-bolt-elements-borderColorActive"
            />
            {isSearching && (
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin h-4 w-4 border-2 border-bolt-elements-loader-progress border-t-transparent rounded-full" />
              </div>
            )}
          </div>
          <div className="text-xs text-bolt-elements-textSecondary">Use glob patterns: *.js, **/*.tsx, src/**/*</div>
        </div>

        {error && (
          <div className="mt-2 text-xs text-red-400 bg-red-900/20 border border-red-900/30 rounded px-2 py-1">
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          {fileResults.length === 0 && filePattern.trim() && !isSearching ? (
            <div className="text-center text-bolt-elements-textSecondary text-sm py-4">No files found</div>
          ) : (
            <div className="space-y-1">
              {fileResults.map((result, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-2 py-1 rounded hover:bg-bolt-elements-background-depth-0 cursor-pointer transition-colors"
                  onClick={() => handleFileClick(result.file)}
                >
                  <div className="i-ph:file text-sm text-bolt-elements-textSecondary" />
                  <span className="text-sm text-bolt-elements-textPrimary">{result.file}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}); 