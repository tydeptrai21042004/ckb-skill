import { copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";

if (!existsSync(".env.live")) {
  await copyFile(".env.live.example", ".env.live");
  console.log("Created .env.live from .env.live.example");
} else {
  console.log(".env.live already exists; it was not overwritten.");
}
console.log("Fill CAPABILITY_CODE_HASH and CAPABILITY_DEP_TX_HASH from the real CKB testnet deployment, then run:");
console.log("  npm run doctor:live");
console.log("  docker compose -f compose.live.yaml up --build");
