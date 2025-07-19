import type { WebContainer, WebContainerProcess } from '@webcontainer/api';
import { atom, map, type WritableAtom, type MapStore } from 'nanostores';
import type { ITerminal } from '~/types/terminal';
import { newShellProcess } from '~/utils/shell';
import { coloredText } from '~/utils/terminal';

export interface TerminalInfo {
  id: string;
  terminal?: ITerminal;
  process?: WebContainerProcess;
  command?: string;
  isClaude?: boolean;
  isRunning?: boolean;
}

export class TerminalStore {
  #webcontainer: Promise<WebContainer>;
  #terminals: Array<{ terminal: ITerminal; process: WebContainerProcess }> = [];
  #terminalIdCounter = 0;

  showTerminal: WritableAtom<boolean> = import.meta.hot?.data.showTerminal ?? atom(true);
  terminalInfo: MapStore<Record<string, TerminalInfo>> = import.meta.hot?.data.terminalInfo ?? map({});
  activeTerminalId: WritableAtom<string> = import.meta.hot?.data.activeTerminalId ?? atom('terminal-0');

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;

    if (import.meta.hot) {
      import.meta.hot.data.showTerminal = this.showTerminal;
      import.meta.hot.data.terminalInfo = this.terminalInfo;
      import.meta.hot.data.activeTerminalId = this.activeTerminalId;
    }

    // Initialize with one default Claude terminal
    if (Object.keys(this.terminalInfo.get()).length === 0) {
      this.createTerminal(true);
    }
  }

  toggleTerminal(value?: boolean) {
    this.showTerminal.set(value !== undefined ? value : !this.showTerminal.get());
  }

  createTerminal(isClaude = false, command?: string): string {
    const id = `terminal-${this.#terminalIdCounter++}`;
    const terminalInfo: TerminalInfo = {
      id,
      isClaude,
      command: command || (isClaude ? 'npx -y @anthropic-ai/claude-code@1.0.56' : undefined),
      isRunning: isClaude,
    };

    this.terminalInfo.setKey(id, terminalInfo);

    if (isClaude) {
      // Mark Claude terminals as no longer running after 5 seconds
      setTimeout(() => {
        const info = this.terminalInfo.get()[id];

        if (info) {
          this.terminalInfo.setKey(id, { ...info, isRunning: false });
        }
      }, 5000);
    }

    return id;
  }

  async attachTerminal(terminalId: string, terminal: ITerminal) {
    const info = this.terminalInfo.get()[terminalId];

    if (!info) {
      console.error(`Terminal ${terminalId} not found`);
      return;
    }

    try {
      const shellProcess = await newShellProcess(await this.#webcontainer, terminal, info.command);
      this.#terminals.push({ terminal, process: shellProcess });

      // Update terminal info with the actual terminal instance
      this.terminalInfo.setKey(terminalId, {
        ...info,
        terminal,
        process: shellProcess,
      });
    } catch (error: any) {
      terminal.write(coloredText.red('Failed to spawn shell\n\n') + error.message);
      return;
    }
  }

  setActiveTerminal(terminalId: string) {
    this.activeTerminalId.set(terminalId);
  }

  getTerminalCount(): number {
    return Object.keys(this.terminalInfo.get()).length;
  }

  onTerminalResize(cols: number, rows: number) {
    for (const { process } of this.#terminals) {
      process.resize({ cols, rows });
    }
  }
}
