import { useState, useEffect } from 'react';
import { Command } from 'cmdk';
import { FileIcon, Settings, Terminal, Search, Folder } from 'lucide-react';
import { useProjectFiles } from '~/hooks/useProjectFiles';
import * as RadixDialog from '@radix-ui/react-dialog';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFileSelect?: (filePath: string) => void;
  onCommand?: (command: string) => void;
}

const commands = [
  {
    id: 'toggle-terminal',
    title: 'Toggle Terminal',
    shortcut: '⌃`',
    icon: Terminal,
  },
  {
    id: 'open-settings',
    title: 'Open Settings',
    shortcut: '⌘,',
    icon: Settings,
  },
  {
    id: 'search-files',
    title: 'Search Files',
    shortcut: '⌘P',
    icon: Search,
  },
];

export function CommandPalette({ open, onOpenChange, onFileSelect, onCommand }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const { files, isLoading, searchFiles } = useProjectFiles();
  const [filteredFiles, setFilteredFiles] = useState(files);

  // Update filtered files when search changes
  useEffect(() => {
    const results = searchFiles(search);
    setFilteredFiles(results.slice(0, 50)); // Limit to 50 results for performance
  }, [search, searchFiles]);

  // Clear search when dialog closes
  useEffect(() => {
    if (!open) {
      setSearch('');
    }
  }, [open]);

  const handleFileSelect = (filePath: string) => {
    onFileSelect?.(filePath);
    onOpenChange(false);
  };

  const handleCommandSelect = (commandId: string) => {
    onCommand?.(commandId);
    onOpenChange(false);
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    
    // You could expand this with more specific icons
    switch (ext) {
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
        return '📄';
      case 'json':
        return '⚙️';
      case 'md':
        return '📝';
      case 'css':
      case 'scss':
        return '🎨';
      case 'html':
        return '🌐';
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'svg':
        return '🖼️';
      default:
        return '📄';
    }
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <RadixDialog.Content className="fixed top-[20vh] left-1/2 -translate-x-1/2 z-50 w-[90vw] max-w-[640px] bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg shadow-2xl overflow-hidden">
          <Command className="w-full" shouldFilter={false}>
            <div className="flex items-center border-b border-bolt-elements-borderColor px-3">
              <Search className="h-4 w-4 shrink-0 opacity-50 mr-2" />
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder="Search files, commands..."
                className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-bolt-elements-textSecondary text-bolt-elements-textPrimary disabled:cursor-not-allowed disabled:opacity-50"
              />
              {isLoading && (
                <div className="animate-spin h-4 w-4 border-2 border-bolt-elements-loader-progress border-t-transparent rounded-full ml-2" />
              )}
            </div>
            
            <Command.List className="max-h-[400px] overflow-y-auto">
              <Command.Empty className="py-6 text-center text-sm text-bolt-elements-textSecondary">
                No results found.
              </Command.Empty>

              {/* Files Section */}
              {filteredFiles.length > 0 && (
                <Command.Group heading="Files" className="text-xs font-medium text-bolt-elements-textSecondary px-2 py-1.5">
                  {filteredFiles.map((file) => (
                    <Command.Item
                      key={file.path}
                      value={file.relativePath}
                      onSelect={() => handleFileSelect(file.path)}
                      className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm cursor-pointer hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary transition-colors data-[selected=true]:bg-bolt-elements-background-depth-3 aria-selected:bg-bolt-elements-background-depth-3"
                    >
                      <span className="text-base">{getFileIcon(file.name)}</span>
                      <span className="flex-1 truncate">{file.relativePath}</span>
                      <span className="text-xs text-bolt-elements-textSecondary">
                        {file.relativePath.includes('/') ? file.relativePath.split('/').slice(0, -1).join('/') : ''}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* Commands Section */}
              {(!search || search.trim() === '') && (
                <Command.Group heading="Commands" className="text-xs font-medium text-bolt-elements-textSecondary px-2 py-1.5">
                  {commands.map((command) => {
                    const Icon = command.icon;
                    return (
                      <Command.Item
                        key={command.id}
                        value={command.title}
                        onSelect={() => handleCommandSelect(command.id)}
                        className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm cursor-pointer hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary transition-colors data-[selected=true]:bg-bolt-elements-background-depth-3 aria-selected:bg-bolt-elements-background-depth-3"
                      >
                        <Icon className="h-4 w-4 text-bolt-elements-textSecondary" />
                        <span className="flex-1">{command.title}</span>
                        <span className="text-xs text-bolt-elements-textTertiary bg-bolt-elements-background-depth-1 px-1.5 py-0.5 rounded border border-bolt-elements-borderColor">
                          {command.shortcut}
                        </span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}

              {/* Recent Files - show when no search */}
              {(!search || search.trim() === '') && files.length > 0 && (
                <Command.Group heading="Recent Files" className="text-xs font-medium text-bolt-elements-textSecondary px-2 py-1.5">
                  {files.slice(0, 5).map((file) => (
                    <Command.Item
                      key={`recent-${file.path}`}
                      value={`recent ${file.relativePath}`}
                      onSelect={() => handleFileSelect(file.path)}
                      className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm cursor-pointer hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary transition-colors data-[selected=true]:bg-bolt-elements-background-depth-3 aria-selected:bg-bolt-elements-background-depth-3"
                    >
                      <span className="text-base">{getFileIcon(file.name)}</span>
                      <span className="flex-1 truncate">{file.relativePath}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
          
          {/* Footer */}
          <div className="border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2">
            <div className="flex items-center justify-between text-xs text-bolt-elements-textSecondary">
              <span>
                {filteredFiles.length > 0 ? `${filteredFiles.length} files` : 'Type to search files and commands'}
              </span>
              <div className="flex items-center gap-1">
                <kbd className="bg-bolt-elements-background-depth-2 px-1.5 py-0.5 rounded border border-bolt-elements-borderColor">↑↓</kbd>
                <span>to navigate</span>
                <kbd className="bg-bolt-elements-background-depth-2 px-1.5 py-0.5 rounded border border-bolt-elements-borderColor">↵</kbd>
                <span>to select</span>
                <kbd className="bg-bolt-elements-background-depth-2 px-1.5 py-0.5 rounded border border-bolt-elements-borderColor">esc</kbd>
                <span>to close</span>
              </div>
            </div>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}