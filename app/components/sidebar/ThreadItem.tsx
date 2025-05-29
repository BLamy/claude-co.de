import { useState } from 'react';
import { IconButton } from '~/components/ui/IconButton';
import type { Thread } from '~/lib/stores/projects';

interface ThreadItemProps {
  thread: Thread;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export function ThreadItem({ thread, isActive, onSelect, onDelete }: ThreadItemProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = () => {
    if (showDeleteConfirm) {
      onDelete();
      setShowDeleteConfirm(false);
    } else {
      setShowDeleteConfirm(true);
      // Auto-hide confirmation after 3 seconds
      setTimeout(() => setShowDeleteConfirm(false), 3000);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div className={`group flex items-center p-2 rounded-md transition-colors cursor-pointer ${
      isActive 
        ? 'bg-bolt-elements-sidebar-buttonBackgroundActive text-bolt-elements-sidebar-buttonTextActive' 
        : 'hover:bg-bolt-elements-sidebar-buttonBackgroundHover text-bolt-elements-sidebar-buttonText'
    }`}>
      <button
        onClick={onSelect}
        className="flex-1 flex items-center gap-2 min-w-0 text-left"
      >
        <span className="inline-block i-bolt:git-branch scale-110 text-bolt-elements-textSecondary" />
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">
            {thread.name}
          </div>
          <div className="text-xs text-bolt-elements-textTertiary flex items-center gap-2 truncate">
            <span>{thread.branch}</span>
            <span>•</span>
            <span>{formatDate(thread.updatedAt)}</span>
            {thread.messages.length > 0 && (
              <>
                <span>•</span>
                <span>{thread.messages.length} messages</span>
              </>
            )}
          </div>
        </div>
      </button>
      
      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
        <IconButton
          icon="i-bolt:trash"
          title={showDeleteConfirm ? "Click again to confirm" : "Delete thread"}
          size="sm"
          onClick={handleDelete}
          className={showDeleteConfirm ? 'text-red-500' : ''}
        />
      </div>
    </div>
  );
}