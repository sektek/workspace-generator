import type { BaseGenerator } from './base-generator.js';

type PackageDependencies = Record<string, string>;

/**
 * Matches npm's own sort (@npmcli/package-json's update-dependencies.js), not a plain default .sort().
 *
 * @param deps - Unsorted.
 * @returns Sorted copy.
 */
function sortDependencies(deps: PackageDependencies): PackageDependencies {
  return Object.fromEntries(
    Object.keys(deps)
      .sort((a, b) => a.localeCompare(b, 'en'))
      .map(name => [name, deps[name]]),
  );
}

/**
 * Must run at transform priority (after writing) to see every composed generator's merged dependencies.
 *
 * @param generator - Owns the package.json to sort.
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
