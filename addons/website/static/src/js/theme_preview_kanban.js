odoo.define('website.theme_preview_kanban', function (require) {
"use strict";

var KanbanController = require('web.KanbanController');
var KanbanView = require('web.KanbanView');
var ViewRegistry = require('web.view_registry');

var ThemePreviewKanbanController = KanbanController.extend({
    /**
     * @override
     */
    start: function () {
        this.$el.addClass('o_view_kanban_theme_preview_controller');
        return this._super.apply(this, arguments);
    },
});

var ThemePreviewKanbanView = KanbanView.extend({
    searchMenuTypes: [],

    config: _.extend({}, KanbanView.prototype.config, {
        Controller: ThemePreviewKanbanController,
    }),

    // -------------------------------------------------------------------------
    // Private
    // -------------------------------------------------------------------------

    /**
     * @override
     */
    _createControlPanel: async function () {
        const controlPanel = await this._super(...arguments);
        const websiteLink = Object.assign(document.createElement('a'), {
            className: 'btn btn-secondary ml-3',
            href: '/',
            innerHTML: '<i class="fa fa-close"/>'
        });
        controlPanel.el.querySelector('.o_cp_top').appendChild(websiteLink);
        return controlPanel;
    },
});

ViewRegistry.add('theme_preview_kanban', ThemePreviewKanbanView);

});
