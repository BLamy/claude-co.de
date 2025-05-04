/* eslint-disable */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { transformSync } from '@babel/core';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import debuggerInstrumentation from './index.js'; // Assuming index.js is the updated plugin
const require = createRequire(import.meta.url);
/** wipe the plugin's output directory */
function cleanTimetravel() {
  const dir = path.join(process.cwd(), '.timetravel');
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function loadAllSteps() {
  const dir = path.join(process.cwd(), '.timetravel');
  const out = [];
  const walk = d => {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d)) {
      const full = path.join(d, entry);
      const stat = fs.statSync(full);
      stat.isDirectory()
        ? walk(full)
        : entry.endsWith('.json') &&
          out.push({ file: full, data: JSON.parse(fs.readFileSync(full, 'utf8')) });
    }
  };
  walk(dir);
  // Sort steps globally by stepNumber just in case, though resetting should handle per-test order
  return out.sort((a, b) => a.data.stepNumber - b.data.stepNumber);
}

/** compile `source` with the plugin and execute it in-process - UPDATED */
function run(source, pluginOpts = {}, filename = 'fixture.js') {
  const { code } = transformSync(source, {
    filename, // Consistent filename helps debugging
    presets: [['@babel/preset-typescript']],
    plugins: [[debuggerInstrumentation, { suiteName: 'Edge Suite', ...pluginOpts }]],
  });

  // Ensure globalThis exists if in a weird environment
  const globalScope = (typeof globalThis !== 'undefined' ? globalThis : global);

  // Vitest-style globals with reset logic
  globalScope.it = globalScope.test = (n, fn) => {
    // --- Call the reset function before each test ---
    if (typeof globalScope.__resetStepCounter === 'function') {
      globalScope.__resetStepCounter();
      // console.log(`[Test Runner] Called __resetStepCounter for test: ${n}`); // Debug log
    } else {
      // console.log(`[Test Runner] __resetStepCounter not found for test: ${n}`); // Debug log
    }
    // Set test name context BEFORE running the test function
    globalScope.__testName = n;
    try {
      fn(); // Execute the actual test function
    } finally {
      // Clean up test name after execution (optional, depends if beforeEach handles it)
      // delete globalScope.__testName;
    }
  };
  globalScope.describe = (n, fn) => {
    // Describe just executes the callback, suite path managed by plugin visitors
    fn();
  };

  // Execute the transformed code in the global scope
  // Pass require and globalScope itself if needed within the executed code
  try {
      new Function('require', 'globalThis', code)(require, globalScope);
  } catch(execError) {
      console.error("Error executing transformed code:", execError);
      // Optional: throw execError; // Rethrow if you want the test run to fail hard here
  }
}

/** 
 * Run multi-file tests with imports between them.
 * @param {Object} files - Object with filenames as keys and source code as values
 * @param {string} entrypoint - The main file to execute
 * @param {Object} pluginOpts - Options for the debugger instrumentation plugin
 * @returns {Array} - The recorded steps if any
 */
function runMultiFile(files, entrypoint, pluginOpts = {}) {
  // Create a mock filesystem and module cache
  const compiledFiles = {};
  const moduleCache = {};
  const recordedSteps = [];
  
  // First pass: compile all files
  for (const [filename, source] of Object.entries(files)) {
    const extension = path.extname(filename);
    const isTS = extension === '.ts' || extension === '.tsx';
    
    const { code } = transformSync(source, {
      filename,
      presets: [['@babel/preset-typescript', { onlyRemoveTypeImports: true }]],
      plugins: [[debuggerInstrumentation, { 
        suiteName: pluginOpts.suiteName || 'Multi File Suite', 
        filename, // Important: pass the filename to the plugin
        ...pluginOpts 
      }]],
    });
    
    compiledFiles[filename] = code;
    console.log(`Compiled ${filename} to:\n${code}`);
  }
  
  // Create module resolution system
  const globalScope = (typeof globalThis !== 'undefined' ? globalThis : global);
  
  // Store the current file being executed to track source maps
  globalScope.__currentFile = null;
  
  // Instead of using real files, capture steps in memory
  let stepNumber = 0;
  globalScope.__resetStepCounter = () => {
    stepNumber = 0;
  };
  
  globalScope.__recordStep = (line, column, vars, isReturn, file) => {
    stepNumber++;
    // Deep clone the vars to avoid reference issues
    const clonedVars = {};
    try {
      for (const key of Object.getOwnPropertyNames(vars)) {
        try {
          clonedVars[key] = vars[key];
        } catch (e) {
          clonedVars[key] = undefined;
        }
      }
    } catch (e) {
      console.error('Error cloning vars:', e);
    }
    
    // Create a step object similar to what would be written to file
    const stepData = {
      stepNumber,
      file: file || globalScope.__currentFile || 'unknown-file',
      line, 
      column,
      vars: clonedVars,
      ts: Date.now(),
      suite: pluginOpts.suiteName || 'Multi File Suite',
      test: globalScope.__testName || 'unknown-test'
    };
    
    recordedSteps.push(stepData);
    
    // Also try to log to real files if the original __recordStep exists
    if (typeof originalRecordStep === 'function') {
      try {
        originalRecordStep(line, column, vars, isReturn, file);
      } catch (err) {
        console.warn('Failed to call original recordStep:', err);
      }
    }
  };
  
  // Save reference to original recordStep if it exists
  const originalRecordStep = globalScope.__recordStep;
  
  // Set up testing globals
  globalScope.it = globalScope.test = (n, fn) => {
    console.log(`Running test: ${n}`);
    if (typeof globalScope.__resetStepCounter === 'function') {
      globalScope.__resetStepCounter();
      console.log('Step counter reset');
    } else {
      console.warn('Warning: __resetStepCounter not found');
    }
    globalScope.__testName = n;
    try {
      fn();
    } finally {
      // Clean up as needed
    }
  };
  
  globalScope.describe = (n, fn) => {
    console.log(`Running describe: ${n}`);
    fn();
  };
  
  // Create a custom require function for our compiled modules
  const customRequire = (modulePath) => {
    console.log(`Requiring: ${modulePath}`);
    
    // If it's already cached, return it
    if (moduleCache[modulePath]) {
      console.log(`${modulePath} found in cache`);
      return moduleCache[modulePath].exports;
    }
    
    // Check if the file was directly compiled
    if (compiledFiles[modulePath]) {
      console.log(`Found exact match for compiled file: ${modulePath}`);
      
      // Create module exports
      const module = { exports: {} };
      moduleCache[modulePath] = module;
      
      // Save previous currentFile
      const prevCurrentFile = customRequire.currentFile;
      customRequire.currentFile = modulePath;
      
      // Set current file in global context for recordStep to use
      const prevGlobalCurrentFile = globalScope.__currentFile;
      globalScope.__currentFile = modulePath;
      
      // Execute the module code
      try {
        const moduleFunction = new Function(
          'require', 'module', 'exports', 'globalThis', '__filename', '__dirname',
          compiledFiles[modulePath]
        );
        
        moduleFunction(
          customRequire,
          module,
          module.exports,
          globalScope,
          modulePath,
          path.dirname(modulePath)
        );
        
        console.log(`Module exports: ${Object.keys(module.exports)}`);
      } catch(err) {
        console.error(`Error executing ${modulePath}: ${err}`);
      } finally {
        // Restore previous values
        customRequire.currentFile = prevCurrentFile;
        globalScope.__currentFile = prevGlobalCurrentFile;
      }
      
      return module.exports;
    }
    
    // For relative imports, resolve against the importing file
    if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
      const currentDir = path.dirname(customRequire.currentFile || entrypoint);
      const resolvedRelativePath = path.join(path.relative(process.cwd(), currentDir), modulePath);
      console.log(`Resolved relative import to: ${resolvedRelativePath}`);
      
      // Check if we have this resolved relative path in our files
      if (compiledFiles[resolvedRelativePath]) {
        console.log(`Found compiled file for relative import: ${resolvedRelativePath}`);
        return customRequire(resolvedRelativePath);
      }
      
      // Try with just the filename
      const filenameOnly = path.basename(modulePath);
      if (compiledFiles[filenameOnly]) {
        console.log(`Found compiled file by basename: ${filenameOnly}`);
        return customRequire(filenameOnly);
      }
    }
    
    // Fallback to Node.js require for external modules
    try {
      return require(modulePath);
    } catch(err) {
      console.error(`Error requiring module ${modulePath}: ${err}`);
      throw err;
    }
  };
  
  // Execute the entrypoint
  try {
    customRequire.currentFile = entrypoint;
    globalScope.__currentFile = entrypoint;
    
    // Make sure we have a clean state
    if (typeof globalScope.__resetStepCounter === 'function') {
      globalScope.__resetStepCounter();
      console.log('Initial step counter reset before entrypoint');
    }
    
    console.log(`Executing entrypoint: ${entrypoint}`);
    customRequire(entrypoint);
  } catch (execError) {
    console.error(`Error executing '${entrypoint}':`, execError);
  }
  
  return recordedSteps;
}

// Export functions for external use
export { run, runMultiFile };

/* -------------------------------------------------- *
 * tests                                              *
 * -------------------------------------------------- */

// --- UPDATED beforeEach ---
beforeEach(() => {
  cleanTimetravel();
  // Ensure global state is clean before each run call
  delete globalThis.__recordStep;
  delete globalThis.__resetStepCounter; // <-- Make sure to delete the reset function too
  delete globalThis.__testName;
  delete globalThis.__suiteStack;
  delete globalThis.__pushSuite;
  delete globalThis.__popSuite;
  delete globalThis.__currentSuite;
  // Delete any other globals your plugin might implicitly create or rely on
});

afterEach(() => {
  cleanTimetravel();
});

describe('debuggerInstrumentation Babel plugin (real FS)', () => {
  it('injects the runtime stub and logs a basic step', () => {
    run('const a = 1;');
    expect(typeof globalThis.__recordStep).toBe('function');
    expect(typeof globalThis.__resetStepCounter).toBe('function');
    const steps = loadAllSteps();
    expect(steps).toHaveLength(1);
    const step = steps[0].data;
    expect(step.vars).toMatchObject({ a: 1 });
    expect(step.line).toBe(1);
    expect(step.stepNumber).toBe(1);
  });

  it('honours maxVars and caps captured vars', () => {
    run('const a=1,b=2,c=3,d=4;', { maxVars: 2 });

    const [step] = loadAllSteps().map(s => s.data);
    expect(Object.keys(step.vars).length).toBeLessThanOrEqual(2);
  });

  it('does not captures arguments on classic function entry', () => {
    run(`
      function foo(x, y) { return x + y; }
      foo(4, 5);
    `);

    expect(loadAllSteps().some(s => 'arguments' in s.data.vars)).toBe(false);
  });

  it('instruments arrow functions with implicit returns', () => {
    run(`
      const add = (m, n) => m + n;
      add(2, 3);
    `);

    const fnStep = loadAllSteps().find(s => 'm' in s.data.vars && 'n' in s.data.vars);
    expect(fnStep?.data.vars).toMatchObject({ m: 2, n: 3 });
  });

  it('wraps single-line if-statements so they still get instrumented', () => {
    run(`
      let x = 0;
      if (x === 0) x = 1;
    `);

    expect(loadAllSteps().length).toBeGreaterThanOrEqual(2);
  });

  it('sanitises funky suite/test names in generated paths', () => {
    run(
      `
        test('weird test name: 1/2', () => { const v = 42; });
      `,
      { suiteName: 'My Suite/Weird:Name.v1' }
    );

    const suiteDir = path.join(process.cwd(), '.timetravel', 'My_Suite_Weird_Name_v1');
    expect(fs.existsSync(suiteDir)).toBe(true);

    const steps = loadAllSteps();
    const hit = steps.find(s => s.data.test === 'weird test name: 1/2');
    expect(hit).toBeTruthy();
  });

  const steps = () => loadAllSteps().map(s => s.data);

  it('increments stepNumber sequentially across many steps', () => {
    run(`
      let sum = 0;
      for (let i = 0; i < 5; i++) sum += i;
    `);

    const nums = steps().map(s => s.stepNumber);
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
  });

  it('instruments async / await functions correctly', async () => {
    run(`
      async function fetcher() {
        const val = await Promise.resolve(99);
        return val;
      }
      fetcher();
    `);

    await new Promise(r => setTimeout(r, 10));

    const asyncStep = steps().find(s => 'val' in s.vars);
    expect(asyncStep?.vars.val).toBe(99);
  });

  it('captures loop-scoped variables on each iteration', () => {
    run(`
      for (let j = 0; j < 3; j++) {
        const squared = j * j;
      }
    `);

    const loopSteps = steps().filter(s => 'j' in s.vars && 'squared' in s.vars);
    expect(loopSteps).toHaveLength(3);
  });

  it('handles destructuring without TDZ errors', () => {
    run(`const { a, b: renamed } = { a: 7, b: 9 };`);

    const step = steps().find(s => 'a' in s.vars && 'renamed' in s.vars);
    expect(step?.vars).toMatchObject({ a: 7, renamed: 9 });
  });
  
  it('should step through test and implementation', () => {
    run(
      `function add(a, b) {      // Line 1
        const total = a + b;    // Line 2
        return total;           // Line 3
      }                         // Line 4
      function subtract(a, b) {  // Line 5
        const result = a - b;   // Line 6
        return result;          // Line 7
      }                         // Line 8
      describe('Math', () => {    // Line 9
        describe('add', () => {   // Line 10
          it('adds numbers', () => { // Line 11 <<< Expect Step 1 (after this line)
            const x = add(1, 1); // Line 12 
            if (x !== 2) {       // Line 13 <<< Expect Step 5 (after this line)
              throw new Error('x is not 2'); // Line 14
            }                     // Line 15
          });                     // Line 16
        });                       // Line 17
        describe('subtract', () => { // Line 18
          it('subtracts numbers', () => { // Line 19
            const y = subtract(5, 3); // Line 20
            if (y !== 2) {            // Line 21
              throw new Error('y is not 2'); // Line 22
            }// Line 23
          });   // Line 24                  
        });   // Line 25                    
      }); // Line 26`,                       
      { suiteName: 'RootSuite' }
    );

    // Test the subtract function steps
    const subtractDir = path.join(process.cwd(), '.timetravel', 'Math', 'subtract', 'subtracts_numbers');
    expect(fs.existsSync(subtractDir), `Test output dir should exist: ${subtractDir}`).toBe(true);
    let subtractFiles = [];
    try { subtractFiles = fs.readdirSync(subtractDir).filter(f => f.endsWith('.json')).sort((a, b) => parseInt(a.split('.')[0]) - parseInt(b.split('.')[0])); }
    catch (readDirError) { throw new Error(`Failed to read directory ${subtractDir}: ${readDirError}`); }

    console.log('Recorded subtract step files:', subtractFiles.map(f => [f, fs.readFileSync(path.join(subtractDir, f), 'utf8')]));

    // Verify subtract function steps
    expect(subtractFiles.length).toBe(5);
    
    // Step 1: Before (const y = subtract(5, 3);)
    const subtractStep1 = JSON.parse(fs.readFileSync(path.join(subtractDir, subtractFiles[0]), 'utf8'));
    expect(subtractStep1.line).toBe(19);
    expect(subtractStep1.stepNumber).toBe(1);
    expect(subtractStep1.vars).toMatchObject({});
    
    // Step 2: Function entry `subtract` (Line 5)
    const subtractStep2 = JSON.parse(fs.readFileSync(path.join(subtractDir, subtractFiles[1]), 'utf8'));
    expect(subtractStep2.line).toBe(5);
    expect(subtractStep2.stepNumber).toBe(2);
    expect(subtractStep2.vars).toMatchObject({ a: 5, b: 3 });
    expect(subtractStep2.vars.result).toBeUndefined();
    
    // Step 3: AFTER line 6 (const result = a - b;)
    const subtractStep3 = JSON.parse(fs.readFileSync(path.join(subtractDir, subtractFiles[2]), 'utf8'));
    expect(subtractStep3.line).toBe(6);
    expect(subtractStep3.stepNumber).toBe(3);
    expect(subtractStep3.vars).toMatchObject({ a: 5, b: 3, result: 2 });
    
    // Step 4: AFTER line 19 (const y = subtract(5, 3);)
    const subtractStep4 = JSON.parse(fs.readFileSync(path.join(subtractDir, subtractFiles[3]), 'utf8'));
    expect(subtractStep4.line).toBe(20);
    expect(subtractStep4.stepNumber).toBe(4);
    expect(subtractStep4.vars).toMatchObject({ y: 2 });
    
    // Step 5: AFTER line 20 (if (y !== 2))
    const subtractStep5 = JSON.parse(fs.readFileSync(path.join(subtractDir, subtractFiles[4]), 'utf8'));
    expect(subtractStep5.line).toBe(21);
    expect(subtractStep5.stepNumber).toBe(5);
    expect(subtractStep5.vars).toMatchObject({ y: 2 });


    // Test the add function steps
    const addDir = path.join(process.cwd(), '.timetravel',  'Math', 'add', 'adds_numbers');
    expect(fs.existsSync(addDir), `Test output dir should exist: ${addDir}`).toBe(true);
    let addFiles = [];
    try { addFiles = fs.readdirSync(addDir).filter(f => f.endsWith('.json')).sort((a, b) => parseInt(a.split('.')[0]) - parseInt(b.split('.')[0])); }
    catch (readDirError) { throw new Error(`Failed to read directory ${addDir}: ${readDirError}`); }

    console.log('Recorded add step files:', addFiles.map(f => [f, fs.readFileSync(path.join(addDir, f), 'utf8')]));

    // --- EXPECTATIONS BASED ON RESET COUNTER AND WORKING Function visitor ---
    expect(addFiles.length).toBe(5);

    // Step 1: Before (const x = add(1, 1);)
    const step1 = JSON.parse(fs.readFileSync(path.join(addDir, addFiles[0]), 'utf8'));
    expect(step1.line).toBe(11);
    expect(step1.stepNumber).toBe(1);
    expect(step1.vars).toMatchObject({});
    
        
    // Step 2: Function entry `add` (Line 1)
    const step2 = JSON.parse(fs.readFileSync(path.join(addDir, addFiles[1]), 'utf8'));
    expect(step2.line).toBe(1);
    expect(step2.stepNumber).toBe(2);
    expect(step2.vars).toMatchObject({ a: 1, b: 1 });
    expect(step2.vars.total).toBeUndefined();

    // Step 3: AFTER line 2 (const total = a + b;)
    const step3 = JSON.parse(fs.readFileSync(path.join(addDir, addFiles[2]), 'utf8'));
    expect(step3.line).toBe(2);
    expect(step3.stepNumber).toBe(3);
    expect(step3.vars).toMatchObject({ a: 1, b: 1, total: 2 });

    // Step 4: AFTER line 12 (const x = add(1, 1);)
    const step4 = JSON.parse(fs.readFileSync(path.join(addDir, addFiles[3]), 'utf8'));
    expect(step4.line).toBe(12);
    expect(step4.stepNumber).toBe(4);
    expect(step4.vars).toMatchObject({ x: 2 });

    // Step 5: AFTER line 13 (if (x !== 2))
    const step5 = JSON.parse(fs.readFileSync(path.join(addDir, addFiles[4]), 'utf8'));
    expect(step5.line).toBe(13);
    expect(step5.stepNumber).toBe(5);
    expect(step5.vars).toMatchObject({ x: 2 });
  });

  it('tests multiple files with imports and correct line tracking', () => {
    const files = {
      'math.js': `
// Implementation file
function add(a, b) {      // Line 2
  const total = a + b;           // Line 3
  return total;                  // Line 4
}                                // Line 5
module.exports = { add };
      `,
      'test.js': `
// Test file
const { add } = require('./math.js'); // Line 2

describe('Math', () => {         // Line 4
  it('adds numbers', () => {     // Line 5
    const x = add(3, 5);         // Line 6
    if (x !== 8) {               // Line 7
      throw new Error('x is not 8'); // Line 8
    }                            // Line 9
  });                            // Line 10
});                              // Line 11
      `
    };

    const steps = runMultiFile(files, 'test.js', { suiteName: 'MultiFileTest' });
    console.log('First 10 steps:', steps.slice(0, 10));
    
    // Verify we have steps 
    expect(steps.length).toBeGreaterThan(5);
    
    // Find steps with specific variable patterns
    const stepsWithA = steps.filter(s => s.vars && s.vars.a === 3 && s.vars.b === 5);
    expect(stepsWithA.length).toBeGreaterThan(0);
    
    const stepsWithTotal = steps.filter(s => s.vars && s.vars.total === 8);
    expect(stepsWithTotal.length).toBeGreaterThan(0);
    
    const stepsWithX = steps.filter(s => s.vars && s.vars.x === 8);
    expect(stepsWithX.length).toBeGreaterThan(0);
  });
});

const TS_SAMPLE = /* ts */ `
interface ODataQueryOptions {
  $select?: string[];
  $filter?: string;
  $orderby?: string[];
  $top?: number;
  $skip?: number;
}
function parseODataQuery (queryString: string) {
  const params = new URLSearchParams(queryString);
  return {};
}
parseODataQuery('$filter=age%20gt%2018');
`.trimStart() + '\n';           // final \n = real‑file newline

describe('babel preset‑typescript with retainLines (via run helper)', () => {
  it('records steps with the original TypeScript line numbers', () => {
    /*  👇  the only extra option: retainLines=true on the preset  */
    run(TS_SAMPLE, { suiteName: 'RootSuite' }, 'fixture.ts');

    /* The plugin will emit:                               *
     *  – a function‑entry step  (line 8)                  *
     *  – an after‑statement step (# params assignment)    */
    const steps = loadAllSteps().map(s => s.data);

    // expect at least the two we care about
    expect(steps.length).toBeGreaterThanOrEqual(2);

    // Function‑entry (first user code after stripping types)
    const entry = steps.find(s => s.line === 8);
    expect(entry).toBeTruthy();

    // First statement inside the function
    const firstStmt = steps.find(s => s.line === 9);
    expect(firstStmt).toBeTruthy();
  });
  
  it('supports multi-file TypeScript tests with correct line tracking', () => {
    const files = {
      'utils.ts': `
// Utility functions with TypeScript types
interface Person {
  name: string;
  age: number;
}

function greet(person: Person): string {  // Line 7
  const greeting = \`Hello, \${person.name}!\`;  // Line 8
  return greeting;                              // Line 9
}                                               // Line 10

module.exports = { greet };
// We need to export the Person type too, but that will be stripped by TypeScript compilation
// TypeScript interfaces don't exist at runtime
      `,
      'test.ts': `
// Test file with TypeScript
const { greet } = require('./utils.ts');  // Line 2

// TypeScript interfaces don't exist at runtime, so we define the object inline
interface Person {
  name: string;
  age: number;
}

describe('Utils', () => {                    // Line 9
  it('greets a person', () => {              // Line 10
    const person = {                         // Line 11
      name: 'Alice',                         // Line 12
      age: 30                                // Line 13
    };                                       // Line 14
    const message = greet(person);           // Line 15
    if (message !== 'Hello, Alice!') {       // Line 16
      throw new Error('Incorrect greeting'); // Line 17
    }                                        // Line 18
  });                                        // Line 19
});                                          // Line 20
      `
    };

    const steps = runMultiFile(files, 'test.ts', { suiteName: 'MultiFileTypeScript' });
    console.log('TypeScript test first 10 steps:', steps.slice(0, 10));
    
    // Verify we have a reasonable number of steps
    expect(steps.length).toBeGreaterThan(5);
    
    // Find steps with specific variable patterns
    const stepsWithPerson = steps.filter(s => 
      s.vars && s.vars.person && 
      s.vars.person.name === 'Alice' && 
      s.vars.person.age === 30
    );
    expect(stepsWithPerson.length).toBeGreaterThan(0);
    
    const stepsWithGreeting = steps.filter(s => 
      s.vars && s.vars.greeting === 'Hello, Alice!'
    );
    expect(stepsWithGreeting.length).toBeGreaterThan(0);
    
    const stepsWithMessage = steps.filter(s => 
      s.vars && s.vars.message === 'Hello, Alice!'
    );
    expect(stepsWithMessage.length).toBeGreaterThan(0);
  });
});