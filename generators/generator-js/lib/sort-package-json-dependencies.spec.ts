import { expect } from 'chai';
import { helper } from '@sektek/generator-test';

import { BaseGenerator } from './base-generator.js';

// '0x' vs '@types/node' is deliberate: plain .sort() and localeCompare('en') disagree on this pair.
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
}

const run = () =>
  helper.run(SortFixtureGenerator).withOptions({ language: 'javascript' });

describe('sortPackageJsonDependencies', function () {
  it('sorts dependencies using localeCompare("en"), matching real `npm install`', async function () {
    const { fs } = await run();
    const pkg = JSON.parse(fs.read('package.json'));

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
