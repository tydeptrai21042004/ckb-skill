import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class ReplayStore {
  #loaded = false;
  #entries = new Map();
  #write = Promise.resolve();

  constructor({ file = "", now = () => Date.now() } = {}) {
    this.file = file;
    this.now = now;
  }

  async #load() {
    if (this.#loaded) return;
    this.#loaded = true;
    if (!this.file) return;
    try {
      const rows = JSON.parse(await readFile(this.file, "utf8"));
      for (const row of Array.isArray(rows) ? rows : []) {
        if (row && typeof row.key === "string") this.#entries.set(row.key, row);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  async has(key) {
    await this.#load();
    return this.#entries.has(String(key).toLowerCase());
  }

  async consume(key, metadata = {}) {
    await this.#load();
    const normalized = String(key).toLowerCase();
    if (this.#entries.has(normalized)) return false;
    this.#entries.set(normalized, { key: normalized, consumedAt: this.now(), ...metadata });
    await this.#persist();
    return true;
  }

  async #persist() {
    if (!this.file) return;
    const task = async () => {
      await mkdir(dirname(this.file), { recursive: true });
      const temp = `${this.file}.${process.pid}.tmp`;
      await writeFile(temp, JSON.stringify([...this.#entries.values()], null, 2) + "\n", { mode: 0o600 });
      await rename(temp, this.file);
    };
    this.#write = this.#write.then(task, task);
    return this.#write;
  }
}
