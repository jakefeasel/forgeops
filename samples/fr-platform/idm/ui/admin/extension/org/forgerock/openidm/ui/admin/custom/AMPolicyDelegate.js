/*
 * Copyright 2018 ForgeRock AS. All Rights Reserved
 *
 * Use of this code requires a commercial software license with ForgeRock AS.
 * or with one of its affiliates. All use shall be exclusively subject
 * to such license between the licensee and ForgeRock AS.
 */

define([
    "jquery",
    "underscore",
    "org/forgerock/commons/ui/common/main/AbstractDelegate",
    "org/forgerock/commons/ui/common/util/Constants"
], function($, _,
            AbstractDelegate,
            Constants) {

    var AMPolicyDelegate = new AbstractDelegate("/openig/api/system/objects/_router/routes/openidm");

    AMPolicyDelegate.initialize = function () {
        return AMPolicyDelegate.serviceCall({
            "serviceUrl" : "/openidm/",
            "url": "script?_action=eval",
            "type": "POST",
            "data": JSON.stringify({
                "type": "text/javascript",
                "source": "identityServer.getProperty('am.realm.endpoint')"
            }),
        })
        .then(_.bind(function (resp) {
            this.amRealmEndpoint = resp;
            return this;
        }, this));
    };

    AMPolicyDelegate.createPolicyConditionScript = function (roleId) {
        return this.serviceCall({
            "serviceUrl": this.amRealmEndpoint,
            "url": "scripts?_queryFilter=name eq 'hasRole-" + roleId + "'"
        })
        .then(_.bind(function (resp) {
            if (resp.result.length === 0) {
                return this.serviceCall({
                    "serviceUrl": this.amRealmEndpoint,
                    "type": "POST",
                    "url": "scripts?_action=create",
                    "data": JSON.stringify({
                        context: "POLICY_CONDITION",
                        language: "GROOVY",
                        name: "hasRole-" + roleId,
                        script: btoa("authorized = environment.get('securityContextRoles').inject(false) { result, role -> result || role == '"+roleId+"' }")
                    })
                });
            } else {
                return resp.result[0];
            }
        }, this));
    };

    AMPolicyDelegate.getPolicyForRole = function (roleId) {
        return this.serviceCall({
            "serviceUrl": this.amRealmEndpoint,
            "url": "policies?_queryFilter=name eq 'role-"+roleId+"' and applicationName eq 'openidm'"
        })
        .then(function (resp) {
            return resp.result[0];
        });
    };

    AMPolicyDelegate.getResourceFromPolicy = function (policy) {
        return policy.resources[0].replace(/^.*\/managed\/(.*?)\/.*$/, "$1");
    };

    AMPolicyDelegate.getAllowedFieldsFromPolicy = function (policy) {
        var allowedFieldsAttribute = policy.resourceAttributes.filter(function (attribute) {
            return attribute.propertyName === "allowedFields";
        })[0];

        if (allowedFieldsAttribute) {
            return allowedFieldsAttribute.propertyValues;
        } else {
            return [];
        }
    };

    AMPolicyDelegate.getScopingAttributeFromPolicy = function (policy) {
        var scopingAttribute = policy.resourceAttributes.filter(function (attribute) {
            return attribute.type === "User";
        })[0];

        if (scopingAttribute) {
            return scopingAttribute.propertyName;
        } else {
            return [];
        }
    };

    AMPolicyDelegate.createPolicyForRole = function (roleId, conditionScriptId, resourceName, allowedFields, scopingAttribute) {
        var resourceAttributes = [];

        if (scopingAttribute) {
            resourceAttributes.push({
                "type": "User",
                "propertyName": scopingAttribute,
                "propertyValues": []
            });
        }

        if (allowedFields.length) {
            resourceAttributes.push({
                "type": "Static",
                "propertyName": "allowedFields",
                "propertyValues": allowedFields
            });
        }

        return this.serviceCall({
            "serviceUrl": this.amRealmEndpoint,
            "type": "PUT",
            "url": "policies/role-" + roleId,
            "data": JSON.stringify({
                "name": "role-" + roleId,
                "active": true,
                "resources": [
                    "*://*:*/openidm/managed/"+resourceName+"/*?*",
                    "*://*:*/openidm/managed/"+resourceName+"/*",
                    "*://*:*/openidm/managed/"+resourceName+"?_queryFilter=*",
                    "*://*:*/openidm/managed/"+resourceName+"?*&_queryFilter=*"
                ],
                "applicationName": "openidm",
                "actionValues": {
                    "GET": true,
                    "PATCH": allowedFields.length > 0
                },
                "subject": {
                    "type": "AuthenticatedUsers"
                },
                "condition": {
                    "type": "Script",
                    "scriptId": conditionScriptId
                },
                "resourceTypeUuid": "76656a38-5f8e-401b-83aa-4ccb74ce88d2",
                "resourceAttributes": resourceAttributes
            })
        });
    };

    AMPolicyDelegate.getScopeResourceQueryFilter = function (roleId) {
        return this.serviceCall({})
        .then(_.bind(function (igFilter) {
            var existingScopeFilter = igFilter.handler.config.filters.filter(function (filter) {
                return filter.name === "scopeValidation-" + roleId;
            })[0];

            if (existingScopeFilter) {
                return existingScopeFilter.config.delegate.config.args.scopeResourceQueryFilter.replace("\\${", "${");
            } else {
                return null;
            }
        }, this));
    };

    AMPolicyDelegate.updateIGFilter = function (roleId, scopingAttribute, scopeResourceQueryFilter) {
        return this.serviceCall({})
        .then(_.bind(function (igFilter) {
            var existingScopeFilter = igFilter.handler.config.filters.filter(function (filter) {
                return filter.name === "scopeValidation-" + roleId;
            })[0];

            var config = {
                "condition": "${contains(session.idmUserDetails.authorization.roles, '"+roleId+"')}",
                "delegate": {
                    "type": "ScriptableFilter",
                    "config": {
                        "clientHandler": "IDMClient",
                        "type": "application/x-groovy",
                        "file": "scopeValidation.groovy",
                        "args": {
                            "scopeResourceQueryFilter": scopeResourceQueryFilter.replace("${", "\\${"),
                            "scopingAttribute": scopingAttribute,
                            "failureResponse": "${heap['authzFailureResponse']}"
                        }
                    }
                }
            };

            if (!existingScopeFilter) {
                igFilter.handler.config.filters.push({
                    "name": "scopeValidation-" + roleId,
                    "type": "ConditionalFilter",
                    "config": config
                });
            } else {
                existingScopeFilter.config = config;
                existingScopeFilter.type = "ConditionalFilter";
            }

            return this.serviceCall({
                "type": "PUT",
                "data": JSON.stringify(igFilter),
                "headers": {
                    "If-Match": "*"
                }
            });

        }, this));
    };

    AMPolicyDelegate.updateGeneralAdminPolicy = function (conditionScriptId) {
        return this.serviceCall({
            "serviceUrl": this.amRealmEndpoint,
            "url": "policies?_queryFilter=name eq 'generalBasicAdmin' and applicationName eq 'openidm'"
        })
        .then(_.bind(function (resp) {
            var policy;
            if (resp.result.length === 0) {
                policy = {
                    "name": "generalBasicAdmin",
                    "active": true,
                    "description": "",
                    "resources": [
                        "*://*:*/openidm/system?_action=test",
                        "*://*:*/openidm/config/external.email",
                        "*://*:*/openidm/config/workflow",
                        "*://*:*/openidm/config/managed",
                        "*://*:*/openidm/config/ui/configuration",
                        "*://*:*/openidm/maintenance?_action=status"
                    ],
                    "applicationName": "openidm",
                    "actionValues": {
                        "POST": true,
                        "GET": true
                    },
                    "subject": {
                        "type": "AuthenticatedUsers"
                    },
                    "condition": {
                        "type": "OR",
                        "conditions": [
                            {
                                "type": "Script",
                                "scriptId": conditionScriptId
                            }
                        ]
                    },
                    "resourceTypeUuid": "76656a38-5f8e-401b-83aa-4ccb74ce88d2"
                };

                return this.serviceCall({
                    "serviceUrl": this.amRealmEndpoint,
                    "url": "policies?_action=create",
                    "type": "POST",
                    "data": JSON.stringify(policy)
                });
            } else {
                policy = resp.result[0];
                if (policy.condition.conditions.filter(function (condition) {
                    return condition.scriptId === conditionScriptId;
                }).length === 0) {
                    policy.condition.conditions.push({
                        "type": "Script",
                        "scriptId": conditionScriptId
                    });
                    return this.serviceCall({
                        "serviceUrl": this.amRealmEndpoint,
                        "url": "policies/generalBasicAdmin",
                        "type": "PUT",
                        "data": JSON.stringify(policy),
                        "headers": {
                            "If-Match": "*"
                        }
                    });
                } else {
                    return policy;
                }
            }
        }, this));

    };

    AMPolicyDelegate.updateUIConfig = function (roleId) {
        return this.serviceCall({
            "serviceUrl": "/openidm/",
            "url": "config/ui/configuration"
        })
        .then(_.bind(function (uiConfig) {
            if (!uiConfig.configuration.roles[roleId]) {
                uiConfig.configuration.roles[roleId] = "ui-admin";
                return this.serviceCall({
                    "serviceUrl": "/openidm/",
                    "url": "config/ui/configuration",
                    "type": "PUT",
                    "data": JSON.stringify(uiConfig),
                    "headers": {
                        "If-Match": "*"
                    }
                })
            } else {
                return uiConfig;
            }
        }, this));
    };

    AMPolicyDelegate.configurePoliciesForRole = function (roleId, resourceName, allowedFields, scopingAttribute, scopeResourceQueryFilter) {
        var promise;
        if (!this.amRealmEndpoint) {
            promise = this.initialize();
        } else {
            promise = $.Deferred().resolve();
        }

        return promise
        .then(_.bind(function () {
            return this.createPolicyConditionScript(roleId);
        }, this))
        .then(_.bind(function (policyConditionScript) {
            return $.when([
                this.createPolicyForRole(roleId, policyConditionScript._id, resourceName, allowedFields, scopingAttribute),
                this.updateGeneralAdminPolicy(policyConditionScript._id),
                this.updateUIConfig(roleId),
                this.updateIGFilter(roleId, scopingAttribute, scopeResourceQueryFilter)
            ]);
        }, this));
    };

    return AMPolicyDelegate;
});
