odoo.define('web.Pager', function (require) {
    "use strict";

    const utils = require('web.utils');
    const Widget = require('web.Widget');

    const { Component, hooks } = owl;
    const { useRef, useState, useStore } = hooks;

    class Pager extends Component {
        /**
         * The pager goes from 1 to size (included).
         * The current value is minimum if limit === 1
         *          or the interval [minimum, minimum + limit[ if limit > 1
         *
         * @param {Widget} [props] the parent widget
         * @param {int} [props.size] the total number of elements
         * @param {int} [props.minimum] the first element of the current_page
         * @param {int} [props.limit] the number of elements per page
         * @param {boolean} [props.can_edit] editable feature of the pager
         * @param {boolean} [props.single_page_hidden] (not) to display the pager
         *   if only one page
         * @param {function} [props.validate] callback returning a Promise to
         *   validate changes
         * @param {boolean} [props.withAccessKey]
         */
        constructor() {
            super(...arguments);

            this.state = useState({ editing: false });
            this.storeProps = useStore(state => state.pager, { store: this.env.controlPanelStore });
            this.inputRef = useRef('input');
        }

        get maximum() {
            return Math.min(this.storeProps.minimum + this.storeProps.limit - 1, this.storeProps.size);
        }

        get value() {
            let value = "" + this.storeProps.minimum;
            if (this.storeProps.limit > 1) {
                value += "-" + this.maximum;
            }
            return value;
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
                await this.storeProps.validate();
            } catch (err) {
                if (err instanceof Error) {
                    throw err;
                }
                return false;
            }
            const { limit, size } = this.storeProps;

            // Compute the new minimum
            let minimum = (this.storeProps.minimum + limit * direction);
            if (minimum > size) {
                minimum = 1;
            } else if ((minimum < 1) && (limit === 1)) {
                minimum = size;
            } else if ((minimum < 1) && (limit > 1)) {
                minimum = size - ((size % limit) || limit) + 1;
            }

            // The re-rendering of the pager must be done before the trigger of
            // event 'pager_changed' as the rendering may enable the pager
            // (and a common use is to disable the pager when this event is
            // triggered, and to re-enable it when the data have been reloaded)
            this.trigger('pager_changed', { limit, maximum: this.maximum, minimum });
        }

        /**
         * Private function that saves the state from the content of the input
         *
         * @param {string} value the jQuery element containing the new state
         */
        async _save(value) {
            try {
                await this.storeProps.validate();
            } catch (err) {
                if (err instanceof Error) {
                    throw err;
                }
                return false;
            }
            const [min, max] = value.split('-');

            let minimum = Math.max(Math.min(parseInt(min, 10), this.storeProps.size), 1);
            let maximum = max ? Math.max(Math.min(parseInt(max, 10), this.storeProps.size), 1) : min;

            if (isNaN(minimum) || isNaN(maximum) || maximum < minimum) {
                return false;
            }
            const limit = Math.max(maximum - minimum) + 1;
            this.trigger('pager_changed', { limit, maximum, minimum });
            return true;
        }

        /**
         * @private
         * @returns {boolean} true iff there is only one page
         */
        get singlePage() {
            const { minimum, size } = this.storeProps;
            return (1 === minimum) && (this.maximum === size);
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         */
        async _onEdit() {
            if (!this.state.editing && !this.storeProps.disabled && this.storeProps.can_edit) {
                this.state.editing = true;
                await new Promise(resolve => {
                    this.constructor.scheduler.requestAnimationFrame(() => setTimeout(resolve));
                });
                this.inputRef.el.focus();
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
        can_edit: true, // editable
        single_page_hidden: false, // displayed even if there is a single page
        validate: () => Promise.resolve(),
        withAccessKey: true,  // can be disabled, for example, for x2m widgets
    };
    Pager.template = 'Pager';

    return Pager;
});
