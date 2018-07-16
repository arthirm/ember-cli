'use strict';
const fs = require('fs-extra');
const path = require('path');
const PackageInfo = require('../../models/package-info-cache/package-info');
const micromatch = require('micromatch');
const Project = require('../../models/project');
const PREBUILT = 'pre-built';

/**
  Clears all prebuilt addons
  @public
  @method clearPrebuilt
  @param {*} options command line options which contains prebuilt directory, targets, addons
*/
function clearPrebuilt(cmd, options) {
  let addonPattern = options.addons;
  let addonPackageInfoList;
  let project = cmd.project;
  let prebuiltBasePath = cmd.project.pkg.prebuild && cmd.project.pkg.prebuild['prebuild-base-path'];
  let clearResult;
  // If prebuiltBasePath is provided and addon pattern is not present, delete the entire prebuilt directory
  if (addonPattern === undefined && prebuiltBasePath) {
    clearResult = [_remove(prebuiltBasePath)];
  } else {
    // Get all addon entries from the project
    addonPackageInfoList = _getAllAddonPackageInfo(cmd);
    if (cmd.project.isEmberCLIAddon()) {
      addonPattern = cmd.project.name();
    }
    // Get the list of addons for which the prebuilt directories should be cleared
    if (addonPattern) {
      addonPackageInfoList = addonPackageInfoList.filter(addon => micromatch.isMatch(addon.name, addonPattern));
    }

    clearResult = addonPackageInfoList.map(addon => {
      // Get the basepath of prebuilt addon
      let prebuiltPath = _getPrebuildBasePath(project, addon);
      return _remove(prebuiltPath);
    });
  }
  return Promise.all(clearResult);
}

/**
  Constructs and returns the prebuild base path of the project
  @private
  @method _getPrebuildBasePath
  @param {*} project current project object
  @param {*} addon object from PackageInfo
*/
function _getPrebuildBasePath(project, addon) {
  let prebuildBasePath;
  if (!project.isEmberCLIAddon()) {
    // get the path from application's package.json if the project is app
    prebuildBasePath = project.pkg.prebuild && project.pkg.prebuild['prebuild-base-path'];
  } else {
    // get the path from addon's package.json if project is addon
    prebuildBasePath = addon.pkg.prebuild && addon.pkg.prebuild['prebuild-base-path'];
  }

  // if package.json does not have prebuilt base path then <addon basepath>/pre-built is the prebuilt path
  if (!prebuildBasePath) {
    prebuildBasePath = path.join(addon.realPath, PREBUILT);
  }

  // Many addon's have different names in package.json and index.js mainly due to scopes.
  // ember-cli displays a warning. Until all addons are cleaned up addon's name will be fetched from index.js
  let addonName = addon.addonMainPath ? require(addon.addonMainPath).name : addon.name;
  return path.join(prebuildBasePath, addonName);
}

/**
  Deletes the directory
  @private
  @method remove
  @param {*} path path to delete
*/
function _remove(path) {
  try {
    fs.removeSync(path);
    console.log(`Deleting prebuilt addon from the path ${path}`);
    return Promise.resolve();
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
  Get the list of all addons from an app including nested ember apps
  @private
  @method _getAllAddonPackageInfo
  @param {*} cmd Command object
*/
function _getAllAddonPackageInfo(cmd) {
  let packageInfoCache = cmd.project.packageInfoCache.entries;

  // Initialize addons for nested ember apps
  Object.keys(packageInfoCache).map(k => {
    const val = packageInfoCache[k];
    if (val instanceof PackageInfo && val.pkg['ember-addon'] && val.pkg['ember-addon'].apps) {
      return val;
    }
  }).filter(val => !!val).forEach(val => {
    val.pkg['ember-addon'].apps.forEach(app => {
      // Project object is created for nested apps for the packageInfoCache to be populated for nested apps
      const project = Project.closestSync(
        path.resolve(app, ''),
        cmd.project.ui,
        cmd.project.cli
      );
      project.initializeAddons();
    });
  });

  // The `packageInfoCache.entries` contains the entries of all libraries present in an ember app.
  // Return the entry if its an addon and is not blacklisted.
  return Object.keys(packageInfoCache).map(k => {
    const val = packageInfoCache[k];
    if (val instanceof PackageInfo && val.isAddon() && val.realPath.indexOf(cmd.project.root) > -1) {
      let packageInfo = cmd.project.pkg.prebuild;
      if (!packageInfo || (packageInfo && !packageInfo.excludeAddons) || (packageInfo && packageInfo.excludeAddons
        && !packageInfo.excludeAddons.includes(val.name))) {
        return val;
      }
    }
  }).filter(val => !!val);
}

module.exports = { clearPrebuilt };
