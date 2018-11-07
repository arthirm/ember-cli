'use strict';

const path = require('path');
const crypto = require('crypto');
const stringify = require('json-stable-stringify');
const Tee = require('broccoli-tee');
const presetEnv = require('babel-preset-env/lib/targets-parser');
const EXCLUDED_TREES = ['app', 'styles', 'public', 'test-support', 'src', 'vendor', 'extractedTemplates'];
const PREBUILT = 'pre-built';
const PREBUILT_ADDON_LIST = [];
const PREBUILT_ADDON_USAGE_SUMMARY = new Map();
const Minimatch = require('minimatch').Minimatch;
const ISPROJECTAPP = true;
const SilentError = require('silent-error');
const semver = require('semver');
const findNodeModules = require('find-node-modules');
const PREBUILD_USED = true;
const fs = require('fs-extra');

/**
  Fetches the prebuilt tree for an addon if the cachekey matches for the default trees.
  Default tree includes addon, templates, addon-test-support
  Cache key is a combination of target browsers, babel options, package, name etc.

  @public
  @method getPrebuiltTreeForAddon
  @param {*} addon object
  @param {*} treeType
*/
function getPrebuiltTreeForAddon(addon, treeType) {
  if (_checkPrebuildConditions(addon, treeType)) {
    let cacheKeyForPrebuiltAddon = _cacheKeyForPrebuiltTree(addon);
    let prebuiltTree = _getPrebuiltTree(addon, cacheKeyForPrebuiltAddon, treeType);

    if (prebuiltTree !== undefined) {
      let summary = _addPrebuildSummary(cacheKeyForPrebuiltAddon, addon.name, prebuiltTree, treeType, PREBUILD_USED);
      console.log(`Using prebuilt addon ${summary.name} for treeType ${summary.treeType} from ${summary.prebuildPath}`);
      return prebuiltTree;
    }
  }
}

/**
  Check if an addon should be excluded from being prebuilt or using prebuild
  The addons to be excluded will be provided in project's package.json or as env variable

  @private
  @method _isAddonExcluded
  @param {*} addon object
*/
function _isAddonExcluded(addon) {
  let matcher = [];
  if (addon.project.pkg.prebuild && addon.project.pkg.prebuild.excludeAddons) {
    let excludeAddons = addon.project.pkg.prebuild.excludeAddons;
    if (excludeAddons instanceof Array && excludeAddons.length > 0) {
      matcher = matcher.concat(addon.project.pkg.prebuild.excludeAddons);
    } else {
      matcher.push(excludeAddons);
    }
  }
  if (process.env.EXCLUDEADDONS) {
    matcher.push(process.env.EXCLUDEADDONS);
  }
  return _match(matcher, addon.name);
}

/**
  Check if an input matches the given pattern

  @private
  @method _match
  @param {*} matcher pattern to match
  @param {*} input input string to match against pattern matcher
*/
function _match(matcher, input) {
  if (matcher.length === 0) {
    return false;
  }
  if (matcher instanceof Array) {
    return matcher.some(pattern => _match(pattern, input));
  } else if (typeof matcher === 'string') {
    return new Minimatch(matcher).match(input);
  } else if (_isRegex(matcher)) {
    return new RegExp(matcher).test(input);
  }
  throw new SilentError(`Prebuild Matcher ${matcher} is invalid for input ${input} in prebuild-addon-utils`);
}

/**
  Checks if string is a regex
  @private
  @method isRegex
  @param {*} str string to match
*/
function _isRegex(str) {
  try {
    return new RegExp(str);
  } catch (e) {
    return false;
  }
}

/**
  Return prebuilt tree if it exists.

  Check the addon's package.json to get the prebuildPath and return prebuild if it exists in that location
  Else check the app's package.json to get the prebuildPath and return prebuild if it exists in that location
  @private
  @method _getPrebuiltTree
  @param {*} addon addon object
  @param {*} cacheKeyForPrebuiltAddon
  @param {*} treeType addon, templates, addon-test-support
*/
function _getPrebuiltTree(addon, cacheKeyForPrebuiltAddon, treeType) {
  let prebuildPath = _getPrebuildPathForTree(addon, cacheKeyForPrebuiltAddon, treeType, !ISPROJECTAPP);
  if (fs.existsSync(prebuildPath)) {
    return prebuildPath;
  } else {
    prebuildPath = _getPrebuildPathForTree(addon, cacheKeyForPrebuiltAddon, treeType, ISPROJECTAPP);
    if (fs.existsSync(prebuildPath)) {
      return prebuildPath;
    }
  }
}

/**
  Returns the prebuiltBasePath of the project (app/addon).
  Base function for '_getPrebuiltTree' and '_getPrebuildPath'
  Prebuilt path will be of the format '<prebuild-base-path>/addon.name/cacheKeyForPrebuiltAddon/treeType'
  'prebuild-base-path' will be either path specified in package.json or 'addon.root/pre-built'

  @private
  @method _getPrebuildPathForTree
  @param {*} addon addon object
  @param {*} cacheKeyForPrebuiltAddon
  @param {*} treeType addon, templates, addon-test-support
  @param {*} isProjectApp to determine whether the project is app or addon
*/
function _getPrebuildPathForTree(addon, cacheKeyForPrebuiltAddon, treeType, isProjectApp) {
  let prebuildPath;
  if (isProjectApp) {
    prebuildPath = addon.project.pkg.prebuild && addon.project.pkg.prebuild['prebuild-base-path'];
  } else {
    prebuildPath = addon.pkg.prebuild && addon.pkg.prebuild['prebuild-base-path'];
  }
  prebuildPath = prebuildPath !== undefined ? path.join(prebuildPath, addon.name, cacheKeyForPrebuiltAddon, treeType)
    : path.join(path.resolve(addon.root), PREBUILT, addon.name, cacheKeyForPrebuiltAddon, treeType);
  return prebuildPath;
}

/**
  Returns the prebuildPath for app if it exists else return addon's prebuildPath.
  This will be used to store the prebuild in either app or addon's location
  @private
  @method _getPrebuildPath
  @param {*} addon addon object
  @param {*} cacheKeyForPrebuiltAddon
  @param {*} treeType addon, templates, addon-test-support
  @param {*} isProjectApp to determine whether the project is app or addon
*/
function _getPrebuildPath(addon, cacheKeyForPrebuiltAddon, treeType) {
  let prebuildPath;

  if (!addon.project.isEmberCLIAddon()) {
    // If project is an app, return the prebuilt path for all addons in the app (store prebuild for all the addons in the app)
    prebuildPath = _getPrebuildPathForTree(addon, cacheKeyForPrebuiltAddon, treeType, ISPROJECTAPP);
  } else if (addon.project.isEmberCLIAddon() && addon.name === addon.project.name()) {
    // If project is an addon, return only the prebuilt path for project addon (store the build only for the project)
    prebuildPath = _getPrebuildPathForTree(addon, cacheKeyForPrebuiltAddon, treeType, !ISPROJECTAPP);
  }
  return prebuildPath;
}

/**
  Create the hash for the prebuilt directory
  @private
  @method _cacheKeyForPrebuiltTree
  @param {*} addon
*/
function _cacheKeyForPrebuiltTree(addon) {
  let targetBrowsers = addon.project.targets.browsers.sort().toString().toLowerCase();
  let cacheKeyParts = [
    addon.pkg && Object.keys(addon.pkg).sort(),
    addon.name,
    typeof addon.options.babel === 'function' ? addon.options.babel() : addon.options.babel,
    addon.options['ember-cli-babel'],
    targetBrowsers,
  ];
  return crypto.createHash('md5').update(stringify(cacheKeyParts), 'utf8').digest('hex');
}

/**
  This function helps to check if the changes to an addon can be tracked to prebuild it.
  If an addon is symlinked or if the dependencies in application's package.json is pointing to a path
  then the changes cannot be tracked
  @private
  @method _canTrackAddonChanges
  @param {*} addon object
*/
function _canTrackAddonChanges(addon) {
  return !_isAddonDownloadedFromPath(addon) && !_isAddonSymlinked(addon);
}

/**
  This function checks if an addon is symlinkled or not
  Addon is not symlinked if addon's root is contained in project's root or addon is present in project's node_modules
  @private
  @method _isAddonSymlinked
  @param {*} addon object
*/
function _isAddonSymlinked(addon) {
  return !(addon.root.indexOf(path.resolve(addon.project.root)) > -1 || addon.root.indexOf(_getProjectNodeModulesPath(addon.project.root)) > -1 || addon.root.indexOf(_getProjectNodeModulesPath(path.dirname(addon.project.root)) > -1 ));
}

/**
  This function gets the node_modules path starting from the given root path
  @private
  @method _getProjectNodeModulesPath
  @param {*} root path  from where the the function should start finding the node_modules
*/
function _getProjectNodeModulesPath(root) {
  return path.resolve(root, findNodeModules({ cwd: root })[0]);
}


/**
  This function checks if an addon name is pointing to a path or a version in project or parents dependencies
  e.g, If dependencies in package.json has "ember-ajax": "https://github.com/ember-cli/ember-ajax.git"
  then _isAddonDownloadedFromPath will return true

  @private
  @method _isAddonDownloadedFromPath
  @param {*} addon object
*/
function _isAddonDownloadedFromPath(addon) {
  let path = false;
  if (addon.project.pkg.dependencies && addon.project.pkg.dependencies[addon.name]) {
    path = _isPath(addon.project.pkg.dependencies[addon.name]);
  }
  if (addon.project.pkg.devDependencies && addon.project.pkg.devDependencies[addon.name]) {
    path = _isPath(addon.project.pkg.devDependencies[addon.name]);
  }

  // Parent may not be equal to project
  if (!path) {
    if (addon.parent && addon.parent.pkg && addon.parent.pkg.dependencies && addon.parent.pkg.dependencies[addon.name]) {
      path = _isPath(addon.parent.pkg.dependencies[addon.name]);
    }
    if (addon.parent && addon.parent.pkg && addon.parent.pkg.devDependencies && addon.parent.pkg.devDependencies[addon.name]) {
      path = _isPath(addon.parent.pkg.devDependencies[addon.name]);
    }
  }
  return path;
}

/**
  Returns if addonValue is pointing to a path and not version
  @private
  @method _isPath
  @param {*} addonValue can be a version or a path
*/
function _isPath(addonValue) {
  let semverObj = semver.coerce(addonValue);
  return semverObj == null ?  false : semver.valid(semverObj) == null;
}

/**
  Returns metadata Info for prebuilt addon
  This information will be stored in the metadata file for each prebuilt addon
  @private
  @method _metaDataInfo
  @param {*} addon
*/
function _metaDataInfo(addon) {
  return {
    'name': addon.name,
    'babelOptions': addon.options.babel,
    'options.ember-cli-babel': addon.options['ember-cli-babel'],
    'targets': presetEnv.default(addon.project.targets),
  };
}

/**
  Check if addon can be prebuilt or stored as prebuilt
  !_isDeveloping(addon) || _isProjectAddon(addon) condition is used to check the following
  If addon is being developed and if the addon is also the current project
  then the prebuild will be used or created (since PREBUILD env variable is also set when the control reaches here)
  Else prebuild is used/stored only for the addons that are not being developed
  @private
  @method _checkPrebuildConditions
  @param {*} addon object
  @param {*} treeType addon, templates, addon-test-support etc
 */
function _checkPrebuildConditions(addon, treeType) {
  return (!_isAddonExcluded(addon) && !EXCLUDED_TREES.includes(treeType) && (!_isDeveloping(addon) || _isProjectAddon(addon)) && _canTrackAddonChanges(addon));
}

/**
  Store the prebuilt addon for a treeType using a broccoli plugin

  @public
  @method storePrebuild
  @param {*} addon object
  @param {*} treeType addon, templates, addon-test-support etc
  @param {*} mergedTreesForType prebuilt addon for a particulat tree
 */
function storePrebuild(addon, treeType, mergedTreesForType) {
  if (_checkPrebuildConditions(addon, treeType)) {
    let cacheKeyForPrebuiltAddon = _cacheKeyForPrebuiltTree(addon);
    // PREBUILT_ADDON_LIST is used to check if a metadata file has been created already for this addon
    let isMetadataStored = PREBUILT_ADDON_LIST.includes(cacheKeyForPrebuiltAddon);

    // Generate the prebuild path
    let prebuildPath = _getPrebuildPath(addon, cacheKeyForPrebuiltAddon, treeType);
    if (prebuildPath) {
      if (!isMetadataStored) {
        PREBUILT_ADDON_LIST.push(cacheKeyForPrebuiltAddon);
        _storeMetadata(prebuildPath, _metaDataInfo(addon));
      }

      mergedTreesForType = new Tee(mergedTreesForType, prebuildPath);
      _addPrebuildSummary(cacheKeyForPrebuiltAddon, addon.name, prebuildPath, treeType, !PREBUILD_USED);
    }
  }
  return mergedTreesForType;
}

/**
  Store metadata information in the given path

  @private
  @method _storeMetadata
  @param {*} basePath path to store the metadata
  @param {*} data for the metadata file
 */
function _storeMetadata(basePath, data) {
  fs.mkdirpSync(basePath);
  fs.writeFileSync(path.join(path.dirname(basePath), 'metadata'), JSON.stringify(data, undefined, 2), 'utf8');
}

/**
  Checks if an addon is being developed or not
  @private
  @method _isDeveloping
  @param {*} addon
*/
function _isDeveloping(addon) {
  return addon.isDevelopingAddon();
}

/**
  Checks if the current project is the input addon
  @private
  @method _isProjectAddon
  @param {*} addon
*/
function _isProjectAddon(addon) {
  return addon.project.isEmberCLIAddon() && addon.name === addon.project.name();
}

/**
  Adds prebuild info to cache whenever an addon is being prebuilt or the prebuilt addon is used.
  Its used to log the prebuilt summary at the end of build.
  @private
  @method _addPrebuildSummary
  @param {*} key cache key
  @param {*} name name of the addon
  @param {*} prebuildPath path in which the addon is prebuilt
  @param {*} treeType tree for which the addon has been prebuilt
  @param {*} usingPrebuild Boolean value which indicates whether a prebuilt addon is created (false) or used (true).
*/
function _addPrebuildSummary(key, name, prebuildPath, treeType, usingPrebuild) {
  let summary;
  if (PREBUILT_ADDON_USAGE_SUMMARY.has(key)) {
    summary = PREBUILT_ADDON_USAGE_SUMMARY.get(key);
    summary.usingPrebuild = usingPrebuild;
  } else {
    summary = { name, prebuildPath, treeType, usingPrebuild };
    PREBUILT_ADDON_USAGE_SUMMARY.set(key, summary);
  }
  return summary;
}

/**
  Logs information about the addons that are prebuilt and the addons for which prebuilt is used.
  @public
  @method logPrebuildSummary
*/
function logPrebuildSummary() {
  let logPath = path.join(process.cwd(), 'prebuild.log');
  if (fs.existsSync(logPath)) {
    fs.unlinkSync(logPath);
  }
  fs.writeFileSync(logPath, JSON.stringify([...PREBUILT_ADDON_USAGE_SUMMARY.values()], undefined, 2), 'utf8');
}

/**
  Clears PrebuiltAddon list. Used for testing
  @private
  @method _clearPrebuiltAddonList
*/
function _clearPrebuiltAddonList() {
  PREBUILT_ADDON_LIST.length = 0;
}

// Private functions are exported for testing
module.exports = {  storePrebuild, getPrebuiltTreeForAddon, logPrebuildSummary, _cacheKeyForPrebuiltTree, _addPrebuildSummary, _clearPrebuiltAddonList, _isAddonDownloadedFromPath, _getProjectNodeModulesPath, _isAddonSymlinked };
