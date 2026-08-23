import { CoreGenerator } from '@sektek/generator';
import latestVersion from 'latest-version';

import { BaseConfig } from './types/base-config.js';
import { BaseFeatures } from './types/base-features.js';
import { BaseOptions } from './types/base-options.js';
import { sortPackageJsonDependencies } from './sort-package-json-dependencies.js';

const DEFAULT_OPTIONS: Partial<BaseOptions> = {
  packageScope: 'sektek',
  author: 'Edward Kelly <eddie@sektek.net>',
  license: 'UNLICENSED',
  private: true,
};

export class BaseGenerator<
  C extends BaseConfig = BaseConfig,
  O extends BaseOptions = BaseOptions,
  F extends BaseFeatures = BaseFeatures,
> extends CoreGenerator<C, O, F> {
  package = '@sektek/js';
  dependencies: Record<string, string> = {};
  devDependencies: Record<string, string> = {};

  constructor(args: string[], options: O, features?: F) {
    super(args, { ...DEFAULT_OPTIONS, ...options }, features);
  }

  async addDependency(name: string, version?: string) {
    this.dependencies[name] = await this.#resolveVersion(name, version);
  }

  async addDevDependency(name: string, version?: string) {
    this.devDependencies[name] = await this.#resolveVersion(name, version);
  }

  async #resolveVersion(name: string, version?: string) {
    if (!version) {
      return await latestVersion(name);
    } else {
      return await latestVersion(name, { version });
    }
  }

  writeDependencies() {
    const { dependencies, devDependencies } = this;

    this.fs.extendJSON(this.destinationPath('package.json'), {
      dependencies,
      devDependencies,
    });
  }

  // Every JS sub-generator extends this class, whether composed under
  // @sektek/js:app/workspace or run standalone against an existing
  // project (e.g. `gen js:eslint --dest <existing-project>`) — sorting
  // here rather than only on the two "root" composers means a
  // standalone run's writeDependencies() call still ends up sorted.
  // Yeoman runs a priority to completion, across every composed
  // generator, before the next one starts, so by the time any instance's
  // taskTransform fires, every composed generator's writing-priority
  // writeDependencies() call (including this one's own) has already run.
  // Sorting is idempotent, so when several composed generators each
  // extend this class, the redundant re-sorts after the first are cheap
  // no-ops rather than a correctness problem.
  taskTransform() {
    sortPackageJsonDependencies(this);
  }
}

export default BaseGenerator;
