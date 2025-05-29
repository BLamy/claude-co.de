import React from 'react';

interface ProjectsProviderProps {
  children: React.ReactNode;
}

export function ProjectsProvider({ children }: ProjectsProviderProps) {
  // The projects database is now initialized directly in useProjects hook
  // to avoid WebAssembly conflicts from multiple PGlite instances
  return <>{children}</>;
}