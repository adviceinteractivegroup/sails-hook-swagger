'use strict';

module.exports = function swagger(sails) {
  defaults: {
    __configKey__: {
      enabled: true, actions
    :
      true, rest
    :
      true, shortcuts
    :
      true
    }
  },
  initialize: function initialize(cb) {
    if (!sails.config[this.configKey].enabled) {
      sails.log.verbose('Swagger hook deactivated.');
      return cb();
    } else {
      sails.log.verbose('Swagger hook activated.');
    }

    console.log('Initialize Here');
    cb();
  },
  routes: {

  }
};
