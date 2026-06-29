export function normalizeMarkdown(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function elementToMarkdown(node: Node): string {
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

export function childrenToMarkdown(node: Node): string {
  return Array.from(node.childNodes).map(elementToMarkdown).join("");
}

export function blockMarkdown(value: string): string {
  const normalized = normalizeMarkdown(value);
  return normalized ? `\n\n${normalized}\n\n` : "";
}

export function headingToMarkdown(node: HTMLElement, level: number): string {
  const text = normalizeMarkdown(childrenToMarkdown(node));
  return text ? `\n\n${"#".repeat(level)} ${text}\n\n` : "";
}

export function anchorToMarkdown(node: HTMLElement): string {
  const href = node.getAttribute("href") ?? "";
  const text =
    normalizeMarkdown(childrenToMarkdown(node)) ||
    node.getAttribute("aria-label") ||
    node.getAttribute("title") ||
    href;
  const url = normalizeHref(href);
  if (!text || !url) {
    return text;
  }

  return `[${escapeMarkdownLinkText(text)}](${escapeMarkdownUrl(url)})`;
}

export function normalizeHref(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("#") || /^javascript:/i.test(trimmed)) {
    return "";
  }

  try {
    return new URL(trimmed, location.href).href;
  } catch {
    return trimmed;
  }
}

export function wrapInlineMarkdown(node: HTMLElement, marker: string): string {
  const text = childrenToMarkdown(node);
  return text ? `${marker}${text}${marker}` : "";
}

export function inlineCodeToMarkdown(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  const marker = normalized.includes("`") ? "``" : "`";
  return `${marker}${normalized}${marker}`;
}

function extractCodeText(node: Node): string {
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
  
  if (isBr) return "\n";
  if (isBlock) return `${text}\n`;
  return text;
}

export function codeBlockToMarkdown(node: HTMLElement): string {
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

export function blockquoteToMarkdown(node: HTMLElement): string {
  const text = normalizeMarkdown(childrenToMarkdown(node));
  if (!text) {
    return "";
  }

  return `\n\n${text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")}\n\n`;
}

export function listToMarkdown(node: HTMLElement, ordered: boolean): string {
  const items = Array.from(node.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.tagName.toLowerCase() === "li",
  );
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

export function tableToMarkdown(node: HTMLElement): string {
  const rows = Array.from(node.querySelectorAll("tr")).map((row) =>
    Array.from(row.querySelectorAll("th, td")).map((cell) =>
      normalizeMarkdown(elementToMarkdown(cell)).replace(/\|/g, "\\|"),
    ),
  );
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

export function imageToMarkdown(node: HTMLElement): string {
  const src = normalizeHref(node.getAttribute("src") ?? "");
  const alt = node.getAttribute("alt") ?? "";
  return src ? `![${escapeMarkdownLinkText(alt)}](${escapeMarkdownUrl(src)})` : alt;
}

export function escapeMarkdownLinkText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

export function escapeMarkdownUrl(value: string): string {
  return value.replace(/\)/g, "%29");
}
