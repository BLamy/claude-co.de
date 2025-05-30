import { useStore } from '@nanostores/react';
import { motion, type HTMLMotionProps, type Variants } from 'framer-motion';
import { computed } from 'nanostores';
import { memo, useCallback, useEffect, useState, useRef, useMemo } from 'react';
import useResizeObserver from 'use-resize-observer';
import { toast } from 'react-toastify';
import {
  type OnChangeCallback as OnEditorChange,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror/CodeMirrorEditor';
import { IconButton } from '~/components/ui/IconButton';
import { workbenchStore, type WorkbenchViewType } from '~/lib/stores/workbench';
import { WORK_DIR } from '~/utils/constants';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';
import { renderLogger } from '~/utils/logger';
import { EditorPanel } from './EditorPanel';
import { Preview } from './Preview';
import { GitPanel } from './GitPanel';
import { SearchPanel } from './SearchPanel';
import { FileTree } from './FileTree';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import { themeStore } from '~/lib/stores/theme';
import { Terminal, type TerminalRef } from './terminal/Terminal';
import { TopBar } from './TopBar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';

interface WorkspaceProps {
  chatStarted?: boolean;
  isStreaming?: boolean;
}

const viewTransition = { ease: cubicEasingFn };

const workbenchVariants = {
  closed: {
    width: 0,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
  open: {
    width: 'var(--workbench-width)',
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
} satisfies Variants;

const DEFAULT_TERMINAL_SIZE = 50;
const DEFAULT_EDITOR_SIZE = 100 - DEFAULT_TERMINAL_SIZE;
const MAX_TERMINALS = 3;

export const Workbench = memo(({ chatStarted: _chatStarted, isStreaming }: WorkspaceProps) => {
  renderLogger.trace('Workbench');

  const hasPreview = useStore(computed(workbenchStore.previews, (previews) => previews.length > 0));
  const selectedFile = useStore(workbenchStore.selectedFile);
  const currentDocument = useStore(workbenchStore.currentDocument);
  const unsavedFiles = useStore(workbenchStore.unsavedFiles);
  const files = useStore(workbenchStore.files);
  const selectedView = useStore(workbenchStore.currentView);
  const showTerminal = useStore(workbenchStore.showTerminal);
  const theme = useStore(themeStore);

  const [activeSidebarPanel, setActiveSidebarPanel] = useState<'files' | 'git' | 'search'>('files');
  const [isWide, setIsWide] = useState(false);
  const { ref: containerRef, width: containerWidth = 0 } = useResizeObserver<HTMLDivElement>();
  
  // Sidebar state
  const [sidebarWidth, setSidebarWidth] = useState(25);
  const [sidebarMode, setSidebarMode] = useState<'full' | 'compact' | 'minimal'>('full');
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
  const originalSidebarSize = useRef(25);

  // terminal state
  const terminalRefs = useRef<Record<string, TerminalRef | null>>({});
  const terminalPanelRef = useRef<ImperativePanelHandle>(null);
  const terminalToggledByShortcut = useRef(false);
  const terminalInfo = useStore(workbenchStore.terminalInfo);
  const activeTerminalId = useStore(workbenchStore.activeTerminalId);
  const terminalKeys = useMemo(() => Object.keys(terminalInfo), [terminalInfo]);

  const setSelectedView = (view: WorkbenchViewType) => {
    workbenchStore.currentView.set(view);
  };

  useEffect(() => {
    if (hasPreview) {
      setSelectedView('preview');
    } else {
      setSelectedView('code');
    }
  }, [hasPreview]);

  useEffect(() => {
    workbenchStore.setDocuments(files);
  }, [files]);

  useEffect(() => {
    console.log('Container width:', containerWidth, 'Window width:', window.innerWidth);
    setIsWide(containerWidth > 900);
  }, [containerWidth]);

  useEffect(() => {
    const { current: terminal } = terminalPanelRef;

    if (!terminal) {
      return;
    }

    const isCollapsed = terminal.isCollapsed();

    if (!showTerminal && !isCollapsed) {
      terminal.collapse();
    } else if (showTerminal && isCollapsed) {
      terminal.resize(DEFAULT_TERMINAL_SIZE);
    }

    terminalToggledByShortcut.current = false;
  }, [showTerminal]);

  const onEditorChange = useCallback<OnEditorChange>((update) => {
    workbenchStore.setCurrentDocumentContent(update.content);
  }, []);

  const onEditorScroll = useCallback<OnEditorScroll>((position) => {
    workbenchStore.setCurrentDocumentScrollPosition(position);
  }, []);

  const onFileSelect = useCallback((filePath: string | undefined) => {
    workbenchStore.setSelectedFile(filePath);
  }, []);

  const onFileSave = useCallback(() => {
    workbenchStore.saveCurrentDocument().catch(() => {
      toast.error('Failed to update file content');
    });
  }, []);

  const onFileReset = useCallback(() => {
    workbenchStore.resetCurrentDocument();
  }, []);

  const toggleSidebarPanel = useCallback((panel: 'files' | 'git' | 'search') => {
    setActiveSidebarPanel(panel);
    
    // If in minimal mode, expand sidebar on click
    if (sidebarMode === 'minimal') {
      sidebarPanelRef.current?.resize(originalSidebarSize.current);
      setSidebarMode('full');
    }
  }, [sidebarMode]);
  
  // Handle sidebar resize
  const handleSidebarResize = useCallback((size: number) => {
    setSidebarWidth(size);
    
    // Determine sidebar mode based on width
    if (size <= 10) {
      setSidebarMode('minimal');
      // Snap to minimal size
      if (sidebarPanelRef.current && size !== 3.5) {
        setTimeout(() => {
          sidebarPanelRef.current?.resize(3.5);
        }, 0);
      }
    } else if (size <= 24) {
      setSidebarMode('compact');
    } else {
      setSidebarMode('full');
      originalSidebarSize.current = size;
    }
  }, []);

  const addTerminal = () => {
    if (workbenchStore.getTerminalCount() < MAX_TERMINALS) {
      const newId = workbenchStore.createTerminal();
      workbenchStore.setActiveTerminal(newId);
    }
  };

  const addClaudeTerminal = () => {
    if (workbenchStore.getTerminalCount() < MAX_TERMINALS) {
      const newId = workbenchStore.createTerminal(true);
      workbenchStore.setActiveTerminal(newId);
    }
  };

  const renderTerminal = () => (
    <>
      <PanelResizeHandle />
      <Panel
        ref={terminalPanelRef}
        defaultSize={showTerminal ? DEFAULT_TERMINAL_SIZE : 8}
        minSize={8}
        collapsible={false}
        onResize={(size) => {
          // If the panel is resized to close to minimum, treat it as collapsed
          if (size <= 10 && showTerminal) {
            terminalToggledByShortcut.current = true;
            workbenchStore.toggleTerminal(false);
          } else if (size > 10 && !showTerminal) {
            terminalToggledByShortcut.current = true;
            workbenchStore.toggleTerminal(true);
          }
        }}
      >
        <div className="h-full flex flex-col">
          {/* Terminal header - always visible */}
          <div
            className={classNames(
              'flex items-center bg-bolt-elements-background-depth-2 border-y border-bolt-elements-borderColor gap-1.5 min-h-[34px] p-2',
              {
                'cursor-pointer relative top-[7px]': !showTerminal,
              },
            )}
            onClick={() => {
              if (!showTerminal) {
                terminalToggledByShortcut.current = true;
                workbenchStore.toggleTerminal(true);
                terminalPanelRef.current?.resize(DEFAULT_TERMINAL_SIZE);
              }
            }}
          >
            {terminalKeys.map((terminalId) => {
              const info = terminalInfo[terminalId];
              const isActive = activeTerminalId === terminalId;
              const isClaude = info.isClaude;
              const isClaudeRunning = info.isRunning;

              return (
                <button
                  key={terminalId}
                  className={classNames(
                    'flex items-center text-sm cursor-pointer gap-1.5 px-3 py-2 h-full whitespace-nowrap rounded-full',
                    {
                      'bg-bolt-elements-terminals-buttonBackground text-bolt-elements-textPrimary': isActive,
                      'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-terminals-buttonBackground':
                        !isActive,
                    },
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!showTerminal) {
                      terminalToggledByShortcut.current = true;
                      workbenchStore.toggleTerminal(true);
                      terminalPanelRef.current?.resize(DEFAULT_TERMINAL_SIZE);
                    }
                    workbenchStore.setActiveTerminal(terminalId);
                  }}
                >
                  {isClaude ? (
                    <div className="relative">
                      <svg
                        height="18"
                        width="18"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                        className={classNames('flex-shrink-0', {
                          'animate-pulse': isClaudeRunning || false,
                        })}
                      >
                        <path
                          d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"
                          fill="currentColor"
                        />
                      </svg>
                      {isClaudeRunning && (
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      )}
                    </div>
                  ) : (
                    <div className="i-ph:terminal-window-duotone text-lg" />
                  )}
                  {isClaude ? (isClaudeRunning ? 'Claude (Running)' : 'Claude') : 'Terminal'}{' '}
                  {terminalKeys.length > 1 && terminalKeys.indexOf(terminalId) + 1}
                </button>
              );
            })}
            {terminalKeys.length < MAX_TERMINALS && (
              <IconButton
                icon="i-ph:plus"
                size="md"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!showTerminal) {
                    terminalToggledByShortcut.current = true;
                    workbenchStore.toggleTerminal(true);
                    terminalPanelRef.current?.resize(DEFAULT_TERMINAL_SIZE);
                  }
                  addTerminal();
                }}
              />
            )}
            {terminalKeys.length < MAX_TERMINALS && (
              <IconButton
                size="md"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!showTerminal) {
                    terminalToggledByShortcut.current = true;
                    workbenchStore.toggleTerminal(true);
                    terminalPanelRef.current?.resize(DEFAULT_TERMINAL_SIZE);
                  }
                  addClaudeTerminal();
                }}
                title="Open Claude Code Terminal"
              >
                <svg
                  height="1em"
                  style={{ flex: 'none', lineHeight: 1 }}
                  viewBox="0 0 24 24"
                  width="1em"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <title>Claude</title>
                  <path
                    d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"
                    fill="#D97757"
                  />
                </svg>
              </IconButton>
            )}
            <IconButton
              className="ml-auto"
              icon={showTerminal ? 'i-ph:caret-down' : 'i-ph:caret-up'}
              title={showTerminal ? 'Close' : 'Open'}
              size="md"
              onClick={(e) => {
                e.stopPropagation();
                if (showTerminal) {
                  terminalToggledByShortcut.current = true;
                  workbenchStore.toggleTerminal(false);
                  terminalPanelRef.current?.resize(8);
                } else {
                  terminalToggledByShortcut.current = true;
                  workbenchStore.toggleTerminal(true);
                  terminalPanelRef.current?.resize(DEFAULT_TERMINAL_SIZE);
                }
              }}
            />
          </div>

          {/* Terminal content - only visible when terminal is open */}
          {showTerminal && (
            <div className="bg-bolt-elements-terminals-background flex-1">
              {terminalKeys.map((terminalId) => {
                const isActive = activeTerminalId === terminalId;

                return (
                  <Terminal
                    key={terminalId}
                    className={classNames('h-full overflow-hidden', {
                      hidden: !isActive,
                    })}
                    ref={(ref) => {
                      terminalRefs.current[terminalId] = ref;
                    }}
                    onTerminalReady={(terminal) => workbenchStore.attachTerminal(terminalId, terminal)}
                    onTerminalResize={(cols, rows) => workbenchStore.onTerminalResize(cols, rows)}
                    theme={theme}
                  />
                );
              })}
            </div>
          )}
        </div>
      </Panel>
    </>
  );

  return (
    <TooltipProvider>
      <motion.div
        initial="open"
        animate="open"
        variants={workbenchVariants}
        className="z-workbench h-full w-full"
        ref={containerRef}
      >
        <div className="fixed inset-0 z-0">
          <div className="h-full w-full">
            <div className="h-full flex flex-col bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor shadow-sm overflow-hidden">
              <TopBar 
                selectedView={selectedView}
                onViewChange={setSelectedView}
                hasPreview={hasPreview}
                isWide={isWide}
              />
              <div className="relative flex-1 overflow-hidden">
                <div className="h-full">
                  {/* Main content area with preview: resizable layout */}
                  <PanelGroup direction="horizontal" className="flex-1">
                  {/* Sidebar + Editor + Terminal */}
                  <Panel defaultSize={isWide ? 60 : 100} minSize={30}>
                    <PanelGroup direction="vertical">
                      <Panel defaultSize={showTerminal ? DEFAULT_EDITOR_SIZE : 100} minSize={20}>
                        {/* Sidebar + Editor: resizable layout */}
                        <PanelGroup direction="horizontal">
                          {/* Left sidebar with FileTree and TestExplorerPanel */}
                          <Panel 
                            ref={sidebarPanelRef}
                            defaultSize={25} 
                            minSize={3.5} 
                            maxSize={40}
                            onResize={handleSidebarResize}
                            style={sidebarMode === 'minimal' ? { minWidth: '42px', maxWidth: '42px', width: '42px' } : {}}
                          >
                            <div className="h-full border-r border-bolt-elements-borderColor">
                              <div className={classNames(
                                "bg-bolt-elements-background-depth-1 border-b border-bolt-elements-borderColor",
                                sidebarMode === 'minimal' ? 'h-full' : ''
                              )}>
                                <div className={classNames(
                                  sidebarMode === 'minimal' ? 'flex-col h-full' : 'flex-row',
                                  'flex w-full'
                                )}>
                                  {/* Files button */}
                                  {sidebarMode === 'full' ? (
                                    <button
                                      className={classNames(
                                        'flex-1 py-2 px-3 font-medium text-sm',
                                        activeSidebarPanel === 'files'
                                          ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent border-b-2 border-bolt-brand'
                                          : 'bg-bolt-elements-item-backgroundActive text-bolt-elements-textSecondary hover:bg-bolt-elements-item-backgroundAccent',
                                      )}
                                      onClick={() => toggleSidebarPanel('files')}
                                    >
                                      <div className="flex items-center justify-center">
                                        <div className="i-ph:folder mr-2" />
                                        Files
                                      </div>
                                    </button>
                                  ) : (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          className={classNames(
                                            sidebarMode === 'minimal' ? 'w-full py-3' : 'flex-1 py-2 px-2',
                                            'font-medium text-sm',
                                            activeSidebarPanel === 'files'
                                              ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                                              : 'bg-bolt-elements-item-backgroundActive text-bolt-elements-textSecondary hover:bg-bolt-elements-item-backgroundAccent',
                                            sidebarMode === 'minimal' && activeSidebarPanel === 'files' ? 'border-l-2 border-bolt-brand' : '',
                                            sidebarMode === 'compact' && activeSidebarPanel === 'files' ? 'border-b-2 border-bolt-brand' : ''
                                          )}
                                          onClick={() => toggleSidebarPanel('files')}
                                        >
                                          <div className="flex items-center justify-center">
                                            <div className="i-ph:folder text-lg" />
                                          </div>
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side={sidebarMode === 'minimal' ? 'right' : 'bottom'}>
                                        Files
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                  
                                  {/* Git button */}
                                  {sidebarMode === 'full' ? (
                                    <button
                                      className={classNames(
                                        'flex-1 py-2 px-3 font-medium text-sm',
                                        activeSidebarPanel === 'git'
                                          ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent border-b-2 border-bolt-brand'
                                          : 'bg-bolt-elements-item-backgroundActive text-bolt-elements-textSecondary hover:bg-bolt-elements-item-backgroundAccent',
                                      )}
                                      onClick={() => toggleSidebarPanel('git')}
                                    >
                                      <div className="flex items-center justify-center">
                                        <div className="i-ph:git-branch mr-2" />
                                        Git
                                      </div>
                                    </button>
                                  ) : (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          className={classNames(
                                            sidebarMode === 'minimal' ? 'w-full py-3' : 'flex-1 py-2 px-2',
                                            'font-medium text-sm',
                                            activeSidebarPanel === 'git'
                                              ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                                              : 'bg-bolt-elements-item-backgroundActive text-bolt-elements-textSecondary hover:bg-bolt-elements-item-backgroundAccent',
                                            sidebarMode === 'minimal' && activeSidebarPanel === 'git' ? 'border-l-2 border-bolt-brand' : '',
                                            sidebarMode === 'compact' && activeSidebarPanel === 'git' ? 'border-b-2 border-bolt-brand' : ''
                                          )}
                                          onClick={() => toggleSidebarPanel('git')}
                                        >
                                          <div className="flex items-center justify-center">
                                            <div className="i-ph:git-branch text-lg" />
                                          </div>
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side={sidebarMode === 'minimal' ? 'right' : 'bottom'}>
                                        Git
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                  
                                  {/* Search button */}
                                  {sidebarMode === 'full' ? (
                                    <button
                                      className={classNames(
                                        'flex-1 py-2 px-3 font-medium text-sm',
                                        activeSidebarPanel === 'search'
                                          ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent border-b-2 border-bolt-brand'
                                          : 'bg-bolt-elements-item-backgroundActive text-bolt-elements-textSecondary hover:bg-bolt-elements-item-backgroundAccent',
                                      )}
                                      onClick={() => toggleSidebarPanel('search')}
                                    >
                                      <div className="flex items-center justify-center">
                                        <div className="i-ph:magnifying-glass mr-2" />
                                        Search
                                      </div>
                                    </button>
                                  ) : (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          className={classNames(
                                            sidebarMode === 'minimal' ? 'w-full py-3' : 'flex-1 py-2 px-2',
                                            'font-medium text-sm',
                                            activeSidebarPanel === 'search'
                                              ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                                              : 'bg-bolt-elements-item-backgroundActive text-bolt-elements-textSecondary hover:bg-bolt-elements-item-backgroundAccent',
                                            sidebarMode === 'minimal' && activeSidebarPanel === 'search' ? 'border-l-2 border-bolt-brand' : '',
                                            sidebarMode === 'compact' && activeSidebarPanel === 'search' ? 'border-b-2 border-bolt-brand' : ''
                                          )}
                                          onClick={() => toggleSidebarPanel('search')}
                                        >
                                          <div className="flex items-center justify-center">
                                            <div className="i-ph:magnifying-glass text-lg" />
                                          </div>
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side={sidebarMode === 'minimal' ? 'right' : 'bottom'}>
                                        Search
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              </div>

                              {sidebarMode !== 'minimal' && (
                                <div className="h-[calc(100%-40px)] overflow-hidden">
                                  {activeSidebarPanel === 'files' ? (
                                    <FileTree
                                      className="h-full p-2"
                                      files={files}
                                      hideRoot
                                      unsavedFiles={unsavedFiles}
                                      rootFolder={WORK_DIR}
                                      selectedFile={selectedFile}
                                      onFileSelect={onFileSelect}
                                    />
                                  ) : activeSidebarPanel === 'git' ? (
                                    <GitPanel />
                                  ) : (
                                    <SearchPanel onFileSelect={onFileSelect} />
                                  )}
                                </div>
                              )}
                            </div>
                          </Panel>

                          <PanelResizeHandle />

                          {/* Editor panel */}
                          <Panel defaultSize={75} minSize={20}>
                            <div className="relative h-full overflow-hidden" style={{ minWidth: 0 }}>
                              {!isWide && (
                                <View
                                  initial={{ x: selectedView === 'code' ? 0 : '-100%' }}
                                  animate={{ x: selectedView === 'code' ? 0 : '-100%' }}
                                >
                                  <EditorPanel
                                    editorDocument={currentDocument}
                                    isStreaming={isStreaming}
                                    selectedFile={selectedFile}
                                    files={files}
                                    unsavedFiles={unsavedFiles}
                                    onFileSelect={onFileSelect}
                                    onEditorScroll={onEditorScroll}
                                    onEditorChange={onEditorChange}
                                    onFileSave={onFileSave}
                                    onFileReset={onFileReset}
                                    hideFileExplorer={true}
                                    hideTerminal={true}
                                  />
                                </View>
                              )}
                              {!isWide && (
                                <View
                                  initial={{ x: selectedView === 'preview' ? 0 : '100%' }}
                                  animate={{ x: selectedView === 'preview' ? 0 : '100%' }}
                                >
                                  <Preview />
                                </View>
                              )}
                              {!isWide && (
                                <View
                                  initial={{ x: selectedView === 'git' ? 0 : '100%' }}
                                  animate={{ x: selectedView === 'git' ? 0 : '100%' }}
                                >
                                  <GitPanel />
                                </View>
                              )}
                              {isWide && (
                                <EditorPanel
                                  editorDocument={currentDocument}
                                  isStreaming={isStreaming}
                                  selectedFile={selectedFile}
                                  files={files}
                                  unsavedFiles={unsavedFiles}
                                  onFileSelect={onFileSelect}
                                  onEditorScroll={onEditorScroll}
                                  onEditorChange={onEditorChange}
                                  onFileSave={onFileSave}
                                  onFileReset={onFileReset}
                                  hideFileExplorer={true}
                                  hideTerminal={true}
                                />
                              )}
                            </div>
                          </Panel>
                        </PanelGroup>
                      </Panel>
                      {renderTerminal()}
                    </PanelGroup>
                  </Panel>

                  {/* Preview panel - only show when wide */}
                  {isWide && (
                    <>
                      <PanelResizeHandle />
                      <Panel defaultSize={40} minSize={20}>
                        <div className="h-full border-l border-bolt-elements-borderColor">
                          <Preview />
                        </div>
                      </Panel>
                    </>
                  )}
                </PanelGroup>
              </div>
            </div>
            
            {/* Blue status bar at bottom */}
            <div className="h-6 bg-blue-600 border-t border-bolt-elements-borderColor flex items-center px-3">
              <div className="text-white text-xs font-medium">Ready</div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
    </TooltipProvider>
  );
});

interface ViewProps extends HTMLMotionProps<'div'> {
  children: JSX.Element;
}

const View = memo(({ children, ...props }: ViewProps) => {
  return (
    <motion.div className="absolute inset-0" transition={viewTransition} {...props}>
      {children}
    </motion.div>
  );
});
