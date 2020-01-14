odoo.define('web.ActionMixin', function (require) {
"use strict";

/**
 * We define here the ActionMixin, the generic notion of action (from the point
 * of view of the web client).  In short, an action is a widget which controls
 * the main part of the screen (everything below the navbar).
 *
 * More precisely, the action manager is the component that coordinates a stack
 * of actions.  Whenever the user navigates in the interface, switches views,
 * open different menus, the action manager creates/updates/destroys special
 * widgets which implements the ActionMixin.  These actions need to answer to a
 * standardised API, which is the reason for this mixin.
 *
 * In practice, most actions are view controllers (coming from an
 * ir.action.act_window).  However, some actions are 'client actions'.  They
 * also need to implement the ActionMixin for a better cooperation with the
 * action manager.
 *
 * @module web.ActionMixin
 */

var core = require('web.core');

var ActionMixin = {
    template: 'Action',

    /**
     * The action mixin assumes that it is rendered with the 'Action' template.
     * This template has a special zone ('.o_content') where the content should
     * be added.  Actions that want to automatically render a template there
     * should define the contentTemplate key.  In short, client actions should
     * probably define a contentTemplate key, and not a template key.
     */
    contentTemplate: null,

    /**
     * If an action wants to use a control panel, it will be created and
     * registered in this _controlPanel key (the widget).  The way this control
     * panel is created is up to the implementation (so, view controllers or
     * client actions may have different needs).
     *
     * Note that most of the time, this key should be set by the framework, not
     * by the code of the client action.
     */
    _controlPanel: null,

    /**
     * String containing the title of the client action (which may be needed to
     * display in the breadcrumbs zone of the control panel).
     *
     * @see _updateActionProps
     */
    _title: '',

    /**
     * @override
     */
    renderElement: function () {
        this._super.apply(this, arguments);
        if (this.contentTemplate) {
            var content = core.qweb.render(this.contentTemplate, {widget: this});
            this.$('.o_content').append(content);
        }
    },
    /**
     * Called each time the action is attached into the DOM.
     */
    on_attach_callback: function () { },
    /**
     * Called each time the action is detached from the DOM.
     */
    on_detach_callback: function () { },
    /**
     * Called by the action manager when action is restored (typically, when the
     * user clicks on the action in the breadcrumb)
     *
     * @returns {Promise|undefined}
     */
    willRestore: function () {},

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * In some situations, we need confirmation from the controller that the
     * current state can be destroyed without prejudice to the user.  For
     * example, if the user has edited a form, maybe we should ask him if we
     * can discard all his changes when we switch to another action.  In that
     * case, the action manager will call this method.  If the returned
     * promise is successfully resolved, then we can destroy the current action,
     * otherwise, we need to stop.
     *
     * @returns {Promise} resolved if the action can be removed, rejected
     *   otherwise
     */
    canBeRemoved: function () {
        return Promise.resolve();
    },
    /**
     * This function is called when the current state of the action
     * should be known. For instance, if the action is a view controller,
     * this may be useful to reinstantiate a view in the same state.
     *
     * Typically the state can (and should) be encoded in a query object of
     * the form::
     *
     *     {
     *          context: {...},
     *          groupBy: [...],
     *          domain = [...],
     *          orderedBy = [...],
     *     }
     *
     * where the context key can contain many information.
     * This method is mainly called during the creation of a custom filter.
     *
     * @returns {Object}
     */
    getOwnedQueryParams: function () {
        return {};
    },
    /**
     * Returns a title that may be displayed in the breadcrumb area.  For
     * example, the name of the record (for a form view). This is actually
     * important for the action manager: this is the way it is able to give
     * the proper titles for other actions.
     *
     * @returns {string}
     */
    getTitle: function () {
        return this._title;
    },
    /**
     * Returns a serializable state that will be pushed in the URL by
     * the action manager, allowing the action to be restarted correctly
     * upon refresh. This function should be overriden to add extra information.
     * Note that some keys are reserved by the framework and will thus be
     * ignored ('action', 'active_id', 'active_ids' and 'title', for all
     * actions, and 'model' and 'view_type' for act_window actions).
     *
     * @returns {Object}
     */
    getState: function () {
        return {};
    },
    /**
     * Gives the focus to the action
     */
    giveFocus: function () {
    },
    /**
     * Renders the buttons to append, in most cases, to the control panel (in
     * the bottom left corner). When the action is rendered in a dialog, those
     * buttons might be moved to the dialog's footer.
     *
     * @param {jQuery Node} $node
     */
    renderButtons: function ($node) {
    },
    // TODO: add hooks methods:
    // - onRestoreHook (on_reverse_breadcrumbs)

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * FIXME: this logic should be rethought
     *
     * Handles a context request: provides to the caller the state of the
     * current controller.
     *
     * @private
     * @param {function} callback used to send the requested state
     */
    _onGetOwnedQueryParams: function (callback) {
        const state = this.getOwnedQueryParams();
        callback(state || {});
    },
    /**
     * @private
     * @param {Object} newProps
     */
    _updateActionProps: function (newProps) {
        if ('title' in newProps) {
            this._title = newProps.title;
        }
        if (this.dispatch) {
            return this.dispatch('updateActionProps', newProps);
        }
    },
};

return ActionMixin;

});
