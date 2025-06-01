import { useState, useEffect } from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { ScrollArea } from '~/components/ui/scroll-area';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '~/components/ui/Dialog';
import { logger } from '~/utils/logger';
import { webcontainer } from '~/lib/webcontainer';

interface McpServer {
  name: string;
  command: string;
  enabled: boolean;
}

interface ClaudeConfig {
  projects?: {
    [path: string]: {
      mcpServers?: {
        [name: string]: {
          command: string;
          args?: string[];
          env?: Record<string, string>;
        };
      };
      enabledMcpjsonServers?: string[];
      disabledMcpjsonServers?: string[];
    };
  };
}

export function McpServersPanel() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [newServerCommand, setNewServerCommand] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadMcpServers();
  }, []);

  const loadMcpServers = async () => {
    try {
      setLoading(true);
      setError(null);

      const instance = await webcontainer;
      
      // Create temporary file in current directory
      const tempPath = '.claude.json.tmp';
      
      // Copy the file from /home to current directory
      const result = await instance.spawn('cp', ['/home/.claude.json', tempPath]);
      const exitCode = await result.exit;
      
      if (exitCode !== 0) {
        throw new Error('Failed to copy .claude.json file');
      }

      // Read the temporary file
      const configContent = await instance.fs.readFile(tempPath, 'utf-8');
      await instance.fs.rm(tempPath);

      const config: ClaudeConfig = JSON.parse(configContent);
      const projectConfig = config.projects?.['/home/project'];
      
      if (projectConfig?.mcpServers) {
        const serverList: McpServer[] = Object.entries(projectConfig.mcpServers).map(([name, serverConfig]) => ({
          name,
          command: serverConfig.command + (serverConfig.args ? ' ' + serverConfig.args.join(' ') : ''),
          enabled: !projectConfig.disabledMcpjsonServers?.includes(name)
        }));
        setServers(serverList);
      }
    } catch (err) {
      logger.error('Failed to load MCP servers:', err);
      setError('Failed to load MCP servers configuration');
    } finally {
      setLoading(false);
    }
  };

  const updateClaudeConfig = async (updater: (config: ClaudeConfig) => void) => {
    try {
      const instance = await webcontainer;
      
      // Create temporary file in current directory
      const tempPath = '.claude.json.tmp';
      
      // Copy the file from /home to current directory
      let result = await instance.spawn('cp', ['/home/.claude.json', tempPath]);
      let exitCode = await result.exit;
      
      if (exitCode !== 0) {
        throw new Error('Failed to copy .claude.json file');
      }

      // Read the temporary file
      const configContent = await instance.fs.readFile(tempPath, 'utf-8');
      const config: ClaudeConfig = JSON.parse(configContent);
      
      // Apply the update
      updater(config);
      
      // Write updated content back to temp file
      await instance.fs.writeFile(tempPath, JSON.stringify(config, null, 2));
      
      // Move the file back to /home
      result = await instance.spawn('mv', [tempPath, '/home/.claude.json']);
      exitCode = await result.exit;
      
      if (exitCode !== 0) {
        throw new Error('Failed to move .claude.json file back');
      }
    } catch (err) {
      logger.error('Failed to update .claude.json:', err);
      throw err;
    }
  };

  const handleAddServer = async () => {
    if (!newServerName || !newServerCommand) {
      return;
    }

    setIsProcessing(true);
    try {
      const instance = await webcontainer;
      
      // // For Claude Code, install the MCP server package if it's an npm package
      // if (newServerCommand.startsWith('@') || newServerCommand.includes('/')) {
      //   const installResult = await instance.spawn('npm', ['install', '-g', newServerCommand]);
      //   const installExitCode = await installResult.exit;
        
      //   if (installExitCode !== 0) {
      //     throw new Error(`Failed to install MCP server package: ${newServerCommand}`);
      //   }
      // }

      // Update the configuration
      await updateClaudeConfig((config) => {
        if (!config.projects) {
          config.projects = {};
        }
        if (!config.projects['/home/project']) {
          config.projects['/home/project'] = {};
        }
        if (!config.projects['/home/project'].mcpServers) {
          config.projects['/home/project'].mcpServers = {};
        }
        
        // Store the command configuration
        // For Claude Code, the command format might be different
        // Try to parse the npx command to get the actual server command
        let finalCommand = newServerCommand;
        let finalArgs: string[] = [];
        
        if (newServerCommand.startsWith('@')) {
          // It's an npm package, use npx
          finalCommand = 'npx';
          finalArgs = ['-y', newServerCommand];
        } else {
          // Parse as space-separated command and args
          const parts = newServerCommand.split(' ');
          finalCommand = parts[0];
          finalArgs = parts.slice(1);
        }
        
        config.projects['/home/project'].mcpServers![newServerName] = {
          command: finalCommand,
          args: finalArgs
        };
      });

      // Reload servers
      await loadMcpServers();
      
      // Reset form
      setNewServerName('');
      setNewServerCommand('');
      setIsAddDialogOpen(false);
    } catch (err) {
      setError(`Failed to add MCP server: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveServer = async (serverName: string) => {
    setIsProcessing(true);
    try {
      await updateClaudeConfig((config) => {
        if (config.projects?.['/home/project']?.mcpServers) {
          delete config.projects['/home/project'].mcpServers[serverName];
        }
      });

      await loadMcpServers();
    } catch (err) {
      setError(`Failed to remove MCP server: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleServer = async (serverName: string, enabled: boolean) => {
    setIsProcessing(true);
    try {
      await updateClaudeConfig((config) => {
        if (!config.projects?.['/home/project']) {
          return;
        }
        
        if (!config.projects['/home/project'].disabledMcpjsonServers) {
          config.projects['/home/project'].disabledMcpjsonServers = [];
        }
        
        const disabled = config.projects['/home/project'].disabledMcpjsonServers!;
        const index = disabled.indexOf(serverName);
        
        if (enabled && index !== -1) {
          disabled.splice(index, 1);
        } else if (!enabled && index === -1) {
          disabled.push(serverName);
        }
      });

      await loadMcpServers();
    } catch (err) {
      setError(`Failed to toggle MCP server: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading MCP servers...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-sm font-medium">MCP Servers</h2>
        <Button
          size="sm"
          onClick={() => setIsAddDialogOpen(true)}
          disabled={isProcessing}
        >
          Add Server
        </Button>
      </div>

      <Alert className="m-4 mb-2">
        <AlertDescription>
          <strong>Note:</strong> MCP servers are managed by Claude Code. This interface updates the configuration in ~/.claude.json.
          <br />
          After making changes, use <code>/restart</code> in Claude Code to reload the configuration.
        </AlertDescription>
      </Alert>

      {error && (
        <Alert className="m-4" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {servers.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No MCP servers configured
            </div>
          ) : (
            servers.map((server) => (
              <div
                key={server.name}
                className="flex items-center justify-between p-3 rounded-lg border bg-card"
              >
                <div className="flex-1">
                  <div className="font-medium text-sm">{server.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{server.command}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={server.enabled ? "default" : "outline"}
                    onClick={() => handleToggleServer(server.name, !server.enabled)}
                    disabled={isProcessing}
                  >
                    {server.enabled ? 'Enabled' : 'Disabled'}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleRemoveServer(server.name)}
                    disabled={isProcessing}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add MCP Server</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="server-name" className="text-sm font-medium">
                Server Name
              </label>
              <Input
                id="server-name"
                placeholder="e.g., my-server"
                value={newServerName}
                onChange={(e) => setNewServerName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="server-command" className="text-sm font-medium">
                MCP Server Package or Command
              </label>
              <Input
                id="server-command"
                placeholder="e.g., @modelcontextprotocol/server-memory"
                value={newServerCommand}
                onChange={(e) => setNewServerCommand(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Enter an npm package name (e.g., @modelcontextprotocol/server-memory) or a full command path
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddServer}
              disabled={!newServerName || !newServerCommand || isProcessing}
            >
              Add Server
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}