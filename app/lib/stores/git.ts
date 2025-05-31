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

      // ensure git.js exists and install isomorphic-git
      try {
        await instance.fs.readFile('./.bolt/bin/git.js');

        // install isomorphic-git in .bolt/bin directory to avoid affecting project dependencies
        console.log('Installing isomorphic-git for git diff...');

        const installProcess = await instance.spawn('npm', ['install', 'isomorphic-git@1.24.5'], {
          output: true,
          cwd: './.bolt/bin',
        });
        await installProcess.exit;
      } catch {
        console.log('Git script not found, skipping git diff');
        this.#error.set('Git functionality not available');

        return;
      }

      const process = await instance.spawn('node', ['./.bolt/bin/git.js', 'diff']);

      let output = '';

      process.output.pipeTo(
        new WritableStream({
          write(data) {
            output += data;
          },
        }),
      );

      const exitCode = await process.exit;
      console.log('Git diff exit code:', exitCode);
      console.log('Git diff output:', output);

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
        this.#error.set(`Failed to get git diff. Exit code: ${exitCode}`);
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
      // clean line of any carriage returns and extra whitespace
      const cleanLine = line.replace(/\r/g, '').trim();

      // file header
      if (cleanLine.startsWith('diff --git')) {
        console.log('Found diff line:', JSON.stringify(cleanLine));
        console.log('Line length:', cleanLine.length);

        // try a simple split approach
        const parts = cleanLine.split(' ');

        if (parts.length >= 4) {
          const aPath = parts[2].substring(2); // remove 'a/'
          const bPath = parts[3].substring(2); // remove 'b/'
          console.log('Extracted paths:', aPath, bPath);
          currentFile = {
            path: bPath,
            additions: 0,
            deletions: 0,
            chunks: [],
          };
          files.push(currentFile);

          // create a default chunk for simple diffs without @@ headers
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
      // chunk header (if present)
      else if (cleanLine.startsWith('@@')) {
        const match = cleanLine.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);

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
      // skip --- and +++ lines
      else if (cleanLine.startsWith('---') || cleanLine.startsWith('+++')) {
        continue;
      }
      // diff lines
      else if (
        currentFile &&
        currentChunk &&
        (cleanLine.startsWith('+') || cleanLine.startsWith('-') || cleanLine.startsWith(' '))
      ) {
        const type = cleanLine.startsWith('+') ? 'add' : cleanLine.startsWith('-') ? 'remove' : 'context';
        const diffLine: GitDiffLine = {
          type,
          content: cleanLine.substring(1),
        };

        if (type === 'context') {
          diffLine.oldLineNumber = oldLineNum++;
          diffLine.newLineNumber = newLineNum++;
        } else if (type === 'add') {
          diffLine.newLineNumber = newLineNum++;

          if (currentFile) {
            currentFile.additions++;
          }
        } else if (type === 'remove') {
          diffLine.oldLineNumber = oldLineNum++;

          if (currentFile) {
            currentFile.deletions++;
          }
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

  async getOriginalFileContent(filePath: string): Promise<string> {
    const instance = await webcontainer;

    try {
      // create the git show script
      const gitShowScript = `
const git = require('isomorphic-git');
const fs = require('fs');

async function showFile() {
  try {
    const [commit, path] = process.argv[2].split(':');
    const result = await git.readBlob({
      fs,
      dir: '/home/project',
      oid: await git.resolveRef({ fs, dir: '/home/project', ref: commit }),
      filepath: path
    });
    
    const content = Buffer.from(result.blob).toString('utf8');
    process.stdout.write(content);
    process.exit(0);
  } catch (error) {
    if (error.code === 'NotFoundError') {
      // file doesn't exist in the commit (new file)
      process.exit(0);
    }
    console.error(error.message);
    process.exit(1);
  }
}

showFile();
`;

      // write the show script
      await instance.fs.writeFile('./.bolt/bin/git-show.js', gitShowScript);

      // install isomorphic-git if needed
      try {
        await instance.fs.readFile('./node_modules/isomorphic-git/package.json');
      } catch {
        // install in .bolt/bin directory to avoid affecting project dependencies
        const installProcess = await instance.spawn('npm', ['install', 'isomorphic-git'], {
          cwd: './.bolt/bin',
        });
        await installProcess.exit;
      }

      // run the script to get file content
      const process = await instance.spawn('node', ['./.bolt/bin/git-show.js', `HEAD:${filePath}`]);

      let output = '';

      const outputStream = new WritableStream({
        write(chunk) {
          output += chunk;
        },
      });

      process.output.pipeTo(outputStream);

      const exitCode = await process.exit;

      if (exitCode === 0) {
        return output;
      } else {
        // file might be new (not in HEAD), return empty string
        if (output === '') {
          return '';
        }

        throw new Error(`Failed to get original content for ${filePath}`);
      }
    } catch (err) {
      console.error('Error getting original file content:', err);
      throw err;
    }
  }
}

export const gitStore = new GitStore();