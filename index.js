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
      var self = this;

      this.routes = {};
      this.routes.manual = sails.config.routes;

      // foreach controller build the shadow routes
      _.each(sails.middleware.controllers,
        function eachController(controller, controllerId) {
          if (!_.isObject(controller) || _.isArray(controller)) {
            return;
          }

          var config = _.merge({}, sails.config.blueprints,
            controller._config || {});

          // Determine the names of the controller's user-defined actions
          // IMPORTANT: Use `sails.controllers` instead of `sails.middleware.controllers`
          // (since `sails.middleware.controllers` will have blueprints already mixed-in,
          // and we want the explicit actions defined in the app)
          var actions = Object.keys(sails.controllers[controllerId]);

          var baseRoute = config.prefix + '/' + controllerId;

          // Determine base route for RESTful service
          var baseRestRoute = nodepath.normalize(config.prefix +
            config.restPrefix + '/' + controllerId);

          if (config.pluralize) {
            baseRoute = pluralize(baseRoute);
            baseRestRoute = pluralize(baseRestRoute);
          }

          // Build route options for blueprint
          var routeOpts = config;

          // Bind "actions" and "index" shadow routes for each action
          _.each(actions, function eachActionID(actionId) {
            if(config.actions) {
              if(!self.routes.actions) {
                self.routes.actions = [];
              }

              var actionRoute = baseRoute + '/' + actionId.toLowerCase() +
                '/:id?';

              self.routes.actions.push(actionRoute);
            }
          });
        }
      );

      console.log(this.routes);
      // todo attach the routes to a variable for later referencing
      cb();
    }, routes: {}
  }
};
