#!/usr/bin/env node
// Generate a secure random session secret

import { randomBytes } from "crypto";

const length = parseInt(process.argv[2], 10) || 32;
const secret = randomBytes(length).toString("base64url").slice(0, length);

console.log(secret);