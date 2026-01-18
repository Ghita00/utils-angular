import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { ConfigUselessImport } from "../interface/ConfigUselessImport";
import { Imports } from "../interface/Imports";
import { UsageCheckOptions } from "../interface/UsageCheckOptions";
import { AnalysisResult } from "../interface/AnalysisResult";
import { UnusedImports } from "../interface/UnusedImports";
import { StatsImport } from "../interface/StatsImport";

dotenv.config();

export class CheckUselessImport {
  private readonly CONFIG: ConfigUselessImport = {
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

  private extractAllImports(tsContent: string): Imports {
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

  private removeCommentsAndStrings(content: string): string {
    let cleaned = content.replace(/\/\/.*$/gm, "");
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, "");
    cleaned = cleaned.replace(/`[^`]*`/g, "");
    cleaned = cleaned.replace(/"[^"]*"/g, "");
    cleaned = cleaned.replace(/'[^']*'/g, "");
    return cleaned;
  }

  private isSymbolUsed(
    symbol: string,
    content: string,
    options: UsageCheckOptions = { checkDecorators: false, checkTypes: false }
  ): boolean {
    const cleaned = this.removeCommentsAndStrings(content);

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

  private analyzeFile(filePath: string): AnalysisResult {
    const content = fs.readFileSync(filePath, "utf8");
    const imports = this.extractAllImports(content);

    const unused: UnusedImports = {
      named: [],
      default: [],
      namespace: [],
    };

    const options: UsageCheckOptions = {
      checkDecorators: this.CONFIG.ignoreDecorators,
      checkTypes: this.CONFIG.ignoreTypes,
    };

    // Analizza named imports
    imports.named.forEach((imp) => {
      if (!this.isSymbolUsed(imp.name, content, options)) {
        unused.named.push(imp);
      }
    });

    // Analizza default imports
    imports.default.forEach((imp) => {
      if (!this.isSymbolUsed(imp, content, options)) {
        unused.default.push(imp);
      }
    });

    // Analizza namespace imports
    imports.namespace.forEach((imp) => {
      const namespaceRegex = new RegExp(`\\b${imp}\\.\\w+`, "g");
      const directRegex = new RegExp(`\\b${imp}\\b`, "g");
      const cleaned = this.removeCommentsAndStrings(content);

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
      unused: unused.named.map(x => x.name),
      used: 0
    };
  }

  private walkFiles(dir: string, files: string[] = []): string[] {
    try {
      fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          this.walkFiles(fullPath, files);
        } else if (entry.isFile() && entry.name.endsWith(".ts")) {
          const shouldExclude = this.CONFIG.excludePatterns.some((pattern) =>
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

  checkUselessImport(): void {
    console.log("🔍 TypeScript Unused Imports Scanner");
    console.log("━".repeat(60));
    console.log(`📂 Target: ${this.CONFIG.targetPath}`);
    console.log(`🎯 Decoratori: ${this.CONFIG.ignoreDecorators ? "✓" : "✗"}`);
    console.log(`📝 Type hints: ${this.CONFIG.ignoreTypes ? "✓" : "✗"}`);
    console.log("━".repeat(60) + "\n");

    try {
      const files = this.walkFiles(this.CONFIG.targetPath);

      if (files.length === 0) {
        console.log("⚠️  Nessun file TypeScript trovato");
        process.exit(0);
      }

      console.log(`📊 File da analizzare: ${files.length}\n`);

      const stats: StatsImport = {
        filesWithUnused: 0,
        totalUnused: 0,
        byType: { named: 0, default: 0, namespace: 0 },
      };

      files.forEach((file) => {
        try {
          const result = this.analyzeFile(file);

          if (result.unused.length || this.CONFIG.verbose) {
            const relativePath = path.relative(this.CONFIG.targetPath, file);
            console.log(`📄 ${relativePath}`);

            if (result.unused.length > 0) {
              console.log(`   Named imports:`);
              result.unused.forEach((imp) => {
                console.log(`     ${imp ? " (type)" : ""}`);
                stats.byType.named++;
                stats.totalUnused++;
              });
            }

            if (result.unused.length > 0) {
              console.log(`   Default imports:`);
              result.unused.forEach((imp) => {
                console.log(`     ❌ ${imp}`);
                stats.byType.default++;
                stats.totalUnused++;
              });
            }

            if (result.unused.length > 0) {
              console.log(`   Namespace imports:`);
              result.unused.forEach((imp) => {
                console.log(`     ❌ * as ${imp}`);
                stats.byType.namespace++;
                stats.totalUnused++;
              });
            }

            if (result) {
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
}