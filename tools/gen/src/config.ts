import { ConfigObject, loadConfig } from './config-loader.js';
import { configSearchPaths } from './config-paths.js';

export type ConfigDefaults = Record<string, unknown>;

/**
 * Resolves the merged config-file defaults for a generator namespace, by
 * walking `cwd`'s directory hierarchy (and `homeDir`) via
 * {@link configSearchPaths} and, per key, taking the first directory whose
 * config defines it — namespaced value (`<family>.<generator>.key`) if
 * present, else that directory's top-level value.
 *
 * Doesn't know or care about `schema.ts` — a config file's keys are
 * returned as-is, whatever they are; the caller filters against its own
 * schema.
 *
 * @param namespace - The resolved generator namespace, e.g. `@sektek/js:app`.
 * @param dirs - Where to search from.
 * @param dirs.cwd - The directory to start the ancestor walk from.
 * @param dirs.homeDir - The user's home directory.
 * @returns The merged defaults found across the directory hierarchy.
 */
export async function resolveConfigDefaults(
  namespace: string,
  { cwd, homeDir }: { cwd: string; homeDir: string },
): Promise<ConfigDefaults> {
  const { family, generator } = parseNamespace(namespace);
  const result: ConfigDefaults = {};

  for (const dir of configSearchPaths(cwd, homeDir)) {
    const config = await loadConfig(dir);
    if (!config) {
      continue;
    }

    for (const [key, value] of Object.entries(
      effectiveDefaults(config, family, generator),
    )) {
      if (!(key in result)) {
        result[key] = value;
      }
    }
  }

  return result;
}

/**
 * Splits a resolved namespace into the package family and generator name
 * its config nesting (`<family>.<generator>.key`) is keyed on.
 *
 * @param namespace - e.g. `@sektek/js:app`.
 * @returns The package family (`js`/`base`) and generator name.
 */
function parseNamespace(namespace: string): {
  family: string;
  generator: string;
} {
  const [pkg, generator = ''] = namespace.split(':');
  const family = pkg.split('/')[1] ?? '';
  return { family, generator };
}

/**
 * Merges one directory's config into the effective defaults for a single
 * namespace: every top-level key except `family`'s own section (that's
 * structural nesting, not a default value), overridden by whatever's
 * namespaced under `family.generator`, if anything.
 *
 * @param config - One directory's parsed config file.
 * @param family - The current run's package family (`js`/`base`).
 * @param generator - The current run's generator name.
 * @returns This directory's effective defaults for that namespace.
 */
function effectiveDefaults(
  config: ConfigObject,
  family: string,
  generator: string,
): ConfigObject {
  const topLevel: ConfigObject = {};
  for (const [key, value] of Object.entries(config)) {
    if (key !== family) {
      topLevel[key] = value;
    }
  }

  const namespaced = asConfigObject(
    asConfigObject(config[family])?.[generator],
  );

  return { ...topLevel, ...namespaced };
}

/**
 * Narrows a config value to a plain object, if it is one.
 *
 * @param value - The value to narrow.
 * @returns `value` if it's a plain object, else undefined.
 */
function asConfigObject(value: unknown): ConfigObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as ConfigObject)
    : undefined;
}

export default resolveConfigDefaults;
