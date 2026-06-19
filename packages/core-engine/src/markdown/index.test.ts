import { describe, it, expect } from 'vitest';
import { parseMarkdown } from './index';

describe('Markdown Parser', () => {
  it('parses basic markdown', () => {
    const result = parseMarkdown('# Hello World\n\nThis is a test.');
    expect(result).toContain('<h1');
    expect(result).toContain('Hello World');
    expect(result).toContain('<p>This is a test.</p>');
  });

  it('parses wikilinks', () => {
    const result = parseMarkdown('Check out [[Page Name]].');
    expect(result).toContain('href="#Page_Name"');
    expect(result).toContain('Page Name');
    expect(result).toContain('class="internal new"');
  });

  it('parses callouts', () => {
    const result = parseMarkdown('> [!info] Tip\n> This is an info callout.');
    expect(result).toContain('callout callout-info');
    expect(result).toContain('callout-title');
    expect(result).toContain('Tip');
    expect(result).toContain('This is an info callout.');
  });

  it('parses math', () => {
    const result = parseMarkdown('Inline math $a^2 + b^2 = c^2$ and block math\n\n$$ E = mc^2 $$');
    expect(result).toContain('katex');
  });

  it('parses footnotes', () => {
    const result = parseMarkdown('Here is a footnote reference,[^1]\n\n[^1]: Here is the footnote.');
    expect(result).toContain('user-content-fn-1');
  });

  it('sanitizes dangerous HTML', () => {
    const result = parseMarkdown('<div><script>alert("xss")</script><p>Safe</p></div>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('<p>Safe</p>');
  });

  it('allows safe HTML attributes', () => {
    const result = parseMarkdown('<div class="test" data-src="test.png"></div>');
    expect(result).toContain('class="test"');
  });
});
