import { Decoration, DecorationSet, EditorView, MatchDecorator, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { autocompletion, CompletionContext } from '@codemirror/autocomplete';

export const createWikiLinkPlugin = (resolvedLinks: string[]) => {
  const wikiLinkDecorator = new MatchDecorator({
    regexp: /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    decoration: (match) => {
      const isResolved = resolvedLinks.includes(match[1]);
      return Decoration.mark({
        class: `cm-wikilink ${isResolved ? 'cm-wikilink-resolved' : 'cm-wikilink-unresolved'}`,
        attributes: {
          'data-target': match[1]
        }
      });
    }
  });

  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = wikiLinkDecorator.createDeco(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = wikiLinkDecorator.updateDeco(update, this.decorations);
      }
    }
  }, {
    decorations: v => v.decorations
  });
};

export const wikiLinkAutocomplete = (resolvedLinks: string[]) => {
  return autocompletion({
    override: [
      (context: CompletionContext) => {
        const word = context.matchBefore(/\[\[[^\]]*/);
        if (!word) return null;
        
        return {
          from: word.from + 2,
          options: resolvedLinks.map(link => ({
            label: link,
            type: 'text'
          }))
        };
      }
    ]
  });
};

export const wikiLinkTheme = EditorView.theme({
  '.cm-wikilink': {
    textDecoration: 'none',
    cursor: 'pointer',
    fontWeight: '500'
  },
  '.cm-wikilink-resolved': {
    color: '#a855f7' // purple-500
  },
  '.cm-wikilink-unresolved': {
    color: '#9ca3af', // gray-400
    opacity: '0.8'
  },
  '.cm-wikilink:hover': {
    textDecoration: 'underline'
  }
});

export const wikiLinks = (resolvedLinks: string[]) => [
  createWikiLinkPlugin(resolvedLinks),
  wikiLinkAutocomplete(resolvedLinks),
  wikiLinkTheme
];
