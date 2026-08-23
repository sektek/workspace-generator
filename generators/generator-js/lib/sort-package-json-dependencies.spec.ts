import { expect } from 'chai';
import { helper } from '@sektek/generator-test';

import { BaseGenerator } from './base-generator.js';
import { sortPackageJsonDependencies } from './sort-package-json-dependencies.js';

// Deliberately chosen so that a plain default `.sort()` and npm's real
// `localeCompare('en')` sort disagree: plain `.sort()` compares UTF-16 code
// units, where '@' (0x40) sorts after the digit range ('0'-'9' are
// 0x30-0x39), so it places '0x' before '@types/node'. `localeCompare('en')`
// collates '@types/node' before '0x' instead, matching what a real
// `npm install --save[-dev]` actually writes (see @npmcli/package-json's
// update-dependencies.js, which sorts with
// `.sort((a, b) => a.localeCompare(b, 'en'))`).
class SortFixtureGenerator extends BaseGenerator {
  taskWriting() {
    this.dependencies = {
      'is-odd': '^1.0.0',
      '0x': '^1.0.0',
      '@types/node': '^1.0.0',
    };
    this.devDependencies = {
      'is-odd': '^1.0.0',
      '0x': '^1.0.0',
      '@types/node': '^1.0.0',
    };
    this.writeDependencies();
  }

  taskTransform() {
    sortPackageJsonDependencies(this);
  }
}

const run = () =>
  helper.run(SortFixtureGenerator).withOptions({ language: 'javascript' });

describe('sortPackageJsonDependencies', function () {
  it('sorts dependencies using localeCompare("en"), matching real `npm install`', async function () {
    const { fs } = await run();
    const pkg = JSON.parse(fs.read('package.json'));

    // Sanity check: this input order genuinely diverges between a plain
    // default `.sort()` (['0x', '@types/node', 'is-odd']) and
    // `localeCompare('en')` (['@types/node', '0x', 'is-odd']) — if the
    // assertion below is also what a plain `.sort()` would produce, the
    // test isn't exercising the distinction it's meant to guard.
    expect(Object.keys(pkg.dependencies)).to.deep.equal([
      '@types/node',
      '0x',
      'is-odd',
    ]);
  });

  it('sorts devDependencies using localeCompare("en") as well', async function () {
    const { fs } = await run();
    const pkg = JSON.parse(fs.read('package.json'));

    expect(Object.keys(pkg.devDependencies)).to.deep.equal([
      '@types/node',
      '0x',
      'is-odd',
    ]);
  });
});
