/**
 * `${DATA_DIR}/snapshot.json`, written atomically: the bytes go to a per-process
 * `snapshot.json.<pid>.tmp` (so a concurrent `--once` cannot clobber the service's tmp file), are
 * fsynced, and a rename swaps them in, so a crash mid-write leaves the previous file intact and the
 * board never reads a half-written document. On start the last file is reloaded so `/snapshot.json`
 * answers before the first poll finishes; a file that is empty, truncated or not a Snapshot is
 * ignored (the service starts empty and answers 503 until its first poll).
 */
import * as nodeFs from 'node:fs';
import { join } from 'node:path';
import { SnapshotSchema, type Snapshot } from '@sealtech/domain';

/** The subset of `node:fs` the writer uses; tests inject one whose `renameSync` fails on purpose. */
export interface WriterFs {
  mkdirSync(path: string, opts: { recursive: true }): unknown;
  openSync(path: string, flags: string): number;
  writeSync(fd: number, data: string): number;
  fsyncSync(fd: number): void;
  closeSync(fd: number): void;
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
    this.tmpPath = `${this.path}.${process.pid}.tmp`;
  }

  /** Writes `body` (already serialized) atomically. Throws on failure, with no `.tmp` left behind. */
  write(body: string): void {
    this.fs.mkdirSync(this.dataDir, { recursive: true });
    try {
      const fd = this.fs.openSync(this.tmpPath, 'w');
      try {
        this.fs.writeSync(fd, body);
        this.fs.fsyncSync(fd);
      } finally {
        this.fs.closeSync(fd);
      }
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

  /**
   * The last good snapshot on disk, or undefined when absent, unreadable, not JSON or not a valid
   * Snapshot. Never throws; `warn` hears why a present file was ignored.
   */
  read(warn: (message: string) => void = () => {}): { snapshot: Snapshot; body: string } | undefined {
    try {
      if (!this.fs.existsSync(this.path)) return undefined;
      const body = this.fs.readFileSync(this.path, 'utf8');
      let json: unknown;
      try {
        json = JSON.parse(body);
      } catch {
        warn(`${this.path} is not JSON (${body.length} bytes, likely a torn write); starting empty until the first poll`);
        return undefined;
      }
      const parsed = SnapshotSchema.safeParse(json);
      if (!parsed.success) {
        warn(`${this.path} is not a valid Snapshot; starting empty until the first poll`);
        return undefined;
      }
      return { snapshot: parsed.data as Snapshot, body };
    } catch {
      warn(`${this.path} could not be read; starting empty until the first poll`);
      return undefined;
    }
  }
}
