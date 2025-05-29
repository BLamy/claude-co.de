import { useStore } from '@nanostores/react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import {
  CodeMirrorEditor,
  type EditorDocument,
  type EditorSettings,
  type OnChangeCallback as OnEditorChange,
  type OnSaveCallback as OnEditorSave,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror/CodeMirrorEditor';
import { IconButton } from '~/components/ui/IconButton';
import { PanelHeader } from '~/components/ui/PanelHeader';
import { PanelHeaderButton } from '~/components/ui/PanelHeaderButton';
import { shortcutEventEmitter } from '~/lib/hooks';
import type { FileMap } from '~/lib/stores/files';
import { themeStore } from '~/lib/stores/theme';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { WORK_DIR } from '~/utils/constants';
import { renderLogger } from '~/utils/logger';
import { isMobile } from '~/utils/mobile';
import { FileBreadcrumb } from './FileBreadcrumb';
import { FileTree } from './FileTree';
import { Terminal, type TerminalRef } from './terminal/Terminal';

interface EditorPanelProps {
  files?: FileMap;
  unsavedFiles?: Set<string>;
  editorDocument?: EditorDocument;
  selectedFile?: string | undefined;
  isStreaming?: boolean;
  onEditorChange?: OnEditorChange;
  onEditorScroll?: OnEditorScroll;
  onFileSelect?: (value?: string) => void;
  onFileSave?: OnEditorSave;
  onFileReset?: () => void;
  sidebarMode?: boolean;
  hideFileExplorer?: boolean;
}

const MAX_TERMINALS = 3;
const DEFAULT_TERMINAL_SIZE = 25;
const DEFAULT_EDITOR_SIZE = 100 - DEFAULT_TERMINAL_SIZE;

const editorSettings: EditorSettings = { tabSize: 2 };

export const EditorPanel = memo(
  ({
    files,
    unsavedFiles,
    editorDocument,
    selectedFile,
    isStreaming,
    onFileSelect,
    onEditorChange,
    onEditorScroll,
    onFileSave,
    onFileReset,
    sidebarMode,
    hideFileExplorer,
  }: EditorPanelProps) => {
    renderLogger.trace('EditorPanel');

    const theme = useStore(themeStore);
    const showTerminal = useStore(workbenchStore.showTerminal);

    const terminalRefs = useRef<Array<TerminalRef | null>>([]);
    const terminalPanelRef = useRef<ImperativePanelHandle>(null);
    const terminalToggledByShortcut = useRef(false);

    const [activeTerminal, setActiveTerminal] = useState(0);
    const [terminalCount, setTerminalCount] = useState(1);
    const [terminalCommands, setTerminalCommands] = useState<Record<number, string>>({});
    const [claudeTerminals, setClaudeTerminals] = useState<Set<number>>(new Set());
    const [runningClaudeTerminals, setRunningClaudeTerminals] = useState<Set<number>>(new Set());

    const activeFileSegments = useMemo(() => {
      if (!editorDocument) {
        return undefined;
      }

      return editorDocument.filePath.split('/');
    }, [editorDocument]);

    const activeFileUnsaved = useMemo(() => {
      return editorDocument !== undefined && unsavedFiles?.has(editorDocument.filePath);
    }, [editorDocument, unsavedFiles]);

    useEffect(() => {
      const unsubscribeFromEventEmitter = shortcutEventEmitter.on('toggleTerminal', () => {
        terminalToggledByShortcut.current = true;
      });

      const unsubscribeFromThemeStore = themeStore.subscribe(() => {
        for (const ref of Object.values(terminalRefs.current)) {
          ref?.reloadStyles();
        }
      });

      return () => {
        unsubscribeFromEventEmitter();
        unsubscribeFromThemeStore();
      };
    }, []);

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

    const addTerminal = () => {
      if (terminalCount < MAX_TERMINALS) {
        setTerminalCount(terminalCount + 1);
        setActiveTerminal(terminalCount);
      }
    };

    const addClaudeTerminal = () => {
      if (terminalCount < MAX_TERMINALS) {
        const newIndex = terminalCount;
        setTerminalCount(terminalCount + 1);
        setActiveTerminal(newIndex);

        // Store the command for this terminal
        setTerminalCommands((prev) => ({
          ...prev,
          [newIndex]: 'npx -y @anthropic-ai/claude-code@1.0.3',
        }));

        // Mark this as a Claude terminal
        setClaudeTerminals((prev) => new Set(prev).add(newIndex));

        // Mark it as running initially
        setRunningClaudeTerminals((prev) => new Set(prev).add(newIndex));

        // After a delay, mark it as no longer running (Claude Code is interactive but starts quickly)
        setTimeout(() => {
          setRunningClaudeTerminals((prev) => {
            const newSet = new Set(prev);
            newSet.delete(newIndex);

            return newSet;
          });
        }, 5000); // 5 seconds should be enough for Claude Code to start
      }
    };

    return (
      <PanelGroup direction="vertical">
        <Panel defaultSize={showTerminal ? DEFAULT_EDITOR_SIZE : 100} minSize={20}>
          {sidebarMode ? (
            <div className="flex flex-col h-full">
              <FileTree
                className="h-full"
                files={files}
                hideRoot
                unsavedFiles={unsavedFiles}
                rootFolder={WORK_DIR}
                selectedFile={selectedFile}
                onFileSelect={onFileSelect}
              />
            </div>
          ) : (
            <PanelGroup direction="horizontal">
              {!hideFileExplorer && (
                <>
                  <Panel defaultSize={20} minSize={10} collapsible>
                    <div className="flex flex-col border-r border-bolt-elements-borderColor h-full">
                      <FileTree
                        className="h-full"
                        files={files}
                        hideRoot
                        unsavedFiles={unsavedFiles}
                        rootFolder={WORK_DIR}
                        selectedFile={selectedFile}
                        onFileSelect={onFileSelect}
                      />
                    </div>
                  </Panel>
                  <PanelResizeHandle />
                </>
              )}
              <Panel className="flex flex-col" defaultSize={hideFileExplorer ? 100 : 80} minSize={20}>
                <PanelHeader className="overflow-x-auto">
                  {activeFileSegments?.length && (
                    <div className="flex items-center flex-1 text-sm">
                      <FileBreadcrumb pathSegments={activeFileSegments} files={files} onFileSelect={onFileSelect} />
                      {activeFileUnsaved && (
                        <div className="flex gap-1 ml-auto -mr-1.5">
                          <PanelHeaderButton onClick={onFileSave}>
                            <div className="i-ph:floppy-disk-duotone" />
                            Save
                          </PanelHeaderButton>
                          <PanelHeaderButton onClick={onFileReset}>
                            <div className="i-ph:clock-counter-clockwise-duotone" />
                            Reset
                          </PanelHeaderButton>
                        </div>
                      )}
                    </div>
                  )}
                </PanelHeader>
                <div className="h-full flex-1 overflow-hidden">
                  <CodeMirrorEditor
                    theme={theme}
                    editable={!isStreaming && editorDocument !== undefined}
                    settings={editorSettings}
                    doc={editorDocument}
                    autoFocusOnDocumentChange={!isMobile()}
                    onScroll={onEditorScroll}
                    onChange={onEditorChange}
                    onSave={onFileSave}
                  />
                </div>
              </Panel>
            </PanelGroup>
          )}
        </Panel>
        {!sidebarMode && (
          <>
            <PanelResizeHandle />
            <Panel
              ref={terminalPanelRef}
              defaultSize={showTerminal ? DEFAULT_TERMINAL_SIZE : 0}
              minSize={10}
              collapsible
              onExpand={() => {
                if (!terminalToggledByShortcut.current) {
                  workbenchStore.toggleTerminal(true);
                }
              }}
              onCollapse={() => {
                if (!terminalToggledByShortcut.current) {
                  workbenchStore.toggleTerminal(false);
                }
              }}
            >
              <div className="h-full">
                <div className="bg-bolt-elements-terminals-background h-full flex flex-col">
                  <div className="flex items-center bg-bolt-elements-background-depth-2 border-y border-bolt-elements-borderColor gap-1.5 min-h-[34px] p-2">
                    {Array.from({ length: terminalCount }, (_, index) => {
                      const isActive = activeTerminal === index;

                      const isClaude = claudeTerminals.has(index);
                      const isClaudeRunning = runningClaudeTerminals.has(index);

                      return (
                        <button
                          key={index}
                          className={classNames(
                            'flex items-center text-sm cursor-pointer gap-1.5 px-3 py-2 h-full whitespace-nowrap rounded-full',
                            {
                              'bg-bolt-elements-terminals-buttonBackground text-bolt-elements-textPrimary': isActive,
                              'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-terminals-buttonBackground':
                                !isActive,
                            },
                          )}
                          onClick={() => setActiveTerminal(index)}
                        >
                          {isClaude ? (
                            <div className="relative">
                              <svg
                                height="18"
                                width="18"
                                viewBox="0 0 24 24"
                                xmlns="http://www.w3.org/2000/svg"
                                className={classNames('flex-shrink-0', {
                                  'animate-pulse': isClaudeRunning,
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
                          {terminalCount > 1 && index + 1}
                        </button>
                      );
                    })}
                    {terminalCount < MAX_TERMINALS && <IconButton icon="i-ph:plus" size="md" onClick={addTerminal} />}
                    {terminalCount < MAX_TERMINALS && (
                      <IconButton size="md" onClick={addClaudeTerminal} title="Open Claude Code Terminal">
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
                      icon="i-ph:caret-down"
                      title="Close"
                      size="md"
                      onClick={() => workbenchStore.toggleTerminal(false)}
                    />
                  </div>
                  {Array.from({ length: terminalCount }, (_, index) => {
                    const isActive = activeTerminal === index;

                    return (
                      <Terminal
                        key={index}
                        className={classNames('h-full overflow-hidden', {
                          hidden: !isActive,
                        })}
                        ref={(ref) => {
                          terminalRefs.current[index] = ref;
                        }}
                        initialCommand={terminalCommands[index]}
                        onTerminalReady={(terminal) => workbenchStore.attachTerminal(terminal, terminalCommands[index])}
                        onTerminalResize={(cols, rows) => workbenchStore.onTerminalResize(cols, rows)}
                        theme={theme}
                      />
                    );
                  })}
                </div>
              </div>
            </Panel>
          </>
        )}
      </PanelGroup>
    );
  },
);
