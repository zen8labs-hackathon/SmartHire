import bcrypt from "bcrypt";

/** bcrypt work factor. 12 is the current OWASP-recommended floor for interactive login. */
const SALT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
