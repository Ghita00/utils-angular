import { ImportItem } from "./ImportItem";

export interface UnusedImports {
  named: ImportItem[];
  default: string[];
  namespace: string[];
}