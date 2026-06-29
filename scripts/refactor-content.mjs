import { Project, SyntaxKind } from "ts-morph";

const project = new Project();
const contentFile = project.addSourceFileAtPath("src/content/content.ts");
const markdownFile = project.createSourceFile("src/content/markdown.ts", "", { overwrite: true });

const contentIIFE = contentFile.getFirstDescendantByKind(SyntaxKind.ArrowFunction).getBody();
const markdownFuncNames = [
  "normalizeMarkdown",
  "elementToMarkdown",
  "childrenToMarkdown",
  "blockMarkdown",
  "headingToMarkdown",
  "anchorToMarkdown",
  "normalizeHref",
  "wrapInlineMarkdown",
  "inlineCodeToMarkdown",
  "codeBlockToMarkdown",
  "blockquoteToMarkdown",
  "listToMarkdown",
  "tableToMarkdown",
  "imageToMarkdown",
  "escapeMarkdownLinkText",
  "escapeMarkdownUrl",
];

const extractedMarkdownFuncs = [];
for (const name of markdownFuncNames) {
  const func = contentIIFE.getFunction(name);
  if (func) {
    extractedMarkdownFuncs.push(func.getStructure());
    func.remove();
  }
}

for (const struct of extractedMarkdownFuncs) {
  markdownFile.addFunction({ ...struct, isExported: true });
}

contentFile.insertStatements(0, `import { ${markdownFuncNames.join(", ")} } from "./markdown";\n`);

project.saveSync();
console.log("Refactoring content.ts complete");
