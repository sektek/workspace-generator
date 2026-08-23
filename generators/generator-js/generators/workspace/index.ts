import '../eslint/index.js';
import '../gitconfig/index.js';

import { BaseConfig } from '../../lib/types/base-config.js';
import { BaseFeatures } from '../../lib/types/base-features.js';
import { BaseGenerator } from '../../lib/base-generator.js';
import { BaseOptions } from '../../lib/types/base-options.js';

const DEFAULT_FEATURES: Partial<BaseFeatures> = {
  unique: true,
};

const CONFIG_TEMPLATES = {
  'mocharc.cjs.ejs': '.mocharc.cjs',
  'npmrc.ejs': '.npmrc',
};

const TS_TEMPLATES = {
  'tsconfig.json.ejs': 'tsconfig.json',
  'tsconfig.build.json.ejs': 'tsconfig.build.json',
};

const WORKSPACE_DIRS = ['apps', 'libs', 'tools'];

export const BUILD_SCRIPT = 'npm run build --workspaces --if-present';

export class WorkspaceGenerator extends BaseGenerator<
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

  // Composed here rather than in taskInitializing: beforeQueue runs before
  // this generator's own task queue is built, so @sektek/base:workspace
  // writes .vscode/settings.json before our own taskWriting merges into it.
  async beforeQueue() {
    await this.composeWith('@sektek/base:workspace', this.options, true);
  }

  async taskInitializing() {
    await this.composeWith('gitconfig', this.options, true);
    await this.composeWith('eslint', this.options, true);
  }

  async taskDefault() {
    await this.addDevDependency('c8');
    await this.addDevDependency('mocha');

    if (this.options.language === 'typescript') {
      await this.addDevDependency('typescript');
      await this.addDevDependency('tsx');
    }
  }

  taskWriting() {
    const { language, author, license, private: isPrivate } = this.options;

    // Queued at instantiation, before taskInitializing's composeWith calls
    // run, so this write lands before eslint/prettier's later extendJSON
    // merges into the same package.json.
    this.fs.copyTpl(
      this.templatePath('package.json.ejs'),
      this.destinationPath('package.json'),
      {
        projectSlug: this.projectSlug,
        author,
        license,
        privatePackage: isPrivate,
      },
    );

    Object.entries(CONFIG_TEMPLATES).forEach(([template, destination]) => {
      this.fs.copyTpl(
        this.templatePath(template),
        this.destinationPath(destination),
        {},
      );
    });

    if (language === 'typescript') {
      Object.entries(TS_TEMPLATES).forEach(([template, destination]) => {
        this.fs.copyTpl(
          this.templatePath(template),
          this.destinationPath(destination),
          {},
        );
      });
    }

    WORKSPACE_DIRS.forEach(dir => {
      this.fs.write(this.destinationPath(`${dir}/.gitkeep`), '');
    });

    this.fs.extendJSON(this.destinationPath('package.json'), {
      scripts: {
        build: BUILD_SCRIPT,
      },
    });

    // .vscode/settings.json has JSONC comments, which extendJSON's strict
    // JSON.parse can't handle — insert these keys textually instead.
    const settingsPath = this.destinationPath('.vscode/settings.json');
    const settings = this.fs.read(settingsPath) ?? '';
    this.fs.write(
      settingsPath,
      settings.replace(
        /^\{\n/,
        '{\n' +
          '  "mochaExplorer.esmLoader": true,\n' +
          '  "mochaExplorer.nodeArgv": ["--import=tsx/esm"],\n',
      ),
    );

    this.writeDependencies();
  }
}

export default WorkspaceGenerator;
