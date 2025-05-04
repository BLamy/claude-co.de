import type { WebContainer } from '@webcontainer/api';
import { atom, type WritableAtom } from 'nanostores';

// Types
export interface DebugStep {
  file: string;
  line: number;
  vars?: Record<string, unknown>;
}

export interface TestSuiteData {
  [suite: string]: {
    [test: string]: DebugStep[];
  };
}

export interface TestStatus {
  text: string;
  color: string;
}

export interface TestStats {
  total: number;
  passing: number;
  time: string;
}

export interface HighlightedLine {
  filePath: string;
  line: number;
}

export class TestStore {
  #webcontainer: Promise<WebContainer>;

  // State atoms
  testSuites: WritableAtom<TestSuiteData> = atom({});
  selectedTestSteps: WritableAtom<DebugStep[] | null> = atom(null);
  currentStepIndex: WritableAtom<number> = atom(0);
  testStatus: WritableAtom<TestStatus> = atom({ text: 'Ready', color: '#3BB446' });
  testStats: WritableAtom<TestStats> = atom({ total: 0, passing: 0, time: '--' });
  highlightedLine: WritableAtom<HighlightedLine | null> = atom(null);

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;

    if (import.meta.hot) {
      import.meta.hot.data.testSuites = this.testSuites;
      import.meta.hot.data.selectedTestSteps = this.selectedTestSteps;
      import.meta.hot.data.currentStepIndex = this.currentStepIndex;
      import.meta.hot.data.testStatus = this.testStatus;
      import.meta.hot.data.testStats = this.testStats;
      import.meta.hot.data.highlightedLine = this.highlightedLine;
    }
  }

  async runTests() {
    const webcontainer = await this.#webcontainer;
    this.testStatus.set({ text: 'Running tests…', color: '#E0AF0B' });
    
    const t0 = performance.now();
    try {
      const proc = await webcontainer.spawn('npm', ['test']);
      const exitCode = await proc.exit;
      const dt = Math.round(performance.now() - t0);

      const collected = await this.#collectDebugData(webcontainer);
      const totalTests = Object.values(collected).reduce(
        (sum, suite) => sum + Object.keys(suite).length, 
        0
      );
      
      this.testStats.set({ 
        total: totalTests, 
        passing: totalTests, // Assuming all pass for now
        time: `${dt}ms` 
      });
      
      this.testSuites.set(collected);
      this.testStatus.set({ 
        text: `Tests finished${exitCode !== 0 ? ` (Code: ${exitCode})` : ''}`, 
        color: exitCode === 0 ? '#3BB446' : '#E00B0B' 
      });
    } catch (error: any) {
      console.error('Failed to run tests:', error);
      this.testStatus.set({ text: 'Test run failed', color: '#E00B0B' });
      this.testStats.set({ total: 0, passing: 0, time: '--' });
      this.testSuites.set({});
    }
    
    // Clear selected steps after running
    this.selectedTestSteps.set(null);
    this.currentStepIndex.set(0);
    this.highlightedLine.set(null);
  }

  async #collectDebugData(webcontainer: WebContainer): Promise<TestSuiteData> {
    const collected: TestSuiteData = {};
    const debugDir = '/.timetravel';
    
    try {
      const suiteDirs = await webcontainer.fs.readdir(debugDir, { withFileTypes: true });
      
      for (const suiteDir of suiteDirs) {
        if (!suiteDir.isDirectory() || ['DefaultSuite', 'UnknownTest'].includes(suiteDir.name)) {
          continue;
        }

        const suiteName = suiteDir.name;
        collected[suiteName] = {};
        
        const testFiles = await webcontainer.fs.readdir(`${debugDir}/${suiteName}`, { 
          withFileTypes: true 
        });

        for (const testFile of testFiles) {
          if (!testFile.isFile() || !testFile.name.endsWith('.json')) {
            continue;
          }

          const testName = testFile.name.endsWith('.json') 
            ? testFile.name.slice(0, -5) 
            : testFile.name;
            
          const jsonStr = await webcontainer.fs.readFile(
            `${debugDir}/${suiteName}/${testFile.name}`,
            'utf-8'
          );
          
          try {
            collected[suiteName][testName] = JSON.parse(jsonStr);
          } catch (parseError) {
            console.error(`Failed to parse debug data for ${suiteName}/${testName}:`, parseError);
          }
        }
      }
    } catch (error) {
      // Ignore if directory doesn't exist, log other errors
      if (!String(error).includes('ENOENT')) {
        console.error('Error reading debug data:', error);
      }
    }
    
    return collected;
  }

  selectTest(stepsDebug: DebugStep[]) {
    this.selectedTestSteps.set(stepsDebug);
  }

  goToStep(index: number) {
    const steps = this.selectedTestSteps.get();
    if (!steps || index < 0 || index >= steps.length) {
      return;
    }

    this.currentStepIndex.set(index);
    
    const step = steps[index];
    console.log('DEBUG - goToStep - original file path:', step.file, 'line:', step.line);
    
    /*
     * Extract the relative path from the full path.
     * Improved handling for various path formats.
     */
    const filePath = extractRelativePath(step.file);
    console.log('DEBUG - goToStep - processed file path:', filePath);
    
    // create a new object literal to ensure reactivity
    const newHighlight = { 
      filePath, 
      line: step.line,
    };

    /* 
     * Set the new highlight value. If the value is the same object reference,
     * nanostores might not notify listeners. Creating a new object ensures notification.
     */
    this.highlightedLine.set(newHighlight);
    console.log('DEBUG - highlightedLine set to:', newHighlight);
  }

  clearHighlight() {
    // set to null to clear the highlight
    if (this.highlightedLine.get() !== null) {
        this.highlightedLine.set(null);
        console.log('DEBUG - highlight cleared');
    }
  }
}

/**
 * Extracts a relative file path that can be used by the editor
 * Handles various path formats from different environments
 */
function extractRelativePath(fullPath: string): string {
  console.log('DEBUG - extractRelativePath - input path:', fullPath);
  
  // remove any leading /home/project/.bolt/ or similar paths
  const parts = fullPath.split('/');
  console.log('DEBUG - extractRelativePath - path parts:', parts);
  
  // check for common patterns in paths and handle them
  if (parts.includes('project') || parts.includes('home')) {
    // find important parts of the path after project structure markers
    for (let i = 0; i < parts.length; i++) {
      // skip until we find a directory that's likely part of the actual project
      if (['home', 'project', '.bolt', 'node_modules'].includes(parts[i])) {
        console.log('DEBUG - extractRelativePath - skipping path segment:', parts[i]);
        continue;
      }
      
      // return the rest of the path
      const result = parts.slice(i).join('/');
      console.log('DEBUG - extractRelativePath - returning path after segment', i, ':', result);
      return result;
    }
  }
  
  // if we can't determine a specific pattern, use the filename as fallback
  // or the last 2 segments if there are multiple segments
  const fallbackResult = parts.length > 2 ? parts.slice(-2).join('/') : parts[parts.length - 1];
  console.log('DEBUG - extractRelativePath - using fallback path:', fallbackResult);
  return fallbackResult;
} 