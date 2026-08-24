/** Promise wrapper fs untuk worker Excel Sync. */
import { stat as fsStat, rm as fsRm } from "node:fs/promises";

export async function statFile(path) {
  return fsStat(path);
}

export async function rmFile(path) {
  await fsRm(path, { force: true });
}
