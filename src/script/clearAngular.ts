import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import * as dotenv from "dotenv";
import { ItemInfo } from "../interface/ItemInfo";
import { ConfigClearAngular } from "../interface/ConfigClearAngular";
import { StatsClear } from "../interface/StatsClear";

dotenv.config();

export class ClearAngular {
  private parseFolders = (): string[] => {
    const foldersStr = process.env.folders || "";
    return foldersStr
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);
  };

  private parseFiles = (): string[] => {
    const filesStr = process.env.files || "";
    return filesStr
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);
  };

  private readonly CONFIG: ConfigClearAngular = {
    projectRoot: path.resolve(process.env.projectRoot || ""),
    folders: this.parseFolders(),
    files: this.parseFiles(),
    dryRun: process.env.dryRun === "true",
    confirmBeforeDelete: process.env.confirmBeforeDelete === "true",
  };

  private formatSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
  }

  private getDirectorySize(dirPath: string): number {
    if (!fs.existsSync(dirPath)) return 0;

    let totalSize = 0;

    try {
      const files = fs.readdirSync(dirPath, { withFileTypes: true });

      files.forEach((file) => {
        const filePath = path.join(dirPath, file.name);

        if (file.isDirectory()) {
          totalSize += this.getDirectorySize(filePath);
        } else {
          const stats = fs.statSync(filePath);
          totalSize += stats.size;
        }
      });
    } catch (err) {
      // Ignora errori di lettura
    }

    return totalSize;
  }

  private removeDirectory(dirPath: string): boolean {
    if (!fs.existsSync(dirPath)) return false;

    const isWindows = process.platform === "win32";

    try {
      if (isWindows) {
        execSync(`rmdir /s /q "${dirPath}"`, {
          stdio: "pipe",
          windowsHide: true,
        });
      } else {
        execSync(`rm -rf "${dirPath}"`, { stdio: "pipe" });
      }
      return true;
    } catch (err) {
      try {
        fs.rmSync(dirPath, { recursive: true, force: true });
        return true;
      } catch (fallbackErr) {
        throw new Error(
          `Impossibile eliminare: ${(fallbackErr as Error).message}`
        );
      }
    }
  }

  private removeFile(filePath: string): boolean {
    if (!fs.existsSync(filePath)) return false;

    try {
      fs.unlinkSync(filePath);
      return true;
    } catch (err) {
      throw new Error(`Impossibile eliminare: ${(err as Error).message}`);
    }
  }

  private confirmAction(message: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(`${message} (s/n): `, (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === "s" || answer.toLowerCase() === "y");
      });
    });
  }

  async cleanProject(): Promise<void> {
    console.log("🧹 Project Cleaner");
    console.log("━".repeat(60));
    console.log(`📂 Progetto: ${this.CONFIG.projectRoot}`);
    console.log(
      `${this.CONFIG.dryRun
        ? "🔍 MODALITÀ DRY-RUN (nessuna eliminazione)"
        : "⚠️  MODALITÀ PULIZIA ATTIVA"
      }`
    );
    console.log("━".repeat(60) + "\n");

    if (!fs.existsSync(this.CONFIG.projectRoot)) {
      console.error("❌ La directory del progetto non esiste!");
      process.exit(1);
    }

    const stats: StatsClear = {
      foldersFound: 0,
      foldersDeleted: 0,
      filesFound: 0,
      filesDeleted: 0,
      totalSize: 0,
      errors: [],
    };

    console.log("📁 Analisi cartelle...\n");

    const itemsToDelete: ItemInfo[] = [];

    this.CONFIG.folders.forEach((folder) => {
      const fullPath = path.join(this.CONFIG.projectRoot, folder);

      if (fs.existsSync(fullPath)) {
        const size = this.getDirectorySize(fullPath);
        stats.foldersFound++;
        stats.totalSize += size;

        itemsToDelete.push({
          path: fullPath,
          name: folder,
          size,
          type: "folder",
        });

        console.log(`   ✓ ${folder} (${this.formatSize(size)})`);
      } else {
        console.log(`   ⊘ ${folder} (non trovata)`);
      }
    });

    if (this.CONFIG.files.length > 0) {
      console.log("\n📄 Analisi file...\n");

      this.CONFIG.files.forEach((file) => {
        const fullPath = path.join(this.CONFIG.projectRoot, file);

        if (fs.existsSync(fullPath)) {
          const fileStats = fs.statSync(fullPath);
          stats.filesFound++;
          stats.totalSize += fileStats.size;

          itemsToDelete.push({
            path: fullPath,
            name: file,
            size: fileStats.size,
            type: "file",
          });

          console.log(`   ✓ ${file} (${this.formatSize(fileStats.size)})`);
        } else {
          console.log(`   ⊘ ${file} (non trovato)`);
        }
      });
    }

    if (stats.foldersFound === 0 && stats.filesFound === 0) {
      console.log("\n✅ Nessun elemento da pulire");
      return;
    }

    console.log("\n" + "━".repeat(60));
    console.log("📊 Riepilogo:");
    console.log(`   Cartelle: ${stats.foldersFound}`);
    console.log(`   File: ${stats.filesFound}`);
    console.log(`   Spazio totale: ${this.formatSize(stats.totalSize)}`);
    console.log("━".repeat(60) + "\n");

    if (this.CONFIG.dryRun) {
      console.log("🔍 Dry-run completato (nessuna modifica effettuata)");
      return;
    }

    if (this.CONFIG.confirmBeforeDelete) {
      const confirmed = await this.confirmAction(
        "⚠️  Procedere con l'eliminazione?"
      );
      if (!confirmed) {
        console.log("❌ Operazione annullata");
        return;
      }
      console.log("");
    }

    console.log("🗑️  Eliminazione in corso...\n");

    for (const item of itemsToDelete) {
      try {
        if (item.type === "folder") {
          this.removeDirectory(item.path);
          stats.foldersDeleted++;
          console.log(`   ✓ Eliminata: ${item.name}`);
        } else {
          this.removeFile(item.path);
          stats.filesDeleted++;
          console.log(`   ✓ Eliminato: ${item.name}`);
        }
      } catch (err) {
        stats.errors.push({ item: item.name, error: (err as Error).message });
        console.error(`   ✗ Errore con ${item.name}: ${(err as Error).message}`);
      }
    }

    console.log("\n" + "━".repeat(60));
    console.log("✅ Pulizia completata");
    console.log(
      `   Cartelle eliminate: ${stats.foldersDeleted}/${stats.foldersFound}`
    );
    console.log(`   File eliminati: ${stats.filesDeleted}/${stats.filesFound}`);
    console.log(`   Spazio liberato: ${this.formatSize(stats.totalSize)}`);

    if (stats.errors.length > 0) {
      console.log(`\n⚠️  Errori: ${stats.errors.length}`);
      stats.errors.forEach((err) => {
        console.log(`   • ${err.item}: ${err.error}`);
      });
    }

    console.log("━".repeat(60));
  }
}