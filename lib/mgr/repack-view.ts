export type RepackViewModel = {
  parent: string;
  location: string;
  qty: string;
  unit: string;
  tape: [string, string][];
  preview: string;
  damaged: string;
  unavailable?: string;
};
