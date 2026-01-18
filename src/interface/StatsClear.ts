import { ErrorInfo } from "./ErrorInfo";

export interface StatsClear {
  foldersFound: number;
  foldersDeleted: number;
  filesFound: number;
  filesDeleted: number;
  totalSize: number;
  errors: ErrorInfo[];
}