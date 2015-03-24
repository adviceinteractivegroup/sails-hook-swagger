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

      var eventsToWaitFor = [];
      eventsToWaitFor.push('router:after');
      if (sails.hooks.policies) {
        eventsToWaitFor.push('hook:policies:bound');
      }
      if (sails.hooks.orm) {
        eventsToWaitFor.push('hook:orm:loaded');
      }
      if (sails.hooks.controllers) {
        eventsToWaitFor.push('hook:controllers:loaded');
      }
      sails.after(eventsToWaitFor, this.getRoutes);

      cb();
    },
    routes: {},
    getRoutes: function getRoutes() {
      // let blueprintConfig = sails.config.blueprints;

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
          var baseRestRoute = config.prefix + config.restPrefix +
            '/' + controllerId;

          if (config.pluralize) {
            baseRoute = pluralize(baseRoute);
            baseRestRoute = pluralize(baseRestRoute);
          }

          // Build route options for blueprint
          var routeOpts = config;

          // Add "actions" shadow routes for each action
          _.each(actions, function eachActionID(actionId) {
            if (['identity', 'sails', 'globalId'].indexOf(actionId) !== -1) {
              return;
            }

            if (!sails.controllers[controllerId][actionId]['_middlewareType']) {
              return;
            }

            if (config.actions) {
              if (!self.routes.actions) {
                self.routes.actions = [];
              }

              var actionRoute = baseRoute + '/' + actionId.toLowerCase();

              self.routes.actions.push(actionRoute);
            }
          });

          // define access to the model
          var globalId = sails.controllers[controllerId].globalId;
          var routeConfig = sails.router.explicitRoutes[controllerId] || {};
          var modelFromGlobalId = sails.util.findWhere(sails.models, {
            globalId: globalId
          });

          var modelId = config.model || routeConfig.model ||
            (modelFromGlobalId && modelFromGlobalId.identity) || controllerId;

          if (sails.hooks.orm && sails.models && sails.models[modelId]) {
            // get the model
            var Model = sails.models[modelId];

            // Add shortcuts show routes if enabled
            if (config.shortcuts) {
              if (!self.routes.shortcuts) {
                self.routes.shortcuts = [];
              }

              self.routes.shortcuts.push(baseRoute + '/find');
              self.routes.shortcuts.push(baseRoute + '/find/:id');
              self.routes.shortcuts.push(baseRoute + '/create');
              self.routes.shortcuts.push(baseRoute + '/update/:id');
              self.routes.shortcuts.push(baseRoute + '/destroy/:id');

              // bind the routes based on the model associations
              // Bind add/remove "shortcuts" for each `collection` associations
              _(Model.associations).where({type: 'collection'}).forEach(
                function addAssociationRoutes(association) {
                  var alias = association.alias;

                  var addRoute = baseRoute + '/:parentid/' + alias + '/add/:id';
                  self.routes.shortcuts.push(addRoute);

                  var removeRoute = baseRoute + '/:parentid/' + alias +
                    '/remove/:id';
                  self.routes.shortcuts.push(removeRoute);
                }
              );
            }

            if (config.rest) {
              if (!self.routes.rest) {
                self.routes.rest = [];
              }

              // add the base rest routes
              self.routes.rest.push('get ' + baseRestRoute);
              self.routes.rest.push('get ' + baseRestRoute + '/:id');
              self.routes.rest.push('post ' + baseRestRoute);
              self.routes.rest.push('put ' + baseRestRoute + '/:id');
              self.routes.rest.push('post ' + baseRestRoute + '/:id');
              self.routes.rest.push('delete ' + baseRestRoute + '/:id');

              _(Model.associations).where({type: 'collection'}).forEach(
                function addAssociationRoutes(association) {
                  var alias = association.alias;

                  var assocPath = 'get ' + baseRestRoute + '/:parentid/' +
                    alias + '/:id';

                  self.routes.rest.push(assocPath);
                }
              );
            }
          }
        });

      console.log(this.routes);
    }
  }
};
