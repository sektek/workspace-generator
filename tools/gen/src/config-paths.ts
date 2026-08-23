import { dirname } from 'node:path';
import { realpathSync } from 'node:fs';

/**
 * Builds the ordered list of directories to search for a config file:
 * `cwd`, every ancestor up to and including the filesystem root, then
 * `homeDir` appended once at the end if it isn't already covered by that
 * walk (e.g. `cwd` being a descendant of `homeDir`).
 *
 * Takes `cwd`/`homeDir` as explicit params rather than reading
 * `process.cwd()`/`os.homedir()` (or calling `process.chdir()`) itself —
 * a prior session traced real data corruption to a test helper's `cwd`
 * option doing exactly that, so this stays a pure function of its inputs.
 * Directories are deduped by real path (`fs.realpathSync`), so symlinked
 * paths that resolve to the same place on disk only appear once.
 *
 * @param cwd - The directory to start the ancestor walk from.
 * @param homeDir - The user's home directory.
 * @returns The ordered, deduped list of directories to search.
 */
export function configSearchPaths(cwd: string, homeDir: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  let current = realpathSync(cwd);
  for (;;) {
    if (!seen.has(current)) {
      paths.push(current);
      seen.add(current);
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  const home = realpathSync(homeDir);
  if (!seen.has(home)) {
    paths.push(home);
  }

  return paths;
}
