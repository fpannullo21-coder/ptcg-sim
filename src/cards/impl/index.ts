/** Tutte le implementazioni a mano. Ogni file raccoglie un gruppo di carte. */
import type { Impl } from "../registry.js";
import { HIDE_N_SNEAK } from "./hide-n-sneak.js";
import { STAPLES } from "./staples.js";
import { DRAGAPULT } from "./dragapult.js";
import { TRAINERS } from "./trainers.js";
import { BOXES } from "./boxes.js";
import { MIDRANGE } from "./midrange.js";
import { META_OCT } from "./meta-oct.js";

export const IMPLS: Impl[] = [...HIDE_N_SNEAK, ...STAPLES, ...DRAGAPULT, ...TRAINERS, ...BOXES, ...MIDRANGE, ...META_OCT];
