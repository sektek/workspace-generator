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
  // Null-prototype + Object.hasOwn: a config file's own keys (parsed by
  // JSON.parse/yaml's parser, which define them directly rather than going
  // through a setter) are safe, but building this object up via bracket
  // assignment is not — a key literally named `__proto__` would otherwise
  // invoke Object.prototype's inherited setter and repoint this object's
  // own prototype instead of just storing a value under that key.
  const result: ConfigDefaults = Object.create(null) as ConfigDefaults;

  for (const dir of configSearchPaths(cwd, homeDir)) {
    const config = await loadConfig(dir);
    if (!config) {
      continue;
    }

    for (const [key, value] of Object.entries(
      effectiveDefaults(config, family, generator),
    )) {
      if (!Object.hasOwn(result, key)) {
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
  const [pkg, generator] = namespace.split(':');
  const family = pkg?.split('/')[1];
  if (!family || !generator) {
    throw new Error(
      `resolveConfigDefaults(): expected a resolved namespace like "@sektek/js:app", got ${JSON.stringify(namespace)}`,
    );
  }
  return { family, generator };
}

/**
 * Merges one directory's config into the effective defaults for a single
 * namespace: every top-level key whose value isn't itself a plain object
 * (every real option value is a scalar — a nested object can only be
 * namespace-section structure, `family`'s own or another's, never a
 * default value), overridden by whatever's namespaced under
 * `family.generator`, if anything.
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
  // Object.fromEntries defines properties directly rather than assigning
  // through them, so a `__proto__` key here can't hijack this object's
  // prototype the way `topLevel[key] = value` could.
  const topLevel = Object.fromEntries(
    Object.entries(config).filter(
      ([, value]) => asConfigObject(value) === undefined,
    ),
  );

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
