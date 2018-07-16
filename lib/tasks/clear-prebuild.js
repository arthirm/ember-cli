'use strict';

const Task = require('../models/task');
const clearPrebuildAddons = require('../utilities/prebuild/clear-prebuilt-addons').clearPrebuilt;

class ClearPrebuildTask extends Task {
  constructor(options) {
    super(options);
  }

  run(options) {
    return clearPrebuildAddons(this, options);
  }
}

module.exports = ClearPrebuildTask;
