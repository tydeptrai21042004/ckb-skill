import { copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";

for (const target of [".env.testnet", ".env.live"]) {
  if (!existsSync(target)) {
    await copyFile(".env.testnet.example", target);
    console.log(`Created ${target} from .env.testnet.example`);
  } else {
    console.log(`${target} already exists; it was not overwritten.`);
  }
}
console.log("Recommended deployment flow:");
console.log("  ./deploy.sh init-testnet");
console.log("  ./deploy.sh doctor");
console.log("  ./deploy.sh testnet");
