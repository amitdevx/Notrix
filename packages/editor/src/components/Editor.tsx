import React, { useEffect, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { keymap } from '@codemirror/view';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { wikiLinks } from '../extensions/wikilink';

export interface EditorProps {
  initialContent?: string;
  onChange?: (content: string) => void;
  onLinkClick?: (target: string) => void;
  mode?: 'source' | 'live';
  resolvedLinks?: string[];
}

export const Editor: React.FC<EditorProps> = ({ 
  initialContent = '', 
  onChange,
  onLinkClick,
  mode = 'live',
  resolvedLinks = []
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && onChange) {
        onChange(update.state.doc.toString());
      }
    });

    const clickHandler = EditorView.domEventHandlers({
      click(event, view) {
        if (event.target instanceof HTMLElement && event.target.matches('.cm-wikilink')) {
          const target = event.target.getAttribute('data-target');
          if (target && onLinkClick) {
            onLinkClick(target);
            return true;
          }
        }
        return false;
      }
    });

    const livePreviewTheme = EditorView.theme({
      '&': { fontSize: '16px', fontFamily: 'Inter, sans-serif' },
      '.cm-content': { maxWidth: '800px', margin: '0 auto', padding: '40px' },
      '.cm-header': { fontWeight: 'bold' },
      '.cm-header-1': { fontSize: '2.5em', marginTop: '24px' },
      '.cm-header-2': { fontSize: '2em', marginTop: '20px' },
      '.cm-header-3': { fontSize: '1.5em', marginTop: '16px' }
    });

    const sourceTheme = EditorView.theme({
      '&': { fontSize: '14px', fontFamily: 'monospace' },
      '.cm-content': { padding: '20px' }
    });

    const modeCompartment = new Compartment();
    const wikilinkCompartment = new Compartment();
    
    const getModeExtensions = (m: 'live' | 'source') => [
      m === 'source' ? lineNumbers() : [],
      m === 'live' ? livePreviewTheme : sourceTheme
    ];

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        EditorView.lineWrapping,
        clickHandler,
        modeCompartment.of(getModeExtensions(mode)),
        wikilinkCompartment.of(wikiLinks(resolvedLinks)),
        updateListener
      ]
    });

    const view = new EditorView({
      state,
      parent: editorRef.current
    });
    viewRef.current = view;

    // We attach compartments to viewRef for the other useEffect
    (view as any).__modeCompartment = modeCompartment;
    (view as any).__getModeExtensions = getModeExtensions;
    (view as any).__wikilinkCompartment = wikilinkCompartment;

    return () => {
      view.destroy();
    };
  }, []); // Run once on mount

  useEffect(() => {
    const view = viewRef.current as any;
    if (view && view.__modeCompartment && view.__getModeExtensions) {
      view.dispatch({
        effects: view.__modeCompartment.reconfigure(view.__getModeExtensions(mode))
      });
    }
  }, [mode]);

  useEffect(() => {
    const view = viewRef.current as any;
    if (view && view.__wikilinkCompartment) {
      view.dispatch({
        effects: view.__wikilinkCompartment.reconfigure(wikiLinks(resolvedLinks))
      });
    }
  }, [resolvedLinks]);

  return <div ref={editorRef} style={{ height: '100%', width: '100%' }} />;
};
