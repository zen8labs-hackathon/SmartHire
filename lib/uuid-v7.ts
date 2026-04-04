import { v7 as uuidV7 } from "uuid";

/** RFC 9562 UUID v7 (time-ordered); prefer for new DB primary keys created in app code. */
export function newUuidV7(): string {
  return uuidV7();
}
