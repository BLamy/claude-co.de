import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { gitStore } from '~/lib/stores/git';
import { workbenchStore } from '~/lib/stores/workbench';
import { LoadingDots } from '~/components/ui/LoadingDots';
import { IconButton } from '~/components/ui/IconButton';
import { WORK_DIR } from '~/utils/constants';

export function GitPanel() {
  const diff = useStore(gitStore.diff);
  const isLoading = useStore(gitStore.loading);
  const error = useStore(gitStore.error);

  const openDiffView = async (filePath: string) => {
    try {
      // get current file content - resolve relative path to absolute path
      const absolutePath = filePath.startsWith('/') ? filePath : `${WORK_DIR}/${filePath}`;

      const currentFile = workbenchStore.getFile(absolutePath);

      if (!currentFile || currentFile.type !== 'file') {
        console.error('❌ File not found in files store:', absolutePath);
        return;
      }

      // get original file content from git
      const originalContent = await gitStore.getOriginalFileContent(filePath);
      const modifiedContent = currentFile.content;

      // open diff view in editor
      workbenchStore.openDiffView(absolutePath, originalContent, modifiedContent);
    } catch (error) {
      console.error('❌ Failed to open diff view:', error);
    }
  };

  useEffect(() => {
    gitStore.fetchDiff();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingDots text="Loading git diff..." />
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
          <div className="p-4 text-muted-foreground text-sm">No changes detected</div>
        ) : (
          <div className="text-xs">
            {diff.files
              .filter((file) => !file.path.startsWith('.bolt/'))
              .map((file) => (
                <div key={file.path} className="border-b">
                  <div
                    className="flex items-center gap-2 p-2 hover:bg-accent cursor-pointer"
                    onClick={() => openDiffView(file.path)}
                  >
                    <span className="flex-1 font-mono hover:text-primary" title="Click to open diff view">
                      {file.path}
                    </span>
                    <span className="text-green-600">+{file.additions}</span>
                    <span className="text-red-600">-{file.deletions}</span>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}