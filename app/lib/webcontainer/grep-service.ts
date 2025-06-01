import type { WebContainer } from '@webcontainer/api';
import { WORK_DIR } from '~/utils/constants';

interface GrepRequest {
  pattern: string;
  paths: string[];
  flags: {
    ignoreCase: boolean;
    invertMatch: boolean;
    filesWithMatches: boolean;
    recursive: boolean;
    lineNumber: boolean;
    count: boolean;
  };
  requestId: string;
  responseFile: string;
}

interface GrepResult {
  file: string;
  line?: number;
  match?: string;
}

export class GrepService {
  private container: WebContainer;
  private watchInterval: NodeJS.Timeout | null = null;

  constructor(container: WebContainer) {
    this.container = container;
  }

  async start() {
    console.log('[GrepService] Starting grep service...');
    
    // Test the .bolt directory
    try {
      const files = await this.container.fs.readdir('.bolt');
      console.log('[GrepService] .bolt directory contents:', files);
    } catch (err) {
      console.log('[GrepService] Error reading .bolt:', err);
    }
    
    // Start watching for grep requests
    let checkCount = 0;
    this.watchInterval = setInterval(async () => {
      checkCount++;
      if (checkCount % 50 === 0) { // Log every 5 seconds
        try {
          const boltFiles = await this.container.fs.readdir('.bolt');
          console.log(`[GrepService] Check #${checkCount}, .bolt contents:`, boltFiles);
        } catch (err) {
          console.log(`[GrepService] Check #${checkCount}, error reading .bolt:`, err);
        }
      }
      this.checkForGrepRequests();
    }, 100);
    
    // Expose service globally for debugging
    (window as any).grepService = this;
  }

  stop() {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }
  }

  // Manual test method for debugging
  async testSignal() {
    console.log('[GrepService] Testing signal detection...');
    await this.container.fs.writeFile('.bolt/test-signal', 'test');
    const content = await this.container.fs.readFile('.bolt/test-signal', 'utf-8');
    console.log('[GrepService] Test signal content:', content);
    await this.container.fs.rm('.bolt/test-signal');
    console.log('[GrepService] Test complete');
  }
  
  // Manual check for debugging
  async manualCheck() {
    console.log('[GrepService] Manual check for grep requests...');
    try {
      const files = await this.container.fs.readdir('.bolt');
      console.log('[GrepService] .bolt files:', files);
      
      const signalExists = files.includes('grep-signal');
      console.log('[GrepService] grep-signal exists:', signalExists);
      
      if (signalExists) {
        const signalContent = await this.container.fs.readFile('.bolt/grep-signal', 'utf-8');
        console.log('[GrepService] Signal content:', signalContent);
        
        const requestContent = await this.container.fs.readFile(signalContent, 'utf-8');
        console.log('[GrepService] Request content:', requestContent);
      }
    } catch (err) {
      console.error('[GrepService] Manual check error:', err);
    }
  }

  private async checkForGrepRequests() {
    try {
      // Check if there's a grep signal file
      const signalContent = await this.container.fs.readFile('.bolt/grep-signal', 'utf-8').catch((err) => {
        // Don't log for "file not found" - this is normal
        if (err.code !== 'ENOENT' && err.message && !err.message.includes('ENOENT')) {
          console.log('[GrepService] Error reading signal file:', err);
        }
        return null;
      });
      
      if (!signalContent) {
        return;
      }

      console.log('[GrepService] Found grep signal:', signalContent);

      // Remove the signal file immediately
      await this.container.fs.rm('.bolt/grep-signal').catch(() => {});

      // Read the request file
      const requestContent = await this.container.fs.readFile(signalContent, 'utf-8').catch(() => null);
      
      if (!requestContent) {
        console.error('[GrepService] Could not read request file:', signalContent);
        return;
      }

      console.log('[GrepService] Request content:', requestContent);
      const request: GrepRequest = JSON.parse(requestContent);
      
      // Perform the search
      console.log('[GrepService] Performing search for pattern:', request.pattern);
      const results = await this.performGrepSearch(request);
      console.log('[GrepService] Search completed, found', results.length, 'results');
      
      // Write the response
      const response = { results, success: true };
      console.log('[GrepService] Writing response:', JSON.stringify(response, null, 2));
      await this.container.fs.writeFile(
        request.responseFile, 
        JSON.stringify(response)
      );
      console.log('[GrepService] Response written to:', request.responseFile);
    } catch (error) {
      console.error('[GrepService] Error handling grep request:', error);
    }
  }

  private async performGrepSearch(request: GrepRequest): Promise<GrepResult[]> {
    const results: GrepResult[] = [];
    
    console.log('[GrepService] Search request:', {
      pattern: request.pattern,
      paths: request.paths,
      flags: request.flags
    });
    
    // Check if internal API is available
    const containerWithInternal = this.container as any;
    if (!containerWithInternal.internal || !containerWithInternal.internal.textSearch) {
      console.error('[GrepService] WebContainer textSearch API not available');
      return [];
    }

    // Convert paths to include patterns for textSearch
    let includePatterns: string[] = [];
    if (request.paths.length === 0 || (request.paths.length === 1 && request.paths[0] === '.')) {
      // Search all files recursively by default
      includePatterns = ['**/*'];
    } else {
      includePatterns = request.paths.map(path => {
        if (path.includes('*')) {
          // Handle glob patterns - if recursive flag is set, make them recursive
          return request.flags.recursive && !path.includes('**') ? path.replace('*', '**/*') : path;
        } else {
          // For specific files or directories
          if (path.endsWith('/')) {
            return request.flags.recursive ? `${path}**/*` : `${path}*`;
          } else {
            // Check if it's a file extension pattern like "*.ts"
            return path;
          }
        }
      });
    }

    console.log('[GrepService] Using textSearch with pattern:', request.pattern);
    console.log('[GrepService] Include patterns:', includePatterns);
    
    try {
      // Use the same options structure as SearchPanel
      const searchOptions = {
        folders: [WORK_DIR],
        includes: includePatterns,
        excludes: [
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**',
          '**/build/**',
          '**/.bolt/**',
          '**/.timetravel/**',
          '**/*.log',
          '**/.DS_Store',
        ],
        homeDir: WORK_DIR,
        gitignore: true,
        requireGit: false,
        globalIgnoreFiles: true,
        isRegex: false, // grep patterns are not regex by default
        caseSensitive: !request.flags.ignoreCase,
        isWordMatch: false,
        ignoreSymlinks: true,
        resultLimit: 10000, // Higher limit for grep
      };
      
      console.log('[GrepService] textSearch options:', searchOptions);
      const searchResults = await containerWithInternal.internal.textSearch(request.pattern, searchOptions, console.log.bind(console));
      
      console.log('[GrepService] textSearch returned results for', searchResults.size, 'files');
      
      // Convert textSearch results to grep format
      for (const [filePath, matches] of searchResults) {
        // Remove WORK_DIR prefix from file paths
        const displayPath = filePath.startsWith(WORK_DIR) ? filePath.substring(WORK_DIR.length + 1) : filePath;
        console.log('[GrepService] Processing file:', displayPath, 'with', matches.length, 'matches');
        
        if (request.flags.filesWithMatches) {
          // Only show files with matches
          results.push({ file: displayPath });
        } else if (request.flags.count) {
          // Count matches per file
          results.push({
            file: displayPath,
            match: matches.length.toString(),
          });
        } else {
          // Show individual matches
          for (const match of matches) {
            for (const range of match.ranges) {
              const lineNumber = range.startLineNumber + 1; // Convert 0-based to 1-based
              results.push({
                file: displayPath,
                line: lineNumber, // Always include line numbers
                match: match.preview.text.trim(), // Use preview text like SearchPanel
              });
            }
          }
        }
      }
      
      console.log('[GrepService] Converted to', results.length, 'results');
      
    } catch (error) {
      console.error('[GrepService] Error calling textSearch:', error);
      return [];
    }
    
    return results;
  }
}