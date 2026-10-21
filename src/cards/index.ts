/** Punto di accesso: database + implementazioni = registro pronto all'uso. */
import { db } from "../data/db.js";
import { Registry } from "./registry.js";
import { IMPLS } from "./impl/index.js";

let shared: Registry | null = null;
export function registry(): Registry {
  return (shared ??= new Registry(db(), IMPLS));
}
