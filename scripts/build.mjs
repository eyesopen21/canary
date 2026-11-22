import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const distRoot = fileURLToPath(new URL("../dist/", import.meta.url));
const agents = ["claude-code", "codex", "cursor", "gemini-cli", "opencode"];

function build(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      build(new URL(entry.name + "/", source), new URL(entry.name + "/", target));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      const contents = readFileSync(new URL(entry.name, source), "utf8");
      const code = stripTypeScriptTypes(contents).replace(/(["'])(\.{1,2}\/[^"'\r\n]+)\.ts\1/g, "$1$2.js$1");
      writeFileSync(new URL(entry.name.slice(0, -3) + ".js", target), code);
    }
  }
}

function moduleId(file) {
  return relative(sourceRoot, file).split(sep).join("/").replace(/\.ts$/, ".js");
}

function parseImportBindings(bindings, moduleName) {
  const imported = [];
  const text = bindings.trim();
  if (text.startsWith("* as ")) {
    imported.push({ imported: "*", local: text.slice(5).trim() });
  } else {
    const braceStart = text.indexOf("{");
    const braceEnd = text.lastIndexOf("}");
    let defaultName = "";
    let namedText = "";
    if (braceStart >= 0) {
      if (braceEnd < braceStart || text.slice(braceEnd + 1).trim() !== "") {
        throw new Error(`Unsupported import syntax in ${moduleName}.`);
      }
      defaultName = text.slice(0, braceStart).replace(/,$/, "").trim();
      namedText = text.slice(braceStart + 1, braceEnd).trim();
    } else {
      defaultName = text;
    }
    if (defaultName) imported.push({ imported: "default", local: defaultName });
    if (namedText) {
      for (const item of namedText.split(",")) {
        if (!item.trim()) continue;
        const binding = item.trim();
        if (binding.startsWith("type ")) continue;
        const [importedName, localName] = binding.split(/\s+as\s+/);
        if (!importedName || localName === "") {
          throw new Error(`Unsupported named import syntax in ${moduleName}.`);
        }
        imported.push({ imported: importedName.trim(), local: (localName ?? importedName).trim() });
      }
    }
  }
  if (imported.some(({ local }) => !/^[$A-Z_a-z][$\w]*$/.test(local))) {
    throw new Error(`Unsupported import binding in ${moduleName}.`);
  }
  return imported;
}

const importPattern = /^import\s+([\s\S]*?)\s+from\s+(["'])([^"']+)\2;[ \t]*$/gm;
const exportDeclarationPattern = /^export\s+(?:(?:async)\s+)?(?:function|const|let|var|class)\s+([$A-Z_a-z][$\w]*)/gm;

function makeBundle(entryFile) {
  const modules = new Map();
  const builtins = new Set();

  function collect(file) {
    const id = moduleId(file);
    if (modules.has(id)) return;
    modules.set(id, null);

    const source = stripTypeScriptTypes(readFileSync(file, "utf8"));
    const dependencies = [];
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[3];
      if (specifier.startsWith("node:")) {
        builtins.add(specifier);
        dependencies.push({ match, id: specifier });
        continue;
      }
      if (!specifier.startsWith(".")) {
        throw new Error(`Hook bundle has a non-built-in dependency: ${specifier}`);
      }
      const dependencyFile = resolve(dirname(file), specifier);
      const rootRelative = relative(sourceRoot, dependencyFile);
      if (rootRelative === ".." || rootRelative.startsWith(`..${sep}`) || !dependencyFile.endsWith(".ts")) {
        throw new Error(`Hook bundle import escapes src or is not TypeScript: ${specifier}`);
      }
      const dependencyId = moduleId(dependencyFile);
      dependencies.push({ match, id: dependencyId });
      collect(dependencyFile);
    }

    let transformed = source;
    const exports = [];
    for (const match of source.matchAll(exportDeclarationPattern)) exports.push(match[1]);
    transformed = transformed.replace(exportDeclarationPattern, (statement) => statement.replace(/^export\s+/, ""));

    let importIndex = 0;
    transformed = transformed.replace(importPattern, (_statement, bindings, _quote, specifier) => {
      const dependency = dependencies.find(({ match }) => match[3] === specifier);
      if (!dependency) throw new Error(`Could not resolve an import in ${id}.`);
      const localBindings = parseImportBindings(bindings, id);
      const importedModule = `__imported${importIndex++}`;
      const declarations = localBindings.map(({ imported, local }) => {
        if (imported === "*") return `const ${local} = __require(${JSON.stringify(dependency.id)});`;
        return `const ${local} = ${importedModule}[${JSON.stringify(imported)}];`;
      });
      return `const ${importedModule} = __require(${JSON.stringify(dependency.id)});\n${declarations.join("\n")}`;
    });

    if (/^\s*(?:import|export)\s/m.test(transformed)) {
      throw new Error(`Unsupported ESM syntax in hook bundle module ${id}.`);
    }
    modules.set(id, { code: transformed, exports: [...new Set(exports)] });
  }

  collect(entryFile);

  const builtinImports = [...builtins].sort().map((specifier, index) => ({
    specifier,
    local: `__native${index}`,
  }));
  const externals = builtinImports.map(({ specifier, local }) =>
    `  ${JSON.stringify(specifier)}: { ...${local}, default: ${local}.default ?? ${local} },`).join("\n");
  const externalImports = builtinImports.map(({ specifier, local }) =>
    `import * as ${local} from ${JSON.stringify(specifier)};`).join("\n");

  const factories = [...modules.entries()].map(([id, module]) => {
    if (!module) throw new Error(`Incomplete hook bundle module: ${id}`);
    const assignments = module.exports.length
      ? `\n    Object.assign(__exports, { ${module.exports.join(", ")} });`
      : "";
    return `  ${JSON.stringify(id)}: (__exports, __require) => {\n${module.code
      .split("\n").map((line) => `    ${line}`).join("\n")}${assignments}\n  },`;
  }).join("\n");

  const output = `${externalImports}\n\nconst __externals = {\n${externals}\n};\nconst __factories = {\n${factories}\n};\nconst __cache = Object.create(null);\nfunction __require(id) {\n  if (Object.hasOwn(__externals, id)) return __externals[id];\n  if (Object.hasOwn(__cache, id)) return __cache[id];\n  const factory = __factories[id];\n  if (!factory) throw new Error("Unknown bundled module.");\n  const exports = Object.create(null);\n  __cache[id] = exports;\n  factory(exports, __require);\n  return exports;\n}\n\nconst __entry = __require(${JSON.stringify(moduleId(entryFile))});\n__entry.startHook();\n`;

  if (/(?:\bfrom\s*|\bimport\s*)["']\.{1,2}\//m.test(output)) {
    throw new Error(`Generated hook bundle still contains a relative import: ${entryFile}`);
  }
  return output;
}

build(new URL("../src/", import.meta.url), new URL("../dist/", import.meta.url));

const hooksTarget = resolve(distRoot, "hook");
mkdirSync(hooksTarget, { recursive: true });
for (const agent of agents) {
  const entryFile = resolve(sourceRoot, "hook", `${agent}.ts`);
  writeFileSync(resolve(hooksTarget, `${agent}.mjs`), makeBundle(entryFile));
}
