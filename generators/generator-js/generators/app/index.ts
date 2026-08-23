import '../base-package/index.js';
import '../gitconfig/index.js';
import '../typescript/index.js';
import '../eslint/index.js';
import '../mocha/index.js';

import { BaseConfig } from '../../lib/types/base-config.js';
import { BaseFeatures } from '../../lib/types/base-features.js';
import { BaseGenerator } from '../../lib/base-generator.js';
import { BaseOptions } from '../../lib/types/base-options.js';

const DEFAULT_FEATURES: Partial<BaseFeatures> = {
  unique: true,
};

export class AppGenerator extends BaseGenerator<
  BaseConfig,
  BaseOptions,
  BaseFeatures
> {
  constructor(
    args: string[],
    options: BaseOptions,
    features: BaseFeatures = {} as BaseFeatures,
  ) {
    super(args, options, { ...DEFAULT_FEATURES, ...features });
  }

  async taskInitializing() {
    const { options } = this;
    const { language } = options;

    await this.composeWith('@sektek/base:app', options, true);
    await this.composeWith('gitconfig', options, true);
    await this.composeWith('@sektek/base:devcontainer', options, true);
    await this.composeWith('base-package', options, true);

    if (language === 'typescript') {
      await this.composeWith('typescript', options, true);
    }

    await this.composeWith('eslint', options, true);
    await this.composeWith('mocha', options, true);
  }
}

export default AppGenerator;
