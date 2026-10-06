import argon2 from "argon2";
import { config } from "../config/index.js";

export async function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: config.argon2.memory,
    timeCost: config.argon2.iterations,
    parallelism: config.argon2.parallelism,
  });
}

export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function needsRehash(hash) {
  try {
    if (!hash.startsWith("$argon2id$")) {
      return true;
    }
    return argon2.needsRehash(hash, {
      memoryCost: config.argon2.memory,
      timeCost: config.argon2.iterations,
      parallelism: config.argon2.parallelism,
    });
  } catch {
    return true;
  }
}