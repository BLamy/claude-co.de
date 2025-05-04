import { defineConfig } from 'vitest/config';
import { transformSync } from '@babel/core';
import debuggerInstrumentation from '../../../.babel/plugins/debugger-instrumentation/index.js';
import expectSoft from '../../../.babel/plugins/expect-soft/index.js';

const testRunnerPlugin = {
  name: 'test-runner-plugin',
  enforce: 'pre', // Try to ensure it runs before other transformers if any exist internally
  transform(code, id) {
    // More specific filter - adjust if your tests/src are elsewhere
    if (!id.includes('/src/') || id.includes('/node_modules/')) {
       return null;
    }

    console.log(`[Transformer] Attempting: ${id}`);
    // Log first 100 chars to check for pre-processing
    // console.log(`[Transformer] Code start:\n---\n${code.substring(0, 100)}\n---`);

    try {
      const result = transformSync(code, {
        filename: id,
        presets: [['@babel/preset-typescript', { retainLines: true }]],
        plugins: [
          // Pass the filename explicitly to the plugin options if it helps
          [debuggerInstrumentation, { suiteName: 'Vitest Suite', filename: id }],
          expectSoft
        ],
        retainLines: true, // Keep this!
        ast: false,
        sourceMaps: 'inline', // Rely on this map
        sourceFileName: id
      });

      if (result && result.code) {
        console.log(`[Transformer] Success: ${id}`);
        // console.log(`[Transformer] Transformed Code start:\n---\n${result.code.substring(0, 200)}\n---`); // Debug output
        return {
          code: result.code,
          map: result.map // Pass the map Vitest might ignore anyway
        };
      } else {
         console.warn(`[Transformer] No code output: ${id}`);
      }
    } catch (error) {
      console.error(`[Transformer] Error: ${id}`, error);
    }
    return null;
  }
};

export default testRunnerPlugin;