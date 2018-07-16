'use strict';

const Command = require('../models/command');

module.exports = Command.extend({
  name: 'prebuild:clear',
  description: 'Clears prebuilt addons',
  aliases: ['clear-prebuild-addons', '-cp'],

  availableOptions: [
    { name: 'addons', type: String, aliases: ['a'],  description: 'Addon name glob pattern for which prebuilt directories should be cleared. By Default clears All' },
  ],

  run(commandOptions) {
    return this.runTask('ClearPrebuild', commandOptions);
  },
});
