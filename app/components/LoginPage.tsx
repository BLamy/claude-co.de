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

const ClaudeLogo = () => (
  <svg
    height="3rem"
    width="3rem"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    className="flex-shrink-0"
  >
    <title>Claude</title>
    <path
      d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"
      fill="#D97757"
    />
  </svg>
);

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
  const [loginCompletedData, setLoginCompletedData] = useState<{ userEmail: string | null; claudeConfig?: any } | null>(
    null,
  );
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const processRef = useRef<WebContainerProcess | null>(null);
  const isProcessConnectedRef = useRef(false);

  // Initialize terminal immediately (even when hidden)
  useEffect(() => {
    if (terminalRef.current && !xtermRef.current) {
      // Dynamic import to avoid SSR issues
      Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit'), import('@xterm/xterm/css/xterm.css')])
        .then(([{ Terminal }, { FitAddon }]) => {
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
        })
        .catch((err) => {
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

  /*
   * This effect is no longer needed since we connect the process in extractClaudeLoginUrl
   * Keeping it empty for now in case we need to add other terminal-related logic
   */

  // Watch for WebContainer and terminal to be ready, then extract Claude login URL
  useEffect(() => {
    if (isWebContainerReady && isTerminalReady && !claudeLoginUrl && !isExtractingUrl) {
      extractClaudeLoginUrl();
    }
  }, [isWebContainerReady, isTerminalReady, claudeLoginUrl, isExtractingUrl]);

  // Handle login completion - send Enter keypresses and complete auth flow
  useEffect(() => {
    if (loginCompletedData && processRef.current && xtermRef.current) {
      const sendEntersAndComplete = async () => {
        console.log('[Auto] Login completed, sending Enter keypresses...');

        // Wait a moment for the process to be ready
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Send multiple Enter keypresses to complete the Claude Code flow
        for (let i = 0; i < 5; i++) {
          if (processRef.current) {
            const writer = processRef.current.input.getWriter();

            try {
              await writer.write('\r');
              console.log(`[Auto] Sent Enter ${i + 1}/5`);

              // Also show in terminal
              if (xtermRef.current) {
                xtermRef.current.write('\r\n');
              }
            } finally {
              writer.releaseLock();
            }

            // Wait between enters
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }

        console.log('[Auto] Finished sending Enter keypresses, waiting for file...');

        // Wait for the .claude.json file to be written
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Send Ctrl+C to exit Claude Code
        console.log('[Auto] Sending Ctrl+C to exit Claude Code...');

        if (processRef.current) {
          const writer = processRef.current.input.getWriter();

          try {
            // Send Ctrl+C (ASCII code 3)
            await writer.write('\x03');
            console.log('[Auto] Ctrl+C sent');

            // Show in terminal
            if (xtermRef.current) {
              xtermRef.current.write('^C\r\n');
            }
          } finally {
            writer.releaseLock();
          }
        }

        // Wait for process to exit
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Now run cat to verify the file exists
        console.log('[Auto] Running cat ~/.claude.json to verify file...');

        const instance = await webcontainer;

        if (instance) {
          try {
            const catProcess = await instance.spawn('cat', ['/home/.claude.json']);

            // Show cat command in terminal
            if (xtermRef.current) {
              xtermRef.current.writeln('\r\n$ cat ~/.claude.json');
            }

            // Capture and display the output
            let jsonOutput = '';
            catProcess.output.pipeTo(
              new WritableStream({
                write(data) {
                  console.log('[Auto] cat output:', data);
                  jsonOutput += data;

                  if (xtermRef.current) {
                    xtermRef.current.write(data);
                  }
                },
              }),
            );

            const catExitCode = await catProcess.exit;
            console.log('[Auto] cat command exited with code:', catExitCode);

            if (catExitCode === 0) {
              console.log('[Auto] .claude.json file verified successfully');
              console.log('[Auto] JSON output length:', jsonOutput.length);

              // Wrap everything in try-catch to see any errors
              try {
                // Parse the JSON output
                const claudeConfig = JSON.parse(jsonOutput);
                console.log('[Auto] Parsed claude.json successfully');
                console.log('[Auto] User email from config:', claudeConfig.oauthAccount?.emailAddress);
                console.log('[Auto] Primary API key exists:', !!claudeConfig.primaryApiKey);

                // Wait a bit before completing authentication
                console.log('[Auto] Waiting before authentication...');
                await new Promise((resolve) => setTimeout(resolve, 1000));

                // Complete the authentication flow directly here with the parsed config
                console.log('[Auto] About to call completeAuthenticationFlow...');
                console.log(
                  '[Auto] Email param:',
                  claudeConfig.oauthAccount?.emailAddress || loginCompletedData.userEmail,
                );
                console.log('[Auto] Config param exists:', !!claudeConfig);

                await completeAuthenticationFlow(
                  claudeConfig.oauthAccount?.emailAddress || loginCompletedData.userEmail,
                  claudeConfig,
                );

                console.log('[Auto] completeAuthenticationFlow returned successfully');
              } catch (err) {
                console.error('[Auto] Error in authentication flow:', err);
                console.error('[Auto] Error stack:', (err as Error).stack);
                console.error('[Auto] JSON output was:', jsonOutput.substring(0, 200) + '...');

                // Set error for user
                setError('Authentication failed: ' + (err as Error).message);
              }
            } else {
              console.error('[Auto] Failed to read .claude.json file');

              // Still try to complete authentication without the cat output
              await new Promise((resolve) => setTimeout(resolve, 1000));
              await completeAuthenticationFlow(loginCompletedData.userEmail, null);
            }
          } catch (err) {
            console.error('[Auto] Error running cat command:', err);
          }
        }

        // Authentication flow is now handled inside the cat output parsing
      };

      sendEntersAndComplete();
    }
  }, [loginCompletedData]);

  const completeAuthenticationFlow = async (userEmail: string | null, claudeConfig?: any) => {
    try {
      console.log('[Auth] Completing authentication flow...');
      console.log('[Auth] UserEmail:', userEmail);
      console.log('[Auth] Has claudeConfig:', !!claudeConfig);
      console.log('[Auth] onAuthenticate function exists:', typeof onAuthenticate);

      // Check if onAuthenticate exists
      if (!onAuthenticate) {
        throw new Error('onAuthenticate function not provided to LoginPage');
      }

      // If we already have the config from cat, use it
      if (claudeConfig) {
        console.log('[Auth] Using Claude config from cat output');
        console.log('[Auth] Email:', claudeConfig.oauthAccount?.emailAddress);
        console.log('[Auth] Config keys:', Object.keys(claudeConfig));

        /*
         * Call the onAuthenticate function with the claude config as the auth code
         * The AuthContext will handle WebAuthn setup
         */
        console.log('[Auth] Calling onAuthenticate with claude config...');
        console.log('[Auth] Config string length:', JSON.stringify(claudeConfig).length);

        try {
          await onAuthenticate({
            type: 'claude',
            value: JSON.stringify(claudeConfig), // Pass the entire config as the "auth code"
          });
          console.log('[Auth] onAuthenticate completed successfully');
        } catch (authErr) {
          console.error('[Auth] onAuthenticate failed:', authErr);
          console.error('[Auth] onAuthenticate error stack:', (authErr as Error).stack);
          throw authErr;
        }
      } else {
        // Fallback: read from file if we don't have the config
        console.log('[Auth] Fallback: Reading ~/.claude.json file...');

        const instance = await webcontainer;

        if (!instance) {
          throw new Error('WebContainer not ready');
        }

        const claudeConfigContent = await instance.fs.readFile('/home/.claude.json', 'utf-8');
        const config = JSON.parse(claudeConfigContent);

        console.log('[Auth] Claude config loaded from file');

        await onAuthenticate({
          type: 'claude',
          value: JSON.stringify(config),
        });
      }
    } catch (err) {
      console.error('[Auth] Failed to complete authentication flow:', err);
      throw err;
    }
  };

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
      const process = await instance.spawn('npx', ['-y', '@anthropic-ai/claude-code@1.0.3']);
      processRef.current = process;

      // Connect process to terminal immediately
      if (xtermRef.current && !isProcessConnectedRef.current) {
        const terminal = xtermRef.current;
        isProcessConnectedRef.current = true;

        // Track state for automation
        let themeSelected = false;
        let loginTypeSelected = false;
        let outputBuffer = '';
        let waitingForAuthCode = false;
        let loginCompleted = false;

        // Connect process output to terminal
        process.output
          .pipeTo(
            new WritableStream({
              write(data) {
                terminal.write(data);
                outputBuffer += data;

                // Debug output
                if (data.trim()) {
                  console.log('[Auto] Output:', data.substring(0, 100), data.length > 100 ? '...' : '');
                }

                // Auto-select theme (option 1)
                if (
                  !themeSelected &&
                  (data.includes('Choose the text style') ||
                    (data.includes('Dark mode') && data.includes('Light mode')) ||
                    (data.includes('1.') && data.includes('Dark mode')) ||
                    data.includes('❯'))
                ) {
                  themeSelected = true;
                  console.log('[Auto] Theme menu detected, selecting option 1...');
                  setTimeout(() => {
                    const writer = process.input.getWriter();
                    writer
                      .write('1')
                      .then(() => {
                        writer.releaseLock();
                        console.log('[Auto] Sent: 1');

                        setTimeout(() => {
                          const writer2 = process.input.getWriter();
                          writer2.write('\r\n').then(() => {
                            writer2.releaseLock();
                            console.log('[Auto] Sent: Enter');
                          });
                        }, 100);
                      })
                      .catch((err) => {
                        console.error('[Auto] Failed to send theme selection:', err);
                      });
                  }, 1500);
                }

                // Auto-select login type (option 2)
                if (
                  !loginTypeSelected &&
                  themeSelected &&
                  (data.includes('How would you like to log in') ||
                    (outputBuffer.includes('theme') && data.includes('1.') && data.includes('2.')) ||
                    data.includes('Choose an option') ||
                    (data.includes('❯') && outputBuffer.includes('Dark mode')))
                ) {
                  loginTypeSelected = true;
                  console.log('[Auto] Login menu detected, selecting option 2...');
                  setTimeout(() => {
                    const writer = process.input.getWriter();
                    writer.write('2').then(() => {
                      writer.releaseLock();
                      console.log('[Auto] Sent: 2');

                      setTimeout(() => {
                        const writer2 = process.input.getWriter();
                        writer2.write('\r\n').then(() => {
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

                // Check if process is now waiting for auth code
                if (
                  data.includes('Paste code here') ||
                  data.includes('Enter code') ||
                  data.includes('authorization code')
                ) {
                  waitingForAuthCode = true;
                  console.log('[Auto] Process is now waiting for authorization code');
                }

                // Check if login is completed
                if (!loginCompleted && data.includes('Logged in as ')) {
                  loginCompleted = true;
                  console.log('[Auto] Login completed detected!');

                  // Extract email from the "Logged in as" message
                  const emailMatch = data.match(/Logged in as ([^\s\r\n]+)/);
                  const userEmail = emailMatch ? emailMatch[1] : null;
                  console.log('[Auto] User email detected:', userEmail);

                  // Set state to trigger Enter keypresses in the main component
                  setLoginCompletedData({ userEmail });
                }
              },
            }),
          )
          .catch((err) => {
            console.error('Error piping output:', err);
          });

        // Connect terminal input to process
        terminal.onData((data) => {
          const writer = process.input.getWriter();
          writer
            .write(data)
            .then(() => {
              writer.releaseLock();
            })
            .catch((err) => {
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
            xtermRef.current.writeln(
              '\r\n\x1b[31mTimeout waiting for login URL. Please complete the setup in the terminal.\x1b[0m',
            );
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
      // Send the auth code to the existing Claude Code process
      if (processRef.current && xtermRef.current) {
        // Show the terminal so user can see what's happening
        setShowTerminal(true);

        console.log('[Auth] Sending authorization code to existing process...');
        console.log('[Auth] Auth code (length:', authCode.length, '):', authCode);
        console.log('[Auth] Process ref exists:', !!processRef.current);
        console.log('[Auth] Terminal ref exists:', !!xtermRef.current);

        // Check if the process is still alive first
        const processExitPromise = processRef.current.exit;
        const processFinished = await Promise.race([
          processExitPromise,
          new Promise((resolve) => setTimeout(() => resolve('still-running'), 100)),
        ]);

        if (processFinished !== 'still-running') {
          throw new Error(`Process already exited with code: ${processFinished}`);
        }

        console.log('[Auth] Process is still running, sending auth code...');

        console.log('[Auth] Manually triggering the terminal input handler...');

        /*
         * Directly call the terminal's onData handler with our auth code + enter
         * This is the same handler that processes manual keyboard input
         * Look at the terminal connection code around line 230 to see this handler
         */

        // Send the auth code
        console.log('[Auth] Triggering auth code input...');

        // Clean the auth code to remove any special characters or formatting
        const cleanAuthCode = authCode.trim().replace(/[\x00-\x1F\x7F-\x9F]/g, '');
        console.log('[Auth] Cleaned auth code (length:', cleanAuthCode.length, ')');

        // Send the entire auth code at once instead of character by character
        const writer = processRef.current.input.getWriter();

        try {
          // Write the entire auth code
          await writer.write(cleanAuthCode);
          console.log('[Auth] Auth code written to process');

          // Display in terminal
          xtermRef.current.write(cleanAuthCode);

          // Small delay before sending Enter
          await new Promise((resolve) => setTimeout(resolve, 100));

          console.log('[Auth] Sending Enter...');

          // Send Enter
          await writer.write('\r');

          // Display Enter in terminal
          xtermRef.current.write('\r\n');

          console.log('[Auth] Enter sent');
        } finally {
          writer.releaseLock();
        }

        // Wait for the process to complete authentication
        console.log('[Auth] Waiting for authentication to complete...');

        const exitCode = await processRef.current.exit;

        if (exitCode === 0) {
          // Authentication successful, now call onAuthenticate to complete the flow
          await onAuthenticate({ type: 'claude', value: authCode });
        } else {
          throw new Error(`Authentication failed with exit code ${exitCode}`);
        }
      } else {
        throw new Error('No active Claude Code process found');
      }
    } catch (err) {
      console.error('Auth code submission failed:', err);
      setError('Failed to authenticate with authorization code');
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-bolt-elements-background-depth-1 via-bolt-elements-background-depth-1 to-bolt-elements-background-depth-2">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-3xl p-8 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-2xl shadow-xl"
      >
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <ClaudeLogo />
            <h1 className="text-3xl font-bold text-bolt-elements-textPrimary">claude-co.de</h1>
          </div>
          <p className="text-sm text-bolt-elements-textSecondary">
            Please wait (~30s) while we download claude code and grab a login url
          </p>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800"
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
                className="w-full px-6 py-4 bg-gradient-to-r from-[#D97757] to-[#c5684a] hover:from-[#c5684a] hover:to-[#b85f43] disabled:from-bolt-elements-borderColor disabled:to-bolt-elements-borderColor text-white rounded-lg font-medium transition-all transform hover:scale-[1.02] disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg"
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

              {/* <button
                onClick={() => setAuthMethod('apiKey')}
                disabled={isLoading}
                className="w-full px-6 py-4 bg-bolt-elements-background-depth-1 border-2 border-bolt-elements-borderColor hover:border-[#D97757] text-bolt-elements-textPrimary hover:text-[#D97757] rounded-lg font-medium transition-all transform hover:scale-[1.02] disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-3"
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
              </button> */}

              {isExtractingUrl && (
                <button
                  type="button"
                  onClick={() => setShowTerminal(!showTerminal)}
                  className="w-full py-2 px-4 text-sm bg-bolt-elements-background-depth-1 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary border border-bolt-elements-borderColor rounded-lg transition-all flex items-center justify-center gap-2"
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
                <label htmlFor="apiKey" className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                  Anthropic API Key
                </label>
                <input
                  type="password"
                  id="apiKey"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full px-4 py-3 border border-bolt-elements-borderColor rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D97757] focus:border-[#D97757] bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary placeholder-bolt-elements-textSecondary"
                  placeholder="sk-ant-..."
                  autoFocus
                />
                <p className="mt-2 text-xs text-bolt-elements-textSecondary">
                  Your API key will be encrypted and stored securely using biometric authentication
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setAuthMethod('none')}
                  className="flex-1 px-4 py-3 border border-bolt-elements-borderColor rounded-lg font-medium text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 px-4 py-3 bg-[#D97757] hover:bg-[#c5684a] disabled:bg-bolt-elements-borderColor text-white rounded-lg font-medium transition-colors"
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
                <label htmlFor="authCode" className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                  Authorization Code
                </label>
                <input
                  type="text"
                  id="authCode"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  className="w-full px-4 py-3 border border-bolt-elements-borderColor rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D97757] focus:border-[#D97757] bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary font-mono placeholder-bolt-elements-textSecondary"
                  placeholder="Enter the code from Anthropic"
                  autoFocus
                />
                <p className="mt-2 text-xs text-bolt-elements-textSecondary">
                  Paste the authorization code you received after logging in with Anthropic
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setAuthMethod('none')}
                  className="flex-1 px-4 py-3 border border-bolt-elements-borderColor rounded-lg font-medium text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 px-4 py-3 bg-[#D97757] hover:bg-[#c5684a] disabled:bg-bolt-elements-borderColor text-white rounded-lg font-medium transition-colors"
                >
                  {isLoading ? 'Authenticating...' : 'Complete Login'}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* xterm.js Terminal - Always rendered but hidden by default */}
        <motion.div initial={false} animate={{ height: showTerminal ? 'auto' : 0 }} className="mt-6 overflow-hidden">
          <div className="bg-gray-900 dark:bg-gray-950 rounded-lg overflow-hidden border border-bolt-elements-borderColor">
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
                position: showTerminal ? 'relative' : 'absolute',
              }}
            />
          </div>
        </motion.div>

        <div className="mt-8 pt-6 border-t border-bolt-elements-borderColor">
          <p className="text-xs text-center text-bolt-elements-textSecondary">
            Your credentials are encrypted with biometric authentication for secure access
          </p>
        </div>
      </motion.div>
    </div>
  );
};
