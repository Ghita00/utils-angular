export interface StatsImport {
  filesWithUnused: number;
  totalUnused: number;
  byType: {
    named: number;
    default: number;
    namespace: number;
  };
}
