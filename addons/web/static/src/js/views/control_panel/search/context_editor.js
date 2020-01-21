odoo.define('web.ContextEditor', function (require) {
    "use strict";

    const { sprintf } = require('web.utils');
    const { useFocusOnUpdate } = require('web.custom_hooks');

    const { Component, useState } = owl;

    const EXCLUDED_KEYS = ['group_by', 'time_ranges'];

    class ContextEditor extends Component {
        constructor() {
            super(...arguments);

            this.state = useState({
                invalid: [],
            });
            this.keyOrder = Object.keys(this.props.context);
            this.focusKey = useFocusOnUpdate();
            this.pairs = this._setupPairs(this.props.context);
            window.top.ce = this;
        }

        async willUpdateProps(nextProps) {
            this.pairs = this._setupPairs(nextProps.context);
        }

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        _setupPairs(contextProps) {
            const pairs = [];
            const context = Object.assign({}, contextProps);

            // We keep the keys order in the state so that it is maintained on props update.
            this.keyOrder.forEach(key => {
                if (key in context) {
                    pairs.push({ key, value: context[key], buffer: key });
                    delete context[key];
                }
            });
            // Additionnal keys given by props
            Object.keys(context).forEach(key => {
                pairs.push({ key, value: context[key], buffer: key });
                this.keyOrder.push(key);
            });
            return pairs;
        }

        /**
         * @private
         * @param {string} title
         * @param {string} message
         */
        _doWarn(title, message) {
            return new Promise(resolve => {
                this.trigger('call-service', {
                    args: [{ title, message, type: 'danger' }],
                    callback: resolve,
                    method: 'notify',
                    service: 'notification',
                });
            });
        }

        /**
         * @private
         * @param {string} value
         * @returns {any}
         */
        _parse(value) {
            try {
                return JSON.parse(value);
            } catch (err) {
                return value;
            }
        }

        /**
         * @private
         * @param {any} value
         * @returns {string}
         */
        _stringify(value) {
            if (typeof value === 'object') {
                return JSON.stringify(value);
            } else {
                return value.toString();
            }
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         */
        _onAddPair() {
            let keyIndex = 1;
            while ('k' + keyIndex in this.props.context) {
                keyIndex ++;
            }
            const key = 'k' + keyIndex;
            const context = Object.assign({}, this.props.context, {
                [key]: this.env._t("value"),
            });
            this.trigger('context-change', { context });
        }

        /**
         * @private
         * @param {Object} pair
         * @param {InputEvent} ev
         */
        _onKeyChanged(pair, ev) {
            const context = Object.assign({}, this.props.context);
            const key = this._parse(ev.target.value);

            pair.buffer = key;

            // Check for duplicates and invalid keys
            const comparisonContext = Object.assign({}, context);
            delete comparisonContext[pair.key];
            if (key in comparisonContext) {
                this.state.invalid.push(key);
                return this._doWarn(
                    this.env._t("Error"),
                    sprintf(this.env._t(`Duplicate key: "%s".`), key)
                );
            }
            if (EXCLUDED_KEYS.includes(key)) {
                this.state.invalid.push(key);
                return this._doWarn(
                    this.env._t("Error"),
                    sprintf(
                        this.env._t(`Could not manually change key "%s". Please use the editor above to modify its value.`),
                        key
                    )
                );
            }
            this.state.invalid = this.state.invalid.filter(k => k !== key);

            // Save the keyorder
            this.keyOrder[this.keyOrder.indexOf(pair.key)] = key;

            // Replace the key in the context
            delete context[pair.key];
            context[key] = pair.value;

            this.trigger('context-change', { context });
            this.focusKey(`#o_context_key_${key}`);
        }

        /**
         * @private
         * @param {number} index
         */
        _onRemovePair(index) {
            const context = Object.assign({}, this.props.context);

            // Remove the key from the order
            const [key] = this.keyOrder.splice(index, 1);

            // Remove the pair in the context
            delete context[key];

            this.trigger('context-change', { context });
        }

        /**
         * @private
         * @param {Object} pair
         * @param {InputEvent} ev
         */
        _onValueChanged(pair, ev) {
            const context = Object.assign({}, this.props.context);

            context[pair.key] = this._parse(ev.target.value);

            this.trigger('context-change', { context });
        }
    }

    ContextEditor.props = {
        context: Object,
    };
    ContextEditor.template = 'ContextEditor';

    return ContextEditor;
});