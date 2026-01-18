export interface ItemInfo {
  path: string;
  name: string;
  size: number;
  type: "folder" | "file";
}