import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { ConfigCheckInfoProject } from "../interface/ConfigCheckInfoProject";
import { LibraryCategories } from "../interface/LibraryCategories";
import { PackageJson } from "../interface/PackageJson";
import { AngularJson } from "../interface/AngularJson";
import { TsConfig } from "../interface/TsConfig";

dotenv.config();

export class CheckInfoProject {
  private readonly CONFIG: ConfigCheckInfoProject = {
    projectPath: path.resolve(process.env.targetPath || ""),
    showInstalledVersions: process.env.showInstalledVersions === "true",
    checkOutdated: process.env.checkOutdated === "true",
    groupByCategory: process.env.groupByCategory === "true",
  };

  private readonly LIBRARY_CATEGORIES: LibraryCategories = {
    angular: {
      title: "Angular Core",
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
      title: "Angular CLI & Build",
      packages: [
        "@angular/cli",
        "@angular-devkit/build-angular",
        "@angular/compiler-cli",
      ],
    },
    angularRouter: {
      title: "Routing & Forms",
      packages: ["@angular/router", "@angular/forms"],
    },
    angularMaterial: {
      title: "Angular Material",
      packages: ["@angular/material", "@angular/cdk"],
    },
    rxjs: {
      title: "Reactive Programming",
      packages: ["rxjs"],
    },
    typescript: {
      title: "TypeScript",
      packages: ["typescript"],
    },
    testing: {
      title: "Testing",
      packages: [
        "jasmine-core",
        "karma",
        "karma-jasmine",
        "karma-chrome-launcher",
        "@types/jasmine",
      ],
    },
    other: {
      title: "Others",
      packages: [],
    },
  };

  private findPackageJson(): string | null {
    let currentPath = this.CONFIG.projectPath;
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

  private getInstalledVersion(
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

  private cleanVersion(version: string): string | null {
    if (!version) return null;
    return version.replace(/^[\^~>=<]+/, "");
  }

  private compareVersions(
    installed: string,
    declared: string
  ): "exact" | "compatible" | "different" | "unknown" {
    if (!installed || !declared) return "unknown";

    const cleanInstalled = this.cleanVersion(installed);
    const cleanDeclared = this.cleanVersion(declared);

    if (cleanInstalled === cleanDeclared) return "exact";
    if (
      cleanInstalled &&
      cleanDeclared &&
      cleanInstalled.startsWith(cleanDeclared.split(".")[0])
    )
      return "compatible";
    return "different";
  }

  private getVersionColor(
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

  private getNodeModulesSize(projectRoot: string): string | null {
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

  private getAngularJson(projectRoot: string): AngularJson | null {
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

  private getTsConfigVersion(projectRoot: string): string | null {
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

  analyzeProject(): void {
    console.log("Angular Project Info");
    console.log("━".repeat(70));

    const pkgPath = this.findPackageJson();

    if (!pkgPath) {
      console.error("ERR: package.json not found!");
      process.exit(1);
    }

    const projectRoot = path.dirname(pkgPath);
    console.log(`  Project: ${projectRoot}`);
    console.log(`  package.json: ${path.basename(pkgPath)}\n`);

    const pkg: PackageJson = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const allDeps: Record<string, string> = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    console.log("━".repeat(70));
    console.log("Info");
    console.log("━".repeat(70));
    console.log(`   Name: ${pkg.name || "N/A"}`);
    console.log(`   Version: ${pkg.version || "N/A"}`);
    console.log(`   Description: ${pkg.description || "N/A"}`);

    const angularVersion = allDeps["@angular/core"];
    if (angularVersion) {
      console.log(`   Angular: ${this.cleanVersion(angularVersion)}`);
    }

    const nmSize = this.getNodeModulesSize(projectRoot);
    if (nmSize) {
      console.log(`   node_modules: ${nmSize} GB`);
    }

    const tsTarget = this.getTsConfigVersion(projectRoot);
    if (tsTarget) {
      console.log(`   TypeScript target: ${tsTarget}`);
    }

    const angularJson = this.getAngularJson(projectRoot);
    if (angularJson) {
      const projects = Object.keys(angularJson.projects || {});
      if (projects.length > 0) {
        console.log(`   Progetti Angular: ${projects.join(", ")}`);
      }
    }

    console.log("");

    if (this.CONFIG.groupByCategory) {
      const categorized = new Set<string>();

      Object.entries(this.LIBRARY_CATEGORIES).forEach(([key, category]) => {
        if (category.packages.length === 0 && key !== "other") return;

        const found = category.packages.filter((pkg) => allDeps[pkg]);

        if (found.length > 0 || key === "other") {
          console.log("━".repeat(70));
          console.log(category.title);
          console.log("━".repeat(70));

          if (key === "other") {
            Object.keys(allDeps).forEach((pkgName) => {
              if (!categorized.has(pkgName)) {
                this.printPackageInfo(pkgName, allDeps[pkgName], projectRoot);
              }
            });
          } else {
            found.forEach((pkgName) => {
              categorized.add(pkgName);
              this.printPackageInfo(pkgName, allDeps[pkgName], projectRoot);
            });
          }

          console.log("");
        }
      });
    } else {
      console.log("━".repeat(70));
      console.log("All dependecy");
      console.log("━".repeat(70));

      Object.entries(allDeps).forEach(([name, version]) => {
        this.printPackageInfo(name, version, projectRoot);
      });
    }

    console.log("━".repeat(70));
    console.log("Stats");
    console.log("━".repeat(70));
    console.log(`   Dipendenze: ${Object.keys(pkg.dependencies || {}).length}`);
    console.log(
      `   DevDipendenze: ${Object.keys(pkg.devDependencies || {}).length}`
    );
    console.log(`   Totale: ${Object.keys(allDeps).length}`);
    console.log("━".repeat(70));
  }

  private printPackageInfo(
    name: string,
    declaredVersion: string,
    projectRoot: string
  ): void {
    const cleanDeclared = this.cleanVersion(declaredVersion);

    if (this.CONFIG.showInstalledVersions) {
      const installed = this.getInstalledVersion(name, projectRoot);
      if (installed) {
        const status = this.compareVersions(installed, declaredVersion);
        const icon = this.getVersionColor(status);
        console.log(
          `   ${icon} ${name.padEnd(40)} ${cleanDeclared?.padEnd(10)} → ${installed}`
        );
      } else {
        console.log(
          `   ${name.padEnd(40)} ${cleanDeclared?.padEnd(10)} (non installato)`
        );
      }
    } else {
      console.log(`   • ${name.padEnd(40)} ${declaredVersion}`);
    }
  }
}