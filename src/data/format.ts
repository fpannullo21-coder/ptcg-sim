/** Formati di gioco: quali segni di regolamento sono legali. */

export interface Format {
  id: string;
  name: string;
  marks: string[];
  from: string;
}

export const FORMATS: Record<string, Format> = {
  // rotazione di aprile 2026: escono le carte con segno G
  "standard-2026": { id: "standard-2026", name: "Standard 2026 (H, I, J)", marks: ["H", "I", "J"], from: "2026-04-10" },
};

export const DEFAULT_FORMAT = FORMATS["standard-2026"];
