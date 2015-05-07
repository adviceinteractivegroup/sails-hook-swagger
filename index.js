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
          var baseRestRoute = config.prefix + config.restPrefix + '/' +
            controllerId;

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

            if (actionId === '_swagger') {
              return;
            }

            if (config.actions) {
              var actionRoute = baseRoute + '/' + actionId.toLowerCase();
              var swagger;

              if (sails.controllers[controllerId]._swagger) {
                swagger = sails.controllers[controllerId]._swagger[actionId];
              }

              var action = controllerId + '.' + actionId.toLowerCase();
              self.routes.push({
                path: actionRoute,
                action: action,
                type: 'action',
                func: actionId,
                controller: pluralize(controllerId),
                swagger: swagger
              });
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
              var summary = 'Returns a list of ' + pluralize(controllerId);
              var description = 'Finds ' + pluralize(controllerId) +
                                ' with any user defined filters applied.';
              var operationId = 'get' + pluralize(globalId);
              var tags = [
                pluralize(controllerId)
              ];
              var params = [
                {
                  $ref: '#/parameters/whereParam'
                },
                {
                  $ref: '#/parameters/limitParam'
                },
                {
                  $ref: '#/parameters/skipParam'
                },
                {
                  $ref: '#/parameters/sortParam'
                },
                {
                  $ref: '#/parameters/callbackParam'
                }
              ];
              params = addModelAttributesToParams(Model, params);
              var responses = {
                default: {
                  description: pluralize(globalId) + ' found',
                  schema: {
                    type: 'object',
                    properties: {
                      status: {
                        type: 'string', default: '200'
                      },
                      error: {
                        type: 'string', default: ''
                      },
                      data: {
                        $ref: '#/definitions/' + pluralize(modelId)
                      }
                    }
                  }
                }
              };
              responses = addDefaultResponses(responses);

              // add the base rest routes
              self.routes.push({
                path: baseRestRoute,
                action: 'get',
                type: 'rest',
                summary: summary,
                description: description,
                operationId: operationId,
                tags: tags,
                parameters: params,
                responses: responses
              });

              summary = 'Returns a specific ' + controllerId;
              description = 'Finds a specific ' + controllerId +
                            ' based on its id';
              operationId = 'get' + pluralize(globalId) + 'ById';
              params = [
                {
                  name: 'id',
                  in: 'path',
                  description: 'id of the ' + controllerId + ' to fetch',
                  required: true,
                  type: 'string',
                  format: 'id'
                }
              ];
              responses = {
                default: {
                  description: globalId + ' found',
                  schema: {
                    type: 'object',
                    properties: {
                      status: {
                        type: 'string',
                        default: '200'
                      },
                      error: {
                        type: 'string',
                        default: ''
                      },
                      data: {
                        $ref: '#/definitions/' + modelId
                      }
                    }
                  }
                }
              };
              responses = addDefaultResponses(responses);
              self.routes.push({
                path: baseRestRoute + '/{id}',
                action: 'get',
                type: 'rest',
                summary: summary,
                description: description,
                operationId: operationId,
                tags: tags,
                parameters: params,
                responses: responses
              });

              summary = 'Creates a new ' + controllerId;
              description = 'Allows the creation of a new ' + controllerId;
              operationId = 'create' + globalId;
              params = [
                {
                  name: controllerId,
                  in: 'body',
                  description: controllerId + ' to create',
                  required: true,
                  schema: {
                    $ref: '#/definitions/' + modelId
                  }
                }
              ];
              responses = {
                default: {
                  description: globalId + ' created',
                  schema: {
                    type: 'object',
                    properties: {
                      status: {
                        type: 'string',
                        default: '201'
                      },
                      error: {
                        type: 'string',
                        default: ''
                      },
                      data: {
                        $ref: '#/definitions/' + modelId
                      }
                    }
                  }
                }
              };
              responses = addDefaultResponses(responses);
              self.routes.push({
                path: baseRestRoute,
                action: 'post',
                type: 'rest',
                summary: summary,
                description: description,
                operationId: operationId,
                tags: tags,
                parameters: params,
                responses: responses
              });

              summary = 'Updates a ' + controllerId;
              description = 'Updates a ' + controllerId + ' based on the ' +
                            'id with the data sent';
              operationId = 'update' + globalId;
              params = [
                {
                  name: 'id',
                  in: 'path',
                  description: 'id of the ' + controllerId + ' to update',
                  required: true,
                  type: 'string',
                  format: 'id'
                }, {
                  name: controllerId,
                  in: 'body',
                  description: 'fields of ' + controllerId + ' to update',
                  required: true,
                  schema: {
                    $ref: '#/definitions/' + modelId
                  }
                }
              ];
              responses = {
                default: {
                  description: globalId + ' updated', schema: {
                    type: 'object', properties: {
                      status: {
                        type: 'string', default: '200'
                      }, error: {
                        type: 'string', default: ''
                      }, data: {
                        $ref: '#/definitions/' + modelId
                      }
                    }
                  }
                }
              };
              responses = addDefaultResponses(responses);
              self.routes.push({
                path: baseRestRoute + '/{id}',
                action: 'put',
                type: 'rest',
                summary: summary,
                description: description,
                operationId: operationId,
                tags: tags,
                parameters: params,
                responses: responses
              });

              summary = 'Destroys a ' + controllerId;
              description = 'Destroys the specified ' + controllerId;
              operationId = 'destroy' + globalId;
              params = [
                {
                  name: 'id',
                  in: 'path',
                  description: 'id of the ' + controllerId + ' to destroy',
                  required: true,
                  type: 'string',
                  format: 'id'
                }
              ];
              responses = {
                default: {
                  description: globalId + ' destroyed', schema: {
                    type: 'object', properties: {
                      status: {
                        type: 'string', default: '200'
                      }, error: {
                        type: 'string', default: ''
                      }, data: {
                        $ref: '#/definitions/' + modelId
                      }
                    }
                  }
                }
              };
              responses = addDefaultResponses(responses);
              self.routes.push({
                path: baseRestRoute + '/{id}',
                action: 'delete',
                type: 'rest',
                summary: summary,
                description: description,
                operationId: operationId,
                tags: tags,
                parameters: params,
                responses: responses
              });

              _.forEach(Model.associations,
                function addAssociationRoutes(association) {
                  if (association.type !== 'collection') {
                    return;
                  }

                  var alias = association.collection;
                  var aliasPlural = association.alias;

                  var assocPath = baseRestRoute + '/{parentId}/' + aliasPlural;

                  summary = 'Gets ' + pluralize(alias) + ' for a ' +
                            controllerId;
                  description = 'Gets ' + pluralize(alias) +
                                ' associated with a ' + controllerId;
                  operationId = 'get' + globalId +
                                aliasPlural.charAt(0).toUpperCase() +
                                aliasPlural.slice(1);
                  tags = [
                    pluralize(controllerId)
                  ];
                  params = [
                    {
                      name: 'parentId',
                      in: 'path',
                      description: 'id of the ' + controllerId + ' to get ' +
                                   aliasPlural + ' for',
                      required: true,
                      type: 'string',
                      format: 'id'
                    }
                  ];
                  responses = {
                    default: {
                      description: aliasPlural + ' found', schema: {
                        type: 'object', properties: {
                          status: {
                            type: 'string', default: '200'
                          }, error: {
                            type: 'string', default: ''
                          }, data: {
                            $ref: '#/definitions/' + aliasPlural
                          }
                        }
                      }
                    }
                  };
                  responses = addDefaultResponses(responses);
                  self.routes.push({
                    path: assocPath,
                    action: 'get',
                    type: 'rest',
                    summary: summary,
                    description: description,
                    operationId: operationId,
                    tags: tags,
                    parameters: params,
                    responses: responses
                  });

                  summary = 'Adds the ' + alias + ' to a ' + controllerId;
                  description = 'Attaches the posted ' + alias +
                                ' to the specified ' + controllerId;
                  operationId = 'addTo' + globalId +
                                aliasPlural.charAt(0).toUpperCase() +
                                aliasPlural.slice(1);
                  params = [
                    {
                      name: 'parentId',
                      in: 'path',
                      description: 'id of the ' + controllerId + ' to add a ' +
                                   alias + ' to',
                      required: true,
                      type: 'string',
                      format: 'id'
                    }, {
                      name: 'id',
                      in: 'path',
                      description: 'The id of the ' + alias + ' to associate',
                      required: true,
                      type: 'string',
                      format: 'id'
                    }
                  ];
                  responses = {
                    default: {
                      description: alias + ' added', schema: {
                        type: 'object', properties: {
                          status: {
                            type: 'string', default: '200'
                          }, error: {
                            type: 'string', default: ''
                          }, data: {
                            $ref: '#/definitions/' + modelId
                          }
                        }
                      }
                    }
                  };
                  responses = addDefaultResponses(responses);
                  self.routes.push({
                    path: assocPath + '/{id}',
                    action: 'post',
                    type: 'rest',
                    summary: summary,
                    description: description,
                    operationid: operationId,
                    tags: tags,
                    parameters: params,
                    responses: responses
                  });

                  summary = 'Adds a ' + alias + ' to a ' + controllerId;
                  description = 'Attaches the posted ' + alias +
                                ' to the specified ' + controllerId;
                  operationId = 'create' + globalId +
                                aliasPlural.charAt(0).toUpperCase() +
                                aliasPlural.slice(1);
                  params = [
                    {
                      name: 'parentId',
                      in: 'path',
                      description: 'id of the ' + controllerId +
                                   ' to add the ' + 'new ' + alias + ' to',
                      required: true,
                      type: 'string',
                      format: 'id'
                    }, {
                      name: controllerId,
                      in: 'body',
                      description: 'fields of ' + alias + ' to create and' +
                                   ' attach to the ' + controllerId,
                      required: true,
                      schema: {
                        $ref: '#/definitions/' + alias
                      }
                    }
                  ];
                  responses = {
                    default: {
                      description: alias + ' added', schema: {
                        type: 'object', properties: {
                          status: {
                            type: 'string', default: '200'
                          }, error: {
                            type: 'string', default: ''
                          }, data: {
                            $ref: '#/definitions/' + modelId
                          }
                        }
                      }
                    }
                  };
                  responses = addDefaultResponses(responses);
                  self.routes.push({
                    path: assocPath,
                    action: 'post',
                    type: 'rest',
                    summary: summary,
                    description: description,
                    operationid: operationId,
                    tags: tags,
                    parameters: params,
                    responses: responses
                  });

                  summary = 'Removes an ' + alias + ' from a ' + controllerId;
                  description = 'Removes the specified ' + alias +
                                ' from the specified' + controllerId;
                  operationId = 'remove' + aliasPlural.charAt(0).toUpperCase() +
                                aliasPlural.slice(1) + 'From' + globalId;
                  params = [
                    {
                      name: 'parentId',
                      in: 'path',
                      description: 'id of the ' + controllerId + ' to remove ' +
                                   alias + ' from',
                      required: true,
                      type: 'string',
                      format: 'id'
                    }, {
                      name: 'id',
                      in: 'path',
                      description: 'The id of the ' + alias +
                                   ' to disassociate',
                      required: true,
                      type: 'string',
                      format: 'id'
                    }
                  ];
                  responses = {
                    default: {
                      description: alias + ' removed', schema: {
                        type: 'object', properties: {
                          status: {
                            type: 'string', default: '200'
                          }, error: {
                            type: 'string', default: ''
                          }, data: {
                            $ref: '#/definitions/' + modelId
                          }
                        }
                      }
                    }
                  };
                  responses = addDefaultResponses(responses);
                  self.routes.push({
                    path: assocPath + '/{id}',
                    action: 'delete',
                    type: 'rest',
                    summary: summary,
                    description: description,
                    operationId: operationId,
                    tags: tags,
                    parameters: params,
                    responses: responses
                  });
                });
            }
          }
        });

      self.writeSpec();
    }, writeSpec: function writeSpec() {
      var config = sails.config[this.configKey];

      var spec = {};
      var additionalTags = [];

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

      spec.paths = calculateSwaggerPaths(this.routes, sails.models);
      spec.definitions = calculateSwaggerDefinitions(sails.models);
      spec.parameters = calculateSwaggerParameters();
      spec.responses = calculateSwaggerResponses();

      spec.tags = calculateSwaggerTags(config.tags,
        sails.middleware.controllers);

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

function calculateSwaggerPaths(routes, models) {
  var paths = {};

  _.each(routes, function eachRoute(route) {
    switch (route.type) {
      case 'action':
        var swagger = route.swagger;
        if (!swagger || !swagger.methods || !swagger.responses) {
          return;
        }

        if (!paths[route.path]) {
          paths[route.path] = {};
        }

        _.each(swagger.methods, function eachMethod(method) {
          var pathObj = {};

          if (swagger.summary) {
            pathObj.summary = swagger.summary;
          }

          if (swagger.description) {
            pathObj.description = swagger.description;
          }

          pathObj.tags = swagger.tags || [];

          if (pathObj.tags.indexOf(route.controller) === -1) {
            pathObj.tags.push(route.controller);
          }

          pathObj.operationId = method + route.func;

          if (swagger.consumes) {
            pathObj.consumes = swagger.consumes;
          }

          if (swagger.produces) {
            pathObj.produces = swagger.produces;
          }

          if (swagger.parameters) {
            pathObj.parameters = swagger.parameters;
          }

          if (swagger.schemes) {
            pathObj.schemes = swagger.schemes;
          }

          if (swagger.deprecated) {
            pathObj.deprecated = swagger.deprecated;
          }

          if (swagger.security) {
            pathObj.security = swagger.security;
          }

          pathObj.responses = swagger.responses;

          if (swagger.addDefaultResponses) {
            pathObj.responses = addDefaultResponses(pathObj.responses);
          }

          var displayName = route.path;
          if(swagger.display) {
            displayName = swagger.display;
          }

          paths[displayName][method] = pathObj;
        });
        break;
      case 'rest':
        if (!paths[route.path]) {
          paths[route.path] = {};
        }

        var pathObj = {};

        pathObj.summary = route.summary;
        pathObj.description = route.description;
        pathObj.tags = route.tags;
        pathObj.operationId = route.operationId;
        pathObj.deprecated = route.deprecated || false;
        pathObj.parameters = route.parameters;
        pathObj.responses = route.responses || {};

        paths[route.path][route.action] = pathObj;
        break;
      default:
        return;
    }
  });

  return paths;
}

function calculateSwaggerDefinitions(models) {
  var definitions = {};

  definitions.DefaultError = {
    type: 'object', properties: {
      status: {
        type: 'string'
      }, error: {
        type: 'string'
      }
    }, example: {
      status: 400, error: 'Invalid Phone'
    }
  };

  _.each(models, function eachModel(model, name) {
    var modelDef = {};
    modelDef.type = 'object';
    if (model.example) {
      modelDef.example = model.example;
    }
    modelDef.properties = {};
    modelDef.required = [];

    _.each(model._attributes, function eachAttribute(attribute, attrName) {
      var attrProps = {};

      // basic type
      if (attribute.type) {
        switch (attribute.type) {
          case 'string':
            attrProps.type = 'string';
            attrProps.format = 'string';
            break;
          case 'text':
            attrProps.type = 'string';
            attrProps.format = 'text';
            break;
          case 'integer':
            attrProps.type = 'integer';
            attrProps.format = 'int64';
            break;
          case 'float':
            attrProps.type = 'float';
            attrProps.format = 'float';
            break;
          case 'date':
            attrProps.type = 'string';
            attrProps.format = 'date';
            break;
          case 'datetime':
            attrProps.type = 'string';
            attrProps.format = 'date-time';
            break;
          case 'boolean':
            attrProps.type = 'boolean';
            break;
          case 'binary':
            attrProps.type = 'string';
            attrProps.format = 'binary';
            break;
          case 'array':
            attrProps.type = 'array';
            attrProps.items = {
              type: 'string'
            };
            break;
          case 'json':
            attrProps.type = 'string';
            attrProps.format = 'json';
            break;
          case 'email':
            attrProps.type = 'string';
            attrProps.format = 'email';
            break;
        }
      }

      // has One
      if (attribute.model) {
        attrProps['$ref'] = '#/definitions/' + attribute.model;
      }

      // has Many
      if (attribute.collection) {
        attrProps.type = 'array';
        attrProps.items = {
          "$ref": '#/definitions/' + attribute.collection
        }
      }

      if (attribute.defaultsTo) {
        attrProps.default = attribute.defaultsTo;
      }

      if (attribute.unique) {
        attrProps.uniqueItems = true;
      }

      if (attribute.enum) {
        attrProps.enum = attribute.enum;
      }

      if (attribute.minLength) {
        attrProps.minLength = attribute.minLength;
      }

      if (attribute.maxLength) {
        attrProps.maxLength = attribute.maxLength;
      }

      modelDef.properties[attrName] = attrProps;

      if (attribute.required) {
        modelDef.required.push(attrName);
      }
    });

    definitions[name] = modelDef;

    var modelCollection = {
      type: 'array', items: {
        $ref: '#/definitions/' + name
      }
    };

    definitions[pluralize(name)] = modelCollection;
  });

  return definitions;
}

function calculateSwaggerParameters() {
  return {
    whereParam: {
      name: 'where',
      description: 'JSON encode WHERE criteria objects. Example: where={"name":{"contains":"theodore"}}',
      in: 'query',
      required: false,
      type: 'string'
    }, limitParam: {
      name: 'limit',
      description: 'The maximum number of records to send back. Example: limit=100',
      in: 'query',
      required: false,
      type: 'integer',
      format: 'int32',
      default: 20
    }, skipParam: {
      name: 'skip',
      description: 'The number of records to skip. Example: skip=30',
      in: 'query',
      required: false,
      type: 'integer',
      format: 'int32',
      default: '0'
    }, sortParam: {
      name: 'sort',
      description: 'The sort order. Example: sort=lastName%20ASC',
      in: 'query',
      required: false,
      type: 'string',
      default: 'id ASC'
    }, callbackParam: {
      name: 'callback',
      description: 'If specified, a JSONP response will be sent (instead of JSON). This is the name of a client-side javascript function to call, to which results will be passed as the first (and only) argument. Example: ?callback=my_JSONP_data_receiver_fn',
      in: 'query',
      required: false,
      type: 'string'
    }
  }
}

function calculateSwaggerResponses() {
  return {
    NotFound: {
      description: 'Entity Not Found', schema: {
        $ref: '#/definitions/DefaultError'
      }
    }, ServerError: {
      description: 'Server Error', schema: {
        $ref: '#/definitions/DefaultError'
      }
    }, Forbidden: {
      description: 'Not Authorized', schema: {
        $ref: '#/definitions/DefaultError'
      }
    }, InvalidRequest: {
      description: 'Invalid Input', schema: {
        $ref: '#/definitions/DefaultError'
      }
    }
  };
}

function calculateSwaggerTags(baseTags, controllers) {
  var tags = baseTags || [];

  _.each(controllers, function handleController(controller, controllerId) {
    var name = pluralize(controllerId);
    var found = false;

    _.each(tags, function checkTag(t) {
      if (t.name === name) {
        found = true;
      }
    });

    if (!found) {
      tags.push({name: name});
    }
  });

  return tags;
}

function addModelAttributesToParams(model, params) {
  _.each(model._attributes, function eachAttribute(attribute, attrName) {
    var paramObj = {};
    paramObj.name = attrName;
    paramObj.in = 'query';

    if (attribute.type) {
      switch (attribute.type) {
        case 'string':
          paramObj.type = 'string';
          paramObj.format = 'string';
          break;
        case 'text':
          paramObj.type = 'string';
          paramObj.format = 'text';
          break;
        case 'integer':
          paramObj.type = 'integer';
          paramObj.format = 'int64';
          break;
        case 'float':
          paramObj.type = 'float';
          paramObj.format = 'float';
          break;
        case 'date':
          paramObj.type = 'string';
          paramObj.format = 'date';
          break;
        case 'datetime':
          paramObj.type = 'string';
          paramObj.format = 'date-time';
          break;
        case 'boolean':
          paramObj.type = 'boolean';
          break;
        case 'binary':
          paramObj.type = 'string';
          paramObj.format = 'binary';
          break;
        case 'array':
          paramObj.type = 'array';
          paramObj.items = {
            type: 'string'
          };
          break;
        case 'json':
          paramObj.type = 'string';
          paramObj.format = 'json';
          break;
        case 'email':
          paramObj.type = 'string';
          paramObj.format = 'email';
          break;
      }
    }

    // has One
    if (attribute.model) {
      paramObj.type = 'string';
      paramObj.format = 'id';
    }

    // has Many
    if (attribute.collection) {
      paramObj.type = 'array';
      paramObj.items = {
        type: 'string', format: 'id'
      };
    }

    if (attribute.defaultsTo) {
      paramObj.default = attribute.defaultsTo;
    }

    if (attribute.unique) {
      paramObj.uniqueItems = true;
    }

    if (attribute.enum) {
      paramObj.enum = attribute.enum;
    }

    if (attribute.minLength) {
      paramObj.minLength = attribute.minLength;
    }

    if (attribute.maxLength) {
      paramObj.maxLength = attribute.maxLength;
    }

    params.push(paramObj);
  });

  return params;
}

function addDefaultResponses(responses) {
  responses['404'] = {
    $ref: '#/responses/NotFound'
  };
  responses['400'] = {
    $ref: '#/responses/InvalidRequest'
  };
  responses['403'] = {
    $ref: '#/responses/Forbidden'
  };
  responses['500'] = {
    $ref: '#/responses/ServerError'
  };

  return responses;
}
