'use client';

import * as React from 'react';
import { useState, useCallback, useEffect } from 'react';
import { SearchIcon, Settings, User, Github, Server, Paintbrush } from 'lucide-react';
import { Button } from '~/components/ui/button';
import * as RadixDialog from '@radix-ui/react-dialog';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '~/components/ui/sidebar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '~/components/ui/breadcrumb';
import { cn } from '~/lib/utils';
import { useStore } from '@nanostores/react';
import { themeStore, toggleTheme } from '~/lib/stores/theme';
import { proxySettingsStore, setCorsAuthToken, setCorsProxyAddress, setCorsProxyDomains } from '~/lib/stores/settings';
import type { WorkbenchViewType } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { motion } from 'framer-motion';
import { cubicEasingFn } from '~/utils/easings';
import { webcontainer } from '~/lib/webcontainer';

const settingsNavData = [
  { name: 'Anthropic Account', icon: User },
  { name: 'GitHub', icon: Github },
  { name: 'MCP Servers', icon: Server },
  { name: 'Appearance', icon: Paintbrush },
  { name: 'Proxy Server', icon: Settings },
];

interface TopBarProps {
  className?: string;
  selectedView?: WorkbenchViewType;
  onViewChange?: (view: WorkbenchViewType) => void;
  hasPreview?: boolean;
  isWide?: boolean;
}

export function TopBar({ className, selectedView, onViewChange, hasPreview: _hasPreview, isWide }: TopBarProps) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState('Anthropic Account');
  
  const theme = useStore(themeStore);
  const proxySettings = useStore(proxySettingsStore);
  const [tempCorsToken, setTempCorsToken] = useState(proxySettings.corsAuthToken);
  const [tempCorsAddress, setTempCorsAddress] = useState(proxySettings.corsProxy.address);
  const [tempCorsDomains, setTempCorsDomains] = useState(proxySettings.corsProxy.domains.join('\n'));
  
  // Anthropic account state
  const [claudeConfig, setClaudeConfig] = useState<any>(null);
  const [isLoadingClaudeConfig, setIsLoadingClaudeConfig] = useState(false);
  const [claudeConfigError, setClaudeConfigError] = useState<string | null>(null);

  // command palette keyboard shortcut
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);

    return () => document.removeEventListener('keydown', down);
  }, []);

  React.useEffect(() => {
    setTempCorsToken(proxySettings.corsAuthToken);
    setTempCorsAddress(proxySettings.corsProxy.address);
    setTempCorsDomains(proxySettings.corsProxy.domains.join('\n'));
  }, [proxySettings]);

  const handleFileOpen = useCallback((fileName: string) => {
    // TODO: Implement file opening logic
    console.log('Opening file:', fileName);
    setCommandOpen(false);
  }, []);

  const handleCommand = useCallback((command: string) => {
    // TODO: Implement command execution logic
    console.log('Executing command:', command);
    setCommandOpen(false);
  }, []);

  const saveProxySettings = () => {
    setCorsAuthToken(tempCorsToken);
    setCorsProxyAddress(tempCorsAddress);
    setCorsProxyDomains(tempCorsDomains.split('\n').filter((d) => d.trim()));
  };

  const loadClaudeConfig = useCallback(async () => {
    setIsLoadingClaudeConfig(true);
    setClaudeConfigError(null);
    
    try {
      const instance = await webcontainer;
      
      if (!instance) {
        throw new Error('WebContainer not available');
      }

      const catProcess = await instance.spawn('cat', ['/home/.claude.json']);
      
      let jsonOutput = '';
      catProcess.output.pipeTo(
        new WritableStream({
          write(data) {
            jsonOutput += data;
          },
        }),
      );

      const catExitCode = await catProcess.exit;
      
      if (catExitCode === 0) {
        const config = JSON.parse(jsonOutput);
        setClaudeConfig(config);
      } else {
        throw new Error('Failed to read .claude.json file');
      }
    } catch (err) {
      console.error('Failed to load Claude config:', err);
      setClaudeConfigError(err instanceof Error ? err.message : 'Failed to load configuration');
    } finally {
      setIsLoadingClaudeConfig(false);
    }
  }, []);

  // Load Claude config when settings dialog opens and Anthropic Account tab is active
  useEffect(() => {
    if (settingsOpen && activeSettingsTab === 'Anthropic Account' && !claudeConfig && !isLoadingClaudeConfig) {
      loadClaudeConfig();
    }
  }, [settingsOpen, activeSettingsTab, claudeConfig, isLoadingClaudeConfig, loadClaudeConfig]);

  const renderSettingsContent = () => {
    switch (activeSettingsTab) {
      case 'Anthropic Account': {
        if (isLoadingClaudeConfig) {
          return (
            <div className="flex items-center justify-center h-32">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                <span className="text-bolt-elements-textSecondary">Loading account information...</span>
              </div>
            </div>
          );
        }

        if (claudeConfigError) {
          return (
            <div className="space-y-6">
              <div className="bg-bolt-elements-background-depth-1 border border-red-500/20 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center">
                    <User className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-bolt-elements-textPrimary">Account Error</h3>
                    <p className="text-sm text-red-500">Failed to load account information</p>
                  </div>
                </div>
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400">{claudeConfigError}</p>
                </div>
                <div className="mt-4">
                  <Button onClick={loadClaudeConfig} size="sm">
                    Retry
                  </Button>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="space-y-6">
            <div className="bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center">
                  <User className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-bolt-elements-textPrimary">Account Information</h3>
                  <p className="text-sm text-bolt-elements-textSecondary">Manage your Anthropic account</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 p-4 bg-bolt-elements-background-depth-2 rounded-lg">
                <div className="text-center">
                  <div className="text-lg font-semibold text-green-500">
                    {claudeConfig ? 'Connected' : 'Disconnected'}
                  </div>
                  <div className="text-xs text-bolt-elements-textSecondary">Status</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-bolt-elements-textPrimary">
                    {claudeConfig?.oauthAccount?.emailAddress || 'N/A'}
                  </div>
                  <div className="text-xs text-bolt-elements-textSecondary">Email</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-blue-500">
                    {claudeConfig?.primaryApiKey ? 'API Key Set' : 'No API Key'}
                  </div>
                  <div className="text-xs text-bolt-elements-textSecondary">Authentication</div>
                </div>
              </div>
            </div>
            <div className="bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-xl p-6">
              <h3 className="font-semibold text-bolt-elements-textPrimary mb-4">API Configuration</h3>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-bolt-elements-textPrimary">API Key</label>
                <div className="flex gap-3">
                  <input
                    type="password"
                    value={claudeConfig?.primaryApiKey ? '••••••••••••••••' : ''}
                    placeholder={claudeConfig?.primaryApiKey ? 'API key is set' : 'sk-ant-...'}
                    className="flex-1 px-4 py-3 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    readOnly
                  />
                  <Button size="sm" className="px-6" onClick={loadClaudeConfig}>
                    Refresh
                  </Button>
                </div>
                <p className="text-xs text-bolt-elements-textSecondary">
                  Your API key is encrypted and stored securely in ~/.claude.json
                </p>
              </div>
              {claudeConfig?.oauthAccount && (
                <div className="mt-4 p-3 bg-bolt-elements-background-depth-2 rounded-lg">
                  <h4 className="text-sm font-medium text-bolt-elements-textPrimary mb-2">OAuth Account</h4>
                  <div className="text-xs text-bolt-elements-textSecondary space-y-1">
                    <div>Email: {claudeConfig.oauthAccount.emailAddress}</div>
                    {claudeConfig.oauthAccount.name && <div>Name: {claudeConfig.oauthAccount.name}</div>}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      }
      case 'GitHub': {
        return (
          <div className="space-y-6">
            <div className="bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center">
                  <Github className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-bolt-elements-textPrimary">GitHub Integration</h3>
                  <p className="text-sm text-bolt-elements-textSecondary">Connect your GitHub account</p>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-bolt-elements-background-depth-2 rounded-lg">
                <div>
                  <div className="font-medium text-bolt-elements-textPrimary">Connection Status</div>
                  <div className="text-sm text-red-500">Not connected</div>
                </div>
                <Button className="bg-gray-900 hover:bg-gray-800 text-white">
                  <Github className="h-4 w-4 mr-2" />
                  Connect GitHub
                </Button>
              </div>
            </div>
            <div className="bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-xl p-6">
              <h3 className="font-semibold text-bolt-elements-textPrimary mb-4">Personal Access Token</h3>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-bolt-elements-textPrimary">Token</label>
                <div className="flex gap-3">
                  <input
                    type="password"
                    placeholder="ghp_..."
                    className="flex-1 px-4 py-3 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  />
                  <Button size="sm" variant="outline" className="px-6">
                    Save
                  </Button>
                </div>
                <p className="text-xs text-bolt-elements-textSecondary">
                  Required for private repository access and advanced features
                </p>
              </div>
            </div>
          </div>
        );
      }
      case 'MCP Servers': {
        return (
          <div className="space-y-6">
            <div className="bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <Server className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-bolt-elements-textPrimary">MCP Server Configuration</h3>
                  <p className="text-sm text-bolt-elements-textSecondary">Configure Model Context Protocol servers</p>
                </div>
              </div>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-bolt-elements-textPrimary">Server Configuration (JSON)</label>
                <div className="relative">
                  <textarea
                    className="w-full h-[400px] px-4 py-3 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary text-sm font-mono resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    placeholder='{\n  "servers": {\n    "example": {\n      "command": "example-server",\n      "args": ["--port", "3000"],\n      "env": {\n        "API_KEY": "your-key-here"\n      }\n    }\n  }\n}'
                  />
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-xs text-bolt-elements-textSecondary">Configure your MCP servers in JSON format</p>
                  <Button size="sm" className="px-6">
                    Save Configuration
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      }
      case 'Appearance': {
        return (
          <div className="space-y-6">
            <div className="bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                  <Paintbrush className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-bolt-elements-textPrimary">Appearance Settings</h3>
                  <p className="text-sm text-bolt-elements-textSecondary">Customize the look and feel</p>
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-3">Theme</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={toggleTheme}
                      className={cn(
                        'p-4 rounded-lg border-2 transition-all',
                        theme === 'light'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 hover:border-bolt-elements-borderColorActive',
                      )}
                    >
                      <svg className="w-full h-16 mb-3" viewBox="0 0 200 80" xmlns="http://www.w3.org/2000/svg">
                        <rect width="200" height="80" fill="#f8f9fa" rx="4"/>
                        <rect x="0" y="0" width="200" height="20" fill="#ffffff" rx="4 4 0 0"/>
                        <circle cx="10" cy="10" r="3" fill="#ff5f56"/>
                        <circle cx="20" cy="10" r="3" fill="#ffbd2e"/>
                        <circle cx="30" cy="10" r="3" fill="#27ca3f"/>
                        <rect x="0" y="20" width="40" height="60" fill="#f0f0f0"/>
                        <rect x="5" y="25" width="30" height="8" fill="#e0e0e0" rx="2"/>
                        <rect x="5" y="35" width="25" height="6" fill="#e0e0e0" rx="2"/>
                        <rect x="5" y="43" width="28" height="6" fill="#e0e0e0" rx="2"/>
                        <rect x="40" y="20" width="160" height="60" fill="#ffffff"/>
                        <rect x="45" y="25" width="150" height="12" fill="#f8f9fa" rx="2"/>
                        <rect x="50" y="30" width="20" height="2" fill="#007acc"/>
                        <rect x="75" y="30" width="30" height="2" fill="#d73a49"/>
                        <rect x="110" y="30" width="25" height="2" fill="#6f42c1"/>
                        <rect x="50" y="45" width="140" height="2" fill="#24292e"/>
                        <rect x="50" y="50" width="120" height="2" fill="#24292e"/>
                        <rect x="50" y="55" width="100" height="2" fill="#24292e"/>
                      </svg>
                      <div className="text-sm font-medium text-bolt-elements-textPrimary">Light</div>
                    </button>
                    <button
                      onClick={toggleTheme}
                      className={cn(
                        'p-4 rounded-lg border-2 transition-all',
                        theme === 'dark'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 hover:border-bolt-elements-borderColorActive',
                      )}
                    >
                      <svg className="w-full h-16 mb-3" viewBox="0 0 200 80" xmlns="http://www.w3.org/2000/svg">
                        <rect width="200" height="80" fill="#1e1e1e" rx="4"/>
                        <rect x="0" y="0" width="200" height="20" fill="#2d2d30" rx="4 4 0 0"/>
                        <circle cx="10" cy="10" r="3" fill="#ff5f56"/>
                        <circle cx="20" cy="10" r="3" fill="#ffbd2e"/>
                        <circle cx="30" cy="10" r="3" fill="#27ca3f"/>
                        <rect x="0" y="20" width="40" height="60" fill="#252526"/>
                        <rect x="5" y="25" width="30" height="8" fill="#3c3c3c" rx="2"/>
                        <rect x="5" y="35" width="25" height="6" fill="#3c3c3c" rx="2"/>
                        <rect x="5" y="43" width="28" height="6" fill="#3c3c3c" rx="2"/>
                        <rect x="40" y="20" width="160" height="60" fill="#1e1e1e"/>
                        <rect x="45" y="25" width="150" height="12" fill="#2d2d30" rx="2"/>
                        <rect x="50" y="30" width="20" height="2" fill="#569cd6"/>
                        <rect x="75" y="30" width="30" height="2" fill="#f92672"/>
                        <rect x="110" y="30" width="25" height="2" fill="#ae81ff"/>
                        <rect x="50" y="45" width="140" height="2" fill="#d4d4d4"/>
                        <rect x="50" y="50" width="120" height="2" fill="#d4d4d4"/>
                        <rect x="50" y="55" width="100" height="2" fill="#d4d4d4"/>
                      </svg>
                      <div className="text-sm font-medium text-black">Dark</div>
                    </button>
                  </div>
                </div>
                <div className="p-4 bg-bolt-elements-background-depth-2 rounded-lg">
                  <div className="text-sm font-medium text-bolt-elements-textPrimary mb-2">Current Theme</div>
                  <div className="text-sm text-bolt-elements-textSecondary capitalize">{theme} mode is active</div>
                </div>
              </div>
            </div>
          </div>
        );
      }
      case 'Proxy Server': {
        return (
          <div className="space-y-6">
            <div className="bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-teal-600 rounded-lg flex items-center justify-center">
                  <Settings className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-bolt-elements-textPrimary">Proxy Server Configuration</h3>
                  <p className="text-sm text-bolt-elements-textSecondary">Configure CORS proxy settings</p>
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">CORS Auth Token</label>
                  <input
                    type="text"
                    value={tempCorsToken}
                    onChange={(e) => setTempCorsToken(e.target.value)}
                    className="w-full px-4 py-3 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    placeholder="Enter CORS auth token"
                  />
                  <p className="text-xs text-bolt-elements-textSecondary mt-1">
                    Authentication token for CORS proxy requests
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">Proxy Address</label>
                  <input
                    type="url"
                    value={tempCorsAddress}
                    onChange={(e) => setTempCorsAddress(e.target.value)}
                    className="w-full px-4 py-3 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    placeholder="http://localhost:3000/api"
                  />
                  <p className="text-xs text-bolt-elements-textSecondary mt-1">Base URL for the CORS proxy server</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">Allowed Domains</label>
                  <textarea
                    value={tempCorsDomains}
                    onChange={(e) => setTempCorsDomains(e.target.value)}
                    className="w-full h-32 px-4 py-3 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary text-sm font-mono resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    placeholder="example.com&#10;api.example.com&#10;*.subdomain.com"
                  />
                  <p className="text-xs text-bolt-elements-textSecondary mt-1">Enter one domain per line. Use * for wildcards.</p>
                </div>
                <div className="flex justify-end">
                  <Button onClick={saveProxySettings} className="px-6">
                    Save Configuration
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      }
      default: {
        return (
          <div className="flex items-center justify-center h-32 text-bolt-elements-textSecondary">Coming soon...</div>
        );
      }
    }
  };

  return (
    <>
      <div
        className={cn(
          'flex items-center h-12 px-4 bg-bolt-elements-background-depth-1 border-b border-bolt-elements-borderColor',
          className,
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 mr-6">
          <svg width="120" height="24" viewBox="0 0 120 24" className="text-bolt-elements-textPrimary">
            <text x="0" y="18" fontSize="16" fontWeight="600" fontFamily="system-ui, -apple-system, sans-serif" fill="currentColor">
              claude-co.de
            </text>
          </svg>
        </div>

        {/* Centered Search Box */}
        <div className="flex-1 flex justify-center">
          <div className="max-w-md w-full cursor-pointer" onClick={() => setCommandOpen(true)}>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md hover:border-bolt-elements-borderColorActive transition-colors">
              <SearchIcon className="h-4 w-4 text-bolt-elements-textSecondary" />
              <span className="text-sm text-bolt-elements-textSecondary">Search files, commands...</span>
              <div className="ml-auto">
                <span className="text-xs text-bolt-elements-textTertiary bg-bolt-elements-background-depth-1 px-1.5 py-0.5 rounded border border-bolt-elements-borderColor">
                  ⌘K
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* View Switching Tabs - only show when not wide */}
        {!isWide && selectedView && onViewChange && (
          <div className="flex items-center flex-wrap shrink-0 gap-1 bg-bolt-elements-background-depth-1 overflow-hidden rounded-full p-1 mx-4">
            <button
              onClick={() => onViewChange('code')}
              className={classNames(
                'bg-transparent text-sm px-2.5 py-0.5 rounded-full relative',
                selectedView === 'code'
                  ? 'text-bolt-elements-item-contentAccent'
                  : 'text-bolt-elements-item-contentDefault hover:text-bolt-elements-item-contentActive',
              )}
            >
              <span className="relative z-10">Code</span>
              {selectedView === 'code' && (
                <motion.span
                  layoutId="view-tab-pill"
                  transition={{ duration: 0.2, ease: cubicEasingFn }}
                  className="absolute inset-0 z-0 bg-bolt-elements-item-backgroundAccent rounded-full"
                ></motion.span>
              )}
            </button>
            <button
              onClick={() => onViewChange('preview')}
              className={classNames(
                'bg-transparent text-sm px-2.5 py-0.5 rounded-full relative',
                selectedView === 'preview'
                  ? 'text-bolt-elements-item-contentAccent'
                  : 'text-bolt-elements-item-contentDefault hover:text-bolt-elements-item-contentActive',
              )}
            >
              <span className="relative z-10">Preview</span>
              {selectedView === 'preview' && (
                <motion.span
                  layoutId="view-tab-pill"
                  transition={{ duration: 0.2, ease: cubicEasingFn }}
                  className="absolute inset-0 z-0 bg-bolt-elements-item-backgroundAccent rounded-full"
                ></motion.span>
              )}
            </button>
          </div>
        )}

        {/* Right side controls */}
        <div className="flex items-center gap-2 ml-6">
          {/* Settings Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary bg-bolt-elements-background-depth-2 dark:hover:bg-bolt-elements-background-depth-1 dark:text-bolt-elements-textPrimary dark:hover:text-bolt-elements-textPrimary"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Command Palette */}
      {commandOpen && (
        <RadixDialog.Root open={commandOpen} onOpenChange={setCommandOpen}>
          <RadixDialog.Portal>
            <RadixDialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
            <RadixDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-[600px] bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg shadow-lg overflow-hidden p-0">
              <div className="flex h-9 items-center gap-2 border-b border-bolt-elements-borderColor px-3 bg-bolt-elements-background-depth-1">
                <SearchIcon className="h-4 w-4 shrink-0 opacity-50" />
                <input
                  type="text"
                  placeholder="Type a command or search..."
                  className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-bolt-elements-textSecondary text-bolt-elements-textPrimary"
                  autoFocus
                />
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                <div className="p-1">
                  <div className="px-2 py-1.5 text-xs font-medium text-bolt-elements-textSecondary">Recent Files</div>
                  <button
                    onClick={() => handleFileOpen('package.json')}
                    className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary transition-colors dark:hover:bg-bolt-elements-background-depth-1"
                  >
                    package.json
                  </button>
                  <button
                    onClick={() => handleFileOpen('vite.config.ts')}
                    className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary transition-colors dark:hover:bg-bolt-elements-background-depth-1"
                  >
                    vite.config.ts
                  </button>
                </div>
                <div className="p-1">
                  <div className="px-2 py-1.5 text-xs font-medium text-bolt-elements-textSecondary">Commands</div>
                  <button
                    onClick={() => handleCommand('toggle-terminal')}
                    className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary transition-colors dark:hover:bg-bolt-elements-background-depth-1"
                  >
                    <span>Toggle Terminal</span>
                    <span className="ml-auto text-xs text-bolt-elements-textTertiary">⌃`</span>
                  </button>
                  <button
                    onClick={() => {
                      setCommandOpen(false);
                      setSettingsOpen(true);
                    }}
                    className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary transition-colors dark:hover:bg-bolt-elements-background-depth-1"
                  >
                    <Settings className="h-4 w-4" />
                    <span>Open Settings</span>
                    <span className="ml-auto text-xs text-bolt-elements-textTertiary">⌘,</span>
                  </button>
                </div>
              </div>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        </RadixDialog.Root>
      )}

      {/* Settings Dialog */}
      <RadixDialog.Root open={settingsOpen} onOpenChange={setSettingsOpen}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <RadixDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 overflow-hidden p-0 w-[95vw] max-w-[1000px] h-[90vh] max-h-[700px] bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-xl shadow-2xl">
            <RadixDialog.Title className="sr-only">Settings</RadixDialog.Title>
            <RadixDialog.Description className="sr-only">Customize your settings here.</RadixDialog.Description>
            <SidebarProvider className="items-start h-full">
              <Sidebar collapsible="none" className="w-64 border-r border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
                <SidebarContent className="p-4">
                  <div className="mb-6">
                    <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Settings</h2>
                    <p className="text-sm text-bolt-elements-textSecondary">Manage your preferences</p>
                  </div>
                  <SidebarGroup>
                    <SidebarGroupContent>
                      <SidebarMenu className="space-y-1">
                        {settingsNavData.map((item) => (
                          <SidebarMenuItem key={item.name}>
                            <SidebarMenuButton
                              asChild
                              isActive={item.name === activeSettingsTab}
                              className={cn(
                                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all',
                                item.name === activeSettingsTab
                                  ? 'bg-blue-500 text-white dark:bg-blue-600 dark:text-white'
                                  : 'bg-transparent text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2 dark:hover:bg-bolt-elements-background-depth-3',
                              )}
                            >
                              <button
                                onClick={() => setActiveSettingsTab(item.name)}
                                className="w-full flex items-center gap-3"
                              >
                                <item.icon className="h-4 w-4" />
                                <span className="text-sm font-medium">{item.name}</span>
                              </button>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                </SidebarContent>
              </Sidebar>
              <main className="flex-1 flex flex-col h-full">
                <header className="flex h-16 shrink-0 items-center justify-between px-6 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
                  <Breadcrumb>
                    <BreadcrumbList>
                      <BreadcrumbItem>
                        <BreadcrumbLink className="text-bolt-elements-textSecondary">Settings</BreadcrumbLink>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbPage className="font-medium text-bolt-elements-textPrimary">{activeSettingsTab}</BreadcrumbPage>
                      </BreadcrumbItem>
                    </BreadcrumbList>
                  </Breadcrumb>
                </header>
                <div className="flex-1 overflow-y-auto p-6">{renderSettingsContent()}</div>
              </main>
            </SidebarProvider>
            <RadixDialog.Close className="absolute top-4 right-4 p-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 dark:bg-bolt-elements-background-depth-1 rounded-lg transition-colors">
              <span className="sr-only">Close</span>
              ✕
            </RadixDialog.Close>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
    </>
  );
} 