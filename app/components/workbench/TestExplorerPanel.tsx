import { useStore } from '@nanostores/react';
import { memo, useEffect, useState } from 'react';
import { PanelHeaderButton } from '~/components/ui/PanelHeaderButton';
import { workbenchStore } from '~/lib/stores/workbench';
import type { DebugStep, TestSuiteData } from '~/lib/stores/test';
import '~/styles/components/editor.scss';

// Helper formatter for variable display
const formatVal = (v: unknown) => {
  if (v === undefined) return <span className="text-gray-400">undefined</span>;
  if (v === null) return <span className="text-gray-400">null</span>;
  if (typeof v === 'boolean') return <span className="text-blue-400">{String(v)}</span>;
  if (typeof v === 'number') return <span className="text-green-400">{v}</span>;
  if (typeof v === 'string') return <span className="text-orange-400">"{v}"</span>;
  return <span className="text-purple-400">{JSON.stringify(v)}</span>;
};

interface TestListProps {
  tests: TestSuiteData;
  onSelect: (debugSteps: DebugStep[]) => void;
}

const TestList = memo(({ tests = {}, onSelect }: TestListProps) => (
  <div className="h-full overflow-y-auto text-[13px]">
    {Object.entries(tests).length === 0 && (
      <div className="p-4 text-gray-500 text-center">
        No tests with debug data.
      </div>
    )}
    <ul>
    {Object.entries(tests).map(([name, steps]) => (
        <li
          key={name}
          className="debug-test-item flex justify-between px-4 py-1 hover:bg-[#2a2d2e] cursor-pointer"
          onClick={() => onSelect(Object.values(steps))}
        >
          <span className="test-name flex-1">{name}</span>
          <span className="test-steps text-xs text-[#888]">
            {Object.values(steps).length} steps
          </span>
        </li>
      ))}
    </ul>
  </div>
));

interface DebuggerPanelProps {
  steps: DebugStep[] | null;
  currentStepIndex: number;
  onStepSelect: (index: number) => void;
}

const DebuggerPanel = memo(({ steps, currentStepIndex, onStepSelect }: DebuggerPanelProps) => {
  if (!steps || steps.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-bolt-elements-textSecondary text-sm">
        Select a test to debug
      </div>
    );
  }

  const currentStep = steps[currentStepIndex];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Controls */}
      <div className="flex items-center gap-2 px-3 py-2 bg-bolt-elements-background-depth-1 border-b border-bolt-elements-borderColor text-sm">
        <button 
          className="p-1 hover:bg-bolt-elements-background-depth-3 rounded" 
          onClick={() => onStepSelect(0)}
        >
          ⏮️
        </button>
        <button 
          className="p-1 hover:bg-bolt-elements-background-depth-3 rounded" 
          onClick={() => onStepSelect(Math.max(0, currentStepIndex - 1))}
        >
          ◀️
        </button>
        <div className="flex-1 text-center text-xs">
          Step {currentStepIndex + 1}/{steps.length}
        </div>
        <button 
          className="p-1 hover:bg-bolt-elements-background-depth-3 rounded" 
          onClick={() => onStepSelect(Math.min(steps.length - 1, currentStepIndex + 1))}
        >
          ▶️
        </button>
        <button 
          className="p-1 hover:bg-bolt-elements-background-depth-3 rounded" 
          onClick={() => onStepSelect(steps.length - 1)}
        >
          ⏭️
        </button>
      </div>

      {/* Timeline */}
      <div className="h-[30px] flex items-center px-3 bg-bolt-elements-background-depth-1">
        <div className="w-full h-1 bg-bolt-elements-background-depth-3 flex">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-full cursor-pointer ${
                i === currentStepIndex 
                  ? 'bg-bolt-brand' 
                  : 'bg-transparent hover:bg-bolt-elements-background-depth-2'
              }`}
              onClick={() => onStepSelect(i)}
            />
          ))}
        </div>
      </div>

      {/* Variables */}
      <div className="flex-1 overflow-y-auto">
        {currentStep?.vars ? (
          Object.entries(currentStep.vars).map(([key, value]) => {
            const prevValue = currentStepIndex > 0 && steps[currentStepIndex - 1]?.vars?.[key];
            const hasChanged = prevValue !== undefined && 
              JSON.stringify(prevValue) !== JSON.stringify(value);
            
            return (
              <div
                key={key}
                className={`px-3 py-1 flex justify-between border-b border-bolt-elements-borderColor ${
                  hasChanged ? 'bg-bolt-elements-background-active bg-opacity-20' : ''
                }`}
              >
                <span className="font-mono">{key}</span>
                {formatVal(value)}
              </div>
            );
          })
        ) : (
          <div className="p-4 text-bolt-elements-textSecondary">
            No variables for this step
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {currentStep?.file && (
          <div className="px-3 py-2 border-b border-bolt-elements-borderColor">
            <div className="text-sm text-bolt-elements-textSecondary mb-1">
              File:
            </div>
            <div className="font-mono text-sm truncate">
              {currentStep.file.split('/').pop()}
            </div>
            <div className="text-sm text-bolt-elements-textSecondary mt-2 mb-1">
              Line:
            </div>
            <div className="font-mono text-sm">
              {currentStep.line}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export const TestExplorerPanel = memo(() => {
  // Get state from workbenchStore
  const testSuites = useStore(workbenchStore.testSuites);
  const selectedTestSteps = useStore(workbenchStore.selectedTestSteps);
  const currentStepIndex = useStore(workbenchStore.currentStepIndex);
  const testStatus = useStore(workbenchStore.testStatus);
  const testStats = useStore(workbenchStore.testStats);

  // UI state
  const [view, setView] = useState<'tests' | 'debug'>('tests');

  // Effects
  useEffect(() => {
    // When test steps are selected, switch to debug view
    if (selectedTestSteps && selectedTestSteps.length > 0) {
      setView('debug');
    }
  }, [selectedTestSteps]);

  // Handlers
  const handleRunTests = () => {
    workbenchStore.runTests();
  };

  const handleSelectTest = (suiteName: string, testName: string) => {
    workbenchStore.selectTest(suiteName, testName);
  };

  const handleStepSelect = (index: number) => {
    workbenchStore.goToTestStep(index);
  };

  const handleBackToTests = () => {
    setView('tests');
    workbenchStore.clearTestHighlight();
  };

  return (
    <div className="flex flex-col h-full bg-bolt-elements-background-depth-0">
      {/* Header */}
      <div className="flex items-center px-3 py-2 border-b border-bolt-elements-borderColor">
        {view === 'debug' && (
          <PanelHeaderButton onClick={handleBackToTests} className="mr-2">
            <div className="i-ph:arrow-left" />
            Back to Tests
          </PanelHeaderButton>
        )}
        
        <div className="flex-1 font-medium">
          {view === 'tests' ? 'Test Explorer' : 'Test Debugger'}
        </div>
        
        <PanelHeaderButton 
          onClick={handleRunTests} 
          className="text-sm"
        >
          <div className="i-ph:play" />
          Run Tests
        </PanelHeaderButton>
      </div>

      {/* Status Bar */}
      <div 
        className="flex items-center h-[24px] text-xs px-3" 
        style={{ background: testStatus.color }}
      >
        <div className="flex flex-1 items-center gap-2">
          <span 
            className="w-2 h-2 rounded-full"
            style={{ background: testStatus.color === '#007acc' ? '#3BB446' : testStatus.color }}
          />
          <span className="text-white">{testStatus.text}</span>
        </div>

        <div className="flex gap-4 items-center">
          <span className="text-white opacity-80">{testStats.time}</span>
          <span className="text-white">
            {testStats.passing}/{testStats.total}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {view === 'tests' ? (
          <TestList 
            tests={testSuites} 
            onSelect={handleSelectTest}
          />
        ) : (
          <DebuggerPanel
            steps={selectedTestSteps}
            currentStepIndex={currentStepIndex}
            onStepSelect={handleStepSelect}
          />
        )}
      </div>
    </div>
  );
}); 