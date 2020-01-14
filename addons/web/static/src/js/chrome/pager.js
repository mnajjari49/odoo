odoo.define('web.Pager', function (require) {
    "use strict";

    const { useFocusOnUpdate } = require('web.custom_hooks');

    const { Component, hooks } = owl;
    const { useState } = hooks;

    class Pager extends Component {
        /**
         * The pager goes from 1 to size (included).
         * The current value is currentMinimum if limit === 1
         *          or the interval [currentMinimum, currentMinimum + limit[ if limit > 1
         *
         * @param {Object} [props] the parent widget
         * @param {int} [props.size] the total number of elements
         * @param {int} [props.currentMinimum] the first element of the current_page
         * @param {int} [props.limit] the number of elements per page
         * @param {boolean} [props.editable] editable feature of the pager
         * @param {boolean} [props.hiddenInSinglePage] (not) to display the pager
         *   if only one page
         * @param {function} [props.validate] callback returning a Promise to
         *   validate changes
         * @param {boolean} [props.withAccessKey]
         */
        constructor() {
            super(...arguments);

            this.state = useState({ editing: false });

            const focusOnMounted = useFocusOnUpdate();
            focusOnMounted();
        }

        async willUpdateProps() {
            this.state.editing = false;
        }

        //--------------------------------------------------------------------------
        // Getters
        //--------------------------------------------------------------------------

        /**
         * @returns {Number}
         */
        get maximum() {
            return Math.min(this.props.currentMinimum + this.props.limit - 1, this.props.size);
        }

        /**
         * @returns {boolean} true iff there is only one page
         */
        get singlePage() {
            const { currentMinimum, size } = this.props;
            return (1 === currentMinimum) && (this.maximum === size);
        }

        /**
         * @returns {Number}
         */
        get value() {
            return this.props.currentMinimum + (this.props.limit > 1 ? `-${this.maximum}` : '');
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        async updateProps(newProps = {}) {
            if (!Object.keys(newProps).length) {
                return;
            }
            await this.willUpdateProps(newProps);
            Object.assign(this.props, newProps);
            // deepCopy(this.props, newProps);
            // Object.assign(this.props, newProps);
            if (this.__owl__.isMounted) {
                this.render(true);
            }
        }

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * Private function that updates the pager's state according to a pager action
         *
         * @param {int} [direction] the action (previous or next) on the pager
         */
        async _changeSelection(direction) {
            try {
                await this.props.validate();
            } catch (err) {
                if (err instanceof Error) {
                    throw err;
                }
                return false;
            }
            const { limit, size } = this.props;

            // Compute the new currentMinimum
            let currentMinimum = (this.props.currentMinimum + limit * direction);
            if (currentMinimum > size) {
                currentMinimum = 1;
            } else if ((currentMinimum < 1) && (limit === 1)) {
                currentMinimum = size;
            } else if ((currentMinimum < 1) && (limit > 1)) {
                currentMinimum = size - ((size % limit) || limit) + 1;
            }

            // The re-rendering of the pager must be done before the trigger of
            // event 'pager_changed' as the rendering may enable the pager
            // (and a common use is to disable the pager when this event is
            // triggered, and to re-enable it when the data have been reloaded)
            this.trigger('pager_changed', { limit, currentMinimum });
        }

        /**
         * Private function that saves the state from the content of the input
         *
         * @param {string} value the jQuery element containing the new state
         */
        async _save(value) {
            try {
                await this.props.validate();
            } catch (err) {
                if (err instanceof Error) {
                    throw err;
                }
                return false;
            }
            const [min, max] = value.split(/[-\s,;]+/);

            let currentMinimum = Math.max(Math.min(parseInt(min, 10), this.props.size), 1);
            let maximum = max ? Math.max(Math.min(parseInt(max, 10), this.props.size), 1) : min;

            if (isNaN(currentMinimum) || isNaN(maximum) || maximum < currentMinimum) {
                return false;
            }
            const limit = Math.max(maximum - currentMinimum) + 1;
            this.trigger('pager_changed', { limit, currentMinimum });
            return true;
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         */
        async _onEdit() {
            if (!this.state.editing && !this.props.disabled && this.props.editable) {
                this.state.editing = true;
            }
        }

        /**
         * @private
         */
        _onValueChange(ev) {
            const canBeSaved = this._save(ev.currentTarget.value);
            if (!canBeSaved) {
                ev.preventDefault();
            }
        }

        /**
         * @private
         */
        _onValueKeydown(ev) {
            switch (ev.key.toUpperCase()) {
                case 'ESCAPE':
                    ev.preventDefault();
                    ev.stopPropagation();
                    this.state.editing = false;
                    break;
                case 'ENTER':
                    ev.preventDefault();
                    ev.stopPropagation();
                    this._save(ev.currentTarget.value);
                    break;
            }
        }
    }

    Pager.defaultProps = {
        disabled: false,
        editable: true,
        hiddenInSinglePage: false, // displayed even if there is a single page
        validate: () => Promise.resolve(),
        withAccessKey: true,  // can be disabled, for example, for x2m widgets
    };
    Pager.props = {
        currentMinimum: { type: Number, optional: 1 },
        disabled: Boolean,
        editable: Boolean,
        hiddenInSinglePage: Boolean,
        limit: { validate: l => !isNaN(l), optional: 1 },
        role: { type: String, optional: 1 },
        size: { type: Number, optional: 1 },
        validate: Function,
        withAccessKey: Boolean,
    }
    Pager.template = 'Pager';

    return Pager;
});
