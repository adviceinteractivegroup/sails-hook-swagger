'use strict';

module.exports = function swagger(sails) {
  defaults: {
    swagger: {
      enabled: true,
      actions: true,
      rest: true,
      shortcuts: true
    }
  },
  initialize: function initialize(cb) {
    if(!sails.config[this.configKey].active) {
      sails.log.verbose('Swagger hook deactivated.');
      return cb();
    }

    console.log('Initialize Here');
  },
  routes: {

  }
};
