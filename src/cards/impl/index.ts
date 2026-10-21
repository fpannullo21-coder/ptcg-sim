/** Tutte le implementazioni a mano. Ogni file raccoglie un gruppo di carte. */
import type { Impl } from "../registry.js";
import { HIDE_N_SNEAK } from "./hide-n-sneak.js";
import { STAPLES } from "./staples.js";

export const IMPLS: Impl[] = [...HIDE_N_SNEAK, ...STAPLES];
