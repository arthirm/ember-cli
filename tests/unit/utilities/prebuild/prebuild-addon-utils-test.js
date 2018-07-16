'use strict';

const prebuildAddonUtils = require('../../../../lib/utilities/prebuild/prebuild-addon-utils');
const chai = require('../../../chai');
const fs = require('fs-extra');
const expect = chai.expect;
const file = chai.file;
const path = require('path');
const ADDON = 'addon';
const Funnel = require('broccoli-funnel');
const Addon = require('../../../../lib/models/addon');
const broccoli = require('broccoli-builder');
const walkSync = require('walk-sync');
const rimraf = require('rimraf');

describe('prebuild-addon-utils', function() {

  let TheAddon = Addon.extend({
    name: 'developing-addon',
    root: './tests/fixtures/addon/developing-addon',
    options: {
      'ember-cli-babel': { "compileModules": true },
    },
    pkg: { },
  });

  const options = {
    loose: true,
    plugins: [[
      {
        "import": {
          "module": "ember-data/-private/features",
        },
        "features": {
          "ds-improved-ajax": null,
          "ds-pushpayload-return": null,
        },
      },
    ]],
    postTransformPlugins: [],
    exclude: ['transform-es2015-block-scoping', 'transform-es2015-typeof-symbol'],
  };

  let addon = new TheAddon();
  addon.project = {
    targets: {
      browsers: ['last 2 ChromeAndroid versions',
        'last 2 iOS versions'],
    },
    pkg: { name: 'developing-addon' },
    _watchmanInfo: {},
    root: './tests/fixtures/addon/developing-addon',
  };

  describe('getPrebuiltTreeForAddon', function() {
    addon.isDevelopingAddon = function() { return false; };
    let expectedTree = path.join(addon.root, 'pre-built/developing-addon/149c62c5618ce2630b5fa705cd485c45/addon');
    beforeEach(function() {
      fs.mkdirpSync(expectedTree);
    });
    let addonRoot = addon.root;

    afterEach(function() {
      rimraf.sync(path.join(addon.root, 'pre-built'));
      delete process.env.EXCLUDEADDONS;
      addon.project.pkg.prebuild = {};
      addon.parent = {};
      addon.project.pkg.devDependencies = {};
      addon.root = addonRoot;
    });

    it('returns prebuilt tree if prebuilt is tree is present for the current targets', function() {
      let addonTree = prebuildAddonUtils.getPrebuiltTreeForAddon(addon, ADDON);
      expect(addonTree).to.not.equal(undefined);

    });

    it('does not return prebuilt tree for an addon if excluded array in package.json contains this addon', function() {
      addon.project.pkg.prebuild = { excludeAddons: [addon.name] };
      let addonTree = prebuildAddonUtils.getPrebuiltTreeForAddon(addon, ADDON);
      expect(addonTree).to.eql(undefined);
    });

    it('does not return prebuilt tree for addons if addons to be excluded is a string in package.json', function() {
      addon.project.pkg.prebuild = { excludeAddons: addon.name };
      let addonTree = prebuildAddonUtils.getPrebuiltTreeForAddon(addon, ADDON);
      expect(addonTree).to.eql(undefined);
    });

    it('does not return prebuilt tree for addons if addons to be excluded is a regex in package.json', function() {
      addon.project.pkg.prebuild = { excludeAddons: "*" };
      let addonTree = prebuildAddonUtils.getPrebuiltTreeForAddon(addon, ADDON);
      expect(addonTree).to.eql(undefined);
    });

    it('returns prebuilt tree for addons if addons to be excluded does not match', function() {
      addon.project.pkg.prebuild = { excludeAddons: "devloping" };
      let addonTree = prebuildAddonUtils.getPrebuiltTreeForAddon(addon, ADDON);
      expect(addonTree).equals(expectedTree);
    });

    it('does not return prebuilt tree for addons if globs for exclusion is given in both package.json and ENV variable ', function() {
      process.env.EXCLUDEADDONS = "devel*";
      let addonTree = prebuildAddonUtils.getPrebuiltTreeForAddon(addon, ADDON);
      expect(addonTree).equals(undefined);
    });

    it('does not return prebuilt tree for an addon if its excluded using env variable', function() {
      addon.isDevelopingAddon = function() { return false; };
      process.env.EXCLUDEADDONS = addon.name;
      let addonTree = prebuildAddonUtils.getPrebuiltTreeForAddon(addon, ADDON);
      expect(addonTree).to.eql(undefined);
    });

    it('does not return prebuilt tree if addon has isDevelopingAddon flag set', function() {
      addon.isDevelopingAddon = function() { return true; };
      addon.project.isEmberCLIAddon = function() { return false; };
      let addonTree = prebuildAddonUtils.getPrebuiltTreeForAddon(addon, ADDON);
      expect(addonTree).to.eql(undefined);
    });

    it('does not return prebuilt tree if it is not present for the current targets', function() {
      addon.isDevelopingAddon = function() { return true; };
      addon.project.isEmberCLIAddon = function() { return false; };
      // Key will change and hence prebuilt will not be present for the target
      addon.project.targets.browsers.push('last 1 Chrome versions');
      let addonTree = prebuildAddonUtils.getPrebuiltTreeForAddon(addon, ADDON);
      expect(addonTree).to.eql(undefined);
      addon.project.targets.browsers.pop();
    });

    it('does not return prebuilt tree if its not default tree which can be prebuilt', function() {
      addon.isDevelopingAddon = function() { return true; };
      let addonTree = prebuildAddonUtils.getPrebuiltTreeForAddon(addon, 'app');
      expect(addonTree).to.eql(undefined);
    });

    it('does not return prebuilt tree if addon is symlinked', function() {
      // Addon is not symlinked if the addon's root is contained in project's root or
      // addon is present in project's node_modules
      addon.root = process.cwd();
      let addonTree = prebuildAddonUtils.getPrebuiltTreeForAddon(addon, 'app');
      expect(addonTree).to.eql(undefined);
    });

    it('does not return prebuilt tree if addon is pointing to a path in project\'s package.json', function() {
      addon.project.pkg = {
        "devDependencies": {
          'developing-addon': 'path',
        },
      };
      let addonTree = prebuildAddonUtils.getPrebuiltTreeForAddon(addon, 'app');
      expect(addonTree).to.eql(undefined);
    });

    it('does not return prebuilt tree if addon is pointing to a path in addon parent\'s package.json', function() {
      addon.parent = {
        "pkg": {
          "devDependencies": {
            'developing-addon': 'path',
          },
        },
      };
      let addonTree = prebuildAddonUtils.getPrebuiltTreeForAddon(addon, 'app');
      expect(addonTree).to.eql(undefined);
    });

  });

  describe('prebuild directory', function() {
    let inputPath = './tests/fixtures/addon/developing-addon/addon';
    let builder, addonTree, result;
    addon.pkg.prebuild = {};
    let cacheKey = prebuildAddonUtils._cacheKeyForPrebuiltTree(addon);
    let prebuildPath = path.join(addon.root, 'pre-built', addon.name, cacheKey, ADDON);
    let addonRoot = addon.root;

    beforeEach(function() {
      addonTree = new Funnel(inputPath, {
        dest: 'addon',
      });
      addon.project.isEmberCLIAddon = function() { return true; };
      addon.project.name = function() { return addon.name; };
      addon.isDevelopingAddon = function() { return true; };
    });

    afterEach(function() {
      rimraf.sync(path.join(addon.root, 'pre-built'));
      rimraf.sync(path.join(addonRoot, 'pre-built'));

      fs.removeSync(path.join(process.cwd(), 'tmp'));
      addon.project.pkg.prebuild = {};
      addon.project.pkg.devDependencies = {};
      addon.pkg.prebuild = {};
      addon.root = addonRoot;
      prebuildAddonUtils._clearPrebuiltAddonList();

      if (builder) {
        return builder.cleanup();
      }

    });

    it('is stored', function() {
      result = prebuildAddonUtils.storePrebuild(addon, ADDON, addonTree);
      builder = new broccoli.Builder(result);
      return builder.build().then(results => {
        expect(walkSync(results.directory)).to.eql(walkSync(inputPath));
        expect(walkSync(prebuildPath)).to.eql(walkSync(inputPath));
      });
    });

    it('is not stored if addon is excluded', function() {
      addon.project.pkg.prebuild = { excludeAddons: addon.name };
      result = prebuildAddonUtils.storePrebuild(addon, ADDON, addonTree);
      expect(result).to.eql(addonTree);
      builder = new broccoli.Builder(result);
      return builder.build().then(() => {
        expect(file(prebuildPath)).to.not.exist;
      });
    });

    it('is not stored if addon is symlinked', function() {
      // Addon is symlinked if the addon's root is not contained in project's root or
      // addon is not present in project's node_modules
      addon.root = process.cwd();
      result = prebuildAddonUtils.storePrebuild(addon, ADDON, addonTree);
      expect(result).to.eql(addonTree);

      builder = new broccoli.Builder(result);
      return builder.build().then(() => {
        expect(file(prebuildPath)).to.not.exist;
      });
    });

    it('is not stored if addon is pointing to a path in project\'s package.json', function() {
      addon.project.pkg = {
        "devDependencies": {
          'developing-addon': 'path',
        },
      };
      result = prebuildAddonUtils.storePrebuild(addon, ADDON, addonTree);
      expect(result).to.eql(addonTree);
      builder = new broccoli.Builder(result);
      return builder.build().then(() => {
        expect(file(prebuildPath)).to.not.exist;
      });
    });

    it('is stored in the location provided by addon\'s package.json, if project is addon', function() {
      addon.pkg.prebuild = { 'prebuild-base-path': path.join(addon.root, '/pre-built/addonPrebuildBasePath') };
      result = prebuildAddonUtils.storePrebuild(addon, ADDON, addonTree);
      let key = prebuildAddonUtils._cacheKeyForPrebuiltTree(addon);
      let targetPath = path.join(addon.root, 'pre-built/addonPrebuildBasePath', addon.name, key, ADDON);
      builder = new broccoli.Builder(result);
      return builder.build().then(results => {
        expect(walkSync(results.directory)).to.eql(walkSync(inputPath));
        expect(walkSync(targetPath)).to.eql(walkSync(inputPath));
      });
    });

    it('is stored in the location provided by app\'s package.json, if project is app', function() {
      addon.isDevelopingAddon = function() { return false; };
      addon.project.isEmberCLIAddon = function() { return false; };
      addon.project.pkg.prebuild = { 'prebuild-base-path': path.join(addon.root, '/pre-built/appPrebuildBasePath') };

      let key = prebuildAddonUtils._cacheKeyForPrebuiltTree(addon);
      let targetPath = path.join(addon.root, 'pre-built/appPrebuildBasePath', addon.name, key, ADDON);
      result = prebuildAddonUtils.storePrebuild(addon, ADDON, addonTree);
      builder = new broccoli.Builder(result);
      return builder.build().then(results => {
        expect(walkSync(results.directory)).to.eql(walkSync(inputPath));
        expect(walkSync(targetPath)).to.eql(walkSync(inputPath));
      });
    });

    it('stores metadata in prebuilt directory', function() {
      result = prebuildAddonUtils.storePrebuild(addon, ADDON, addonTree);
      builder = new broccoli.Builder(result);
      return builder.build().then(() => {
        expect(walkSync(prebuildPath)).to.eql(walkSync(inputPath));
      });
    });

    it('does not store metadata if its already present', function() {
      let expectedStats;
      result = prebuildAddonUtils.storePrebuild(addon, ADDON, addonTree);
      let metadataPath = path.join(path.dirname(prebuildPath), 'metadata');

      builder = new broccoli.Builder(result);
      return builder.build().then(() => {
        expect(walkSync(prebuildPath)).to.eql(walkSync(inputPath));
        expect(file(metadataPath)).to.exist;
        expectedStats = fs.statSync(metadataPath);

        result = prebuildAddonUtils.storePrebuild(addon, ADDON, addonTree);
        builder = new broccoli.Builder(result);
        return builder.build();
      }).then(() => {
        expect(file(metadataPath)).to.exist;
        let stats = fs.statSync(metadataPath);
        expect(stats).to.eql(expectedStats);
      });
    });
  });

  describe('cacheKeyForPrebuiltTree', function() {
    it('returns a key', function() {
      addon.options.babel = options;
      let generatedKey = prebuildAddonUtils._cacheKeyForPrebuiltTree(addon);
      expect(generatedKey).to.not.equal(undefined);
    });

    it('handles if babel option is a function', function() {
      addon.options.babel = function() {
        return options;
      };
      let generatedKey = prebuildAddonUtils._cacheKeyForPrebuiltTree(addon);
      expect(generatedKey).to.not.equal(undefined);
    });

    it('does not change if order of targets are different', function() {
      addon.options.babel = options;
      let expectedKey = prebuildAddonUtils._cacheKeyForPrebuiltTree(addon);
      addon.project.targets.browsers.reverse();
      let generatedKey = prebuildAddonUtils._cacheKeyForPrebuiltTree(addon);
      expect(generatedKey).equals(expectedKey);
    });

    it('does not change if targets are Capitalized', function() {
      addon.options.babel = options;
      let expectedKey = prebuildAddonUtils._cacheKeyForPrebuiltTree(addon);
      addon.project.targets.browsers.toString().toUpperCase();
      let generatedKey = prebuildAddonUtils._cacheKeyForPrebuiltTree(addon);
      expect(generatedKey).equals(expectedKey);
    });
  });

  describe('logPrebuildSummary', function() {
    const logPath = path.join(process.cwd(), 'prebuild.log');
    beforeEach(function() {
      fs.removeSync(logPath);
      prebuildAddonUtils._addPrebuildSummary('key', 'addon-name', 'prebuildPath', ADDON, true);
    });

    afterEach(function() {
      fs.removeSync(logPath);
    });

    it('creates a log file in cwd', function() {
      expect(file(logPath)).to.not.exist;
      prebuildAddonUtils.logPrebuildSummary();
      expect(file(logPath)).to.exist;
      let contents = fs.readFileSync(logPath, { encoding: 'utf8' });
      expect(contents).contains('addon-name');
      expect(contents).contains('prebuildPath');
      expect(contents).contains('treeType');
      expect(contents).contains('usingPrebuild');
    });

    it('does not throw if log file is present already', function() {
      prebuildAddonUtils.logPrebuildSummary();
      expect(file(logPath)).to.exist;

      prebuildAddonUtils._addPrebuildSummary('key', 'addon-name', 'prebuildPath', ADDON, true);
      expect(file(logPath)).to.exist;
      let contents = fs.readFileSync(logPath, { encoding: 'utf8' });
      expect(contents).contains('addon-name');
      expect(contents).contains('prebuildPath');
      expect(contents).contains('treeType');
      expect(contents).contains('usingPrebuild');
    });
  });

  describe('isAddonSymlinked', function() {
    let addonRoot = addon.root;
    let getProjectNodeModulesPath = prebuildAddonUtils._getProjectNodeModulesPath;

    afterEach(function() {
      addon.root = addonRoot;
      prebuildAddonUtils._getProjectNodeModulesPath = getProjectNodeModulesPath;
    });

    it('return true if addon\'s root is not contained in project\'s root', function() {
      addon.root = process.cwd();
      expect(prebuildAddonUtils._isAddonSymlinked(addon)).to.equals(true);
    });

    it('return true if addon\'s root is not contained in project\'s node_modules', function() {
      addon.root = process.cwd();
      prebuildAddonUtils._getProjectNodeModulesPath = function() { return path.join(process.cwd(), 'node_modules'); };
      expect(prebuildAddonUtils._isAddonSymlinked(addon)).to.equals(true);
    });

    it('return false if addon is not symlinked', function() {
      expect(prebuildAddonUtils._isAddonSymlinked(addon)).to.equals(false);
    });
  });

  describe('isAddonDownloadedFromPath', function() {
    it('return true if addon is pointing to path in project\'s package.json', function() {
      addon.project.pkg = {
        "devDependencies": {
          'developing-addon': 'path',
        },
      };
      expect(prebuildAddonUtils._isAddonDownloadedFromPath(addon)).to.equals(true);
    });

    it('return true if addon is pointing to path in addon parent\'s package.json', function() {
      addon.parent = {
        "pkg": {
          "devDependencies": {
            'developing-addon': 'path',
          },
        },
      };
      expect(prebuildAddonUtils._isAddonDownloadedFromPath(addon)).to.equals(true);
    });

    it('return true if addon is pointing to path in addon project\'s package.json and not in parents ', function() {
      addon.project.pkg = {
        "devDependencies": {
          'developing-addon': 'path',
        },
      };
      addon.parent = {
        "pkg": {
          "devDependencies": {
            'developing-addon': '1.2.3',
          },
        },
      };
      expect(prebuildAddonUtils._isAddonDownloadedFromPath(addon)).to.equals(true);
    });

    it('return true if addon\'s project is pointing to path but not in parent ', function() {
      addon.parent = {
        "pkg": {
          "devDependencies": {
            'developing-addon': '^1.2.3',
          },
        },
      };
      addon.project.pkg = {
        "devDependencies": {
          'developing-addon': 'path',
        },
      };
      expect(prebuildAddonUtils._isAddonDownloadedFromPath(addon)).to.equals(true);
    });

    it('return false if addon parent and project have a valid version ', function() {
      addon.parent = {
        "pkg": {
          "devDependencies": {
            'developing-addon': '1.2.3.4',
          },
        },
      };
      addon.project.pkg = {
        "devDependencies": {
          'developing-addon': '2.3.4',
        },
      };
      expect(prebuildAddonUtils._isAddonDownloadedFromPath(addon)).to.equals(false);
    });

    it('return false if addon is pointing to a version in package.json', function() {
      addon.project.pkg = {
        "devDependencies": {
          'developing-addon': '~1.3.4',
        },
      };
      expect(prebuildAddonUtils._isAddonDownloadedFromPath(addon)).to.equals(false);
    });
  });

  describe('getProjectNodeModulesPath', function() {
    let addonNodemodules = path.resolve(path.join(addon.project.root, 'node_modules'));
    afterEach(function() {
      rimraf.sync(addonNodemodules);
    });

    it('get project node_module path if its inside cwd', function() {
      fs.mkdirSync(addonNodemodules);
      expect(prebuildAddonUtils._getProjectNodeModulesPath(addon)).to.equals(addonNodemodules);
    });

    it('get project node_module path if its in parent directory', function() {
      expect(prebuildAddonUtils._getProjectNodeModulesPath(addon)).to.equals(path.join(process.cwd(), 'node_modules'));
    });

    it('get project node_module path which is symlinked', function() {
      fs.symlinkSync(path.join(process.cwd(), 'node_modules'), addonNodemodules);
      expect(prebuildAddonUtils._getProjectNodeModulesPath(addon)).to.equals(addonNodemodules);
    });
  });
});
