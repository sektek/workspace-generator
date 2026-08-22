import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

import { expect } from 'chai';
import { helper } from '@sektek/generator-test';

import { BasePackageGenerator } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const generator = join(__dirname, 'index.js');

// destinationRoot is a real, named directory (not the run context's
// default temp one) to exercise packageName/projectSlug against an
// actual folder name, e.g. one containing a hyphen. Passed as a
// generator option rather than RunContext's `cwd` setting, which does a
// real process.chdir() and isn't isolated between tests.
const runIn = async (dirName: string, options: Record<string, unknown>) => {
  const destinationRoot = join(tmpdir(), 'sektek-base-package-spec', dirName);
  const { fs } = await helper
    .run(generator)
    .withOptions({ ...options, destinationRoot });
  return JSON.parse(fs.read(join(destinationRoot, 'package.json')));
};

describe('@sektek/js:base-package', function () {
  it('generates using BasePackageGenerator', async function () {
    const result = await helper
      .run(generator)
      .withOptions({ language: 'javascript' });
    expect(result.generator).to.be.instanceOf(BasePackageGenerator);
  });

  describe('with language: javascript', function () {
    it('generates a package.json and a plain-JS entrypoint', async function () {
      const { fs } = await helper
        .run(generator)
        .withOptions({ language: 'javascript' });
      expect(fs.exists('package.json')).to.be.true;
      expect(fs.exists('index.js')).to.be.true;
      expect(fs.exists('index.spec.js')).to.be.true;
    });
  });

  describe('with language: typescript', function () {
    it('generates a package.json but no entrypoint', async function () {
      const { fs } = await helper
        .run(generator)
        .withOptions({ language: 'typescript' });
      expect(fs.exists('package.json')).to.be.true;
      expect(fs.exists('index.ts')).to.be.false;
      expect(fs.exists('index.js')).to.be.false;
    });
  });

  describe('package.json content', function () {
    it('does not double up an already-@-prefixed packageScope', async function () {
      const packageJson = await runIn('scope-test', {
        language: 'javascript',
        packageScope: '@sektek',
      });
      expect(packageJson.name).to.match(/^@sektek\//);
      expect(packageJson.name).to.not.include('@@');
    });

    it('does not HTML-escape the author field', async function () {
      const packageJson = await runIn('author-test', {
        language: 'javascript',
        author: 'Edward Kelly <eddie@sektek.net>',
      });
      expect(packageJson.author).to.equal('Edward Kelly <eddie@sektek.net>');
    });

    it('JSON-escapes an author/description containing quotes and newlines', async function () {
      const packageJson = await runIn('json-escape-test', {
        language: 'javascript',
        author: 'Edward "Eddie" Kelly <eddie@sektek.net>\nSecond line',
        description: 'A "quoted" description',
      });
      expect(packageJson.author).to.equal(
        'Edward "Eddie" Kelly <eddie@sektek.net>\nSecond line',
      );
      expect(packageJson.description).to.equal('A "quoted" description');
    });

    it('uses a hyphenated, space-free slug in the repository url', async function () {
      const packageJson = await runIn('test-prj', { language: 'javascript' });
      expect(packageJson.repository.url).to.equal(
        'git@github.com:sektek/test-prj.git',
      );
    });
  });
});
