/**
 * `${DATA_DIR}/snapshot.json`, written atomically: the bytes go to `snapshot.json.tmp` and a rename
 * swaps them in, so a crash mid-write leaves the previous file intact and the board never reads a
 * half-written document. On start the last file is reloaded so `/snapshot.json` answers before the
 * first poll finishes.
 */
import * as nodeFs from 'node:fs';
import { join } from 'node:path';
import { SnapshotSchema, type Snapshot } from '@sealtech/domain';

/** The subset of `node:fs` the writer uses; tests inject one whose `renameSync` fails on purpose. */
export interface WriterFs {
  mkdirSync(path: string, opts: { recursive: true }): unknown;
  writeFileSync(path: string, data: string): void;
  renameSync(from: string, to: string): void;
  readFileSync(path: string, encoding: 'utf8'): string;
  existsSync(path: string): boolean;
  unlinkSync(path: string): void;
}

export const SNAPSHOT_FILE = 'snapshot.json';

export function serializeSnapshot(snapshot: Snapshot): string {
  return JSON.stringify(snapshot, null, 2) + '\n';
}

export class SnapshotWriter {
  readonly path: string;
  readonly tmpPath: string;

  constructor(
    readonly dataDir: string,
    private readonly fs: WriterFs = nodeFs,
  ) {
    this.path = join(dataDir, SNAPSHOT_FILE);
    this.tmpPath = `${this.path}.tmp`;
  }

  /** Writes `body` (already serialized) atomically. Throws on failure, with no `.tmp` left behind. */
  write(body: string): void {
    this.fs.mkdirSync(this.dataDir, { recursive: true });
    this.fs.writeFileSync(this.tmpPath, body);
    try {
      this.fs.renameSync(this.tmpPath, this.path);
    } catch (err) {
      try {
        this.fs.unlinkSync(this.tmpPath);
      } catch {
        // nothing more to do: the previous snapshot.json is untouched either way
      }
      throw err;
    }
  }

  /** The last good snapshot on disk, or undefined when absent or not a valid Snapshot. */
  read(): { snapshot: Snapshot; body: string } | undefined {
    if (!this.fs.existsSync(this.path)) return undefined;
    const body = this.fs.readFileSync(this.path, 'utf8');
    const parsed = SnapshotSchema.safeParse(JSON.parse(body));
    if (!parsed.success) return undefined;
    return { snapshot: parsed.data as Snapshot, body };
  }
}
