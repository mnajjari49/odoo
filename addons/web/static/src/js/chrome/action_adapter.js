odoo.define('web.ActionAdapter', function (require) {
    "use strict";

    const AbstractAction = require('web.AbstractAction');
    const StandaloneFieldManagerMixin = require('web.StandaloneFieldManagerMixin');

    const ActionAdapter = AbstractAction.extend(StandaloneFieldManagerMixin, {
        /**
         * TODO: remove this temporary adapter system when the action manager can
         * handle owl components.
         * @constructor
         * @param {Widget} parent
         * @param {Object} action
         * @param {Object} [options={}]
         */
        init(parent, action, owlAction, options={}) {
            this._super(...arguments);
            StandaloneFieldManagerMixin.init.call(this);
            if (options.env) {
                owlAction.component.env = options.env;
            }
            this._component = new owlAction.component(null, owlAction.props);
        },

        async start() {
            await this._super(...arguments);
            return this._component.mount(this.el);
        },

        destroy() {
            this._component.destroy();
            this._super(...arguments);
        },

        on_attach_callback() {
            return this._component.__callMounted();
        },

        on_detach_callback: function () {
            return this._component.__callWillUnmount();
        },

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * Simulate a native event triggered on the target.
         * @private
         * @param {HTMLElement} target
         * @param {string} eventType
         * @param {Object} payload
         */
        _trigger(target, eventType, payload) {
            const ev = new CustomEvent(eventType, {
                bubbles: true,
                cancelable: true,
                detail: payload
            });
            target.dispatchEvent(ev);
        },

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         * @param {OdooEvent} ev
         * @param {Object} ev.data
         */
        async _onFieldChanged(ev) {
            await StandaloneFieldManagerMixin._onFieldChanged.apply(this, arguments);
            this._trigger(ev.target.el, 'field_changed', ev.data);
        },

        /**
         * @private
         * @param {OdooEvent} ev
         * @param {Object} ev.data
         */
        async _onLoad(ev) {
            await StandaloneFieldManagerMixin._onLoad.apply(this, arguments);
            this._trigger(ev.target.el, 'load', ev.data);
        },

        /**
         * @private
         * @param {OdooEvent} ev
         * @param {Object} ev.data
         */
        async _onMutexify(ev) {
            await StandaloneFieldManagerMixin._onMutexify.apply(this, arguments);
            this._trigger(ev.target.el, 'mutexify', ev.data);
        }
    });

    return ActionAdapter;
});
