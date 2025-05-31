import { useEffect, useRef } from 'react';
import { MergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useStore } from '@nanostores/react';
import { getTheme } from './cm-theme';
import { getLanguage } from './languages';
import { themeStore } from '~/lib/stores/theme';

interface DiffEditorProps {
  originalContent: string;
  modifiedContent: string;
  filePath: string;
}

export function DiffEditor({ originalContent, modifiedContent, filePath }: DiffEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mergeViewRef = useRef<MergeView | null>(null);
  const theme = useStore(themeStore);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    // clean up previous instance
    if (mergeViewRef.current) {
      mergeViewRef.current.destroy();
    }

    const setupMergeView = async () => {
      // get language extension based on file path
      const languageExtension = await getLanguage(filePath);
      const editorTheme = getTheme(theme);

      // common extensions for both editors
      const commonExtensions = [editorTheme];

      if (languageExtension) {
        commonExtensions.push(languageExtension);
      }

      commonExtensions.push(EditorView.lineWrapping);

      // create the merge view
      const mergeView = new MergeView({
        a: {
          doc: originalContent,
          extensions: [...commonExtensions, EditorView.editable.of(false), EditorState.readOnly.of(true)],
        },
        b: {
          doc: modifiedContent,
          extensions: commonExtensions,
        },
        parent: containerRef.current!,
        orientation: 'a-b',
        highlightChanges: true,
        gutter: true,
        collapseUnchanged: {
          margin: 3,
          minSize: 4,
        },
      });

      mergeViewRef.current = mergeView;
    };

    setupMergeView();
  }, [originalContent, modifiedContent, filePath, theme]);

  return (
    <div className="diff-editor-container h-full">
      <div ref={containerRef} className="h-full overflow-auto" />
    </div>
  );
}