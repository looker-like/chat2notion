// HTML-to-Markdown conversion for AI chat content.
// Handles the common rich elements found in AI responses: headings, links,
// bold/italic/strikethrough, inline code, code blocks, lists, tables,
// blockquotes, images, and horizontal rules.
export function normalizeMarkdown(value) {
    return value
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
// Recursively convert a DOM node to its Markdown representation.
export function elementToMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent ?? "";
    }
    if (!(node instanceof HTMLElement)) {
        return Array.from(node.childNodes).map(elementToMarkdown).join("");
    }
    const tagName = node.tagName.toLowerCase();
    switch (tagName) {
        case "br":
            return "\n";
        case "a":
            return anchorToMarkdown(node);
        case "strong":
        case "b":
            return wrapInlineMarkdown(node, "**");
        case "em":
        case "i":
            return wrapInlineMarkdown(node, "*");
        case "s":
        case "del":
            return wrapInlineMarkdown(node, "~~");
        case "code":
            return node.closest("pre") ? (node.textContent ?? "") : inlineCodeToMarkdown(node.textContent ?? "");
        case "pre":
            return codeBlockToMarkdown(node);
        case "h1":
        case "h2":
        case "h3":
        case "h4":
        case "h5":
        case "h6":
            return headingToMarkdown(node, Number(tagName.slice(1)));
        case "p":
            return blockMarkdown(childrenToMarkdown(node));
        case "blockquote":
            return blockquoteToMarkdown(node);
        case "ul":
            return listToMarkdown(node, false);
        case "ol":
            return listToMarkdown(node, true);
        case "li":
            return childrenToMarkdown(node);
        case "table":
            return tableToMarkdown(node);
        case "img":
            return imageToMarkdown(node);
        case "hr":
            return "\n\n---\n\n";
        default:
            return childrenToMarkdown(node);
    }
}
// Convert all child nodes of a DOM node to Markdown and join the results.
export function childrenToMarkdown(node) {
    return Array.from(node.childNodes).map(elementToMarkdown).join("");
}
// Wrap a Markdown value with blank lines to treat it as a block element.
export function blockMarkdown(value) {
    const normalized = normalizeMarkdown(value);
    return normalized ? `\n\n${normalized}\n\n` : "";
}
// Convert a heading element to a Markdown heading line.
export function headingToMarkdown(node, level) {
    const text = normalizeMarkdown(childrenToMarkdown(node));
    return text ? `\n\n${"#".repeat(level)} ${text}\n\n` : "";
}
// Convert an anchor element to a Markdown link.
export function anchorToMarkdown(node) {
    const href = node.getAttribute("href") ?? "";
    const text = normalizeMarkdown(childrenToMarkdown(node)) ||
        node.getAttribute("aria-label") ||
        node.getAttribute("title") ||
        href;
    const url = normalizeHref(href);
    if (!text || !url) {
        return text;
    }
    return `[${escapeMarkdownLinkText(text)}](${escapeMarkdownUrl(url)})`;
}
// Normalize a URL href: resolve relative URLs, skip anchors and javascript: URLs.
export function normalizeHref(value) {
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith("#") || /^javascript:/i.test(trimmed)) {
        return "";
    }
    try {
        return new URL(trimmed, location.href).href;
    }
    catch {
        return trimmed;
    }
}
// Wrap inline content with a Markdown marker (e.g., ** for bold).
export function wrapInlineMarkdown(node, marker) {
    const text = childrenToMarkdown(node);
    return text ? `${marker}${text}${marker}` : "";
}
// Convert inline code to Markdown, choosing backtick count based on content.
export function inlineCodeToMarkdown(value) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) {
        return "";
    }
    const marker = normalized.includes("`") ? "``" : "`";
    return `${marker}${normalized}${marker}`;
}
// Recursively extract text from a code block node, preserving line breaks from block elements.
function extractCodeText(node) {
    if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent ?? "";
    }
    if (!(node instanceof HTMLElement)) {
        return Array.from(node.childNodes).map(extractCodeText).join("");
    }
    const tagName = node.tagName.toLowerCase();
    const isBlock = ["div", "p", "li", "tr"].includes(tagName);
    const isBr = tagName === "br";
    const text = Array.from(node.childNodes).map(extractCodeText).join("");
    if (isBr)
        return "\n";
    if (isBlock)
        return `${text}\n`;
    return text;
}
// Convert a <pre> code block to a fenced Markdown code block.
export function codeBlockToMarkdown(node) {
    const code = node.querySelector("code");
    // Extract language from class names like language-xxx or lang-xxx on either <code> or <pre>
    const classList = [...Array.from(code?.classList ?? []), ...Array.from(node.classList)];
    const languageClass = classList.find(c => c.startsWith("language-") || c.startsWith("lang-"));
    const language = languageClass?.replace(/^(language|lang)-/, "") ?? "";
    const targetElement = code ?? node;
    const rawText = extractCodeText(targetElement);
    // Replace multiple newlines caused by block element stacking, but keep intentional newlines.
    // Actually, standardizing on a single newline for block element boundaries is safe here.
    const text = rawText.replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "");
    return `\n\n\`\`\`${language}\n${text}\n\`\`\`\n\n`;
}
// Convert a blockquote element to Markdown blockquote lines.
export function blockquoteToMarkdown(node) {
    const text = normalizeMarkdown(childrenToMarkdown(node));
    if (!text) {
        return "";
    }
    return `\n\n${text
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")}\n\n`;
}
// Convert a list element to Markdown bullet or numbered list.
export function listToMarkdown(node, ordered) {
    const items = Array.from(node.children).filter((child) => child instanceof HTMLElement && child.tagName.toLowerCase() === "li");
    const lines = items.map((item, index) => {
        const marker = ordered ? `${index + 1}.` : "-";
        const text = normalizeMarkdown(childrenToMarkdown(item))
            .split("\n")
            .map((line, lineIndex) => (lineIndex === 0 ? line : `  ${line}`))
            .join("\n");
        return `${marker} ${text}`;
    });
    return lines.length > 0 ? `\n\n${lines.join("\n")}\n\n` : "";
}
// Convert an HTML table to a Markdown table.
export function tableToMarkdown(node) {
    const rows = Array.from(node.querySelectorAll("tr")).map((row) => Array.from(row.querySelectorAll("th, td")).map((cell) => normalizeMarkdown(elementToMarkdown(cell)).replace(/\|/g, "\\|")));
    if (rows.length === 0) {
        return "";
    }
    const columnCount = Math.max(...rows.map((row) => row.length));
    const normalizedRows = rows.map((row) => [...row, ...Array(Math.max(0, columnCount - row.length)).fill("")]);
    const header = normalizedRows[0];
    const separator = Array(columnCount).fill("---");
    const body = normalizedRows.slice(1);
    const markdownRows = [header, separator, ...body].map((row) => `| ${row.join(" | ")} |`);
    return `\n\n${markdownRows.join("\n")}\n\n`;
}
// Convert an image element to a Markdown image link.
export function imageToMarkdown(node) {
    const src = normalizeHref(node.getAttribute("src") ?? "");
    const alt = node.getAttribute("alt") ?? "";
    return src ? `![${escapeMarkdownLinkText(alt)}](${escapeMarkdownUrl(src)})` : alt;
}
// Escape backslashes and closing brackets in Markdown link text.
export function escapeMarkdownLinkText(value) {
    return value.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}
// Escape closing parentheses in Markdown URLs.
export function escapeMarkdownUrl(value) {
    return value.replace(/\)/g, "%29");
}
