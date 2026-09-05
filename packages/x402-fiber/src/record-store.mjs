import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Small single-process JSON record store.
 *
 * It is intentionally simple for reproducible testnet deployments. Writes are
 * serialized and persisted with an atomic rename. It is NOT a distributed lock
 * and must be replaced by an atomic shared store before horizontal scaling.
 */
export class JsonRecordStore {
  #entries = new Map();
  #loadPromise = null;
  #write = Promise.resolve();

  constructor({ file = "", now = () => Date.now() } = {}) {
    this.file = file;
    this.now = now;
  }

  async #load() {
    if (this.#loadPromise) return this.#loadPromise;
    this.#loadPromise = (async () => {
      if (!this.file) return;
      try {
        const rows = JSON.parse(await readFile(this.file, "utf8"));
        for (const row of Array.isArray(rows) ? rows : []) {
          if (row && typeof row.key === "string") this.#entries.set(row.key, row);
        }
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    })();
    return this.#loadPromise;
  }

  async get(key) {
    await this.#load();
    return this.#entries.get(String(key)) ?? null;
  }

  async has(key) {
    return (await this.get(key)) !== null;
  }

  async set(key, value = {}) {
    await this.#load();
    const normalized = String(key);
    this.#entries.set(normalized, { key: normalized, updatedAt: this.now(), ...value });
    await this.#persist();
    return this.#entries.get(normalized);
  }

  async delete(key) {
    await this.#load();
    const removed = this.#entries.delete(String(key));
    if (removed) await this.#persist();
    return removed;
  }

  async prune(predicate) {
    await this.#load();
    let removed = 0;
    for (const [key, value] of this.#entries) {
      if (predicate(value, key)) {
        this.#entries.delete(key);
        removed += 1;
      }
    }
    if (removed) await this.#persist();
    return removed;
  }

  async size() {
    await this.#load();
    return this.#entries.size;
  }

  async #persist() {
    if (!this.file) return;
    const task = async () => {
      await mkdir(dirname(this.file), { recursive: true });
      const temp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temp, JSON.stringify([...this.#entries.values()], null, 2) + "\n", { mode: 0o600 });
      await rename(temp, this.file);
    };
    this.#write = this.#write.then(task, task);
    return this.#write;
  }
}
