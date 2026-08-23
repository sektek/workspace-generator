import type { BaseGenerator } from './base-generator.js';

type PackageDependencies = Record<string, string>;

/**
 * Rebuilds a dependencies map with its keys re-inserted in sorted order.
 * Sorted with `localeCompare('en')`, matching what a real
 * `npm install --save[-dev]` writes (see \@npmcli/package-json's update-dependencies.js).
 *
 * @param deps - The dependencies map to sort.
 * @returns A new map with the same entries, sorted by key.
 */
function sortDependencies(deps: PackageDependencies): PackageDependencies {
  return Object.fromEntries(
    Object.keys(deps)
      .sort((a, b) => a.localeCompare(b, 'en'))
      .map(name => [name, deps[name]]),
  );
}

/**
 * Re-sorts an already-written package.json's `dependencies`/`devDependencies`
 * alphabetically and rewrites the file.
 *
 * Meant to run at `transform` priority: Yeoman runs a priority queue to
 * completion, across every composed generator, before the next one starts,
 * so by then every `writing`-priority `writeDependencies()` call has already
 * merged its keys in, regardless of composition order.
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
