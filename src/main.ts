import { CheckInfoProject } from "./script/checkInfoProject";
import { CheckUselessCss } from "./script/checkUselessCss";
import { CheckUselessImport } from "./script/checkUselessImport";
import { ClearAngular } from "./script/clearAngular";
import * as readline from "readline";

const checkInfoProject = new CheckInfoProject();
const checkUselessCss = new CheckUselessCss();
const checkUselessImport = new CheckUselessImport();
const clearAngular = new ClearAngular();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function showMenu() {
    console.log(`
Scegli un'operazione:
1 - Analizza progetto
2 - Cerca CSS inutilizzati
3 - Cerca import inutilizzati
4 - Pulisci progetto Angular
0 - Esci
`);
}

function handleChoice(choice: string) {
    switch (choice) {
        case "1":
            checkInfoProject.analyzeProject();
            break;
        case "2":
            checkUselessCss.scannerUselessCss();
            break;
        case "3":
            checkUselessImport.checkUselessImport();
            break;
        case "4":
            clearAngular.cleanProject();
            break;
        case "0":
            console.log("Uscita...");
            rl.close();
            process.exit(0);
        default:
            console.log("Scelta non valida ❌");
    }
}

function main() {
    while (true) {
        showMenu();

        // attende input utente
        const choice = require("child_process")
            .execSync("read input; echo $input", { stdio: ["inherit", "pipe", "inherit"] })
            .toString()
            .trim();

        handleChoice(choice);
    }
}

main();
