export interface ConfigUselessImport {
  targetPath: string;
  excludePatterns: RegExp[];
  ignoreDecorators: boolean;
  ignoreTypes: boolean;
  verbose: boolean;
}