import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { expect } from 'chai';
import { helper } from '@sektek/generator-test';

import { AppGenerator } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const generator = join(__dirname, 'index.js');

// AppGenerator's compose chain reaches two levels deep: app -> @sektek/base:app
// -> editorconfig/gitconfig/readme, and app -> eslint -> prettier. The shared
// test helper has nothing registered under any of these namespaces by
// default, so every namespace actually reached anywhere in the chain must be
// registered by path (registering by class reference instead would break
// templatePath()/sourceRoot() resolution for whichever generator it's used on).
const generatorBaseGenerators = join(
  __dirname,
  '../../../generator-base/generators',
);

const run = (options: Record<string, unknown> = { language: 'javascript' }) =>
  helper
    .run(generator)
    .withOptions(options)
    .withGenerators([
      [
        join(generatorBaseGenerators, 'app/index.js'),
        { namespace: '@sektek/base:app' },
      ],
      [
        join(generatorBaseGenerators, 'editorconfig/index.js'),
        { namespace: '@sektek/base:editorconfig' },
      ],
      [
        join(generatorBaseGenerators, 'gitconfig/index.js'),
        { namespace: '@sektek/base:gitconfig' },
      ],
      [
        join(generatorBaseGenerators, 'readme/index.js'),
        { namespace: '@sektek/base:readme' },
      ],
      [
        join(generatorBaseGenerators, 'devcontainer/index.js'),
        { namespace: '@sektek/base:devcontainer' },
      ],
      [
        join(__dirname, '../base-package/index.js'),
        { namespace: '@sektek/js:base-package' },
      ],
      [
        join(__dirname, '../gitconfig/index.js'),
        { namespace: '@sektek/js:gitconfig' },
      ],
      [
        join(__dirname, '../typescript/index.js'),
        { namespace: '@sektek/js:typescript' },
      ],
      [
        join(__dirname, '../eslint/index.js'),
        { namespace: '@sektek/js:eslint' },
      ],
      [
        join(__dirname, '../prettier/index.js'),
        { namespace: '@sektek/js:prettier' },
      ],
      [join(__dirname, '../mocha/index.js'), { namespace: '@sektek/js:mocha' }],
    ]);

describe('@sektek/js:app', function () {
  it('generates using AppGenerator', async function () {
    const result = await run();
    expect(result.generator).to.be.instanceOf(AppGenerator);
  });

  it('composes @sektek/base (editorconfig, gitconfig, readme)', async function () {
    const { fs } = await run();
    expect(fs.exists('.editorconfig')).to.be.true;
    expect(fs.exists('.gitignore')).to.be.true;
    expect(fs.exists('README.md')).to.be.true;
  });

  it('layers JS-specific gitignore rules on top of the base gitignore', async function () {
    const { fs } = await run();
    const gitignore = fs.read('.gitignore');
    expect(gitignore).to.include('END BASE GITIGNORE');
    expect(gitignore).to.include('BEGIN JavaScript');
  });

  it('composes base-package', async function () {
    const { fs } = await run();
    expect(fs.exists('package.json')).to.be.true;
  });

  it('composes eslint and prettier', async function () {
    const { fs } = await run();
    expect(fs.exists('eslint.config.js')).to.be.true;
    expect(fs.exists('.prettierrc.js')).to.be.true;
  });

  it('composes mocha', async function () {
    const { fs } = await run();
    expect(fs.exists('.mocharc.cjs')).to.be.true;
  });

  it('composes devcontainer, using the sektek/devcontainer-base image', async function () {
    const { fs } = await run();
    expect(fs.exists('.devcontainer/devcontainer.json')).to.be.true;
    expect(fs.read('.devcontainer/Dockerfile')).to.include(
      'sektek/devcontainer-base',
    );
  });

  it('composes typescript when language is typescript', async function () {
    const { fs } = await run({ language: 'typescript' });
    expect(fs.exists('tsconfig.json')).to.be.true;
    expect(fs.exists('index.ts')).to.be.true;
  });

  it('does not compose typescript when language is javascript', async function () {
    const { fs } = await run({ language: 'javascript' });
    expect(fs.exists('tsconfig.json')).to.be.false;
  });

  it('sorts merged package.json dependencies/devDependencies alphabetically', async function () {
    const { fs } = await run({ language: 'typescript' });
    const pkg = JSON.parse(fs.read('package.json'));
    const sorted = (obj: Record<string, string>) =>
      [...Object.keys(obj)].sort((a, b) => a.localeCompare(b, 'en'));

    expect(Object.keys(pkg.dependencies)).to.deep.equal(
      sorted(pkg.dependencies),
    );
    expect(Object.keys(pkg.devDependencies)).to.deep.equal(
      sorted(pkg.devDependencies),
    );
    // eslint composition order adds 'eslint' before its own
    // '@sektek/eslint-plugin' devDependency — asserting the scoped package
    // now comes first confirms the sort actually ran.
    const devDepKeys = Object.keys(pkg.devDependencies);
    expect(devDepKeys.indexOf('@sektek/eslint-plugin')).to.be.lessThan(
      devDepKeys.indexOf('eslint'),
    );
  });
});
