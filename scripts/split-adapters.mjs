import { Project, SyntaxKind } from "ts-morph";
import * as fs from "fs";

const project = new Project();
const adaptersFile = project.addSourceFileAtPath("src/content/adapters.ts");

if (!fs.existsSync("src/content/adapters")) {
  fs.mkdirSync("src/content/adapters");
}

// 1. Move interfaces and helper functions to a new types file or keep them in adapters.ts
// To avoid circular dependencies, we'll create src/content/adapters/types.ts
const typesFile = project.createSourceFile("src/content/adapters/types.ts", "", { overwrite: true });

// Extract the interface
const platformAdapterInterface = adaptersFile.getInterface("PlatformAdapter");
typesFile.addInterface({ ...platformAdapterInterface.getStructure(), isExported: true });
platformAdapterInterface.remove();

// 2. Extract each adapter from the array
const platformAdaptersVar = adaptersFile.getVariableDeclaration("PLATFORM_ADAPTERS");
const arrayLiteral = platformAdaptersVar.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
const elements = arrayLiteral.getElements();

const names = [];

for (const element of elements) {
  if (element.getKind() === SyntaxKind.ObjectLiteralExpression) {
    const idProp = element.getProperty("id");
    if (idProp && idProp.getKind() === SyntaxKind.PropertyAssignment) {
      const idStr = idProp.getInitializer().getText().replace(/['"]/g, "");
      names.push(idStr);

      const file = project.createSourceFile(`src/content/adapters/${idStr}.ts`, "", { overwrite: true });
      file.addImportDeclaration({
        namedImports: ["PlatformAdapter"],
        moduleSpecifier: "./types",
      });
      file.addVariableStatement({
        isExported: true,
        declarations: [
          {
            name: `${idStr}Adapter`,
            type: "PlatformAdapter",
            initializer: element.getText(),
          },
        ],
      });
    }
  }
}

// 3. Rebuild the adapters.ts file
adaptersFile.addImportDeclaration({
  namedImports: ["PlatformAdapter"],
  moduleSpecifier: "./adapters/types",
});

for (const name of names) {
  adaptersFile.addImportDeclaration({
    namedImports: [`${name}Adapter`],
    moduleSpecifier: `./adapters/${name}`,
  });
}

// Replace the array contents with the imported variables
arrayLiteral.replaceWithText(`[\n  ${names.map(n => `${n}Adapter`).join(",\n  ")}\n]`);

// 4. Update getCurrentAdapter return type and FALLBACK_ADAPTER if needed.
// Wait, FALLBACK_ADAPTER has type `PlatformAdapter`, so the import we added will cover it.

project.saveSync();
console.log("Successfully split adapters.ts into individual files.");
