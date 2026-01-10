import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Carica variabili da .env
dotenv.config();

interface Config {
  targetPath: string;
  ignorePatterns: {
    angularMaterial: boolean;
    agGrid: boolean;
    bootstrap: boolean;
  };
  extensions: {
    css: string;
    html: string;
    scss: string;
  };
  verbose: boolean;
}

interface AnalysisResult {
  total: number;
  used: number;
  unused: string[];
}

interface ScanStats {
  files: number;
  totalUnused: number;
}

interface Patterns {
  cssComments: RegExp;
  ngDeep: RegExp;
  cssClass: RegExp;
  htmlClass: RegExp;
  ngClass: RegExp;
  ngClassObject: RegExp;
  quotedString: RegExp;
  interpolation: RegExp;
  dynamicClass: RegExp;
}

interface IgnorePrefixes {
  angularMaterial: string[];
  agGrid: string[];
  bootstrap: string[];
}

const CONFIG: Config = {
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

const PATTERNS: Patterns = {
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

const IGNORE_PREFIXES: IgnorePrefixes = {
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

function extractCssClasses(cssContent: string): Set<string> {
  let cleaned = cssContent
    .replace(PATTERNS.cssComments, "")
    .replace(PATTERNS.ngDeep, "");

  const classes = new Set<string>();
  const matches = [...cleaned.matchAll(PATTERNS.cssClass)];

  matches.forEach((m) => {
    const className = m[1];
    if (!className.includes(":") && !className.includes("(")) {
      classes.add(className);
    }
  });

  return classes;
}

function extractHtmlClasses(htmlContent: string): Set<string> {
  const classes = new Set<string>();

  [...htmlContent.matchAll(PATTERNS.htmlClass)].forEach((match) => {
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

function extractNgClassClasses(htmlContent: string): Set<string> {
  const classes = new Set<string>();

  [...htmlContent.matchAll(PATTERNS.ngClass)].forEach((m) => {
    const expr = m[1];

    [...expr.matchAll(PATTERNS.quotedString)].forEach((sm) => {
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

  [...htmlContent.matchAll(PATTERNS.ngClassObject)].forEach((m) => {
    m[1].split(",").forEach((pair) => {
      const key = pair.split(":")[0].trim().replace(/['"`]/g, "");
      if (key && !key.includes("(") && !key.includes("[")) {
        classes.add(key);
      }
    });
  });

  return classes;
}

function shouldIgnoreClass(className: string): boolean {
  for (const [key, enabled] of Object.entries(CONFIG.ignorePatterns)) {
    if (enabled && IGNORE_PREFIXES[key as keyof IgnorePrefixes]) {
      const prefixes = IGNORE_PREFIXES[key as keyof IgnorePrefixes];
      if (prefixes.some((prefix) => className.startsWith(prefix))) {
        return true;
      }
    }
  }
  return false;
}

function analyzeComponent(cssPath: string, htmlPath: string): AnalysisResult {
  const css = fs.readFileSync(cssPath, "utf8");
  const html = fs.readFileSync(htmlPath, "utf8");

  const cssClasses = extractCssClasses(css);
  const htmlClasses = extractHtmlClasses(html);
  const ngClassClasses = extractNgClassClasses(html);

  const usedClasses = new Set([...htmlClasses, ...ngClassClasses]);

  const unused = [...cssClasses].filter(
    (c) => !usedClasses.has(c) && !shouldIgnoreClass(c)
  );

  return {
    total: cssClasses.size,
    used: usedClasses.size,
    unused: unused,
  };
}

function scanFolder(
  folderPath: string,
  stats: ScanStats = { files: 0, totalUnused: 0 }
): ScanStats {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });

  entries.forEach((entry) => {
    const fullPath = path.join(folderPath, entry.name);

    if (entry.isDirectory()) {
      scanFolder(fullPath, stats);
    } else if (entry.isFile()) {
      const cssMatch = entry.name.match(/(.+)\.component\.(css|scss)$/);
      if (!cssMatch) return;

      const [, name] = cssMatch;
      const htmlPath = path.join(folderPath, `${name}.component.html`);

      if (!fs.existsSync(htmlPath)) return;

      stats.files++;
      const result = analyzeComponent(fullPath, htmlPath);

      if (result.unused.length > 0 || CONFIG.verbose) {
        const relativePath = path.relative(CONFIG.targetPath, folderPath);
        console.log(`\n📁 ${relativePath}/${name}`);
        console.log(
          `   📊 CSS: ${result.total} | Usate: ${result.used} | Non usate: ${result.unused.length}`
        );

        if (result.unused.length > 0) {
          result.unused.forEach((c) => console.log(`   ❌ .${c}`));
          stats.totalUnused += result.unused.length;
        }
      }
    }
  });

  return stats;
}

function main(): void {
  console.log("🔍 CSS Unused Classes Scanner");
  console.log("━".repeat(50));
  console.log(`📂 Target: ${CONFIG.targetPath}`);
  console.log(
    `🚫 Ignora: ${
      Object.entries(CONFIG.ignorePatterns)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(", ") || "nessuno"
    }`
  );
  console.log("━".repeat(50));

  try {
    const stats = scanFolder(CONFIG.targetPath);

    console.log("\n" + "━".repeat(50));
    console.log("✅ Scansione completata");
    console.log(`📊 Componenti analizzati: ${stats.files}`);
    console.log(`🗑️  Classi CSS non utilizzate: ${stats.totalUnused}`);
  } catch (error) {
    console.error(
      "\n❌ Errore durante la scansione:",
      (error as Error).message
    );
    process.exit(1);
  }
}

// Gestione argomenti CLI
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Uso: ts-node css-unused-scanner.ts [opzioni]

Opzioni:
  --verbose, -v     Mostra tutti i componenti, anche senza classi inutilizzate
  --help, -h        Mostra questo messaggio

Configurazione .env:
  targetPath=./src/app                  # Percorso da scansionare
  ignoreAngularMaterial=true|false      # Ignora classi mat-, cdk-, mdc-
  ignoreAgGrid=true|false               # Ignora classi ag-, ag-theme-
  ignoreBootstrap=true|false            # Ignora classi Bootstrap
  verbose=true|false                    # Mostra tutti i componenti

Esempio .env:
  targetPath=./src/app
  ignoreAngularMaterial=true
  ignoreAgGrid=true
  ignoreBootstrap=false
  verbose=false
  `);
  process.exit(0);
}

if (args.includes("--verbose") || args.includes("-v")) {
  CONFIG.verbose = true;
}

main();