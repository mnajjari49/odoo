odoo.define('web.DropdownMenuItem', function (require) {
    "use strict";

    const { Component, useState, hooks } = owl;
    const { useDispatch, useRef } = hooks;

    class DropdownMenuItem extends Component {
        constructor() {
            super(...arguments);

            if (this.env.controlPanelStore) {
                this.dispatch = useDispatch(this.env.controlPanelStore);
            }
            this.fallbackFocusRef = useRef('fallback-focus');
            this.state = useState({ open: false });
        }

        mounted() {
            this.el.addEventListener('keydown', this._onKeydown.bind(this));
        }

        //--------------------------------------------------------------------------
        // Getters
        //--------------------------------------------------------------------------

        /**
         * @returns {boolean}
         */
        get hasActiveOption() {
            return this.props.options.some(o => o.active);
        }

        /**
         * @returns {boolean}
         */
        get canBeOpened() {
            return Boolean(this.props.options && this.props.options.length);
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         * @param {KeyboardEvent} ev
         */
        _onKeydown(ev) {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
                return;
            }
            switch (ev.key) {
                case 'ArrowLeft':
                    if (this.canBeOpened && this.state.open) {
                        ev.preventDefault();
                        this.fallbackFocusRef.el.focus();
                        this.state.open = false;
                    }
                    break;
                case 'ArrowRight':
                    if (this.canBeOpened && !this.state.open) {
                        ev.preventDefault();
                        this.state.open = true;
                    }
                    break;
                case 'Escape':
                    ev.target.blur();
                    if (this.canBeOpened && this.state.open) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        this.fallbackFocusRef.el.focus();
                        this.state.open = false;
                    }
            }
        }
    }

    DropdownMenuItem.components = { DropdownMenuItem };
    DropdownMenuItem.template = 'DropdownMenuItem';

    return DropdownMenuItem;
});
