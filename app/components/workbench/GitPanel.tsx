import { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { gitStore } from '~/lib/stores/git';
import { LoadingDots } from '~/components/ui/LoadingDots';
import { IconButton } from '~/components/ui/IconButton';

export function GitPanel() {
  const diff = useStore(gitStore.diff);
  const isLoading = useStore(gitStore.loading);
  const error = useStore(gitStore.error);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const toggleFile = (path: string) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFiles(newExpanded);
  };

  useEffect(() => {
    gitStore.fetchDiff();
  }, []);

  useEffect(() => {
    // Expand all files by default when diff updates
    if (diff?.files) {
      setExpandedFiles(new Set(diff.files.map(f => f.path)));
    }
  }, [diff]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingDots />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-500">
        <p className="mb-2">Error: {error}</p>
        <button
          onClick={() => gitStore.fetchDiff()}
          className="px-3 py-1 bg-primary text-primary-foreground rounded-md text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col dark:text-white">
      <div className="flex items-center justify-between p-2 border-b">
        <h2 className="text-sm font-medium">Git Changes</h2>
        <IconButton
          icon="i-ph:arrow-clockwise"
          title="Refresh diff"
          onClick={() => gitStore.fetchDiff()}
          className="text-xs"
        />
      </div>
      
      <div className="flex-1 overflow-auto">
        {!diff || diff.files.length === 0 ? (
          <div className="p-4 text-muted-foreground text-sm">
            No changes detected
          </div>
        ) : (
          <div className="text-xs">
            {diff.files
              .filter(file => !file.path.startsWith('.bolt/'))
              .map((file) => (
              <div key={file.path} className="border-b">
                <div
                  className="flex items-center gap-2 p-2 hover:bg-accent cursor-pointer"
                  onClick={() => toggleFile(file.path)}
                >
                  <span className={`transition-transform ${expandedFiles.has(file.path) ? 'rotate-90' : ''}`}>
                    ▶
                  </span>
                  <span className="flex-1 font-mono">{file.path}</span>
                  <span className="text-green-600">+{file.additions}</span>
                  <span className="text-red-600">-{file.deletions}</span>
                </div>
                
                {expandedFiles.has(file.path) && (
                  <div className="bg-secondary/20">
                    {file.chunks.map((chunk, chunkIndex) => (
                      <div key={chunkIndex} className="font-mono">
                        <div className="px-2 py-1 bg-accent/50 text-xs text-muted-foreground">
                          @@ -{chunk.oldStart},{chunk.oldLines} +{chunk.newStart},{chunk.newLines} @@
                        </div>
                        {chunk.lines.map((line, lineIndex) => (
                          <div
                            key={lineIndex}
                            className={`flex ${
                              line.type === 'add' ? 'bg-green-500/10' : 
                              line.type === 'remove' ? 'bg-red-500/10' : ''
                            }`}
                          >
                            <span className="w-12 px-1 text-right text-muted-foreground select-none">
                              {line.oldLineNumber || ''}
                            </span>
                            <span className="w-12 px-1 text-right text-muted-foreground select-none">
                              {line.newLineNumber || ''}
                            </span>
                            <span className={`px-1 select-none ${
                              line.type === 'add' ? 'text-green-600' : 
                              line.type === 'remove' ? 'text-red-600' : 
                              'text-muted-foreground'
                            }`}>
                              {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                            </span>
                            <span className="flex-1 whitespace-pre">{line.content}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}