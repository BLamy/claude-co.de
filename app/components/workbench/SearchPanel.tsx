import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { webcontainer } from '~/lib/webcontainer';
import { WORK_DIR } from '~/utils/constants';
import { createScopedLogger } from '~/utils/logger';
import { Search, Type, Regex, ChevronDown, ChevronRight } from 'lucide-react';
import { workbenchStore } from '~/lib/stores/workbench';

const logger = createScopedLogger('SearchPanel');

interface TextSearchResult {
  file: string;
  line: number;
  lineText: string;
  columnStart: number;
  columnEnd: number;
}

interface SearchPanelProps {
  onFileSelect?: (filePath: string, line?: number) => void;
}

export const SearchPanel = memo(({ onFileSelect }: SearchPanelProps) => {
  const [searchText, setSearchText] = useState('');
  const [filePattern, setFilePattern] = useState('');
  const [results, setResults] = useState<TextSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRegex, setIsRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [isWordMatch, setIsWordMatch] = useState(false);
  const [showFilePattern, setShowFilePattern] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const performTextSearch = useCallback(
    async (text: string, filePattern: string) => {
      if (!text.trim()) {
        setResults([]);
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

        const searchOptions = {
          folders: [WORK_DIR],
          includes: filePattern.trim() ? [filePattern] : ['**/*'],
          excludes: [
            '**/node_modules/**',
            '**/.git/**',
            '**/dist/**',
            '**/build/**',
            '**/.bolt/**',
            '**/.timetravel/**',
            '**/*.log',
            '**/.DS_Store',
          ],
          homeDir: WORK_DIR,
          gitignore: true,
          requireGit: false,
          globalIgnoreFiles: true,
          isRegex,
          caseSensitive,
          isWordMatch,
          ignoreSymlinks: true,
          resultLimit: 1000,
        };

        const searchResults = await container.internal.textSearch(text, searchOptions, console.log.bind(console));

        if (abortControllerRef.current?.signal.aborted) {
          return;
        }

        const textSearchResults: TextSearchResult[] = [];

        for (const [filePath, matches] of searchResults) {
          for (const match of matches) {
            for (const range of match.ranges) {
              textSearchResults.push({
                file: filePath.startsWith(WORK_DIR) ? filePath.substring(WORK_DIR.length + 1) : filePath,
                line: range.startLineNumber + 1,
                lineText: match.preview.text,
                columnStart: range.startColumn,
                columnEnd: range.endColumn,
              });
            }
          }
        }

        setResults(textSearchResults);
      } catch (err) {
        if (!abortControllerRef.current?.signal.aborted) {
          logger.error('Text search failed:', err);
          setError('Text search failed. Please try again.');
        }
      } finally {
        setIsSearching(false);
      }
    },
    [isRegex, caseSensitive, isWordMatch],
  );

  const handleResultClick = useCallback(
    (filePath: string, line?: number) => {
      console.log('DEBUG - SearchPanel - handleResultClick called:', { filePath, line });

      if (onFileSelect) {
        console.log('DEBUG - SearchPanel - calling onFileSelect with:', `${WORK_DIR}/${filePath}`, line);
        onFileSelect(`${WORK_DIR}/${filePath}`, line);
      }

      // if we have a line number, use the workbench store's highlighting system
      if (line !== undefined) {
        // ensure the file path matches the format used by editor documents
        const fullPath = filePath.startsWith(WORK_DIR) ? filePath : `${WORK_DIR}/${filePath}`;
        console.log('DEBUG - SearchPanel - setting highlightedLine:', {
          filePath: fullPath,
          line: line - 1, // convert to 0-based line number for CodeMirror
        });
        workbenchStore.highlightedLine.set({
          filePath: fullPath,
          line: line - 1, // convert to 0-based line number for CodeMirror
        });
      }
    },
    [onFileSelect],
  );

  // debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchText.trim()) {
        performTextSearch(searchText, filePattern);
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchText, filePattern, performTextSearch]);

  return (
    <div className="h-full flex flex-col">
      {/* Search Controls */}
      <div className="p-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
        <div className="space-y-3">
          {/* Search Text Input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search text..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full pl-2 pr-24 py-1 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary placeholder-bolt-elements-textSecondary text-sm focus:outline-none focus:border-bolt-elements-borderColorActive"
            />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
              <button
                onClick={() => setCaseSensitive(!caseSensitive)}
                className={`p-1 rounded transition-colors bg-transparent ${
                  caseSensitive
                    ? 'text-bolt-elements-button-primary-background'
                    : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
                }`}
                title="Match Case"
              >
                <Type className="h-3 w-3" />
              </button>
              <button
                onClick={() => setIsWordMatch(!isWordMatch)}
                className={`p-1 rounded transition-colors bg-transparent ${
                  isWordMatch
                    ? 'text-bolt-elements-button-primary-background'
                    : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
                }`}
                title="Match Whole Word"
              >
                <span className="text-xs font-bold">W</span>
              </button>
              <button
                onClick={() => setIsRegex(!isRegex)}
                className={`p-1 rounded transition-colors bg-transparent ${
                  isRegex
                    ? 'text-bolt-elements-button-primary-background'
                    : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
                }`}
                title="Use Regular Expression"
              >
                <Regex className="h-3 w-3" />
              </button>
            </div>
            {isSearching && (
              <div className="absolute right-32 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin h-4 w-4 border-2 border-bolt-elements-loader-progress border-t-transparent rounded-full" />
              </div>
            )}
          </div>

          {/* Collapsible File Pattern Section */}
          <div>
            <button
              onClick={() => setShowFilePattern(!showFilePattern)}
              className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors bg-transparent p-0"
            >
              {showFilePattern ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Files to include
            </button>

            {showFilePattern && (
              <div className="mt-2">
                <input
                  type="text"
                  placeholder="e.g., *.js, **/*.tsx"
                  value={filePattern}
                  onChange={(e) => setFilePattern(e.target.value)}
                  className="w-full px-2 py-1 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary placeholder-bolt-elements-textSecondary text-sm focus:outline-none focus:border-bolt-elements-borderColorActive"
                />
              </div>
            )}
          </div>
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
          {results.length === 0 && searchText.trim() && !isSearching ? (
            <div className="text-center text-bolt-elements-textSecondary text-sm py-4">No results found</div>
          ) : (
            <div className="space-y-1">
              {/* Group results by file */}
              {Object.entries(
                results.reduce(
                  (acc, result) => {
                    if (!acc[result.file]) {
                      acc[result.file] = [];
                    }

                    acc[result.file].push(result);

                    return acc;
                  },
                  {} as Record<string, TextSearchResult[]>,
                ),
              ).map(([fileName, fileResults]) => (
                <div key={fileName} className="mb-3">
                  {/* File header */}
                  <div
                    className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-bolt-elements-background-depth-0 border-b border-bolt-elements-borderColor mb-1"
                    onClick={() => handleResultClick(fileName)}
                  >
                    <div className="i-ph:file text-sm text-bolt-elements-textSecondary" />
                    <span className="text-sm font-medium text-bolt-elements-textPrimary">{fileName}</span>
                    <span className="text-xs text-bolt-elements-textSecondary ml-auto">
                      {fileResults.length} {fileResults.length === 1 ? 'match' : 'matches'}
                    </span>
                  </div>

                  {/* Match results */}
                  <div className="space-y-1">
                    {fileResults.map((result, index) => (
                      <div
                        key={index}
                        className="group flex items-start gap-2 px-2 py-1 rounded hover:bg-bolt-elements-background-depth-0 cursor-pointer transition-colors text-sm"
                        onClick={() => {
                          console.log('DEBUG - SearchPanel - onClick result:', { fileName, line: result.line });
                          handleResultClick(fileName, result.line);
                        }}
                      >
                        <span className="text-bolt-elements-textSecondary min-w-[3rem] text-right text-xs leading-5 flex-shrink-0">
                          {result.line}:
                        </span>
                        <div className="flex-1 font-mono text-xs leading-5 text-bolt-elements-textPrimary overflow-hidden">
                          {/* Highlight the matched text */}
                          <div className="truncate group-hover:whitespace-normal group-hover:break-words transition-all duration-200">
                            <span>{result.lineText.substring(0, result.columnStart).replace(/\t/g, '  ').trim()}</span>
                            <span className="bg-yellow-300 dark:bg-yellow-700 text-bolt-elements-textPrimary px-0.5 rounded-sm">
                              {result.lineText.substring(result.columnStart, result.columnEnd).replace(/\t/g, '  ')}
                            </span>
                            <span>{result.lineText.substring(result.columnEnd).replace(/\t/g, '  ').trimEnd()}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Results summary */}
          {results.length > 0 && (
            <div className="mt-4 pt-2 border-t border-bolt-elements-borderColor text-xs text-bolt-elements-textSecondary">
              {results.length} results in{' '}
              {
                Object.keys(
                  results.reduce(
                    (acc, result) => {
                      acc[result.file] = true;

                      return acc;
                    },
                    {} as Record<string, boolean>,
                  ),
                ).length
              }{' '}
              files
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
