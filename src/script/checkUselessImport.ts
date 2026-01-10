import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Carica variabili da .env
dotenv.config();

interface Config {
  targetPath: string;
  excludePatterns: RegExp[];
  ignoreDecorators: boolean;
  ignoreTypes: boolean;
  verbose: boolean;
}

interface ImportItem {
  name: string;
  isType: boolean;
}

interface Imports {
  named: ImportItem[];
  default: string[];
  namespace: string[];
  types: string[];
}

interface UnusedImports {
  named: ImportItem[];
  default: string[];
  namespace: string[];
}

interface AnalysisResult {
  total: number;
  unused: UnusedImports;
  hasUnused: boolean;
}

interface Stats {
  filesWithUnused: number;
  totalUnused: number;
  byType: {
    named: number;
    default: number;
    namespace: number;
  };
}

interface UsageCheckOptions {
  checkDecorators: boolean;
  checkTypes: boolean;
}

const CONFIG: Config = {
  targetPath: path.resolve(process.env.targetPath || "./src/app"),
  excludePatterns: [
    /\.spec\.ts$/,
    /\.stories\.ts$/,
    /node_modules/,
  ],
  ignoreDecorators: process.env.ignoreDecorators === "true",
  ignoreTypes: process.env.ignoreTypes === "true",
  verbose: process.env.verbose === "true",
};

function extractAllImports(tsContent: string): Imports {
  const imports: Imports = {
    named: [],
    default: [],
    namespace: [],
    types: [],
  };

  // Named imports
  const namedRegex = /import\s+(?:type\s+)?{([^}]+)}\s+from\s+['"][^'"]+['"]/g;
  [...tsContent.matchAll(namedRegex)].forEach((match) => {
    const isType = match[0].includes("import type");
    match[1].split(",").forEach((item) => {
      const cleaned = item.trim().split(" as ")[0].trim();
      if (cleaned) {
        imports.named.push({ name: cleaned, isType });
      }
    });
  });

  // Default imports
  const defaultRegex = /import\s+(\w+)\s+from\s+['"][^'"]+['"]/g;
  [...tsContent.matchAll(defaultRegex)].forEach((match) => {
    if (!match[0].includes("{")) {
      imports.default.push(match[1]);
    }
  });

  // Namespace imports
  const namespaceRegex = /import\s+\*\s+as\s+(\w+)\s+from\s+['"][^'"]+['"]/g;
  [...tsContent.matchAll(namespaceRegex)].forEach((match) => {
    imports.namespace.push(match[1]);
  });

  return imports;
}

function removeCommentsAndStrings(content: string): string {
  let cleaned = content.replace(/\/\/.*$/gm, "");
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, "");
  cleaned = cleaned.replace(/`[^`]*`/g, "");
  cleaned = cleaned.replace(/"[^"]*"/g, "");
  cleaned = cleaned.replace(/'[^']*'/g, "");
  return cleaned;
}

function isSymbolUsed(
  symbol: string,
  content: string,
  options: UsageCheckOptions = { checkDecorators: false, checkTypes: false }
): boolean {
  const cleaned = removeCommentsAndStrings(content);

  const usageRegex = new RegExp(`\\b${symbol}\\b`, "g");
  const matches = cleaned.match(usageRegex) || [];

  // Se il simbolo appare solo nell'import (1 volta), non è usato
  if (matches.length <= 1) return false;

  // Check decoratori
  if (options.checkDecorators) {
    const decoratorRegex = new RegExp(
      `@\\w+\\s*\\([^)]*\\b${symbol}\\b`,
      "s"
    );
    if (decoratorRegex.test(cleaned)) return true;
  }

  // Check types
  if (options.checkTypes) {
    const typeRegex = new RegExp(
      `:\\s*${symbol}\\b|<${symbol}\\b|extends\\s+${symbol}\\b|implements\\s+${symbol}\\b`
    );
    if (typeRegex.test(cleaned)) return true;
  }

  // Check interface/class/type definitions
  const interfaceRegex = new RegExp(
    `(interface|class|type)\\s+\\w+.*\\b${symbol}\\b`
  );
  if (interfaceRegex.test(cleaned)) return true;

  return matches.length > 1;
}

function analyzeFile(filePath: string): AnalysisResult {
  const content = fs.readFileSync(filePath, "utf8");
  const imports = extractAllImports(content);

  const unused: UnusedImports = {
    named: [],
    default: [],
    namespace: [],
  };

  const options: UsageCheckOptions = {
    checkDecorators: CONFIG.ignoreDecorators,
    checkTypes: CONFIG.ignoreTypes,
  };

  // Analizza named imports
  imports.named.forEach((imp) => {
    if (!isSymbolUsed(imp.name, content, options)) {
      unused.named.push(imp);
    }
  });

  // Analizza default imports
  imports.default.forEach((imp) => {
    if (!isSymbolUsed(imp, content, options)) {
      unused.default.push(imp);
    }
  });

  // Analizza namespace imports
  imports.namespace.forEach((imp) => {
    const namespaceRegex = new RegExp(`\\b${imp}\\.\\w+`, "g");
    const directRegex = new RegExp(`\\b${imp}\\b`, "g");
    const cleaned = removeCommentsAndStrings(content);

    const namespaceUses = (cleaned.match(namespaceRegex) || []).length;
    const directUses = (cleaned.match(directRegex) || []).length;

    if (directUses <= 1 && namespaceUses === 0) {
      unused.namespace.push(imp);
    }
  });

  return {
    total:
      imports.named.length +
      imports.default.length +
      imports.namespace.length,
    unused,
    hasUnused:
      unused.named.length > 0 ||
      unused.default.length > 0 ||
      unused.namespace.length > 0,
  };
}

function walkFiles(dir: string, files: string[] = []): string[] {
  try {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walkFiles(fullPath, files);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        const shouldExclude = CONFIG.excludePatterns.some((pattern) =>
          pattern.test(fullPath)
        );

        if (!shouldExclude) {
          files.push(fullPath);
        }
      }
    });
  } catch (error) {
    console.error(
      `⚠️  Errore lettura directory ${dir}: ${(error as Error).message}`
    );
  }

  return files;
}

function main(): void {
  console.log("🔍 TypeScript Unused Imports Scanner");
  console.log("━".repeat(60));
  console.log(`📂 Target: ${CONFIG.targetPath}`);
  console.log(`🎯 Decoratori: ${CONFIG.ignoreDecorators ? "✓" : "✗"}`);
  console.log(`📝 Type hints: ${CONFIG.ignoreTypes ? "✓" : "✗"}`);
  console.log("━".repeat(60) + "\n");

  try {
    const files = walkFiles(CONFIG.targetPath);

    if (files.length === 0) {
      console.log("⚠️  Nessun file TypeScript trovato");
      process.exit(0);
    }

    console.log(`📊 File da analizzare: ${files.length}\n`);

    const stats: Stats = {
      filesWithUnused: 0,
      totalUnused: 0,
      byType: { named: 0, default: 0, namespace: 0 },
    };

    files.forEach((file) => {
      try {
        const result = analyzeFile(file);

        if (result.hasUnused || CONFIG.verbose) {
          const relativePath = path.relative(CONFIG.targetPath, file);
          console.log(`📄 ${relativePath}`);

          if (result.unused.named.length > 0) {
            console.log(`   Named imports:`);
            result.unused.named.forEach((imp) => {
              console.log(`     ❌ ${imp.name}${imp.isType ? " (type)" : ""}`);
              stats.byType.named++;
              stats.totalUnused++;
            });
          }

          if (result.unused.default.length > 0) {
            console.log(`   Default imports:`);
            result.unused.default.forEach((imp) => {
              console.log(`     ❌ ${imp}`);
              stats.byType.default++;
              stats.totalUnused++;
            });
          }

          if (result.unused.namespace.length > 0) {
            console.log(`   Namespace imports:`);
            result.unused.namespace.forEach((imp) => {
              console.log(`     ❌ * as ${imp}`);
              stats.byType.namespace++;
              stats.totalUnused++;
            });
          }

          if (result.hasUnused) {
            stats.filesWithUnused++;
          }

          console.log("");
        }
      } catch (error) {
        console.error(
          `⚠️  Errore analisi ${file}: ${(error as Error).message}\n`
        );
      }
    });

    console.log("━".repeat(60));

    if (stats.totalUnused === 0) {
      console.log("✅ Nessun import inutilizzato trovato!");
    } else {
      console.log("📊 Riepilogo:");
      console.log(`   File con import inutilizzati: ${stats.filesWithUnused}`);
      console.log(`   Totale import inutilizzati: ${stats.totalUnused}`);
      console.log(`     • Named: ${stats.byType.named}`);
      console.log(`     • Default: ${stats.byType.default}`);
      console.log(`     • Namespace: ${stats.byType.namespace}`);
    }
  } catch (error) {
    console.error("\n❌ Errore fatale:", (error as Error).message);
    process.exit(1);
  }
}

// Gestione argomenti CLI
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Uso: ts-node ts-unused-imports.ts [opzioni]

Opzioni:
  --verbose, -v     Mostra tutti i file, anche senza import inutilizzati
  --help, -h        Mostra questo messaggio

Configurazione .env:
  targetPath=./src/app              # Percorso da scansionare
  ignoreDecorators=true|false       # Considera decoratori come uso valido
  ignoreTypes=true|false            # Considera type hints come uso valido
  verbose=true|false                # Mostra tutti i file

Esempio .env:
  targetPath=./src/app
  ignoreDecorators=true
  ignoreTypes=true
  verbose=false

Nota: Gli import usati solo in:
  - Decoratori (@Component, @Injectable, ecc.)
  - Type annotations (: Type, <Type>)
possono essere considerati "non usati" se ignoreDecorators o ignoreTypes sono false.
  `);
  process.exit(0);
}

if (args.includes("--verbose") || args.includes("-v")) {
  CONFIG.verbose = true;
}

main();