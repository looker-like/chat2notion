import { Project, SyntaxKind } from "ts-morph";

const project = new Project();
const backgroundFile = project.addSourceFileAtPath("src/background/background.ts");
const typesFile = project.createSourceFile("src/background/types.ts", "", { overwrite: true });

// Move all types/interfaces
const interfaces = backgroundFile.getInterfaces();
for (const iface of interfaces) {
  typesFile.addInterface({ ...iface.getStructure(), isExported: true });
  iface.remove();
}

const typeAliases = backgroundFile.getTypeAliases();
for (const typeAlias of typeAliases) {
  typesFile.addTypeAlias({ ...typeAlias.getStructure(), isExported: true });
  typeAlias.remove();
}

// Add import for types
const exportedTypeNames = [...typesFile.getInterfaces(), ...typesFile.getTypeAliases()].map((t) => t.getName());
if (exportedTypeNames.length > 0) {
  backgroundFile.insertStatements(0, `import { ${exportedTypeNames.join(", ")} } from "./types";\n`);
}

// Now move pure parsing/splitting functions to payload.ts?
// To avoid deep refactoring breaking, let's just move types for now and see line counts.

project.saveSync();
console.log("Refactored types out of background.ts");
