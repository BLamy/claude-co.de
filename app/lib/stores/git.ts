import { atom, computed } from 'nanostores';
import { webcontainer } from '~/lib/webcontainer';

export interface GitDiff {
  raw: string;
  files: GitDiffFile[];
}

export interface GitDiffFile {
  path: string;
  additions: number;
  deletions: number;
  chunks: GitDiffChunk[];
}

export interface GitDiffChunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: GitDiffLine[];
}

export interface GitDiffLine {
  type: 'context' | 'add' | 'remove';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

class GitStore {
  #diff = atom<GitDiff | null>(null);
  #loading = atom(false);
  #error = atom<string | null>(null);

  diff = computed(this.#diff, (diff) => diff);
  loading = computed(this.#loading, (loading) => loading);
  error = computed(this.#error, (error) => error);

  async fetchDiff() {
    this.#loading.set(true);
    this.#error.set(null);
    
    try {
      const instance = await webcontainer;
      console.log('WebContainer instance ready, spawning git diff...');
      
      const process = await instance.spawn('node', ['./.bolt/bin/git.js', 'diff']);
      
      let output = '';
      let errorOutput = '';
      
      process.output.pipeTo(
        new WritableStream({
          write(data) {
            output += data;
          },
        })
      );
      
      if (process.error) {
        process.error.pipeTo(
          new WritableStream({
            write(data) {
              errorOutput += data;
            },
          })
        );
      }
      
      const exitCode = await process.exit;
      console.log('Git diff exit code:', exitCode);
      console.log('Git diff output:', output);
      console.log('Git diff error:', errorOutput);
      
      if (exitCode === 0) {
        console.log('Raw git diff output length:', output.length);
        console.log('First 500 chars of output:', output.substring(0, 500));
        const parsedDiff = this.#parseDiff(output);
        console.log('Parsed diff files:', parsedDiff);
        this.#diff.set({
          raw: output,
          files: parsedDiff,
        });
      } else {
        this.#error.set(`Failed to get git diff. Exit code: ${exitCode}. Error: ${errorOutput}`);
      }
    } catch (err) {
      console.error('Error in fetchDiff:', err);
      this.#error.set(err instanceof Error ? err.message : 'Failed to get git diff');
    } finally {
      this.#loading.set(false);
    }
  }

  #parseDiff(diff: string): GitDiffFile[] {
    const files: GitDiffFile[] = [];
    const lines = diff.split('\n');
    
    let currentFile: GitDiffFile | null = null;
    let currentChunk: GitDiffChunk | null = null;
    let oldLineNum = 1;
    let newLineNum = 1;
    
    for (const line of lines) {
      // File header
      if (line.startsWith('diff --git')) {
        console.log('Found diff line:', JSON.stringify(line));
        console.log('Line length:', line.length);
        // Try a simple split approach
        const parts = line.split(' ');
        if (parts.length >= 4) {
          const aPath = parts[2].substring(2); // Remove 'a/'
          const bPath = parts[3].substring(2); // Remove 'b/'
          console.log('Extracted paths:', aPath, bPath);
          currentFile = {
            path: bPath,
            additions: 0,
            deletions: 0,
            chunks: [],
          };
          files.push(currentFile);
          // Create a default chunk for simple diffs without @@ headers
          currentChunk = {
            oldStart: 1,
            oldLines: 0,
            newStart: 1,
            newLines: 0,
            lines: [],
          };
          currentFile.chunks.push(currentChunk);
          oldLineNum = 1;
          newLineNum = 1;
        }
      }
      // Chunk header (if present)
      else if (line.startsWith('@@')) {
        const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
        if (match && currentFile) {
          currentChunk = {
            oldStart: parseInt(match[1], 10),
            oldLines: parseInt(match[2] || '1', 10),
            newStart: parseInt(match[3], 10),
            newLines: parseInt(match[4] || '1', 10),
            lines: [],
          };
          currentFile.chunks.push(currentChunk);
        }
      }
      // Skip --- and +++ lines
      else if (line.startsWith('---') || line.startsWith('+++')) {
        continue;
      }
      // Diff lines
      else if (currentFile && currentChunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
        const type = line.startsWith('+') ? 'add' : line.startsWith('-') ? 'remove' : 'context';
        const diffLine: GitDiffLine = {
          type,
          content: line.substring(1),
        };
        
        if (type === 'context') {
          diffLine.oldLineNumber = oldLineNum++;
          diffLine.newLineNumber = newLineNum++;
        } else if (type === 'add') {
          diffLine.newLineNumber = newLineNum++;
          if (currentFile) currentFile.additions++;
        } else if (type === 'remove') {
          diffLine.oldLineNumber = oldLineNum++;
          if (currentFile) currentFile.deletions++;
        }
        
        currentChunk.lines.push(diffLine);
      }
    }
    
    return files;
  }

  clearDiff() {
    this.#diff.set(null);
    this.#error.set(null);
  }
}

export const gitStore = new GitStore();