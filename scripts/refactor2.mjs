import { Project, SyntaxKind } from "ts-morph";

const project = new Project();
const contentFile = project.addSourceFileAtPath("src/content/content.ts");
const backgroundFile = project.addSourceFileAtPath("src/background/background.ts");

const markdownFile = project.createSourceFile("src/content/markdown.ts", "", { overwrite: true });
const schemaFile = project.createSourceFile("src/background/schema.ts", "", { overwrite: true });
const payloadFile = project.createSourceFile("src/background/payload.ts", "", { overwrite: true });

// --- content.ts refactoring ---
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

// --- background.ts refactoring ---
const schemaFuncNames = [
  "extractDataSourceId",
  "extractProperties",
  "validateRequiredProperties",
  "getRequiredPropertyIssues",
  "createMissingPropertiesPatch",
  "createRequiredPropertiesSchema",
  "createRequiredPropertySchema",
  "getMissingAiSelectOptions",
  "createAiSelectPropertySchema",
  "describeTargetSetup",
];

const extractedSchemaFuncs = [];
for (const name of schemaFuncNames) {
  const func = backgroundFile.getFunction(name);
  if (func) {
    extractedSchemaFuncs.push(func.getStructure());
    func.remove();
  }
}

for (const struct of extractedSchemaFuncs) {
  schemaFile.addFunction({ ...struct, isExported: true });
}
backgroundFile.insertStatements(0, `import { ${schemaFuncNames.join(", ")} } from "./schema";\n`);

const payloadFuncNames = [
  "createPageMarkdownBackup",
  "normalizeMarkdownBackup",
  "canUseFullPropertyValue",
  "toPropertyValue",
  "splitMarkdownForNotion",
  "splitMarkdownUnits",
  "splitTextByByteLimit",
  "flushMarkdownUnit",
  "flushMarkdownChunk",
  "assertNotionRequestFits",
  "getByteLength",
];

// we also need to move some constants to payloadFile if they are used there.
// For simplicity, let's just move functions.
const extractedPayloadFuncs = [];
for (const name of payloadFuncNames) {
  const func = backgroundFile.getFunction(name);
  if (func) {
    extractedPayloadFuncs.push(func.getStructure());
    func.remove();
  }
}

for (const struct of extractedPayloadFuncs) {
  payloadFile.addFunction({ ...struct, isExported: true });
}
backgroundFile.insertStatements(0, `import { ${payloadFuncNames.join(", ")} } from "./payload";\n`);

project.saveSync();
console.log("Refactoring part 2 complete");
