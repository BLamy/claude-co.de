import { useEffect, useState } from 'react';
import { webcontainer } from '~/lib/webcontainer';
import { WebContainerProjectManager } from '~/lib/webcontainer/project-context';
import type { Project, Thread } from '~/lib/stores/projects';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('useWebContainerProject');

let projectManager: WebContainerProjectManager | null = null;

export function useWebContainerProject(project: Project | null, thread: Thread | null) {
  const [isSetup, setIsSetup] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!project || !thread) {
      return;
    }

    let cancelled = false;

    const setupProject = async () => {
      setIsLoading(true);
      setError(null);

      try {
        logger.info(`Setting up webcontainer for project: ${project.name}, thread: ${thread.name}`);
        
        const container = await webcontainer;
        
        if (!projectManager) {
          projectManager = new WebContainerProjectManager(container);
        }

        if (!cancelled) {
          await projectManager.setupProjectContext(project, thread);
          logger.info('Webcontainer project setup completed');
          setIsSetup(true);
        }
      } catch (err) {
        if (!cancelled) {
          logger.error('Failed to setup webcontainer project:', err);
          setError(err instanceof Error ? err.message : 'Failed to setup project');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    setupProject();

    return () => {
      cancelled = true;
    };
  }, [project?.id, thread?.id]);

  return { isSetup, isLoading, error };
}