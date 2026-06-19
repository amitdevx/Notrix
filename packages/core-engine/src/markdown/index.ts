import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import wikiLinkPlugin from 'remark-wiki-link';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { visit } from 'unist-util-visit';
import { Node } from 'unist';

// Custom plugin for Obsidian callouts
function remarkCallouts() {
  return (tree: Node) => {
    visit(tree, 'blockquote', (node: any) => {
      // Find the first paragraph
      const paragraph = node.children.find((c: any) => c.type === 'paragraph');
      if (paragraph && paragraph.children.length > 0) {
        const textNode = paragraph.children[0];
        if (textNode.type === 'text') {
          const textValue = textNode.value;
          const match = textValue.match(/^\[!(\w+)\]([^\n]*)/);
          if (match) {
            const type = match[1].toLowerCase();
            const title = match[2].trim() || type.charAt(0).toUpperCase() + type.slice(1);
            
            node.data = node.data || {};
            node.data.hProperties = { className: `callout callout-${type}` };
            
            // Replace the text node without the trigger
            textNode.value = textValue.substring(match[0].length).replace(/^\n/, '');
            
            // Prepend a title element
            paragraph.children.unshift({
              type: 'html',
              value: `<div class="callout-title">${title}</div>`
            });
          }
        }
      }
    });
  };
}

// Custom plugin for Obsidian embeds
function remarkEmbeds() {
  return (tree: Node) => {
    visit(tree, 'wikiLink', (node: any) => {
      if (node.isType === 'embed') {
        // Notrix embed
        node.data.hName = 'div';
        node.data.hProperties = { className: 'notrix-embed', 'data-src': node.value };
      }
    });
  };
}

import rehypeRaw from 'rehype-raw';

export function parseMarkdown(content: string): string {
  const schema = {
    ...defaultSchema,
    attributes: {
      ...defaultSchema.attributes,
      div: ['className', 'class', 'data-src'],
      a: ['href', 'className', 'class', 'data-href'],
      code: ['className', 'class'],
      span: ['className', 'class'],
      blockquote: ['className', 'class']
    }
  };

  const file = unified()
    .use(remarkParse)
    .use(wikiLinkPlugin, {
      hrefTemplate: (permalink: string) => `#${permalink}`,
      pageResolver: (name: string) => [name.replace(/ /g, '_')],
      aliasDivider: '|'
    })
    .use(remarkCallouts)
    .use(remarkEmbeds)
    .use(remarkMath)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize, schema)
    .use(rehypeKatex)
    .use(rehypeStringify)
    .processSync(content);
    
  return String(file);
}

export function extractLinks(content: string): string[] {
  const links: string[] = [];
  const tree = unified()
    .use(remarkParse)
    .use(wikiLinkPlugin)
    .parse(content);
    
  visit(tree, 'wikiLink', (node: any) => {
    if (node.value) {
      links.push(node.value);
    }
  });
  
  return links;
}

import remarkFrontmatter from 'remark-frontmatter';
import yaml from 'js-yaml';

export function extractMetadata(content: string): any {
  let metadata: any = {};
  
  try {
    const tree = unified()
      .use(remarkParse)
      .use(remarkFrontmatter, ['yaml'])
      .parse(content);
      
    visit(tree, 'yaml', (node: any) => {
      try {
        metadata = yaml.load(node.value) || {};
      } catch (e) {
        console.error('Failed to parse YAML frontmatter', e);
      }
    });
  } catch (e) {
    console.error('Failed to parse markdown for metadata', e);
  }
  
  return metadata;
}
