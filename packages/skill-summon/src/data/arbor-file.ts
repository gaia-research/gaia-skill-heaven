import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { resolve } from "node:path";

import { assertConfinedPath } from "../summon/session.js";

/** Kernel-enforced no-symlink opening; a check followed by plain open is not safe. */
export async function readConfinedArborFile(root: string, target: string): Promise<Buffer> {
  await assertConfinedPath(root, target, "Arbor file");
  let absolute = resolve(target);
  const handles: FileHandle[] = [];
  try {
    let file: FileHandle;
    if (process.platform === "darwin") {
      // Only the standard OS aliases are canonicalized, never an arbitrary
      // realpath supplied by a concurrently replaceable publication directory.
      if (absolute.startsWith("/tmp/")) absolute = `/private${absolute}`;
      if (absolute.startsWith("/var/")) absolute = `/private${absolute}`;
      // Darwin sys/fcntl.h: O_NOFOLLOW_ANY rejects symlinks in EVERY component.
      // Node exposes O_NOFOLLOW (leaf only), but not this kernel flag.
      // Unsupported kernels fail closed rather than falling back to plain open.
      file = await open(absolute, constants.O_RDONLY | constants.O_NONBLOCK | 0x20000000);
      handles.push(file);
    } else if (process.platform === "linux") {
      // /proc/self/fd anchors traversal to held directory descriptors. Renames
      // cannot redirect a later component to a different parent directory.
      let parent = await open("/", constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      handles.push(parent);
      const parts = absolute.split("/").filter(Boolean);
      if (parts.length === 0) throw new Error("Arbor file is not a regular file");
      for (const part of parts.slice(0, -1)) {
        parent = await open(`/proc/self/fd/${parent.fd}/${part}`,
          constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
        handles.push(parent);
      }
      file = await open(`/proc/self/fd/${parent.fd}/${parts.at(-1)!}`,
        constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
      handles.push(file);
    } else {
      throw new Error("Secure Arbor file opening is unavailable on this platform");
    }
    if (!(await file.stat()).isFile()) throw new Error("Arbor file is not a regular file");
    return await file.readFile();
  } finally {
    await Promise.all(handles.map((handle) => handle.close()));
  }
}
