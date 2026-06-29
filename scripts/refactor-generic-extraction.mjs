import { Project, SyntaxKind } from "ts-morph";

const project = new Project();
const contentFile = project.addSourceFileAtPath("src/content/content.ts");
const contentIIFE = contentFile.getFirstDescendantByKind(SyntaxKind.ArrowFunction).getBody();

const funcsToRemove = [
  "extractMessageContent",
  "extractDeepSeekMessageContent",
  "extractSelectedContentBlocks",
  "findContentElement",
];

for (const name of funcsToRemove) {
  const func = contentIIFE.getFunction(name);
  if (func) {
    func.remove();
  }
}

// Add the new universal extractMessageContent
contentIIFE.addFunction({
  name: "extractMessageContent",
  parameters: [
    { name: "message", type: "HTMLElement" },
    { name: "adapter", initializer: "getCurrentAdapter()" },
  ],
  returnType: "MessageContent",
  statements: `
    const clone = message.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(\`[\${CONTROL_ATTRIBUTE}], script, style, button, svg\`).forEach((node) => node.remove());

    let elements: HTMLElement[] = [];
    
    // Find all independent content blocks matching the first successful selector
    for (const selector of adapter.contentSelectors) {
      if (clone.matches(selector)) {
        elements = [clone];
        break;
      }
      
      const children = Array.from(clone.querySelectorAll<HTMLElement>(selector)).filter(
        node => !isInsideChat2NotionControl(node)
      );
      
      if (children.length > 0) {
        // Filter out nested matches
        elements = children.filter(child => !children.some(other => other !== child && other.contains(child)));
        break;
      }
    }

    if (elements.length === 0) {
      elements = [clone];
    }

    const parts = elements
      .map((block) => ({
        text: normalizeText(block.innerText || block.textContent || ""),
        markdown: normalizeMarkdown(elementToMarkdown(block)),
      }))
      .filter((block) => block.text || block.markdown);

    if (parts.length === 0) {
      const text = normalizeText(clone.innerText || clone.textContent || "");
      const markdown = normalizeMarkdown(elementToMarkdown(clone)) || text;
      return { text, markdown };
    }

    if (parts.length === 1) {
      return {
        text: normalizeText(parts[0].text || parts[0].markdown),
        markdown: normalizeMarkdown(parts[0].markdown || parts[0].text),
      };
    }

    // For multiple blocks (e.g. ChatGLM, DeepSeek, Doubao, Kimi), treat all but the last as Reasoning / Search Process
    const reasoningBlocks = parts.slice(0, -1);
    const answerBlock = parts[parts.length - 1];
    
    const reasoningText = normalizeText(reasoningBlocks.map((block) => block.text || block.markdown).join("\\n\\n"));
    const answerText = normalizeText(answerBlock.text || answerBlock.markdown);
    const reasoningMarkdown = normalizeMarkdown(
      reasoningBlocks.map((block) => block.markdown || block.text).join("\\n\\n")
    );
    const answerMarkdown = normalizeMarkdown(answerBlock.markdown || answerBlock.text);
    
    const text = normalizeText(["思考内容", reasoningText, "正式回答", answerText].join("\\n\\n"));
    const markdown = normalizeMarkdown(
      ["## 思考内容", reasoningMarkdown, "---", "## 正式回答", answerMarkdown].join("\\n\\n")
    );

    return { text, markdown };
  `,
});

project.saveSync();
console.log("Replaced extraction logic with universal multi-block reasoning support.");
