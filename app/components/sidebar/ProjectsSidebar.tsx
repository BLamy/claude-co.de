import { motion, type Variants } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { IconButton } from '~/components/ui/IconButton';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import { useProjects } from '~/lib/hooks/useProjects';
import { useGitHubSettings } from '~/lib/hooks/useGitHubSettings';
import { isLoadingProjects } from '~/lib/stores/projects';
import { cubicEasingFn } from '~/utils/easings';
import { ProjectItem } from './ProjectItem';
import { CreateProjectDialog } from './CreateProjectDialog';
import { GitHubSettings } from './GitHubSettings';

const menuVariants = {
  closed: {
    opacity: 0,
    visibility: 'hidden',
    left: '-150px',
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
  open: {
    opacity: 1,
    visibility: 'initial',
    left: 0,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
} satisfies Variants;

export function ProjectsSidebar() {
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showGitHubSettings, setShowGitHubSettings] = useState(false);
  const [pendingCreateProject, setPendingCreateProject] = useState(false);

  const { 
    projects, 
    currentProject, 
    currentThread, 
    loading, 
    getProjectThreads, 
    deleteProject,
    loadProjects 
  } = useProjects();
  
  const { isConfigured, settings } = useGitHubSettings();

  // Projects are loaded automatically by useProjects hook, no need to call loadProjects here
  
  // Fix stuck loading state
  useEffect(() => {
    // If we have projects but loading is still true, force it to false
    if (loading && projects.length > 0) {
      isLoadingProjects.set(false);
    }
  }, [loading, projects.length]);


  // Mouse hover behavior for sidebar
  useEffect(() => {
    const enterThreshold = 40;
    const exitThreshold = 40;

    function onMouseMove(event: MouseEvent) {
      if (event.pageX < enterThreshold) {
        setOpen(true);
      }

      if (menuRef.current && event.clientX > menuRef.current.getBoundingClientRect().right + exitThreshold) {
        setOpen(false);
      }
    }

    window.addEventListener('mousemove', onMouseMove);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, []);

  const handleCreateProject = () => {
    if (!isConfigured) {
      setPendingCreateProject(true);
      setShowGitHubSettings(true);
    } else {
      setShowCreateProject(true);
    }
  };

  // Handle closing GitHub settings dialog
  const handleCloseGitHubSettings = () => {
    setShowGitHubSettings(false);
    
    // If we were pending a create project action and now we're configured, show the create dialog
    if (pendingCreateProject && isConfigured) {
      setPendingCreateProject(false);
      setTimeout(() => {
        setShowCreateProject(true);
      }, 300); // Small delay for smooth transition
    }
  };

  const handleDeleteProject = useCallback((projectId: string) => {
    deleteProject(projectId);
  }, [deleteProject]);

  return (
    <>
      <motion.div
        ref={menuRef}
        initial="closed"
        animate={open ? 'open' : 'closed'}
        variants={menuVariants}
        className="flex flex-col side-menu fixed top-0 w-[380px] h-full bg-bolt-elements-background-depth-2 border-r rounded-r-3xl border-bolt-elements-borderColor z-sidebar shadow-xl shadow-bolt-elements-sidebar-dropdownShadow text-sm"
      >
        <div className="flex items-center h-[var(--header-height)]">{/* Header spacer */}</div>
        
        <div className="flex-1 flex flex-col h-full w-full overflow-hidden">
          {/* Header section */}
          <div className="p-4 border-b border-bolt-elements-borderColor">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Projects</h2>
              <div className="flex items-center gap-1">
                <IconButton
                  icon="i-bolt:gear"
                  title="GitHub Settings"
                  size="sm"
                  onClick={() => setShowGitHubSettings(true)}
                  className={isConfigured ? 'text-green-600' : 'text-bolt-elements-textTertiary'}
                />
                <IconButton
                  icon="i-bolt:plus"
                  title="Create Project"
                  size="sm"
                  onClick={handleCreateProject}
                />
              </div>
            </div>

            {isConfigured && settings.username && (
              <div className="text-xs text-bolt-elements-textTertiary">
                Connected as @{settings.username}
              </div>
            )}
            
            {!isConfigured && (
              <div className="text-xs text-yellow-600 dark:text-yellow-400">
                Configure GitHub token to create projects
              </div>
            )}
          </div>

          {/* Projects list */}
          <div className="flex-1 overflow-auto px-4 py-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-bolt-elements-textTertiary">Loading projects...</div>
              </div>
            ) : projects.length === 0 ? (
              <div className="py-8 text-center">
                <div className="text-bolt-elements-textTertiary mb-3">No projects yet</div>
                <button
                  onClick={handleCreateProject}
                  className="text-sm text-bolt-elements-textPrimary hover:text-bolt-elements-textSecondary underline"
                >
                  Create your first project
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {projects.map(project => (
                  <ProjectItem
                    key={project.id}
                    project={project}
                    threads={getProjectThreads(project.id)}
                    currentProjectId={currentProject?.id}
                    currentThreadId={currentThread?.id}
                    onDeleteProject={handleDeleteProject}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-bolt-elements-borderColor p-4">
            <div className="text-xs text-bolt-elements-textTertiary">
              {projects.length} project{projects.length !== 1 ? 's' : ''}
            </div>
            <ThemeSwitch />
          </div>
        </div>
      </motion.div>

      {/* Dialogs */}
      <CreateProjectDialog
        isOpen={showCreateProject}
        onClose={() => setShowCreateProject(false)}
        onProjectCreated={(projectId) => {
          // Optionally auto-expand the new project
          console.log('Project created:', projectId);
        }}
      />

      <GitHubSettings
        isOpen={showGitHubSettings}
        onClose={handleCloseGitHubSettings}
      />
    </>
  );
}