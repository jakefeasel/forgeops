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
    "org/forgerock/openidm/ui/admin/role/EditRoleView",
    "./EditRolePolicyTab"
], function (_, AbstractView, defaultEditRoleView, EditRolePolicyTab) {

    var EditRoleView = function () {
        return AbstractView.apply(this, arguments);
    };

    EditRoleView.prototype = Object.create(defaultEditRoleView);

    EditRoleView.prototype.render = function (args, callback) {
        defaultEditRoleView.render.call(this, args, _.bind(function () {

            if (this.data.args.length === 3) {
                var tabHeader = this.$el.find("#tabHeaderTemplate").clone(),
                    tabContent = this.$el.find("#relationshipsTemplate").clone();

                tabHeader.attr("id", "tabHeader_rolePolicy");
                tabHeader.find("a").attr("href","#rolePolicy").text("Authorization Policy");
                tabHeader.show();

                tabContent.attr("id", "rolePolicy");
                tabContent.find(".resourceCollectionRelationships").attr("id", "rolePolicyContent");

                this.$el.find(".tab-menu .nav-tabs").append(tabHeader);
                this.$el.find(".tab-content").append(tabContent);

                EditRolePolicyTab.render({
                    roleId: this.data.args[2]
                }, function () {
                    if (callback) {
                        callback();
                    }
                });
            } else {
                if (callback) {
                    callback();
                }
            }

        }, this));
    };

    return new EditRoleView();
});
