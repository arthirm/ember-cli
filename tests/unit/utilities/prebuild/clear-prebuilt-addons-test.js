'use strict';

const cmd = require('../../../../lib/utilities/prebuild/clear-prebuilt-addons');
const chai = require('../../../chai');
const expect = chai.expect;
const Addon = require('../../../../lib/models/addon');
const Project = require('../../../../lib/models/project');
const path = require('path');
const MockUI = require('console-ui/mock');
const MockCLI = require('../../../helpers/mock-cli');
let fixturePath = './tests/fixtures/addon';

describe('clear', function() {
  let ui, cli, options;

  before(function() {
    ui = new MockUI();
    cli = new MockCLI({ ui });
    options = { 'targets': { } };
  });

  it('prebuilt directory is cleared for current addon alone if project is addon', function() {
    let projectPath = path.resolve(fixturePath, 'developing-addon');
    const packageContents = require(path.join(projectPath, 'package.json'));
    let project = new Project(projectPath, packageContents, ui, cli);
    project.initializeAddons();

    let MyAddon = Addon.extend({
      name: 'developing-addon',
      root: projectPath,
    });

    let addon = new MyAddon(project, project);

    return cmd.clearPrebuilt(addon, options).then(result => {
      expect(result.length).to.eql(1);
    });
  });

  it('prebuilt directory is cleared for nested addons if project is app', function() {

    let projectPath = path.resolve(fixturePath, 'simple');
    const packageContents = require(path.join(projectPath, 'package.json'));
    let project = new Project(projectPath, packageContents, ui, cli);
    project.initializeAddons();

    let MyAddon = Addon.extend({
      name: 'developing-addon',
      root: projectPath,
    });

    let addon = new MyAddon(project, project);
    // Project is not addon.
    addon.project.isEmberCLIAddon = function() { return false; };
    addon.addonMainPath = path.join(addon.root, 'index.js');

    return cmd.clearPrebuilt(addon, options).then(result => {
      expect(result.length).to.eql(11);
    });
  });

  it('prebuilt directory is cleared for addons that matches the pattern', function() {
    let projectPath = path.resolve(fixturePath, 'simple');
    const packageContents = require(path.join(projectPath, 'package.json'));
    let project = new Project(projectPath, packageContents, ui, cli);
    project.initializeAddons();

    let MyAddon = Addon.extend({
      name: 'developing-addon',
      root: projectPath,
    });
    options.addons = 'ember-super-*';
    let addon = new MyAddon(project, project);
    // Project is not addon.
    addon.project.isEmberCLIAddon = function() { return false; };
    return cmd.clearPrebuilt(addon, options).then(result => {
      expect(result.length).to.eql(1);
    });
  });

  it('prebuilt directory is cleared if prebuilt path is provided', function() {
    let projectPath = path.resolve(fixturePath, 'simple');
    const packageContents = require(path.join(projectPath, 'package.json'));
    let project = new Project(projectPath, packageContents, ui, cli);
    project.initializeAddons();

    let MyAddon = Addon.extend({
      name: 'developing-addon',
      root: projectPath,
    });

    project.pkg.PREBUILD_BASE_PATH = path.join(__dirname, 'pre-built');

    let addon = new MyAddon(project, project);
    // Project is not addon.
    addon.project.isEmberCLIAddon = function() { return false; };
    return cmd.clearPrebuilt(addon, options).then(result => {
      expect(result.length).to.eql(1);
    });
  });
});
