import {
  closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync,
  realpathSync, readFileSync, writeFileSync, ftruncateSync,
} from "node:fs";
import { join } from "node:path";

function statIfPresent(path: string): ReturnType<typeof lstatSync> | undefined {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function outputFile(root: string, name: string, createDirectory: boolean): string {
  const directory = join(realpathSync(root), "canary");
  if (createDirectory) {
    try {
      mkdirSync(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("Canary output directory must be inside the project.");
  }
  return join(directory, name);
}

function writeOutput(root: string, name: string, text: string, append: boolean): void {
  const target = outputFile(root, name, true);
  const existing = statIfPresent(target);
  if (existing && (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1)) {
    throw new Error("Canary output must be a regular file inside the project.");
  }
  const flags = constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0)
    | (existing ? 0 : constants.O_CREAT | constants.O_EXCL)
    | (append ? constants.O_APPEND : 0);
  const fd = openSync(target, flags, 0o600);
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1
      || (existing && (opened.ino !== existing.ino || opened.dev !== existing.dev))) {
      throw new Error("Canary output changed while opening it.");
    }
    if (!append) ftruncateSync(fd, 0);
    writeFileSync(fd, text);
  } finally {
    closeSync(fd);
  }
}

export function writeProjectReport(root: string, name: "findings.json" | "badge.svg", text: string): void {
  writeOutput(root, name, text, false);
}

export function appendProjectLog(root: string, text: string): void {
  writeOutput(root, "hook.log", text, true);
}

export function readProjectFindings(root: string): string {
  const target = outputFile(root, "findings.json", false);
  const expected = lstatSync(target);
  if (!expected.isFile() || expected.isSymbolicLink() || expected.nlink !== 1) {
    throw new Error("Canary findings must be a regular file inside the project.");
  }
  const fd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || opened.ino !== expected.ino || opened.dev !== expected.dev) {
      throw new Error("Canary findings changed while opening them.");
    }
    return readFileSync(fd, "utf8");
  } finally {
    closeSync(fd);
  }
}
