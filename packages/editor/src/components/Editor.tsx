import React, { useEffect, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { keymap } from '@codemirror/view';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { wikiLinks } from '../extensions/wikilink';
import { yCollab } from 'y-codemirror.next';
import * as Y from 'yjs';

export interface EditorProps {
  initialContent?: string;
  onChange?: (content: string) => void;
  onLinkClick?: (target: string) => void;
  mode?: 'source' | 'live';
  resolvedLinks?: string[];
  ytext?: Y.Text;
}

export const Editor: React.FC<EditorProps> = ({ 
  initialContent = '', 
  onChange,
  onLinkClick,
  mode = 'live',
  resolvedLinks = [],
  ytext
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

    const baseTheme = EditorView.theme({
      '&': { backgroundColor: 'transparent', height: '100%' },
      '&.cm-focused': { outline: 'none' },
      '.cm-scroller': { fontFamily: 'var(--font-sans)' },
      '.cm-content': { caretColor: 'var(--color-brand-primary)' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-brand-primary)', borderLeftWidth: '2px' },
      '.cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'var(--color-brand-glow) !important' },
    });

    const livePreviewTheme = EditorView.theme({
      '&': { fontSize: '16px', color: 'var(--color-foreground)' },
      '.cm-content': { 
        maxWidth: '750px', 
        margin: '0 auto', 
        padding: '60px 40px 50vh 40px', // Extra bottom padding for typewriter feel
        lineHeight: '1.7' 
      },
      '.cm-header': { fontWeight: '700', color: 'var(--color-foreground)' },
      '.cm-header-1': { fontSize: '2.25em', marginTop: '1.5em', marginBottom: '0.5em', letterSpacing: '-0.02em' },
      '.cm-header-2': { fontSize: '1.75em', marginTop: '1.2em', marginBottom: '0.4em', letterSpacing: '-0.01em' },
      '.cm-header-3': { fontSize: '1.375em', marginTop: '1em', marginBottom: '0.3em' },
      '.cm-wikilink': { color: 'var(--color-brand-primary)', textDecoration: 'none', cursor: 'pointer', opacity: 0.9 },
      '.cm-wikilink:hover': { opacity: 1, textDecoration: 'underline' }
    });

    const sourceTheme = EditorView.theme({
      '&': { fontSize: '14px', fontFamily: 'var(--font-mono)', color: '#A1A1AA' },
      '.cm-content': { padding: '40px', maxWidth: '800px', margin: '0 auto', paddingBottom: '50vh' },
      '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: '#52525B' },
      '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--color-brand-primary)' },
      '.cm-activeLine': { backgroundColor: 'rgba(255, 255, 255, 0.02)' }
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
        baseTheme,
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        EditorView.lineWrapping,
        clickHandler,
        modeCompartment.of(getModeExtensions(mode)),
        wikilinkCompartment.of(wikiLinks(resolvedLinks)),
        updateListener,
        ...(ytext ? [yCollab(ytext, null)] : [])
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
