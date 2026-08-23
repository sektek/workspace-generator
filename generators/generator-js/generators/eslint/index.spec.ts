import { dirname, join } from 'path';
import { mkdtempSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

import { expect } from 'chai';
import { helper } from '@sektek/generator-test';

import { EslintGenerator } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const generator = join(__dirname, 'index.js');

const run = (options: Record<string, unknown>) =>
  helper
    .run(generator)
    .withOptions(options)
    .withGenerators([
      [
        join(__dirname, '../prettier/index.js'),
        { namespace: '@sektek/js:prettier' },
      ],
    ]);

describe('@sektek/js:eslint', function () {
  it('generates using EslintGenerator', async function () {
    const result = await run({ language: 'javascript' });
    expect(result.generator).to.be.instanceOf(EslintGenerator);
  });

  it('composes the prettier generator', async function () {
    const { fs } = await run({ language: 'javascript' });
    expect(fs.exists('.prettierrc.js')).to.be.true;
  });

  describe('with language: javascript', function () {
    it('generates an eslint.config.js using the recommended config', async function () {
      const { fs } = await run({ language: 'javascript' });
      expect(fs.exists('eslint.config.js')).to.be.true;
      expect(fs.read('eslint.config.js')).to.include(
        'sektek.configs.recommended',
      );
    });
  });

  describe('with language: typescript', function () {
    it('generates an eslint.config.js using the typescript config', async function () {
      const { fs } = await run({ language: 'typescript' });
      expect(fs.read('eslint.config.js')).to.include(
        'sektek.configs.typescript',
      );
    });
  });

  describe('run standalone against an existing project', function () {
    it('still sorts the merged dependencies/devDependencies', async function () {
      const destinationRoot = mkdtempSync(
        join(tmpdir(), 'sektek-eslint-standalone-spec-'),
      );
      writeFileSync(
        join(destinationRoot, 'package.json'),
        JSON.stringify({
          name: 'existing-project',
          dependencies: {},
          devDependencies: { zod: '^3.0.0', mocha: '^10.0.0' },
        }),
      );

      const { fs } = await run({
        language: 'javascript',
        destinationRoot,
      });
      const pkg = JSON.parse(fs.read(join(destinationRoot, 'package.json')));

      expect(Object.keys(pkg.devDependencies)).to.deep.equal(
        [...Object.keys(pkg.devDependencies)].sort((a, b) =>
          a.localeCompare(b, 'en'),
        ),
      );
      expect(Object.keys(pkg.devDependencies)).to.include('mocha');
      expect(Object.keys(pkg.devDependencies)).to.include('eslint');
    });
  });
});
