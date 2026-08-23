import { BaseGenerator } from './base-generator.js';

type PackageDependencies = Record<string, string>;

/**
 * Rebuilds a dependencies map with its keys re-inserted in sorted order.
 * Plain default `.sort()` (no `localeCompare`), matching what a real
 * `npm install --save[-dev]` writes.
 *
 * @param deps - The dependencies map to sort.
 * @returns A new map with the same entries, sorted by key.
 */
function sortDependencies(deps: PackageDependencies): PackageDependencies {
  return Object.fromEntries(
    Object.keys(deps)
      .sort()
      .map(name => [name, deps[name]]),
  );
}

/**
 * Re-sorts an already-written package.json's `dependencies`/`devDependencies`
 * alphabetically and rewrites the file.
 *
 * Composed sub-generators each call `BaseGenerator#writeDependencies()`
 * during the shared `writing` priority, in composition order, so
 * package.json's dependencies/devDependencies accumulate unsorted. Yeoman
 * runs a priority to completion across every composed generator before the
 * next one starts, so calling this at `transform` priority (after `writing`)
 * is guaranteed to see the fully-merged result regardless of composition
 * order.
 *
 * @param generator - The generator instance owning the package.json to sort.
 */
export function sortPackageJsonDependencies(generator: BaseGenerator): void {
  const packageJsonPath = generator.destinationPath('package.json');
  const pkg = generator.fs.readJSON(packageJsonPath) as
    | ({
        dependencies?: PackageDependencies;
        devDependencies?: PackageDependencies;
      } & Record<string, unknown>)
    | undefined;

  if (!pkg) {
    return;
  }

  if (pkg.dependencies) {
    pkg.dependencies = sortDependencies(pkg.dependencies);
  }

  if (pkg.devDependencies) {
    pkg.devDependencies = sortDependencies(pkg.devDependencies);
  }

  generator.fs.writeJSON(packageJsonPath, pkg);
}

export default sortPackageJsonDependencies;
