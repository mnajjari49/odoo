odoo.define('web.AbstractAction', function (require) {
"use strict";

/**
 * We define here the AbstractAction widget, which implements the ActionMixin.
 * All client actions must extend this widget.
 *
 * @module web.AbstractAction
 */

var ActionMixin = require('web.ActionMixin');
var ControlPanel = require('web.ControlPanel');
var Widget = require('web.Widget');

var AbstractAction = Widget.extend(ActionMixin, {
    config: {
        ControlPanel: ControlPanel,
    },

    /**
     * If this flag is set to true, the client action will create a control
     * panel whenever it is created.
     *
     * @type boolean
     */
    hasControlPanel: false,

    /**
     * If true, this flag indicates that the client action should automatically
     * fetch the <arch> of a search view (or control panel view).  Note that
     * to do that, it also needs a specific modelName.
     *
     * For example, the Discuss application adds the following line in its
     * constructor::
     *
     *      this.controlPanelParams.modelName = 'mail.message';
     *
     * @type boolean
     */
    loadControlPanel: false,

    /**
     * A client action might want to use a search bar in its control panel, or
     * it could choose not to use it.
     *
     * Note that it only makes sense if hasControlPanel is set to true.
     *
     * @type boolean
     */
    withSearchBar: false,

    /**
     * This parameter can be set to customize the available sub menus in the
     * controlpanel (Filters/Group By/Favorites).  This is basically a list of
     * the sub menus that we want to use.
     *
     * Note that it only makes sense if hasControlPanel is set to true.
     *
     * For example, set ['filter', 'favorite'] to enable the Filters and
     * Favorites menus.
     *
     * @type string[]
     */
    searchMenuTypes: [],

    /**
     * @override
     *
     * @param {Widget} parent
     * @param {Object} action
     * @param {Object} [options]
     */
    init: function (parent, action, options) {
        this._super(parent);
        this._title = action.display_name || action.name;
        this.controlPanelParams = {
            actionId: action.id,
            context: action.context,
            breadcrumbs: options && options.breadcrumbs || [],
            title: this.getTitle(),
            viewId: action.search_view_id && action.search_view_id[0],
            withSearchBar: this.withSearchBar,
            searchMenuTypes: this.searchMenuTypes,
        };
    },
    /**
     * The willStart method is actually quite complicated if the client action
     * has a controlPanel, because it needs to prepare it.
     *
     * @override
     */
    willStart: async function () {
        const proms = [this._super(...arguments)];
        if (this.hasControlPanel) {
            const params = this.controlPanelParams;
            if (this.loadControlPanel) {
                const { context, modelName, viewId } = params;
                const loadFieldViewPromise = this.loadFieldView(modelName, context || {}, viewId, 'search')
                    .then(fieldsView =>
                        params.viewInfo = {
                            arch: fieldsView.arch,
                            fields: fieldsView.fields,
                        });
                proms.push(loadFieldViewPromise);
            }
            await Promise.all(proms);
            this._controlPanel = new this.config.ControlPanel(null, params);
            await this._controlPanel.mount(document.createElement('div'));
        }
        return Promise.all(proms);
    },
    /**
     * @override
     */
    start: async function () {
        await this._super(...arguments);
        return this.prependControlPanel();
    },
    on_attach_callback: function () {
        return this.prependControlPanel();
    },
});

return AbstractAction;

});
