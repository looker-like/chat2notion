// Unit tests for src/content/markdown.ts
// Uses jsdom to provide a browser DOM environment for element-based conversion.

import { JSDOM } from "jsdom";
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMarkdown } from "./markdown.js";

// --- jsdom setup ---

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).document = dom.window.document;
(globalThis as unknown as Record<string, unknown>).Element = dom.window.Element;
(globalThis as unknown as Record<string, unknown>).HTMLElement = dom.window.HTMLElement;
(globalThis as unknown as Record<string, unknown>).Node = dom.window.Node;
(globalThis as unknown as Record<string, unknown>).location = dom.window.location;

// Re-import after globals are set so instanceof checks work.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const {
  elementToMarkdown,
  childrenToMarkdown,
  blockMarkdown,
  headingToMarkdown,
  anchorToMarkdown,
  normalizeHref,
  wrapInlineMarkdown,
  inlineCodeToMarkdown,
  codeBlockToMarkdown,
  blockquoteToMarkdown,
  listToMarkdown,
  tableToMarkdown,
  imageToMarkdown,
  escapeMarkdownLinkText,
  escapeMarkdownUrl,
} = await import("./markdown.js");

// --- Helpers ---

function el(tag: string, attrs: Record<string, unknown> = {}, ...children: unknown[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "textContent") {
      node.textContent = value as string;
    } else if (key === "class") {
      (value as string).split(" ").forEach((c: string) => node.classList.add(c));
    } else if (key === "html") {
      node.innerHTML = value as string;
    } else {
      node.setAttribute(key, value as string);
    }
  }
  for (const child of children) {
    if (typeof child === "string") {
      node.appendChild(document.createTextNode(child));
    } else if (child) {
      node.appendChild(child as Node);
    }
  }
  return node;
}

function text(value: string): Text {
  return document.createTextNode(value);
}

// --- normalizeMarkdown ---

test("normalizeMarkdown replaces non-breaking spaces", () => {
  assert.equal(normalizeMarkdown("hello world"), "hello world");
});

test("normalizeMarkdown collapses trailing whitespace on lines", () => {
  assert.equal(normalizeMarkdown("hello   \nworld"), "hello\nworld");
});

test("normalizeMarkdown collapses 3+ newlines to 2", () => {
  assert.equal(normalizeMarkdown("a\n\n\n\nb"), "a\n\nb");
});

test("normalizeMarkdown trims leading and trailing whitespace", () => {
  assert.equal(normalizeMarkdown("  hello  "), "hello");
});

// --- escapeMarkdownLinkText ---

test("escapeMarkdownLinkText escapes backslashes", () => {
  assert.equal(escapeMarkdownLinkText("a\\b"), "a\\\\b");
});

test("escapeMarkdownLinkText escapes closing brackets", () => {
  assert.equal(escapeMarkdownLinkText("a]b"), "a\\]b");
});

test("escapeMarkdownLinkText escapes both backslashes and brackets", () => {
  assert.equal(escapeMarkdownLinkText("path\\to[file]"), "path\\\\to[file\\]");
});

// --- escapeMarkdownUrl ---

test("escapeMarkdownUrl encodes closing parentheses", () => {
  assert.equal(escapeMarkdownUrl("https://example.com/a(b)"), "https://example.com/a(b%29");
});

test("escapeMarkdownUrl passes through regular URLs unchanged", () => {
  assert.equal(escapeMarkdownUrl("https://example.com/path"), "https://example.com/path");
});

// --- inlineCodeToMarkdown ---

test("inlineCodeToMarkdown wraps single backticks for plain text", () => {
  assert.equal(inlineCodeToMarkdown("hello"), "`hello`");
});

test("inlineCodeToMarkdown uses double backticks when content contains backtick", () => {
  // trailing space is not added; trim() removes it
  assert.equal(inlineCodeToMarkdown("use `x`"), "``use `x```");
});

test("inlineCodeToMarkdown returns empty string for empty input", () => {
  assert.equal(inlineCodeToMarkdown(""), "");
});

test("inlineCodeToMarkdown collapses whitespace", () => {
  assert.equal(inlineCodeToMarkdown("  hello  world  "), "`hello world`");
});

// --- wrapInlineMarkdown ---

test("wrapInlineMarkdown wraps text with marker", () => {
  const node = el("span", {}, "bold text");
  assert.equal(wrapInlineMarkdown(node, "**"), "**bold text**");
});

test("wrapInlineMarkdown returns empty string for empty content", () => {
  const node = el("span");
  assert.equal(wrapInlineMarkdown(node, "**"), "");
});

// --- normalizeHref ---

test("normalizeHref returns empty string for empty input", () => {
  assert.equal(normalizeHref(""), "");
});

test("normalizeHref skips anchor-only URLs", () => {
  assert.equal(normalizeHref("#section"), "");
});

test("normalizeHref skips javascript: URLs", () => {
  assert.equal(normalizeHref("javascript:alert(1)"), "");
});

test("normalizeHref resolves relative URLs", () => {
  const result = normalizeHref("/path/to/page");
  assert.ok(result.endsWith("/path/to/page"), `Expected path-ending URL, got: ${result}`);
  assert.ok(!result.startsWith("//"), `Expected absolute URL, got: ${result}`);
});

test("normalizeHref passes through absolute URLs", () => {
  assert.equal(normalizeHref("https://example.com/page"), "https://example.com/page");
});

// --- blockMarkdown ---

test("blockMarkdown wraps text with blank lines", () => {
  assert.equal(blockMarkdown("hello"), "\n\nhello\n\n");
});

test("blockMarkdown returns empty string for empty input", () => {
  assert.equal(blockMarkdown(""), "");
});

test("blockMarkdown normalizes text before wrapping", () => {
  assert.equal(blockMarkdown("  hello  "), "\n\nhello\n\n");
});

// --- headingToMarkdown ---

test("headingToMarkdown produces h1 with correct marker", () => {
  const node = el("h1", {}, "Title");
  assert.equal(headingToMarkdown(node, 1), "\n\n# Title\n\n");
});

test("headingToMarkdown produces h2 with correct marker", () => {
  const node = el("h2", {}, "Subtitle");
  assert.equal(headingToMarkdown(node, 2), "\n\n## Subtitle\n\n");
});

test("headingToMarkdown returns empty string for empty heading", () => {
  const node = el("h3");
  assert.equal(headingToMarkdown(node, 3), "");
});

// --- anchorToMarkdown ---

test("anchorToMarkdown produces a standard link", () => {
  const node = el("a", { href: "https://example.com" }, "Example");
  // jsdom normalizes URLs with a trailing slash
  assert.equal(anchorToMarkdown(node), "[Example](https://example.com/)");
});

test("anchorToMarkdown uses aria-label when text is empty", () => {
  const node = el("a", { href: "https://example.com", "aria-label": "Go to example" });
  assert.equal(anchorToMarkdown(node), "[Go to example](https://example.com/)");
});

test("anchorToMarkdown uses title when no text or aria-label", () => {
  const node = el("a", { href: "https://example.com", title: "Example site" });
  assert.equal(anchorToMarkdown(node), "[Example site](https://example.com/)");
});

test("anchorToMarkdown falls back to href when no text or label", () => {
  const node = el("a", { href: "https://example.com" });
  // text uses the raw href, URL uses the normalized href (jsdom adds trailing /)
  assert.equal(anchorToMarkdown(node), "[https://example.com](https://example.com/)");
});

test("anchorToMarkdown returns text when href normalizes to empty", () => {
  // When href is empty, normalizeHref returns "" — the text is preserved
  const node = el("a", { href: "" }, "click");
  assert.equal(anchorToMarkdown(node), "click");
});

test("anchorToMarkdown returns text when URL is empty after normalization", () => {
  const node = el("a", { href: "#anchor" }, "Jump");
  assert.equal(anchorToMarkdown(node), "Jump");
});

// --- elementToMarkdown: inline elements ---

test("elementToMarkdown converts <br> to newline", () => {
  const node = el("div", {}, el("span", {}, "line1"), el("br"), el("span", {}, "line2"));
  assert.equal(elementToMarkdown(node), "line1\nline2");
});

test("elementToMarkdown converts <strong> to bold", () => {
  assert.equal(elementToMarkdown(el("strong", {}, "bold")), "**bold**");
});

test("elementToMarkdown converts <b> to bold", () => {
  assert.equal(elementToMarkdown(el("b", {}, "bold")), "**bold**");
});

test("elementToMarkdown converts <em> to italic", () => {
  assert.equal(elementToMarkdown(el("em", {}, "italic")), "*italic*");
});

test("elementToMarkdown converts <i> to italic", () => {
  assert.equal(elementToMarkdown(el("i", {}, "italic")), "*italic*");
});

test("elementToMarkdown converts <s> to strikethrough", () => {
  assert.equal(elementToMarkdown(el("s", {}, "removed")), "~~removed~~");
});

test("elementToMarkdown converts <del> to strikethrough", () => {
  assert.equal(elementToMarkdown(el("del", {}, "removed")), "~~removed~~");
});

test("elementToMarkdown converts inline <code> to backtick code", () => {
  assert.equal(elementToMarkdown(el("code", {}, "x = 1")), "`x = 1`");
});

test("elementToMarkdown handles text nodes directly", () => {
  assert.equal(elementToMarkdown(text("hello")), "hello");
});

test("elementToMarkdown recurses into unknown elements", () => {
  const node = el("span", {}, el("strong", {}, "inner"));
  assert.equal(elementToMarkdown(node), "**inner**");
});

// --- elementToMarkdown: block elements ---

test("elementToMarkdown converts <p> to block paragraph", () => {
  assert.equal(elementToMarkdown(el("p", {}, "paragraph")), "\n\nparagraph\n\n");
});

test("elementToMarkdown converts <h1> through <h6>", () => {
  for (let level = 1; level <= 6; level++) {
    const node = el(`h${level}`, {}, "heading");
    assert.equal(elementToMarkdown(node), `\n\n${"#".repeat(level)} heading\n\n`);
  }
});

test("elementToMarkdown converts <blockquote> to blockquote lines", () => {
  const node = el("blockquote", {}, "quoted text");
  assert.equal(elementToMarkdown(node), "\n\n> quoted text\n\n");
});

// --- childrenToMarkdown ---

test("childrenToMarkdown joins child results", () => {
  const node = el("p", {}, el("strong", {}, "bold"), " and ", el("em", {}, "italic"));
  assert.equal(childrenToMarkdown(node), "**bold** and *italic*");
});

// --- inlineCodeToMarkdown edge cases ---

test("inlineCodeToMarkdown handles content with multiple backticks", () => {
  assert.equal(inlineCodeToMarkdown("a ` b ` c"), "``a ` b ` c``");
});

test("inlineCodeToMarkdown handles whitespace-only input", () => {
  assert.equal(inlineCodeToMarkdown("   "), "");
});

// --- blockquoteToMarkdown ---

test("blockquoteToMarkdown prefixes each line with >", () => {
  const node = el("blockquote", {}, text("line1"), text("\n"), text("line2"));
  assert.equal(blockquoteToMarkdown(node), "\n\n> line1\n> line2\n\n");
});

test("blockquoteToMarkdown returns empty string for empty content", () => {
  const node = el("blockquote");
  assert.equal(blockquoteToMarkdown(node), "");
});

// --- listToMarkdown ---

test("listToMarkdown converts unordered list", () => {
  const node = el("ul", {}, el("li", {}, "a"), el("li", {}, "b"), el("li", {}, "c"));
  assert.equal(listToMarkdown(node, false), "\n\n- a\n- b\n- c\n\n");
});

test("listToMarkdown converts ordered list", () => {
  const node = el("ol", {}, el("li", {}, "first"), el("li", {}, "second"));
  assert.equal(listToMarkdown(node, true), "\n\n1. first\n2. second\n\n");
});

test("listToMarkdown returns empty string for empty list", () => {
  const node = el("ul");
  assert.equal(listToMarkdown(node, false), "");
});

test("listToMarkdown indents multiline list items", () => {
  const node = el("ul", {}, el("li", {}, "line1", el("br"), "line2"));
  const result = listToMarkdown(node, false);
  assert.ok(result.includes("- line1\n  line2"), `Expected indented continuation, got: ${result}`);
});

// --- tableToMarkdown ---

test("tableToMarkdown converts a simple table", () => {
  const table = el("table", {},
    el("tr", {}, el("th", {}, "A"), el("th", {}, "B")),
    el("tr", {}, el("td", {}, "1"), el("td", {}, "2")),
  );
  const result = tableToMarkdown(table);
  assert.ok(result.includes("| A | B |"), `Header missing: ${result}`);
  assert.ok(result.includes("| --- | --- |"), `Separator missing: ${result}`);
  assert.ok(result.includes("| 1 | 2 |"), `Body missing: ${result}`);
});

test("tableToMarkdown escapes pipe characters in cells", () => {
  const table = el("table", {},
    el("tr", {}, el("td", {}, "a | b")),
  );
  const result = tableToMarkdown(table);
  assert.ok(result.includes("a \\| b"), `Pipe not escaped: ${result}`);
});

test("tableToMarkdown returns empty string for empty table", () => {
  const table = el("table");
  assert.equal(tableToMarkdown(table), "");
});

// --- imageToMarkdown ---

test("imageToMarkdown produces image link with src and alt", () => {
  const node = el("img", { src: "https://example.com/img.png", alt: "An image" });
  assert.equal(imageToMarkdown(node), "![An image](https://example.com/img.png)");
});

test("imageToMarkdown returns alt text when src resolves to empty href", () => {
  // normalizeHref returns empty for "#anchor" URLs
  const node = el("img", { src: "#anchor", alt: "No src" });
  assert.equal(imageToMarkdown(node), "No src");
});

// --- codeBlockToMarkdown ---

test("codeBlockToMarkdown produces fenced code block", () => {
  const pre = el("pre", {}, el("code", {}, "const x = 1;"));
  assert.equal(codeBlockToMarkdown(pre), "\n\n```\nconst x = 1;\n```\n\n");
});

test("codeBlockToMarkdown extracts language from class", () => {
  const pre = el("pre", { class: "language-python" }, el("code", { class: "language-python" }, "print(1)"));
  assert.equal(codeBlockToMarkdown(pre), "\n\n```python\nprint(1)\n```\n\n");
});

test("codeBlockToMarkdown falls back to pre content when no <code>", () => {
  const pre = el("pre", {}, "raw code");
  assert.equal(codeBlockToMarkdown(pre), "\n\n```\nraw code\n```\n\n");
});
