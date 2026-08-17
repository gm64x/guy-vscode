import * as path from "node:path";
import { LanguageDefinition, SupportedLanguage } from "./model";
import { pythonAdapter } from "./adapters/python";
import { TreeSitterLanguageParser } from "./treeSitter";
import { javaAdapter } from "./adapters/java";
import { phpAdapter } from "./adapters/php";
import { cAdapter } from "./adapters/c";
import { goAdapter } from "./adapters/go";
import { rustAdapter } from "./adapters/rust";

const definitions: Record<SupportedLanguage, LanguageDefinition> = {
  python: {
    language: "python",
    displayName: "Python",
    vscodeLanguageIds: ["python"],
    extensions: [".py", ".pyw"],
    adapter: pythonAdapter,
  },
  java: {
    language: "java",
    displayName: "Java",
    vscodeLanguageIds: ["java"],
    extensions: [".java"],
    adapter: javaAdapter,
  },
  php: {
    language: "php",
    displayName: "PHP",
    vscodeLanguageIds: ["php"],
    extensions: [".php"],
    adapter: phpAdapter,
  },
  c: {
    language: "c",
    displayName: "C",
    vscodeLanguageIds: ["c"],
    extensions: [".c"],
    adapter: cAdapter,
  },
  go: {
    language: "go",
    displayName: "Go",
    vscodeLanguageIds: ["go"],
    extensions: [".go"],
    adapter: goAdapter,
  },
  rust: {
    language: "rust",
    displayName: "Rust",
    vscodeLanguageIds: ["rust"],
    extensions: [".rs"],
    adapter: rustAdapter,
  },
};

const parserCache = new Map<SupportedLanguage, TreeSitterLanguageParser>();

export function getLanguageDefinition(language: SupportedLanguage): LanguageDefinition {
  const definition = definitions[language];
  if (!definition) {throw new Error(`Unsupported language: ${language}`);}
  return definition;
}

export function getLanguageParser(language: SupportedLanguage): TreeSitterLanguageParser {
  let parser = parserCache.get(language);
  if (!parser) {
    parser = new TreeSitterLanguageParser(getLanguageDefinition(language).adapter);
    parserCache.set(language, parser);
  }
  return parser;
}

export function resolveSupportedLanguage(
  vscodeLanguageId?: string,
  fileName?: string,
): SupportedLanguage | undefined {
  const byId = Object.values(definitions).find(
    (definition) => definition?.vscodeLanguageIds.includes(vscodeLanguageId ?? ""),
  );
  if (byId) {return byId.language;}
  if (vscodeLanguageId && vscodeLanguageId !== "plaintext") {return undefined;}
  const extension = fileName ? path.extname(fileName).toLowerCase() : "";
  return Object.values(definitions).find(
    (definition) => definition?.extensions.includes(extension),
  )?.language;
}

export function getSupportedLanguageNames(): string[] {
  return Object.values(definitions)
    .filter((definition): definition is LanguageDefinition => Boolean(definition))
    .map((definition) => definition.displayName);
}
export type { SupportedLanguage } from "./model";
