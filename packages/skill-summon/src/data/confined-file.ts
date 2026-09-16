import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { resolve } from "node:path";

import { assertConfinedPath } from "../summon/session.js";

/** Kernel-enforced no-symlink opening; a check followed by plain open is not safe. */
export async function readConfinedFile(root: string, target: string): Promise<Buffer> {
  // On macOS /tmp and /var are symlink aliases of /private/tmp and
  // /private/var. Canonicalize only those OS-owned aliases before the
  // confinement check; user-controlled symlink components still fail closed.
  const confinedRoot = darwinAlias(resolve(root));
  const absolute = darwinAlias(resolve(target));
  await assertConfinedPath(confinedRoot, absolute, "Optional evidence file");
  const handles: FileHandle[] = [];
  try {
    let file: FileHandle;
    if (process.platform === "darwin") {
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
      if (parts.length === 0) throw new Error("Evidence file is not a regular file");
      for (const part of parts.slice(0, -1)) {
        parent = await open(`/proc/self/fd/${parent.fd}/${part}`,
          constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
        handles.push(parent);
      }
      file = await open(`/proc/self/fd/${parent.fd}/${parts.at(-1)!}`,
        constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
      handles.push(file);
    } else {
      throw new Error("Secure evidence file opening is unavailable on this platform");
    }
    if (!(await file.stat()).isFile()) throw new Error("Evidence file is not a regular file");
    return await file.readFile();
  } finally {
    await Promise.all(handles.map((handle) => handle.close()));
  }
}

function darwinAlias(value: string): string {
  if (process.platform !== "darwin") return value;
  if (value === "/tmp" || value.startsWith("/tmp/")) return `/private${value}`;
  if (value === "/var" || value.startsWith("/var/")) return `/private${value}`;
  return value;
}
