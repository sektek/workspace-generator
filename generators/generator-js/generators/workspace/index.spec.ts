import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { expect } from 'chai';
import { helper } from '@sektek/generator-test';

import { WorkspaceGenerator } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const generator = join(__dirname, 'index.js');

// WorkspaceGenerator's compose chain reaches two levels deep: workspace ->
// @sektek/base:workspace -> editorconfig/gitconfig/readme/devcontainer, and
// workspace -> eslint -> prettier. The shared test helper has nothing
// registered under any of these namespaces by default, so every namespace
// actually reached anywhere in the chain must be registered by path.
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
        join(generatorBaseGenerators, 'workspace/index.js'),
        { namespace: '@sektek/base:workspace' },
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
        join(__dirname, '../gitconfig/index.js'),
        { namespace: '@sektek/js:gitconfig' },
      ],
      [
        join(__dirname, '../eslint/index.js'),
        { namespace: '@sektek/js:eslint' },
      ],
      [
        join(__dirname, '../prettier/index.js'),
        { namespace: '@sektek/js:prettier' },
      ],
    ]);

describe('@sektek/js:workspace', function () {
  it('generates using WorkspaceGenerator', async function () {
    const result = await run();
    expect(result.generator).to.be.instanceOf(WorkspaceGenerator);
  });

  it('composes @sektek/base:workspace (devcontainer, vscode, readme checklist)', async function () {
    const { fs } = await run();
    expect(fs.exists('.devcontainer/devcontainer.json')).to.be.true;
    expect(fs.read('.devcontainer/devcontainer.json')).to.include(
      'dockerComposeFile',
    );
    expect(fs.exists('.vscode/settings.json')).to.be.true;
    expect(fs.read('README.md')).to.include('## Changes Required');
  });

  it('layers JS-specific gitignore rules on top of the base gitignore', async function () {
    const { fs } = await run();
    const gitignore = fs.read('.gitignore');
    expect(gitignore).to.include('END BASE GITIGNORE');
    expect(gitignore).to.include('BEGIN JavaScript');
  });

  it('writes a root package.json and merges scripts/devDependencies from composed generators', async function () {
    const { fs } = await run();
    const pkg = JSON.parse(fs.read('package.json'));
    expect(pkg.workspaces).to.deep.equal(['apps/*', 'libs/*', 'tools/*']);
    expect(pkg.scripts.build).to.equal(
      'npm run build --workspaces --if-present',
    );
    expect(pkg.scripts.lint).to.equal('eslint . --cache');
    expect(pkg.devDependencies).to.have.property('eslint');
    expect(pkg.devDependencies).to.have.property('prettier');
  });

  it('merges JS-specific keys into .vscode/settings.json alongside the base keys', async function () {
    // .vscode/settings.json contains JSONC comments (valid for VS Code), so
    // check textually rather than JSON.parse-ing it.
    const { fs } = await run();
    const settings = fs.read('.vscode/settings.json');
    expect(settings).to.include('sqltools.connections');
    expect(settings).to.include('githubPullRequests.autoRepositoryDetection');
    expect(settings).to.include('"mochaExplorer.esmLoader": true');
  });

  it('generates .mocharc.cjs and .npmrc', async function () {
    const { fs } = await run();
    expect(fs.exists('.mocharc.cjs')).to.be.true;
    expect(fs.exists('.npmrc')).to.be.true;
  });

  it('generates apps/libs/tools placeholder directories', async function () {
    const { fs } = await run();
    expect(fs.exists('apps/.gitkeep')).to.be.true;
    expect(fs.exists('libs/.gitkeep')).to.be.true;
    expect(fs.exists('tools/.gitkeep')).to.be.true;
  });

  describe('with language: typescript', function () {
    it('generates tsconfig.json and tsconfig.build.json', async function () {
      const { fs } = await run({ language: 'typescript' });
      expect(fs.exists('tsconfig.json')).to.be.true;
      expect(fs.exists('tsconfig.build.json')).to.be.true;
    });
  });

  describe('with language: javascript', function () {
    it('does not generate tsconfig files', async function () {
      const { fs } = await run({ language: 'javascript' });
      expect(fs.exists('tsconfig.json')).to.be.false;
    });
  });

  it('sorts merged package.json dependencies/devDependencies alphabetically', async function () {
    const { fs } = await run({ language: 'typescript' });
    const pkg = JSON.parse(fs.read('package.json'));
    const sorted = (obj: Record<string, string>) =>
      [...Object.keys(obj)].sort((a, b) => a.localeCompare(b, 'en'));

    expect(Object.keys(pkg.dependencies ?? {})).to.deep.equal(
      sorted(pkg.dependencies ?? {}),
    );
    expect(Object.keys(pkg.devDependencies)).to.deep.equal(
      sorted(pkg.devDependencies),
    );
    const devDepKeys = Object.keys(pkg.devDependencies);
    expect(devDepKeys.indexOf('@sektek/eslint-plugin')).to.be.lessThan(
      devDepKeys.indexOf('eslint'),
    );
  });
});
