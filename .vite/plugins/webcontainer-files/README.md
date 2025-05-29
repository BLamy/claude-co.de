# WebContainer Files Plugin

This Vite plugin loads files from a directory and makes them available to WebContainer. It also supports creating executable "bin" files that can be run as commands in the WebContainer terminal.

## Usage

```typescript
import webcontainerFilesPlugin from './.vite/plugins/webcontainer-files';

export default defineConfig({
  plugins: [
    webcontainerFilesPlugin({
      // Directory containing files to include in WebContainer
      directory: './app/lib/webcontainer/files',
      
      // Optional: Bin files to make available as commands
      binFiles: [
        {
          source: './app/lib/webcontainer/bin/git.ts',
          target: 'git' // Will be available as 'git' command
        },
        {
          source: './scripts/custom-tool.js',
          // target is optional, defaults to basename without extension
        }
      ]
    })
  ]
});
```

## How it works

1. **Regular files**: All files in the specified directory are recursively loaded and included in the WebContainer file system.

2. **Bin files**: 
   - The source file is included in its original location
   - A wrapper shell script is created in a `.bin` directory that executes the source file with Node.js
   - During WebContainer initialization:
     - The wrapper scripts are made executable
     - Symlinks are created from `/bin` to the wrapper scripts
     - `/bin` is added to the PATH in `.bashrc` and `.profile`

## Example

If you have a file at `./app/lib/webcontainer/bin/git.ts`, and configure it as a bin file with target `git`:

1. The TypeScript file is included at `/home/project/app/lib/webcontainer/bin/git.ts`
2. A wrapper script is created at `/home/project/.bin/git` that runs: `exec node /home/project/app/lib/webcontainer/bin/git.ts "$@"`
3. A symlink is created: `/usr/local/bin/git` -> `/home/project/.bin/git`
4. Users can run `git` commands in the terminal, which will execute your TypeScript implementation

## Exports

The plugin exports two variables:

- `files`: The complete file tree for WebContainer mounting
- `binFiles`: A map of command names to their source file paths