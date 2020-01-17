odoo.define('web.AbstractController', function (require) {
"use strict";

/**
 * The Controller class is the class coordinating the model and the renderer.
 * It is the C in MVC, and is what was formerly known in Odoo as a View.
 *
 * Its role is to listen to events bubbling up from the model/renderer, and call
 * the appropriate methods if necessary.  It also render control panel buttons,
 * and react to changes in the search view.  Basically, all interactions from
 * the renderer/model with the outside world (meaning server/reading in session/
 * reading localstorage, ...) has to go through the controller.
 */

var ActionMixin = require('web.ActionMixin');
var ajax = require('web.ajax');
var concurrency = require('web.concurrency');
var mvc = require('web.mvc');
var { WidgetAdapterMixin } = require('web.OwlCompatibility');

var session = require('web.session');
const ControlPanelWrapper = require('web.ControlPanelWrapper');
const ControlPanel = require('web.ControlPanel');

var AbstractController = mvc.Controller.extend(ActionMixin, WidgetAdapterMixin, {
    custom_events: _.extend({}, ActionMixin.custom_events, {
        navigation_move: '_onNavigationMove',
        open_record: '_onOpenRecord',
        switch_view: '_onSwitchView',
        search: '_onSearch',
        search_panel_domain_updated: '_onSearchPanelDomainUpdated',
    }),
    events: {
        'click a[type="action"]': '_onActionClicked',
        switch_view: '_onSwitchView',
    },

    /**
     * @override
     * @param {string} params.modelName
     * @param {string} [params.controllerID] an id to ease the communication
     *   with upstream components
     * @param {ControlPanel} [params.controlPanel]
     * @param {any} [params.handle] a handle that will be given to the model (some id)
     * @param {Object[]} params.actionViews
     * @param {string} params.viewType
     * @todo review doc
     */
    init: function (parent, model, renderer, params) {
        this._super.apply(this, arguments);
        this._title = params.displayName;
        this.modelName = params.modelName;
        this.activeActions = params.activeActions;
        this.controllerID = params.controllerID;
        this.initialState = params.initialState;
        this.bannerRoute = params.bannerRoute;
        this.actionViews = params.actionViews;
        this.viewType = params.viewType;
        // use a DropPrevious to correctly handle concurrent updates
        this.dp = new concurrency.DropPrevious();

        this.withControlPanel = params.withControlPanel;
        if (this.withControlPanel) {
            this.controlPanelProps = params.controlPanelProps;
            this._controlPanelStore = params.controlPanelStore;
        }

        this.withSearchPanel = params.withSearchPanel && params.searchPanel;
        if (this.withSearchPanel) {
            // the following attributes are used when there is a searchPanel
            this._searchPanel = params.searchPanel;
        }

        // todo; change those 'things'
        this.controlPanelDomain = params.controlPanelDomain || [];
        this.searchPanelDomain = this._searchPanel ? this._searchPanel.getDomain() : [];
    },

    /**
     *
     * @returns {Promise}
     */
    willStart: async function () {
        const proms = [this._super.apply(this, ...arguments)];
        if (this.withControlPanel) {
            proms.push(this._controlPanelStore.isReady);
        }
        return Promise.all(proms);
    },

    /**
     * Simply renders and updates the url.
     *
     * @returns {Promise}
     */
    start: async function () {
        const _super = this._super(...arguments);
        if (this.withSearchPanel) {
            this.$('.o_content')
                .addClass('o_controller_with_searchpanel')
                .prepend(this._searchPanel.$el);
        }
        // this.renderButtons();
        // this._updateButtons();
        // this.cp_content.buttons = this.$buttons,
        // this.controlPanelProps.cp_content = cp_content;
        if (this.withControlPanel) {
            this._controlPanelWrapper = new ControlPanelWrapper(this, ControlPanel, this.controlPanelProps);
            await this._controlPanelWrapper.mount(this.el, { position: 'first-child' });
        }

        this.$el.addClass('o_view_controller');

        await _super;
        await this._update(this.initialState);
    },
    /**
     * @override
     */
    destroy: function () {
        if (this.$buttons) {
            this.$buttons.off();
        }
        this._super.apply(this, arguments);
        WidgetAdapterMixin.destroy.call(this);
    },
    /**
     * Called each time the controller is attached into the DOM.
     */
    on_attach_callback: function () {
        if (this.withSearchPanel) {
            this._searchPanel.on_attach_callback();
        }
        if (this.withControlPanel) {
            this._controlPanelStore.on('get_controller_query_params', this, this._onGetOwnedQueryParams);
        }
        this.renderer.on_attach_callback();
    },
    /**
     * Called each time the controller is detached from the DOM.
     */
    on_detach_callback: function () {
        if (this.withControlPanel) {
            this._controlPanelStore.off('get_controller_query_params', this);
        }
        this.renderer.on_detach_callback();
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    canBeRemoved: function () {
        // AAB: get rid of 'readonlyIfRealDiscard' option when on_hashchange mechanism is improved
        return this.discardChanges(undefined, {
            noAbandon: true,
            readonlyIfRealDiscard: true,
        });
    },
    /**
     * Discards the changes made on the record associated to the given ID, or
     * all changes made by the current controller if no recordID is given. For
     * example, when the user opens the 'home' screen, the action manager calls
     * this method on the active view to make sure it is ok to open the home
     * screen (and lose all current state).
     *
     * Note that it returns a Promise, because the view could choose to ask the
     * user if he agrees to discard.
     *
     * @param {string} [recordID]
     *        if not given, we consider all the changes made by the controller
     * @param {Object} [options]
     * @returns {Promise} resolved if properly discarded, rejected otherwise
     */
    discardChanges: function (recordID, options) {
        return Promise.resolve();
    },
    /**
     * Export the state of the controller containing information that is shared
     * between different controllers of a same action (like the current
     * searchQuery of the controlPanel).
     *
     * @returns {Object}
     */
    exportState: function () {
        var state = {};
        if (this.withControlPanel) {
            state.cpState = this._controlPanelStore.exportState();
        }
        if (this.withSearchPanel) {
            state.spState = this._searchPanel.exportState();
        }
        return state;
    },
    /**
     * Gives the focus to the renderer
     */
    giveFocus: function () {
        this.renderer.giveFocus();
    },
    /**
     * The use of this method is discouraged.  It is still snakecased, because
     * it currently is used in many templates, but we will move to a simpler
     * mechanism as soon as we can.
     *
     * @deprecated
     * @param {string} action type of action, such as 'create', 'read', ...
     * @returns {boolean}
     */
    is_action_enabled: function (action) {
        return this.activeActions[action];
    },
    /**
     * Short helper method to reload the view
     *
     * @param {Object} [params={}] This object will simply be given to the update
     * @returns {Promise}
     */
    reload: async function (params = {}) {
        let searchPanelUpdateProm;
        const controllerState = params.controllerState || {};
        const cpState = controllerState.cpState;
        if (this._controlPanel && cpState) {
            const searchQuery = this._controlPanelStore.importState(cpState);
            params = Object.assign({}, params, searchQuery);
        }
        let postponeRendering = false;
        if (this.withSearchPanel) {
            this.controlPanelDomain = params.domain || this.controlPanelDomain;
            if (controllerState.spState) {
                this._searchPanel.importState(controllerState.spState);
                this.searchPanelDomain = this._searchPanel.getDomain();
            } else {
                searchPanelUpdateProm =  this._searchPanel.update({searchDomain: this._getSearchDomain()});
                postponeRendering = !params.noRender;
                params.noRender = true; // wait for searchpanel to be ready to render
            }
            params.domain = this.controlPanelDomain.concat(this.searchPanelDomain);
        }
        await Promise.all([this.update(params, {}), searchPanelUpdateProm]);
        if (postponeRendering) {
            return this.renderer._render();
        }
    },
    /**
     * Method used to assign a jQuery element to `this.$buttons`.
     */
    renderButtons: function () { },

    updateButtons: function () { },
    /**
     * This is the main entry point for the controller.  Changes from the search
     * view arrive in this method, and internal changes can sometimes also call
     * this method.  It is basically the way everything notifies the controller
     * that something has changed.
     *
     * The update method is responsible for fetching necessary data, then
     * updating the renderer and wait for the rendering to complete.
     *
     * @param {Object} params will be given to the model and to the renderer
     * @param {Object} [options]
     * @param {boolean} [options.reload=true] if true, the model will reload data
     *
     * @returns {Promise}
     */
    update: function (params, options) {
        var self = this;
        var shouldReload = (options && 'reload' in options) ? options.reload : true;
        var def = shouldReload ? this.model.reload(this.handle, params) : Promise.resolve();
        // we check here that the updateIndex of the control panel hasn't changed
        // between the start of the update request and the moment the controller
        // asks the control panel to update itself ; indeed, it could happen that
        // another action/controller is executed during this one reloads itself,
        // and if that one finishes first, it replaces this controller in the DOM,
        // and this controller should no longer update the control panel.
        // note that this won't be necessary as soon as each controller will have
        // its own control panel
        var cpUpdateIndex = this._controlPanel && this._controlPanel.updateIndex;
        return this.dp.add(def).then(function (handle) {
            if (self._controlPanel && cpUpdateIndex !== self._controlPanel.updateIndex) {
                return;
            }
            self.handle = handle || self.handle; // update handle if we reloaded
            var state = self.model.get(self.handle);
            var localState = self.renderer.getLocalState();
            return self.dp.add(self.updateRendererState(state, params)).then(function () {
                if (self._controlPanel && cpUpdateIndex !== self._controlPanel.updateIndex) {
                    return;
                }
                self.renderer.setLocalState(localState);
                return self._update(state, params);
            });
        });
    },
    /**
     * Update the state of the renderer (handle both Widget and Component
     * renderers).
     *
     * @param {Object} state the model state
     * @param {Object} params will be given to the model and to the renderer
     */
    updateRendererState: function (state, params) {
        if (this.renderer instanceof owl.Component) {
            return this.renderer.update(state);
        }
        return this.renderer.updateState(state, params);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------


    /**
     * Meant to be overriden to return a proper object.
     * @private
     * @return {(Object|null)}
     */
    _getPagerProps: function () {
        return null;
    },
    /**
     * Return the current search domain. This is the searchDomain used to update
     * the searchpanel. It returns the domain coming from the controlpanel. This
     * function can be overridden to add sub-domains coming from other parts of
     * the interface.
     *
     * @private
     * @returns {Array[]}
     */
    _getSearchDomain: function () {
        return this.controlPanelDomain;
    },
    /**
     * Meant to be overriden to return a proper object.
     * @private
     * @return {(Object|null)}
     */
    _getSidebarProps: function () {
        return null;
    },
    /**
     * This method is the way a view can notifies the outside world that
     * something has changed.  The main use for this is to update the url, for
     * example with a new id.
     *
     * @private
     */
    _pushState: function () {
        this.trigger_up('push_state', {
            controllerID: this.controllerID,
            state: this.getState(),
        });
    },
    /**
     * Renders the html provided by the route specified by the
     * bannerRoute attribute on the controller (banner_route in the template).
     * Renders it before the view output and add a css class 'o_has_banner' to it.
     * There can be only one banner displayed at a time.
     *
     * If the banner contains stylesheet links or js files, they are moved to <head>
     * (and will only be fetched once).
     *
     * Route example:
     * @http.route('/module/hello', auth='user', type='json')
     * def hello(self):
     *     return {'html': '<h1>hello, world</h1>'}
     *
     * @private
     * @returns {Promise}
     */
    _renderBanner: function () {
        if (this.bannerRoute !== undefined) {
            var self = this;
            return this.dp
                .add(this._rpc({route: this.bannerRoute}))
                .then(function (response) {
                    if (!response.html) {
                        self.$el.removeClass('o_has_banner');
                        return Promise.resolve();
                    }
                    self.$el.addClass('o_has_banner');
                    var $banner = $(response.html);
                    // we should only display one banner at a time
                    if (self._$banner && self._$banner.remove) {
                        self._$banner.remove();
                    }
                    // Css and js are moved to <head>
                    var defs = [];
                    $('link[rel="stylesheet"]', $banner).each(function (i, link) {
                        defs.push(ajax.loadCSS(link.href));
                        link.remove();
                    });
                    $('script[type="text/javascript"]', $banner).each(function (i, js) {
                        defs.push(ajax.loadJS(js.src));
                        js.remove();
                    });
                    return Promise.all(defs).then(function () {
                        $banner.insertBefore(self.$('> .o_content'));
                        self._$banner = $banner;
                    });
                });
        }
        return Promise.resolve();
    },
    /**
     * @override
     * @private
     */
    _startRenderer: function () {
        if (this.renderer instanceof owl.Component) {
            return this.renderer.mount(this.$('.o_content')[0]);
        }
        return this.renderer.appendTo(this.$('.o_content'));
    },
    /**
     * This method is called after each update or when the start method is
     * completed.
     *
     * Its primary use is to be used as a hook to update all parts of the UI,
     * besides the renderer.  For example, it may be used to enable/disable
     * some buttons in the control panel, such as the current graph type for a
     * graph view.
     *
     * @private
     * @param {Object} state the state given by the model
     * @param {Object} [params={}]
     * @returns {Promise}
     */
    _update: async function (state, params={}) {
        // AAB: update the control panel -> this will be moved elsewhere at some point
        if (!this.$buttons) {
            this.renderButtons();
            // here this.$buttons could still be undefined!
        }
        const newProps = {
            cp_content: {
                buttons: this.$buttons,
            },
            pager: this._getPagerProps(),
            sidebar: this._getSidebarProps(),
            title: this.getTitle(),
        };
        this._updateActionProps(newProps);
        this._pushState();
        return this._renderBanner();
    },
    /**
     * @private
     * @param {Object} newProps
     * @returns {Promise}
     */
    _updatePagerProps(newProps) {
        const pagerProps = Object.assign(this._getPagerProps(), newProps);
        return this._updateActionProps({ pager: pagerProps });
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * When a user clicks on an <a> link with type="action", we need to actually
     * do the action. This kind of links is used a lot in no-content helpers.
     *
     * * if the link has both data-model and data-method attributes, the
     *   corresponding method is called, chained to any action it would
     *   return. An optional data-reload-on-close (set to a non-falsy value)
     *   also causes th underlying view to be reloaded after the dialog is
     *   closed.
     * * if the link has a name attribute, invoke the action with that
     *   identifier (see :class:`ActionManager.doAction` to not get the
     *   details)
     * * otherwise an *action descriptor* is built from the link's data-
     *   attributes (model, res-id, views, domain and context)
     *
     * @private
     * @param ev
     */
    _onActionClicked: function (ev) { // FIXME: maybe this should also work on <button> tags?
        ev.preventDefault();
        var $target = $(ev.currentTarget);
        var self = this;
        var data = $target.data();

        if (data.method !== undefined && data.model !== undefined) {
            var options = {};
            if (data.reloadOnClose) {
                options.on_close = function () {
                    self.trigger_up('reload');
                };
            }
            this.dp.add(this._rpc({
                model: data.model,
                method: data.method,
                context: session.user_context,
            })).then(function (action) {
                if (action !== undefined) {
                    self.do_action(action, options);
                }
            });
        } else if ($target.attr('name')) {
            this.do_action(
                $target.attr('name'),
                data.context && {additional_context: data.context}
            );
        } else {
            this.do_action({
                name: $target.attr('title') || _.str.strip($target.text()),
                type: 'ir.actions.act_window',
                res_model: data.model || this.modelName,
                res_id: data.resId,
                target: 'current', // TODO: make customisable?
                views: data.views || (data.resId ? [[false, 'form']] : [[false, 'list'], [false, 'form']]),
                domain: data.domain || [],
            }, {
                additional_context: _.extend({}, data.context)
            });
        }
    },
    /**
     * Called either from the control panel to focus the controller
     * or from the view to focus the search bar
     *
     * @private
     * @param {OdooEvent} ev
     */
    _onNavigationMove: function (ev) {
        switch (ev.data.direction) {
            case 'up':
                ev.stopPropagation();
                this._controlPanel.focusSearchBar();
                break;
            case 'down':
                ev.stopPropagation();
                this.giveFocus();
                break;
        }
    },
    /**
     * When an Odoo event arrives requesting a record to be opened, this method
     * gets the res_id, and request a switch view in the appropriate mode
     *
     * Note: this method seems wrong, it relies on the model being a basic model,
     * to get the res_id.  It should receive the res_id in the event data
     * @todo move this to basic controller?
     *
     * @private
     * @param {OdooEvent} ev
     * @param {number} ev.data.id The local model ID for the record to be
     *   opened
     * @param {string} [ev.data.mode='readonly']
     */
    _onOpenRecord: function (ev) {
        ev.stopPropagation();
        var record = this.model.get(ev.data.id, {raw: true});
        this.trigger_up('switch_view', {
            view_type: 'form',
            res_id: record.res_id,
            mode: ev.data.mode || 'readonly',
            model: this.modelName,
        });
    },
    /**
     * Called when there is a change in the search view, so the current action's
     * environment needs to be updated with the new domain, context, groupby,...
     *
     * @private
     * @param {CustomeEvent} ev
     * @param {Array[]} ev.data.domain
     * @param {Object} ev.data.context
     * @param {string[]} ev.data.groupby
     */
    _onSearch: function (ev) {
        ev.stopPropagation();
        this.reload(_.extend({offset: 0}, ev.data));
    },
    /**
     * @private
     * @param {OdooEvent} ev
     * @param {Array[]} ev.data.domain the current domain of the searchPanel
     */
    _onSearchPanelDomainUpdated: function (ev) {
        this.searchPanelDomain = ev.data.domain;
        this.reload({offset: 0});
    },
    /**
     * Intercepts the 'switch_view' event to add the controllerID into the data,
     * and lets the event bubble up.
     *
     * @param {OdooEvent} ev
     */
    _onSwitchView: function (ev) {
        Object.assign(ev.detail || ev.data, { controllerID: this.controllerID });
    },
});

return AbstractController;

});
