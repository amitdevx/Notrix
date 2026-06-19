import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Editor } from './Editor';
import React from 'react';

// Mock CodeMirror since it requires DOM API that JSDOM might not fully support
vi.mock('@codemirror/view', () => {
  const EditorViewMock = class {
    destroy() {}
    dispatch() {}
  };
  (EditorViewMock as any).updateListener = { of: vi.fn(() => ({})) };
  (EditorViewMock as any).domEventHandlers = vi.fn(() => ({}));
  (EditorViewMock as any).theme = vi.fn(() => ({}));
  (EditorViewMock as any).lineWrapping = {};
  
  return {
    EditorView: EditorViewMock,
    lineNumbers: () => [],
    keymap: { of: vi.fn(() => ({})) },
    MatchDecorator: class { createDeco() { return {}; } updateDeco() { return {}; } },
    ViewPlugin: { fromClass: () => [] },
    Decoration: { mark: () => ({}) }
  };
});
vi.mock('@codemirror/state', () => {
  return {
    EditorState: {
      create: vi.fn().mockReturnValue({}),
    },
    Compartment: class {
      of(extensions: any) { return {}; }
      reconfigure(extensions: any) { return {}; }
    }
  };
});
vi.mock('@codemirror/lang-markdown', () => ({
  markdown: () => [],
  markdownLanguage: {}
}));

describe('Editor Component', () => {
  it('should render the editor container', () => {
    const { container } = render(<Editor initialContent="# Hello" onChange={() => {}} />);
    expect(container.firstChild).toBeDefined();
  });
});
