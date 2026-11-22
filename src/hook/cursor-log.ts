import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { CursorWarnLogEntry } from "../adapters/cursor.ts";

function statIfPresent(file: string): ReturnType<typeof lstatSync> | undefined {
  try {
    return lstatSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/** Append only the warning rule and decision under the resolved project root. */
export function appendCursorWarning(root: string, entry: CursorWarnLogEntry): void {
  const directory = join(realpathSync(root), "canary");
  try {
    mkdirSync(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const directoryStat = lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error("Canary output directory must be inside the project.");
  }

  const target = join(directory, "hook.log");
  const existing = statIfPresent(target);
  if (existing && (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1)) {
    throw new Error("Canary output must be a regular file inside the project.");
  }
  const flags = constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0)
    | (existing ? 0 : constants.O_CREAT | constants.O_EXCL)
    | constants.O_APPEND;
  const fd = openSync(target, flags, 0o600);
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1
      || (existing && (opened.ino !== existing.ino || opened.dev !== existing.dev))) {
      throw new Error("Canary output changed while opening it.");
    }
    writeFileSync(fd, JSON.stringify(entry) + "\n");
  } finally {
    closeSync(fd);
  }
}
