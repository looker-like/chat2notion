import { Project, SyntaxKind } from "ts-morph";

const project = new Project();
const indexFile = project.addSourceFileAtPath("src/content/index.ts");

const callExpr = indexFile.getFirstDescendantByKind(SyntaxKind.CallExpression);
const arrowFunc = callExpr.getFirstDescendantByKind(SyntaxKind.ArrowFunction);
const block = arrowFunc.getBody();

const interfaceDecl = block.getInterfaceOrThrow("PlatformAdapter");
const arrayDecl = block.getVariableStatementOrThrow((s) => s.getText().includes("PLATFORM_ADAPTERS"));
const fallbackDecl = block.getVariableStatementOrThrow((s) => s.getText().includes("FALLBACK_ADAPTER"));

const adaptersFile = project.createSourceFile("src/content/adapters.ts", "", { overwrite: true });

adaptersFile.addInterface({
  ...interfaceDecl.getStructure(),
  isExported: true,
});

adaptersFile.addVariableStatement({
  ...arrayDecl.getStructure(),
  isExported: true,
});

adaptersFile.addVariableStatement({
  ...fallbackDecl.getStructure(),
  isExported: true,
});

interfaceDecl.remove();
arrayDecl.remove();
fallbackDecl.remove();

indexFile.insertStatements(0, `import { PlatformAdapter, PLATFORM_ADAPTERS, FALLBACK_ADAPTER } from "./adapters";\n`);

project.saveSync();
console.log("Refactoring complete");
