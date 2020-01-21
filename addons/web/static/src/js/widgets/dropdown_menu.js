odoo.define('web.DropdownMenu', function (require) {
    "use strict";

    const DropdownMenuItem = require('web.DropdownMenuItem');
    const { useExternalListener } = require('web.custom_hooks');

    const { Component, hooks } = owl;
    const { useRef, useState } = hooks;

    // Used to provide unique ids to its template elements.
    let dropdownId = 0;

    class DropdownMenu extends Component {
        constructor() {
            super(...arguments);

            this.id = dropdownId ++;
            this.dropdownMenu = useRef('dropdown');
            this.state = useState({ open: false });
            useExternalListener(window, 'mousedown', this._onWindowMousedown);
            useExternalListener(window, 'keydown', this._onWindowKeydown);

            this.symbol = this.env.device.isMobile ? 'fa fa-chevron-right float-right mt4' : false;
        }

        //--------------------------------------------------------------------------
        // Getters
        //--------------------------------------------------------------------------

        /**
         * Meant to be overriden to provide the list of items to display.
         * @returns {Object[]}
         */
        get items() {
            return this.props.items;
        }

        /**
         * Overriden in case we want to keep the caret style on the button in mobile.
         * @returns {boolean}
         */
        get displayCaret() {
            return !this.env.device.isMobile;
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         * @param {KeyboardEvent} ev
         */
        _onButtonKeydown(ev) {
            switch (ev.key) {
                case 'ArrowLeft':
                case 'ArrowRight':
                case 'ArrowUp':
                case 'ArrowDown':
                    const firstItem = this.el.querySelector('.dropdown-item');
                    if (firstItem) {
                        ev.preventDefault();
                        firstItem.focus();
                    }
            }
        }

        /**
         * @private
         * @param {MouseEvent} ev
         */
        _onItemSelected(ev) {
            this.trigger('item-selected', ev.detail);
        }

        /**
         * @private
         * @param {Event} ev
         */
        _onWindowMousedown(ev) {
            if (this.state.open && !this.el.contains(ev.target)) {
                this.state.open = false;
            }
        }

        /**
         * @private
         * @param {KeyboardEvent} ev
         */
        _onWindowKeydown(ev) {
            if (this.state.open && ev.key === 'Escape') {
                this.state.open = false;
            }
        }
    }

    DropdownMenu.components = { DropdownMenuItem };
    DropdownMenu.defaultProps = {
        items: [],
    };
    DropdownMenu.props = {
        icon: { type: String, optional: 1 },
        items: {
            type: Array,
            element: Object,
            optional: 1,
        },
        title: String,
    };
    DropdownMenu.template = 'DropdownMenu';

    return DropdownMenu;
});
