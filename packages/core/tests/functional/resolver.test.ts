import mockFS from 'mock-fs';
import { assert } from 'chai';

import path from 'path';

import { resolve } from '../../src/node/core-plugins/resolver';

afterEach(() => mockFS.restore());

const base = '/root/path/to/base/directory';
const f = (p: string) => path.join(base, p);

// ! IMPORTANT NOTE
// If test is failing make sure to check if the file
// is added to mockFS files

describe('Module Resolver', () => {
  it('resolves absolute paths', () => {
    const main = f('main.js');
    const absolute = f('path/to/absolute/file.txt');

    mockFS({
      [main]: '',
      [absolute]: ''
    });

    assert.equal(resolve(main, absolute), absolute);
  });

  it('resolves extensions', () => {
    const main = f('main.js');
    const JSFile = f('javascript.js');
    const TSFile = f('typescript.ts');
    const JSONFile = f('json-file.json');

    mockFS({
      [main]: '',
      [JSFile]: '',
      [TSFile]: '',
      [JSONFile]: ''
    });

    assert.equal(resolve(main, './javascript'), JSFile);
    assert.equal(resolve(main, './typescript', {
      extensions: ['.ts']
    }), TSFile);
    assert.equal(resolve(main, './json-file', {
      extensions: ['.js', '.ts', '.json']
    }), JSONFile);
  });

  it('resolves alias', () => {
    const main = f('main.js');
    const imported = f('node_modules/long-aliased-name/imported.js');
    const moduleIndex = f('node_modules/long-aliased-name/index.js');

    mockFS({
      [main]: '',
      [imported]: '',
      [moduleIndex]: ''
    });

    assert.equal(resolve(main, 'short-key/imported', {
      alias: {
        'short-key': 'long-aliased-name'
      }
    }), imported);
    assert.equal(resolve(main, 'short-key', {
      alias: {
        'short-key': 'long-aliased-name'
      }
    }), moduleIndex);
  });

  it('resolves mainFile', () => {
    const main = f('main.js');
    const f1 = f('folder/index.js');
    const f2 = f('folder/other.js');

    mockFS({
      [main]: '',
      [f1]: '',
      [f2]: ''
    });

    assert.equal(resolve(main, './folder'), f1);
    assert.equal(resolve(main, './folder', {
      mainFiles: ['other']
    }), f2);
    assert.equal(resolve(main, './folder', {
      mainFiles: ['some', 'main', 'files', 'other']
    }), f2);
  });

  it('resolves modules', () => {
    const main = f('main.js');
    const moduleIndex = f('node_modules/mod/index.js');
    const customModuleIndex = f('custom_module_path/mod/index.js');

    mockFS({
      [main]: '',
      [moduleIndex]: '',
      [customModuleIndex]: ''
    });

    assert.equal(resolve(main, 'mod'), moduleIndex);
    assert.equal(resolve(main, 'mod', {
      modules: ['custom_module_path']
    }), customModuleIndex);
    assert.equal(resolve(main, 'mod', {
      modules: ['does_not_exist', 'custom_module_path']
    }), customModuleIndex);
  });

  it('resolves absolute module directories', () => {
    const main = f('main.js');
    const customModuleIndex = f('custom_module_path/mod/index.js');

    mockFS({
      [main]: '',
      [customModuleIndex]: ''
    });

    assert.equal(resolve(main, 'mod', {
      modules: [f('custom_module_path')]
    }), customModuleIndex);
    assert.equal(resolve(main, 'mod', {
      modules: [f('abs_does_not_exist'), 'does_not_exist', f('custom_module_path')]
    }), customModuleIndex);
  });

  it('resolves scooped modules', () => {
    const main = f('main.js');
    const moduleIndex = f('node_modules/@scooped/mod/index.js');
    const customModuleIndex = f('custom_module_path/@scooped/mod/index.js');

    mockFS({
      [main]: '',
      [moduleIndex]: '',
      [customModuleIndex]: ''
    });

    assert.equal(resolve(main, '@scooped/mod'), moduleIndex);
    assert.equal(resolve(main, '@scooped/mod', {
      modules: ['custom_module_path']
    }), customModuleIndex);
    assert.equal(resolve(main, '@scooped/mod', {
      modules: ['does_not_exist', 'custom_module_path']
    }), customModuleIndex);
  });

  it('resolves modules from parent directory', () => {
    const main = f('parent/some/sub/directory/main.js');
    const moduleIndex = f('parent/node_modules/mod/index.js');

    mockFS({
      [main]: '',
      [moduleIndex]: ''
    });

    assert.equal(resolve(main, 'mod'), moduleIndex);
  });

  it('resolves from package.json', () => {
    const main = f('main.js');
    const pkgJSON = f('mod/package.json');
    const imported = f('mod/imp.js');

    mockFS({
      [main]: '',
      [imported]: '',
      [pkgJSON]: JSON.stringify({
        main: 'imp.js'
      })
    });

    assert.equal(resolve(main, './mod'), imported);

    mockFS({
      [main]: '',
      [imported]: '',
      [pkgJSON]: JSON.stringify({
        oField: 'imp.js'
      })
    });

    assert.equal(resolve(main, './mod', {
      mainFields: ['oField']
    }), imported);
  });
});
