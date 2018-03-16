/*
 * Copyright 2018 ForgeRock AS. All Rights Reserved
 *
 * Use of this code requires a commercial software license with ForgeRock AS.
 * or with one of its affiliates. All use shall be exclusively subject
 * to such license between the licensee and ForgeRock AS.
 */

define([
    "lodash",
    "org/forgerock/commons/ui/common/main/AbstractView",
    "./AMPolicyDelegate",
    "org/forgerock/openidm/ui/common/delegates/ConfigDelegate",
    "org/forgerock/openidm/ui/common/resource/util/ResourceQueryFilterEditor",
], function (_, AbstractView, AMPolicyDelegate, ConfigDelegate, ResourceQueryFilterEditor) {

    var EditRolePolicyTab = AbstractView.extend({
        element: "#rolePolicyContent",
        events: {
            "change [name=enabled]" : "togglePolicy",
            "click #savePolicies" : "savePolicies"
        },
        partials: [
            "partials/role/_policyConfiguration.html"
        ],
        template: "templates/admin/role/RolePolicyTab.html",
        render: function (args, callback) {
            this.data.roleId = args.roleId;
            AMPolicyDelegate.initialize()
            .then(_.bind(function () {

                return $.when(
                    AMPolicyDelegate.getPolicyForRole(this.data.roleId),
                    AMPolicyDelegate.getScopeResourceQueryFilter(this.data.roleId),
                    ConfigDelegate.readEntity("managed")
                );

            }, this))
            .then(_.bind(function (policy, scopeResourceQueryFilter, managedConfig) {

                this.data.managedObjects = managedConfig.objects.map(function (obj) {
                    return obj.name;
                });

                this.data.enabled = !!policy;
                this.data.policy = policy;
                if (this.data.enabled) {
                    this.data.scopeResourceQueryFilter = scopeResourceQueryFilter;
                    this.data.resource = AMPolicyDelegate.getResourceFromPolicy(policy);
                    this.data.allowedFields = AMPolicyDelegate.getAllowedFieldsFromPolicy(policy);
                    this.data.scopingAttribute = AMPolicyDelegate.getScopingAttributeFromPolicy(policy);

                    this.data.managedObjectProperties = managedConfig.objects
                    .filter(_.bind(function (obj) {
                        return obj.name === this.data.resource;
                    }, this))[0].schema.order
                    .map(_.bind(function(property) {
                        return {
                            name: property,
                            checked: _.indexOf(this.data.allowedFields, property) !== -1
                        }
                    }, this));
                } else {
                    this.data.managedObjectProperties = managedConfig.objects[0].schema.order
                    .map(_.bind(function(property) {
                        return {
                            name: property,
                            checked: false
                        }
                    }, this));
                }
                this.parentRender(_.bind(function () {
                    this.editor = new ResourceQueryFilterEditor();

                    this.editor.render(
                        {
                            "queryFilter": this.data.scopeResourceQueryFilter || "",
                            "element": "#scopeResourceQueryFilterHolder",
                            "resource": "managed/user"
                        },
                        function () {
                            if (callback) {
                                callback();
                            }
                        }
                    );

                }, this));
            }, this));
        },
        togglePolicy: function (el) {
            var enabled = $(el.target).prop("checked");
            this.$el.find("#policyConfiguration").toggleClass('hidden', !enabled);
        },
        savePolicies: function (e) {
            e.preventDefault();

            var resourceName = this.$el.find("[name=resource]").val(),
                allowedFields = this.$el.find("[name=allowedFields]:checked").map(function () {
                    return this.value;
                }).get(),
                scopingAttribute = this.$el.find("[name=scopingAttribute]").val()
                scopeResourceQueryFilter = this.editor.getFilterString();

            AMPolicyDelegate.configurePoliciesForRole(
                this.data.roleId,
                resourceName,
                allowedFields,
                scopingAttribute,
                scopeResourceQueryFilter
            );
        }
    });

    return new EditRolePolicyTab();
});
