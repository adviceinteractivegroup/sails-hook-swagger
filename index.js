'use strict';

var lodash = require('lodash')
var util = require('util');
var path = require('path');
var async = require('async');
var pluralize = require('pluralize');
var STRINGFILE = require('sails-stringfile');

module.exports = function swagger(sails) {
  return {
    defaults: {
      __configKey__: {
        enabled: true
      }
    }, initialize: function initialize(cb) {
      if (!sails.config[this.configKey].enabled) {
        sails.log.verbose('Swagger hook deactivated.');
        return cb();
      } else {
        sails.log.verbose('Swagger hook activated.');
      }

//      let blueprintConfig = sails.config.blueprints;

      // todo calculate the routes here
      // get the manual routes first

      this.routes = {};
      this.routes.manual = sails.config.routes;
      console.log(this.routes);
      // foreach controller build the routes

      // todo attach the routes to a variable for later referencing
      cb();
    }, routes: {}
  }
};
