'use strict';

var _ = require('lodash');
var pluralize = require('pluralize');
var fs = require('fs');

module.exports = function swagger(sails) {
  return {
    defaults: {
      __configKey__: {
        enabled: true,
        title: 'My API',
        version: '1.0.0',
        host: 'localhost',
        basePath: '/',
        schemes: ['http', 'ws'],
        consumes: ['application/json'],
        produces: ['application/json']
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
    getRoutes: function getRoutes() {
      // get the manual routes first
      var self = this;

      this.routes = [];
      setManualRoutes(this.routes, sails.config.routes);

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
              var actionRoute = baseRoute + '/' + actionId.toLowerCase();

              var action = controllerId + '.' + actionId.toLowerCase();
              self.routes.push({path: actionRoute, action: action});
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
              self.routes.push({
                path: baseRoute + '/find',
                action: 'get'
              });
              self.routes.push({
                path: baseRoute + '/find/:id',
                action: 'get'
              });
              self.routes.push({
                path: baseRoute + '/create',
                action: 'get'
              });
              self.routes.push({
                path: baseRoute + '/update/:id',
                action: 'get'
              });
              self.routes.push({
                path: baseRoute + '/destroy/:id',
                action: 'get'
              });

              // bind the routes based on the model associations
              // Bind add/remove "shortcuts" for each `collection` associations
              _(Model.associations).where({type: 'collection'}).forEach(
                function addAssociationRoutes(association) {
                  var alias = association.alias;

                  var addRoute = baseRoute + '/:parentid/' + alias + '/add/:id';
                  self.routes.push({
                    path: addRoute,
                    action: 'get'
                  });

                  var removeRoute = baseRoute + '/:parentid/' + alias +
                    '/remove/:id';
                  self.routes.push({
                    path: removePath,
                    action: 'get'
                  });
                }
              );
            }

            if (config.rest) {
              if (!self.routes.rest) {
                self.routes.rest = [];
              }

              // add the base rest routes
              self.routes.push({
                path: baseRestRoute,
                action: 'get'
              });
              self.routes.push({
                path: baseRestRoute + '/:id',
                action: 'get'
              });
              self.routes.push({
                path: baseRestRoute,
                action: 'post'
              });
              self.routes.push({
                path: baseRestRoute + '/:id',
                action: 'put'
              });
              self.routes.push({
                path: baseRestRoute + '/:id',
                action: 'post'
              });
              self.routes.push({
                path: baseRestRoute + '/:id',
                action: 'delete'
              });

              _(Model.associations).where({type: 'collection'}).forEach(
                function addAssociationRoutes(association) {
                  var alias = association.alias;

                  var assocPath = baseRestRoute + '/:parentid/' +
                    alias + '/:id';

                  self.routes.push({
                    path: assocPath,
                    action: 'get'
                  });
                }
              );
            }
          }
        }
      );

      self.writeSpec();
    },
    writeSpec: function writeSpec() {
      var config = sails.config[this.configKey];

      var spec = {};
      // set the swagger version
      spec.swagger = '2.0';

      // setup the api info
      var info = {};

      info.title = config.title;
      info.version = config.version;

      if (config.description) {
        info.description = config.description;
      }

      if (config.termsOfService) {
        info.termsOfServer = config.termsOfService;
      }

      if (config.contact) {
        info.contact = config.contact;
      }

      if (config.license) {
        info.license = config.license;
      }

      spec.info = info;
      spec.host = config.host;
      spec.basePath = config.basePath;
      spec.schemes = config.schemes;
      spec.consumes = config.consumes;
      spec.produces = config.produces;

      if (config.tags) {
        spec.tags = config.tags;
      }

      if (config.docs) {
        spec.externalDocs = config.docs;
      }

      var output = JSON.stringify(spec, null, 2);

      fs.writeFileSync('public/spec.json', output);
    }
  }
};

function addRoutes(target, source) {
  _.each(source, function handleRoute(route, action) {
    target.push({
      path: route,
      action: action
    });
  });
};
