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
        schemes: ['http'],
        consumes: ['application/json'],
        produces: ['application/json']
      }
    },
    initialize: function initialize(cb) {
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

            if (config.rest) {
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
                    alias;

                  self.routes.push({
                    path: assocPath,
                    action: 'get'
                  });

                  self.routes.push({
                    path: assocPath + '/:id',
                    action: 'post'
                  });

                  self.routes.push({
                    path: assocPath,
                    action: 'post'
                  });

                  self.routes.push({
                    path: assocPath + '/:id',
                    action: 'delete'
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

//      spec.paths = calculateSwaggerPaths();
//      spec.definitions = calculateSwaggerDefinitions();
      spec.parameters = calculateSwaggerParameters();
//      spec.responses = calculateSwaggerResponses();

      if (config.tags) {
        spec.tags = config.tags;
      }

      if (config.securityDefinitions) {
        spec.securityDefinitions = config.securityDefinitions;
      }

      if (config.security) {
        spec.security = config.security;
      }

      if (config.docs) {
        spec.externalDocs = config.docs;
      }

      var output = JSON.stringify(spec, null, 2);

      fs.writeFileSync('public/spec.json', output);
    }
  }
};

function setManualRoutes(target, source) {
  _.each(source, function handleRoute(route, action) {
    target.push({
      path: route,
      action: action
    });
  });
}

function calculateSwaggerPaths() {

}

function calculateSwaggerDefinitions() {

}

function calculateSwaggerParameters() {
  return {
    whereParam: {
      name: 'where',
      description: 'JSON encode WHERE criteria objects. Example: where={"name":{"contains":"theodore"}}',
      in: 'query',
      required: false
    },
    limitParam: {
      name: 'limit',
      description: 'The maximum number of records to send back. Example: limit=100',
      in: 'query',
      required: false
    },
    skipParam: {
      name: 'skip',
      description: 'The number of records to skip. Example: skip=30',
      in: 'query',
      required: false
    },
    sortParam: {
      name: 'sort',
      description: 'The sort order. Example: sort=lastName%20ASC',
      in: 'query',
      required: false
    },
    callbackParam: {
      name: 'callback',
      description: 'If specified, a JSONP response will be sent (instead of JSON). This is the name of a client-side javascript function to call, to which results will be passed as the first (and only) argument. Example: ?callback=my_JSONP_data_receiver_fn',
      in: 'query',
      required: false
    }
  }
}

function calculateSwaggerResponses() {

}
