import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { ConfigCheckUselessCSS } from "../interface/ConfigCheckUselessCss";
import { Patterns } from "../interface/Patterns";
import { IgnorePrefixes } from "../interface/IgnorePrefixes";
import { AnalysisResult } from "../interface/AnalysisResult";
import { ScanStats } from "../interface/ScanStats";

// Carica variabili da .env
dotenv.config();

export class CheckUselessCss {
  private readonly CONFIG: ConfigCheckUselessCSS = {
    targetPath: path.resolve(process.env.targetPath || ""),
    ignorePatterns: {
      angularMaterial: process.env.ignoreAngularMaterial === "true",
      agGrid: process.env.ignoreAgGrid === "true",
      bootstrap: process.env.ignoreBootstrap === "true",
    },
    extensions: {
      css: ".component.css",
      html: ".component.html",
      scss: ".component.scss",
    },
    verbose: process.env.verbose === "true",
  };

  private readonly PATTERNS: Patterns = {
    cssComments: /\/\*[\s\S]*?\*\//g,
    ngDeep: /::ng-deep[\s\S]*?{[\s\S]*?}/g,
    cssClass: /\.([a-zA-Z0-9_-]+)\s*[{,]/g,
    htmlClass: /class\s*=\s*["']([^"']+)["']/g,
    ngClass: /\[ngClass\]\s*=\s*["']([^"']+)["']/g,
    ngClassObject: /\[ngClass\]\s*=\s*["']?\{([^}]+)\}/g,
    quotedString: /['"`]([^'"`]+)['"`]/g,
    interpolation: /\{\{[^}]+\}\}/g,
    dynamicClass: /\[class\.[^\]]+\]/g,
  };

  private readonly IGNORE_PREFIXES: IgnorePrefixes = {
    angularMaterial: ["mat-", "cdk-", "mdc-"],
    agGrid: ["ag-", "ag-theme-"],
    bootstrap: [
      "btn-",
      "col-",
      "row-",
      "d-",
      "p-",
      "m-",
      "bg-",
      "text-",
      "border-",
    ],
  };

  private extractCssClasses(cssContent: string): Set<string> {
    let cleaned = cssContent
      .replace(this.PATTERNS.cssComments, "")
      .replace(this.PATTERNS.ngDeep, "");

    const classes = new Set<string>();
    const matches = [...cleaned.matchAll(this.PATTERNS.cssClass)];

    matches.forEach((m) => {
      const className = m[1];
      if (!className.includes(":") && !className.includes("(")) {
        classes.add(className);
      }
    });

    return classes;
  }

  private extractHtmlClasses(htmlContent: string): Set<string> {
    const classes = new Set<string>();

    [...htmlContent.matchAll(this.PATTERNS.htmlClass)].forEach((match) => {
      match[1]
        .split(/\s+/)
        .filter(Boolean)
        .forEach((cls) => {
          if (!cls.includes("{{") && !cls.includes("}}")) {
            classes.add(cls);
          }
        });
    });

    const dynamicMatches =
      htmlContent.match(/\[class\.([a-zA-Z0-9_-]+)\]/g) || [];
    dynamicMatches.forEach((m) => {
      const classMatch = m.match(/\[class\.([a-zA-Z0-9_-]+)\]/);
      if (classMatch) {
        const className = classMatch[1];
        classes.add(className);
      }
    });

    return classes;
  }

  private extractNgClassClasses(htmlContent: string): Set<string> {
    const classes = new Set<string>();

    [...htmlContent.matchAll(this.PATTERNS.ngClass)].forEach((m) => {
      const expr = m[1];

      [...expr.matchAll(this.PATTERNS.quotedString)].forEach((sm) => {
        sm[1]
          .split(/\s+/)
          .filter(Boolean)
          .forEach((c) => classes.add(c));
      });

      const arrayMatch = expr.match(/\[([^\]]+)\]/);
      if (arrayMatch) {
        arrayMatch[1]
          .split(",")
          .map((c) => c.replace(/['"`\s]/g, ""))
          .filter(Boolean)
          .forEach((c) => classes.add(c));
      }
    });

    [...htmlContent.matchAll(this.PATTERNS.ngClassObject)].forEach((m) => {
      m[1].split(",").forEach((pair) => {
        const key = pair.split(":")[0].trim().replace(/['"`]/g, "");
        if (key && !key.includes("(") && !key.includes("[")) {
          classes.add(key);
        }
      });
    });

    return classes;
  }

  private shouldIgnoreClass(className: string): boolean {
    for (const [key, enabled] of Object.entries(this.CONFIG.ignorePatterns)) {
      if (enabled && this.IGNORE_PREFIXES[key as keyof IgnorePrefixes]) {
        const prefixes = this.IGNORE_PREFIXES[key as keyof IgnorePrefixes];
        if (prefixes.some((prefix) => className.startsWith(prefix))) {
          return true;
        }
      }
    }
    return false;
  }

  private analyzeComponent(cssPath: string, htmlPath: string): AnalysisResult {
    const css = fs.readFileSync(cssPath, "utf8");
    const html = fs.readFileSync(htmlPath, "utf8");

    const cssClasses = this.extractCssClasses(css);
    const htmlClasses = this.extractHtmlClasses(html);
    const ngClassClasses = this.extractNgClassClasses(html);

    const usedClasses = new Set([...htmlClasses, ...ngClassClasses]);

    const unused = [...cssClasses].filter(
      (c) => !usedClasses.has(c) && !this.shouldIgnoreClass(c)
    );

    return {
      total: cssClasses.size,
      used: usedClasses.size,
      unused: unused,
    };
  }

  private scanFolder(
    folderPath: string,
    stats: ScanStats = { files: 0, totalUnused: 0 }
  ): ScanStats {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });

    entries.forEach((entry) => {
      const fullPath = path.join(folderPath, entry.name);

      if (entry.isDirectory()) {
        this.scanFolder(fullPath, stats);
      } else if (entry.isFile()) {
        const cssMatch = entry.name.match(/(.+)\.component\.(css|scss)$/);
        if (!cssMatch) return;

        const [, name] = cssMatch;
        const htmlPath = path.join(folderPath, `${name}.component.html`);

        if (!fs.existsSync(htmlPath)) return;

        stats.files++;
        const result = this.analyzeComponent(fullPath, htmlPath);

        if (result.unused.length > 0 || this.CONFIG.verbose) {
          const relativePath = path.relative(this.CONFIG.targetPath, folderPath);
          console.log(`\n${relativePath}/${name}`);
          console.log(
            `   CSS: ${result.total} | Used: ${result.used} | Not used: ${result.unused.length}`
          );

          if (result.unused.length > 0) {
            result.unused.forEach((c) => console.log(`   .${c}`));
            stats.totalUnused += result.unused.length;
          }
        }
      }
    });

    return stats;
  }

  scannerUselessCss(): void {
    console.log("CSS Unused Classes Scanner");
    console.log("━".repeat(50));
    console.log(`Target: ${this.CONFIG.targetPath}`);
    console.log(
      `Ignore: ${Object.entries(this.CONFIG.ignorePatterns)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(", ") || "Nothing"
      }`
    );
    console.log("━".repeat(50));

    try {
      const stats = this.scanFolder(this.CONFIG.targetPath);

      console.log("\n" + "━".repeat(50));
      console.log("Scan completed!");
      console.log(`Component used: ${stats.files}`);
      console.log(`CSS class unused: ${stats.totalUnused}`);
    } catch (error) {
      console.error(
        "\nError during scan",
        (error as Error).message
      );
      process.exit(1);
    }
  }
}
