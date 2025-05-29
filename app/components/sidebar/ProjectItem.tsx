import { useState } from 'react';
import { IconButton } from '~/components/ui/IconButton';
import { useProjects } from '~/lib/hooks/useProjects';
import type { Project, Thread } from '~/lib/stores/projects';
import { ThreadItem } from './ThreadItem';
import { CreateThreadDialog } from './CreateThreadDialog';

interface ProjectItemProps {
  project: Project;
  threads: Thread[];
  currentProjectId?: string;
  currentThreadId?: string;
  onDeleteProject: (projectId: string) => void;
}

export function ProjectItem({ 
  project, 
  threads, 
  currentProjectId, 
  currentThreadId, 
  onDeleteProject 
}: ProjectItemProps) {
  const { switchToThread, deleteThread } = useProjects();
  const [isExpanded, setIsExpanded] = useState(currentProjectId === project.id);
  const [showCreateThread, setShowCreateThread] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isCurrentProject = currentProjectId === project.id;

  const handleThreadSelect = (threadId: string) => {
    switchToThread(threadId);
  };

  const handleProjectClick = () => {
    // If the project has threads, switch to the first one
    if (threads.length > 0) {
      console.log(`Switching to thread ${threads[0].id} for project ${project.id}`);
      switchToThread(threads[0].id);
    } else {
      // Just expand the project if no threads
      console.log(`No threads found for project ${project.id}, expanding instead`);
      setIsExpanded(!isExpanded);
    }
  };

  const handleDeleteThread = (threadId: string) => {
    deleteThread(threadId);
  };

  const handleDeleteProject = () => {
    if (showDeleteConfirm) {
      onDeleteProject(project.id);
      setShowDeleteConfirm(false);
    } else {
      setShowDeleteConfirm(true);
      // Auto-hide confirmation after 3 seconds
      setTimeout(() => setShowDeleteConfirm(false), 3000);
    }
  };

  return (
    <>
      <div className={`group rounded-md transition-colors ${
        isCurrentProject 
          ? 'bg-bolt-elements-sidebar-buttonBackgroundHover' 
          : 'hover:bg-bolt-elements-sidebar-buttonBackgroundHover'
      }`}>
        <div className="flex items-center p-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-bolt-elements-sidebar-buttonBackgroundHover rounded"
            title="Expand/collapse threads"
          >
            <span className={`text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
              ▶
            </span>
          </button>
          <button
            onClick={handleProjectClick}
            className="flex-1 flex items-center gap-2 text-left ml-1"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="inline-block i-bolt:folder scale-110 text-bolt-elements-textSecondary" />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-bolt-elements-textPrimary truncate">
                  {project.name}
                </div>
                <div className="text-xs text-bolt-elements-textTertiary truncate">
                  {project.owner}/{project.repo}
                </div>
              </div>
            </div>
          </button>
          
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <IconButton
              icon="i-bolt:plus"
              title="Create thread"
              size="sm"
              onClick={() => setShowCreateThread(true)}
            />
            <IconButton
              icon="i-bolt:trash"
              title={showDeleteConfirm ? "Click again to confirm" : "Delete project"}
              size="sm"
              onClick={handleDeleteProject}
              className={showDeleteConfirm ? 'text-red-500' : ''}
            />
          </div>
        </div>

        {isExpanded && (
          <div className="ml-4 pb-2 space-y-1">
            {threads.length === 0 ? (
              <div className="px-4 py-2 text-xs text-bolt-elements-textTertiary">
                No threads yet. Create one to get started.
              </div>
            ) : (
              threads.map(thread => (
                <ThreadItem
                  key={thread.id}
                  thread={thread}
                  isActive={currentThreadId === thread.id}
                  onSelect={() => handleThreadSelect(thread.id)}
                  onDelete={() => handleDeleteThread(thread.id)}
                />
              ))
            )}
            
            <button
              onClick={() => setShowCreateThread(true)}
              className="w-full px-4 py-2 text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-sidebar-buttonBackgroundHover rounded-md transition-colors text-left"
            >
              + New thread
            </button>
          </div>
        )}
      </div>

      <CreateThreadDialog
        isOpen={showCreateThread}
        onClose={() => setShowCreateThread(false)}
        project={project}
        onThreadCreated={(threadId) => {
          setIsExpanded(true);
          // Optionally switch to the new thread immediately
          // switchToThread(threadId);
        }}
      />
    </>
  );
}