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
var ControlPanelStore = require('web.ControlPanelStore');
var Widget = require('web.Widget');
const { WidgetAdapterMixin } = require('web.OwlCompatibility');
const ControlPanelWrapper = require('web.ControlPanelWrapper');

var AbstractAction = Widget.extend(ActionMixin, WidgetAdapterMixin, {
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
     *      this.controlPanelProps.modelName = 'mail.message';
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

        if (this.hasControlPanel) {
            this.controlPanelStoreConfig = {
                actionId: action.id,
                actionContext: action.context || {},
                actionDomain: action.domain || [],
                env: owl.Component.env,
                withSearchBar: this.withSearchBar,
            };

            this.viewId = action.search_view_id && action.search_view_id[0]

            this.controlPanelProps = {
                // TODO we should not pass action
                action: action,
                fields: {},
                breadcrumbs: options && options.breadcrumbs,
                withSearchBar: this.withSearchBar,
                searchMenuTypes: this.searchMenuTypes,
            };
        }
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
            if (this.loadControlPanel) {
                const { context, modelName, viewId, searchMenuTypes } = this.controlPanelProps;
                const options = { load_filters: searchMenuTypes.includes('favorite') };
                const loadFieldViewPromise = this.loadFieldView(modelName, context || {}, this.viewId, 'search', options);
                const {arch, fields, favoriteFilters } = await loadFieldViewPromise;
                this.controlPanelStoreConfig.viewInfo = {arch, fields, favoriteFilters };
                this.controlPanelProps.fields = fields;
            }
            this._controlPanelStore = new ControlPanelStore(this.controlPanelStoreConfig);
            this.controlPanelProps.controlPanelStore = this._controlPanelStore;
            proms.push(this._controlPanelStore.isReady);
        }
        return Promise.all(proms);
    },
    /**
     * @override
     */
    start: async function () {
        await this._super(...arguments);
        if (this.hasControlPanel) {
            this._controlPanelWrapper = new ControlPanelWrapper(this, ControlPanel, this.controlPanelProps);
            await this._controlPanelWrapper.mount(this.el, { position: 'first-child' });
        }
        if (this._controlPanelStore) {
            this._controlPanelStore.on('get_controller_query_params', this, this._onGetOwnedQueryParams);
        }
    },
    on_attach_callback: function () {
        WidgetAdapterMixin.on_attach_callback.call(this);
        if (this._controlPanelStore) {
            this._controlPanelStore.on('get_controller_query_params', this, this._onGetOwnedQueryParams);
        }
    },
    /**
     * @private
     * @param {Object} newProps
     */
    _updateControlPanel: function (newProps = {}) {
        if ('title' in newProps) {
            this._setTitle(newProps.title);
        }
        if (this._controlPanelWrapper) {
            return this._controlPanelWrapper.update(newProps);
        }
    },
});

return AbstractAction;

});
