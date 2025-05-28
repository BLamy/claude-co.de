import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { webcontainer } from '~/lib/webcontainer';
import type { WebContainerProcess } from '@webcontainer/api';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';

interface LoginPageProps {
  onAuthenticate: (credentials: { type: 'apiKey' | 'claude'; value: string }) => Promise<void>;
  isWebContainerReady?: boolean;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onAuthenticate, isWebContainerReady = false }) => {
  const [authMethod, setAuthMethod] = useState<'none' | 'apiKey' | 'claude'>('none');
  const [apiKey, setApiKey] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [claudeLoginUrl, setClaudeLoginUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExtractingUrl, setIsExtractingUrl] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [isTerminalReady, setIsTerminalReady] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const processRef = useRef<WebContainerProcess | null>(null);
  const isProcessConnectedRef = useRef(false);

  // Initialize terminal immediately (even when hidden)
  useEffect(() => {
    if (terminalRef.current && !xtermRef.current) {
      // Dynamic import to avoid SSR issues
      Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/xterm/css/xterm.css'),
      ]).then(([{ Terminal }, { FitAddon }]) => {
        const terminal = new Terminal({
          cursorBlink: true,
          fontSize: 13,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          theme: {
            background: '#0a0a0a',
            foreground: '#d4d4d4',
            cursor: '#d4d4d4',
            black: '#0a0a0a',
            red: '#ff5555',
            green: '#50fa7b',
            yellow: '#f1fa8c',
            blue: '#bd93f9',
            magenta: '#ff79c6',
            cyan: '#8be9fd',
            white: '#bfbfbf',
            brightBlack: '#4d4d4d',
            brightRed: '#ff6e6e',
            brightGreen: '#69ff94',
            brightYellow: '#ffffa5',
            brightBlue: '#d6acff',
            brightMagenta: '#ff92df',
            brightCyan: '#a4ffff',
            brightWhite: '#ffffff',
          },
        });

        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        
        terminal.open(terminalRef.current!);
        fitAddon.fit();
        
        xtermRef.current = terminal;
        fitAddonRef.current = fitAddon;
        setIsTerminalReady(true);

        // Handle window resize
        const handleResize = () => {
          if (showTerminal && fitAddon) {
            fitAddon.fit();
          }
        };
        window.addEventListener('resize', handleResize);

        return () => {
          window.removeEventListener('resize', handleResize);
        };
      }).catch(err => {
        console.error('Failed to load terminal:', err);
      });
    }
  }, []); // Remove showTerminal dependency

  // Fit terminal when it becomes visible
  useEffect(() => {
    if (showTerminal && fitAddonRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
      }, 100);
    }
  }, [showTerminal]);

  // This effect is no longer needed since we connect the process in extractClaudeLoginUrl
  // Keeping it empty for now in case we need to add other terminal-related logic

  // Watch for WebContainer and terminal to be ready, then extract Claude login URL
  useEffect(() => {
    if (isWebContainerReady && isTerminalReady && !claudeLoginUrl && !isExtractingUrl) {
      extractClaudeLoginUrl();
    }
  }, [isWebContainerReady, isTerminalReady, claudeLoginUrl, isExtractingUrl]);

  const extractClaudeLoginUrl = async () => {
    setIsExtractingUrl(true);
    // Don't auto-show terminal since it's automated
    
    try {
      const instance = await webcontainer;
      
      if (!instance) {
        console.error('WebContainer not available');
        return;
      }

      // Clear terminal if it exists
      if (xtermRef.current) {
        xtermRef.current.clear();
        xtermRef.current.writeln('Starting Claude Code...\r\n');
      }

      // Run claude-code command
      const process = await instance.spawn('npx', ['-y', '@anthropic-ai/claude-code']);
      processRef.current = process;

      // Connect process to terminal immediately
      if (xtermRef.current && !isProcessConnectedRef.current) {
        const terminal = xtermRef.current;
        isProcessConnectedRef.current = true;

        // Track state for automation
        let themeSelected = false;
        let loginTypeSelected = false;
        let outputBuffer = '';

        // Connect process output to terminal
        process.output.pipeTo(
          new WritableStream({
            write(data) {
              terminal.write(data);
              outputBuffer += data;
              
              // Debug output
              if (data.trim()) {
                console.log('[Auto] Output:', data.substring(0, 100), data.length > 100 ? '...' : '');
              }

              // Auto-select theme (option 1)
              if (!themeSelected && (
                data.includes('Choose the text style') ||
                data.includes('Dark mode') && data.includes('Light mode') ||
                (data.includes('1.') && data.includes('Dark mode')) ||
                data.includes('❯')
              )) {
                themeSelected = true;
                console.log('[Auto] Theme menu detected, selecting option 1...');
                setTimeout(() => {
                  const writer = process.input.getWriter();
                  writer.write('1').then(() => {
                    writer.releaseLock();
                    console.log('[Auto] Sent: 1');
                    
                    setTimeout(() => {
                      const writer2 = process.input.getWriter();
                      writer2.write('\r').then(() => {
                        writer2.releaseLock();
                        console.log('[Auto] Sent: Enter');
                      });
                    }, 100);
                  }).catch(err => {
                    console.error('[Auto] Failed to send theme selection:', err);
                  });
                }, 1500);
              }

              // Auto-select login type (option 2)
              if (!loginTypeSelected && themeSelected && (
                data.includes('How would you like to log in') ||
                (outputBuffer.includes('theme') && data.includes('1.') && data.includes('2.')) ||
                data.includes('Choose an option') ||
                (data.includes('❯') && outputBuffer.includes('Dark mode'))
              )) {
                loginTypeSelected = true;
                console.log('[Auto] Login menu detected, selecting option 2...');
                setTimeout(() => {
                  const writer = process.input.getWriter();
                  writer.write('2').then(() => {
                    writer.releaseLock();
                    console.log('[Auto] Sent: 2');
                    
                    setTimeout(() => {
                      const writer2 = process.input.getWriter();
                      writer2.write('\r').then(() => {
                        writer2.releaseLock();
                        console.log('[Auto] Sent: Enter');
                      });
                    }, 100);
                  });
                }, 1000);
              }

              // Check for login URL in output
              const urlMatch = data.match(/https:\/\/[^\s]+/);
              if (urlMatch && urlMatch[0].includes('anthropic')) {
                const cleanUrl = urlMatch[0].replace(/[\x00-\x1F\x7F-\x9F]/g, '');
                setClaudeLoginUrl(cleanUrl);
                console.log('[Auto] Found login URL:', cleanUrl);
              }
            },
          })
        ).catch(err => {
          console.error('Error piping output:', err);
        });

        // Connect terminal input to process
        terminal.onData((data) => {
          const writer = process.input.getWriter();
          writer.write(data).then(() => {
            writer.releaseLock();
          }).catch(err => {
            console.error('Error writing input:', err);
          });
        });
      }

      // Monitor process exit
      process.exit.then((exitCode) => {
        if (exitCode !== 0 && !claudeLoginUrl) {
          console.error(`Process exited with code ${exitCode}`);
        }
        processRef.current = null;
        isProcessConnectedRef.current = false;
      });

      // Give it some time to output the URL
      setTimeout(() => {
        if (!claudeLoginUrl) {
          setIsExtractingUrl(false);
          if (xtermRef.current) {
            xtermRef.current.writeln('\r\n\x1b[31mTimeout waiting for login URL. Please complete the setup in the terminal.\x1b[0m');
          }
        }
      }, 120000); // 2 minutes timeout
    } catch (err) {
      console.error('Failed to extract Claude login URL:', err);
      setIsExtractingUrl(false);
    }
  };

  const handleApiKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!apiKey.trim()) {
      setError('Please enter your API key');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      await onAuthenticate({ type: 'apiKey', value: apiKey });
    } catch (err) {
      setError('Failed to authenticate with API key');
      setIsLoading(false);
    }
  };

  const handleClaudeLogin = () => {
    if (claudeLoginUrl) {
      window.open(claudeLoginUrl, '_blank');
      setAuthMethod('claude');
    }
  };

  const handleAuthCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!authCode.trim()) {
      setError('Please enter your authorization code');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      await onAuthenticate({ type: 'claude', value: authCode });
    } catch (err) {
      setError('Failed to authenticate with authorization code');
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-3xl p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-xl"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Welcome to Bolt</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">Choose your authentication method</p>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg"
          >
            {error}
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {authMethod === 'none' && (
            <motion.div
              key="buttons"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <button
                onClick={handleClaudeLogin}
                disabled={!claudeLoginUrl || isLoading}
                className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-lg font-medium transition-all transform hover:scale-[1.02] disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              >
                {!isWebContainerReady ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Preparing environment...</span>
                  </>
                ) : !claudeLoginUrl ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Loading Claude Code...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    <span>
                      Login with Anthropic <span className="text-sm opacity-80">(Max)</span>
                    </span>
                  </>
                )}
              </button>

              <button
                onClick={() => setAuthMethod('apiKey')}
                disabled={isLoading}
                className="w-full px-6 py-4 bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 text-gray-900 dark:text-white rounded-lg font-medium transition-all transform hover:scale-[1.02] disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  />
                </svg>
                <span>Add API Key</span>
              </button>

              {isExtractingUrl && (
                <button
                  type="button"
                  onClick={() => setShowTerminal(!showTerminal)}
                  className="w-full text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors flex items-center justify-center gap-2"
                >
                  <svg
                    className={`w-4 h-4 transition-transform ${showTerminal ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  {showTerminal ? 'Hide' : 'Show'} terminal
                </button>
              )}
            </motion.div>
          )}

          {authMethod === 'apiKey' && (
            <motion.form
              key="apiKey"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onSubmit={handleApiKeySubmit}
              className="space-y-4"
            >
              <div>
                <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Anthropic API Key
                </label>
                <input
                  type="password"
                  id="apiKey"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="sk-ant-..."
                  autoFocus
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Your API key will be encrypted and stored securely using biometric authentication
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setAuthMethod('none')}
                  className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors"
                >
                  {isLoading ? 'Authenticating...' : 'Continue'}
                </button>
              </div>
            </motion.form>
          )}

          {authMethod === 'claude' && (
            <motion.form
              key="claude"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onSubmit={handleAuthCodeSubmit}
              className="space-y-4"
            >
              <div>
                <label htmlFor="authCode" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Authorization Code
                </label>
                <input
                  type="text"
                  id="authCode"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white font-mono"
                  placeholder="Enter the code from Anthropic"
                  autoFocus
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Paste the authorization code you received after logging in with Anthropic
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setAuthMethod('none')}
                  className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors"
                >
                  {isLoading ? 'Authenticating...' : 'Complete Login'}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* xterm.js Terminal - Always rendered but hidden by default */}
        <motion.div
          initial={false}
          animate={{ height: showTerminal ? 'auto' : 0 }}
          className="mt-6 overflow-hidden"
        >
          <div className="bg-gray-900 dark:bg-gray-950 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-800 dark:bg-gray-900 border-b border-gray-700">
              <span className="text-xs text-gray-400 font-mono">Claude Code Terminal</span>
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
              </div>
            </div>
            
            <div 
              ref={terminalRef} 
              className="h-96 xterm-screen"
              style={{ 
                padding: '8px', 
                height: showTerminal ? '384px' : '1px',
                visibility: showTerminal ? 'visible' : 'hidden',
                position: showTerminal ? 'relative' : 'absolute'
              }}
            />
          </div>
        </motion.div>

        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-center text-gray-500 dark:text-gray-400">
            Your credentials are encrypted with biometric authentication for secure access
          </p>
        </div>
      </motion.div>
    </div>
  );
};