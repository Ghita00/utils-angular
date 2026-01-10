import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Carica variabili da .env
dotenv.config();

interface Config {
  projectPath: string;
  showInstalledVersions: boolean;
  checkOutdated: boolean;
  groupByCategory: boolean;
}

interface LibraryCategory {
  title: string;
  packages: string[];
}

interface LibraryCategories {
  [key: string]: LibraryCategory;
}

interface PackageJson {
  name?: string;
  version?: string;
  description?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface AngularJson {
  projects?: Record<string, any>;
}

interface TsConfig {
  compilerOptions?: {
    target?: string;
  };
}

const CONFIG: Config = {
  projectPath: path.resolve(process.env.targetPath || ""),
  showInstalledVersions: process.env.showInstalledVersions === "true",
  checkOutdated: process.env.checkOutdated === "true",
  groupByCategory: process.env.groupByCategory === "true",
};

const LIBRARY_CATEGORIES: LibraryCategories = {
  angular: {
    title: "🅰️  Angular Core",
    packages: [
      "@angular/core",
      "@angular/common",
      "@angular/platform-browser",
      "@angular/platform-browser-dynamic",
      "@angular/compiler",
      "@angular/animations",
    ],
  },
  angularCLI: {
    title: "🔧 Angular CLI & Build",
    packages: [
      "@angular/cli",
      "@angular-devkit/build-angular",
      "@angular/compiler-cli",
    ],
  },
  angularRouter: {
    title: "🧭 Routing & Forms",
    packages: ["@angular/router", "@angular/forms"],
  },
  angularMaterial: {
    title: "🎨 Angular Material",
    packages: ["@angular/material", "@angular/cdk"],
  },
  rxjs: {
    title: "🔄 Reactive Programming",
    packages: ["rxjs"],
  },
  typescript: {
    title: "📘 TypeScript",
    packages: ["typescript"],
  },
  testing: {
    title: "🧪 Testing",
    packages: [
      "jasmine-core",
      "karma",
      "karma-jasmine",
      "karma-chrome-launcher",
      "@types/jasmine",
    ],
  },
  other: {
    title: "📦 Altre Dipendenze",
    packages: [],
  },
};

function findPackageJson(startPath: string): string | null {
  let currentPath = startPath;
  const root = path.parse(currentPath).root;

  while (currentPath !== root) {
    const pkgPath = path.join(currentPath, "package.json");
    if (fs.existsSync(pkgPath)) {
      return pkgPath;
    }
    currentPath = path.dirname(currentPath);
  }

  return null;
}

function getInstalledVersion(
  packageName: string,
  projectRoot: string
): string | null {
  try {
    const packagePath = path.join(
      projectRoot,
      "node_modules",
      packageName,
      "package.json"
    );
    if (fs.existsSync(packagePath)) {
      const pkg: PackageJson = JSON.parse(
        fs.readFileSync(packagePath, "utf8")
      );
      return pkg.version || null;
    }
  } catch (err) {
    // Ignora errori
  }
  return null;
}

function cleanVersion(version: string): string | null {
  if (!version) return null;
  return version.replace(/^[\^~>=<]+/, "");
}

function compareVersions(
  installed: string,
  declared: string
): "exact" | "compatible" | "different" | "unknown" {
  if (!installed || !declared) return "unknown";

  const cleanInstalled = cleanVersion(installed);
  const cleanDeclared = cleanVersion(declared);

  if (cleanInstalled === cleanDeclared) return "exact";
  if (
    cleanInstalled &&
    cleanDeclared &&
    cleanInstalled.startsWith(cleanDeclared.split(".")[0])
  )
    return "compatible";
  return "different";
}

function getVersionColor(
  status: "exact" | "compatible" | "different" | "unknown"
): string {
  switch (status) {
    case "exact":
      return "✓";
    case "compatible":
      return "≈";
    case "different":
      return "⚠";
    default:
      return "?";
  }
}

function getNodeModulesSize(projectRoot: string): string | null {
  const nmPath = path.join(projectRoot, "node_modules");
  if (!fs.existsSync(nmPath)) return null;

  try {
    let totalSize = 0;
    const calcSize = (dir: string): void => {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      items.forEach((item) => {
        const itemPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          calcSize(itemPath);
        } else {
          try {
            totalSize += fs.statSync(itemPath).size;
          } catch (e) {
            // Ignora errori
          }
        }
      });
    };
    calcSize(nmPath);

    const gb = totalSize / (1024 * 1024 * 1024);
    return gb.toFixed(2);
  } catch (err) {
    return null;
  }
}

function getAngularJson(projectRoot: string): AngularJson | null {
  const angularJsonPath = path.join(projectRoot, "angular.json");
  if (fs.existsSync(angularJsonPath)) {
    try {
      return JSON.parse(fs.readFileSync(angularJsonPath, "utf8"));
    } catch (err) {
      return null;
    }
  }
  return null;
}

function getTsConfigVersion(projectRoot: string): string | null {
  const tsconfigPath = path.join(projectRoot, "tsconfig.json");
  if (fs.existsSync(tsconfigPath)) {
    try {
      const tsconfig: TsConfig = JSON.parse(
        fs.readFileSync(tsconfigPath, "utf8")
      );
      return tsconfig.compilerOptions?.target || null;
    } catch (err) {
      return null;
    }
  }
  return null;
}

function analyzeProject(): void {
  console.log("🔍 Angular Project Info");
  console.log("━".repeat(70));

  const pkgPath = findPackageJson(CONFIG.projectPath);

  if (!pkgPath) {
    console.error("❌ package.json non trovato!");
    process.exit(1);
  }

  const projectRoot = path.dirname(pkgPath);
  console.log(`📂 Progetto: ${projectRoot}`);
  console.log(`📄 package.json: ${path.basename(pkgPath)}\n`);

  const pkg: PackageJson = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const allDeps: Record<string, string> = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  console.log("━".repeat(70));
  console.log("📋 Informazioni Progetto");
  console.log("━".repeat(70));
  console.log(`   Nome: ${pkg.name || "N/A"}`);
  console.log(`   Versione: ${pkg.version || "N/A"}`);
  console.log(`   Descrizione: ${pkg.description || "N/A"}`);

  const angularVersion = allDeps["@angular/core"];
  if (angularVersion) {
    console.log(`   Angular: ${cleanVersion(angularVersion)}`);
  }

  const nmSize = getNodeModulesSize(projectRoot);
  if (nmSize) {
    console.log(`   node_modules: ${nmSize} GB`);
  }

  const tsTarget = getTsConfigVersion(projectRoot);
  if (tsTarget) {
    console.log(`   TypeScript target: ${tsTarget}`);
  }

  const angularJson = getAngularJson(projectRoot);
  if (angularJson) {
    const projects = Object.keys(angularJson.projects || {});
    if (projects.length > 0) {
      console.log(`   Progetti Angular: ${projects.join(", ")}`);
    }
  }

  console.log("");

  if (CONFIG.groupByCategory) {
    const categorized = new Set<string>();

    Object.entries(LIBRARY_CATEGORIES).forEach(([key, category]) => {
      if (category.packages.length === 0 && key !== "other") return;

      const found = category.packages.filter((pkg) => allDeps[pkg]);

      if (found.length > 0 || key === "other") {
        console.log("━".repeat(70));
        console.log(category.title);
        console.log("━".repeat(70));

        if (key === "other") {
          Object.keys(allDeps).forEach((pkgName) => {
            if (!categorized.has(pkgName)) {
              printPackageInfo(pkgName, allDeps[pkgName], projectRoot);
            }
          });
        } else {
          found.forEach((pkgName) => {
            categorized.add(pkgName);
            printPackageInfo(pkgName, allDeps[pkgName], projectRoot);
          });
        }

        console.log("");
      }
    });
  } else {
    console.log("━".repeat(70));
    console.log("📦 Tutte le Dipendenze");
    console.log("━".repeat(70));

    Object.entries(allDeps).forEach(([name, version]) => {
      printPackageInfo(name, version, projectRoot);
    });
  }

  console.log("━".repeat(70));
  console.log("📊 Statistiche");
  console.log("━".repeat(70));
  console.log(`   Dipendenze: ${Object.keys(pkg.dependencies || {}).length}`);
  console.log(
    `   DevDipendenze: ${Object.keys(pkg.devDependencies || {}).length}`
  );
  console.log(`   Totale: ${Object.keys(allDeps).length}`);
  console.log("━".repeat(70));
}

function printPackageInfo(
  name: string,
  declaredVersion: string,
  projectRoot: string
): void {
  const cleanDeclared = cleanVersion(declaredVersion);

  if (CONFIG.showInstalledVersions) {
    const installed = getInstalledVersion(name, projectRoot);
    if (installed) {
      const status = compareVersions(installed, declaredVersion);
      const icon = getVersionColor(status);
      console.log(
        `   ${icon} ${name.padEnd(40)} ${cleanDeclared?.padEnd(10)} → ${installed}`
      );
    } else {
      console.log(
        `   ⊘ ${name.padEnd(40)} ${cleanDeclared?.padEnd(10)} (non installato)`
      );
    }
  } else {
    console.log(`   • ${name.padEnd(40)} ${declaredVersion}`);
  }
}

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Uso: ts-node project-info.ts [opzioni]

Opzioni:
  --no-installed    Non mostra versioni installate
  --no-group        Non raggruppa per categoria
  --help, -h        Mostra questo messaggio

Configurazione .env:
  showInstalledVersions=true|false
  checkOutdated=true|false
  groupByCategory=true|false

Legenda:
  ✓  Versione esatta installata
  ≈  Versione compatibile
  ⚠  Versione diversa
  ⊘  Non installato
  `);
  process.exit(0);
}

if (args.includes("--no-installed")) {
  CONFIG.showInstalledVersions = false;
}

if (args.includes("--no-group")) {
  CONFIG.groupByCategory = false;
}

try {
  analyzeProject();
} catch (err) {
  console.error("\n❌ Errore:", (err as Error).message);
  process.exit(1);
}