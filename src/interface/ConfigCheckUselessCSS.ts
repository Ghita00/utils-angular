export interface ConfigCheckUselessCSS {
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