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

    this.queueTask({
      method: () => sortPackageJsonDependencies(this),
      taskName: 'sortPackageJsonDependencies',
      queueName: 'transform',
      once: true,
    });
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
}

export default BaseGenerator;
