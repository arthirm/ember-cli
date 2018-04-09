'use strict';

const Command = require('../models/command');
const preBuild = require('../models/prebuild-addon').preBuild;

module.exports = Command.extend({
  name: 'prebuild-addon',
  description: 'Prebuilds addon trees that are specified in package.json of the addon or passed from command line',
  aliases: ['prebuild', '-p'],

  availableOptions: [
    { name: 'trees', type: String, default: '', description: 'Comma seperated tree names that can be prebuilt for an addon' }
  ],

  // Example command `ember prebuild -trees addon,templates,addon-test-support`
  run(options) {
    let treeTypes = null;
    if(options.trees) {
      treeTypes = options.trees.split(',');
      console.log('Building tree types' + treeTypes);
    }
    return preBuild(this.project.root, treeTypes).catch(error => {
      console.error(error);
      process.exit(1);
    });
  },

});
