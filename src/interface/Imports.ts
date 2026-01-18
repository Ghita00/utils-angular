import { ImportItem } from "./ImportItem";

export interface Imports {
  named: ImportItem[];
  default: string[];
  namespace: string[];
  types: string[];
}