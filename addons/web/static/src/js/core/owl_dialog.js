odoo.define('web.OwlDialog', function (require) {
    "use strict";

    const { qweb, _lt } = require('web.core');
    const { useExternalListener } = require('web.custom_hooks');

    const { Component, hooks, misc } = owl;
    const { Portal } = misc;
    const { useRef, useState } = hooks;
    const SIZE_CLASSES = {
        'extra-large': 'modal-xl',
        'large': 'modal-lg',
        'small': 'modal-sm',
    };

    /**
     * Dialog (owl version)
     *
     * Represents a bootstrap-styled dialog handled with pure JS. Its implementation
     * is roughly the same as the legacy dialog, the only exception being the buttons.
     * @extends Component
     **/
    class Dialog extends Component {
        /**
         * @param {Object} [props]
         * @param {boolean|string} [props.backdrop='static'] The kind of modal backdrop
         *      to use (see Bootstrap documentation).
         * @param {Object[]} [props.buttons] List of button descriptions. If there
         *      are none, a "ok" primary button is added to allow closing the dialog.
         * @param {string} [props.buttons[].class='btn-primary'|'btn-secondary']
         *      Default to primary if only one button and secondary otherwise.
         * @param {boolean} [props.buttons[].disabled=false]
         * @param {string} [props.buttons[].icon] An image 'src' attribute, or Font
         *      Awesome icon if begins with 'fa-'.
         * @param {Object} [props.buttons[].metadata] Object that will be sent when
         *      clicking on the button.
         * @param {string} [props.buttons[].name]
         * @param {string} [props.buttons[].size]
         * @param {string} [props.buttons[].style]
         * @param {string} [props.buttons[].text]
         * @param {string} [props.buttons[].value]
         * @param {string} [props.dialogClass=''] Class to add to the modal-body.
         * @param {boolean} [props.focusFirstButton=true] Whether or not to focus the
         *      primary button when mounted or prievously first modal is closed.
         * @param {boolean} [props.fullscreen=false] Whether the dialog should be
         *      open in fullscreen mode (the main usecase is mobile).
         * @param {boolean} [props.renderFooter=true] Whether the dialog footer
         *      should be rendered.
         * @param {boolean} [props.renderHeader=true] Whether the dialog header
         *      should be rendered.
         * @param {string} [props.sizeClass='large'] 'extra-large', 'large', 'medium'
         *      or 'small'.
         * @param {string} [props.subtitle='']
         * @param {string} [props.title='Odoo']
         * @param {boolean} [props.technical=true] If set to false, the modal will have
         *      the standard frontend style (use this for non-editor frontend features).
         */
        constructor() {
            super(...arguments);

            this.state = useState({ active: true });
            this.footerRef = useRef('modal-footer');

            useExternalListener(window, 'keydown', this._onKeydown);
        }

        async willStart() {
            this.constructor.display(this);
        }

        mounted() {
            this.env.bus.on('close_dialogs', this, this._close);

            this._removeTooltips();
            this._focusMainButton();
        }

        async willUnmount() {
            this.env.bus.off('close_dialogs', this, this._close);

            this._removeTooltips();
            this.constructor.hide(this);
        }

        //--------------------------------------------------------------------------
        // Properties
        //--------------------------------------------------------------------------

        /**
         * @returns {string}
         */
        get sizeClass() {
            return SIZE_CLASSES[this.props.sizeClass];
        }

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * Send an event signaling that the dialog must be closed.
         * @private
         */
        _close() {
            this.trigger('dialog_closed');
        }

        /**
         * Focus first button if visible and focusFirstButton is set to true.
         * @private
         */
        _focusMainButton() {
            if (this.props.focusFirstButton && this.props.renderFooter) {
                for (const btn of this.footerRef.el.querySelectorAll('.btn-primary')) {
                    if (btn.offsetParent !== null) {
                        btn.focus();
                        return;
                    }
                }
            }
        }

        /**
         * Remove any existing tooltip present in the DOM.
         * @private
         */
        _removeTooltips() {
            for (const tooltip of document.querySelectorAll('.tooltip')) {
                tooltip.remove(); // remove open tooltip if any to prevent them staying when modal is opened
            }
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         */
        _onBackdropClick() {
            if (this.props.backdrop === 'static') {
                this._focusMainButton();
            } else {
                this._close();
            }
        }

        /**
         * @private
         * @param {number} button_index
         */
        _onButtonClick(metadata) {
            this.trigger('dialog_button_clicked', metadata);
        }

        /**
         * Manage the TAB key on the buttons. If the focus is on a primary button
         * and the user tries to tab to go to the next button, display a tooltip.
         * @private
         * @param {KeyboardEvent} ev
         */
        _onFooterButtonKeyDown(ev) {
            if (ev.key === 'Tab' && !ev.shiftKey && ev.target.classList.contains("btn-primary")) {
                ev.preventDefault();
                const primaryButton = ev.target;
                $(primaryButton).tooltip({
                    delay: { show: 200, hide: 0 },
                    title: () => qweb.render('FormButton.tooltip', { title: primaryButton.innerText.toUpperCase() }),
                    trigger: 'manual',
                });
                $(primaryButton).tooltip('show');
            }
        }

        /**
         * @private
         * @param {KeyboardEvent} ev
         */
        _onKeydown(ev) {
            if (
                ev.key === 'Escape' &&
                !['INPUT', 'TEXTAREA'].includes(ev.target.tagName) &&
                this === this.constructor.displayed[this.constructor.displayed.length - 1]
            ) {
                ev.preventDefault();
                ev.stopImmediatePropagation();
                ev.stopPropagation();
                this._close();
            }
        }

        //--------------------------------------------------------------------------
        // Static
        //--------------------------------------------------------------------------

        /**
         * Push the given dialog at the end of the displayed list then set it as
         * active and all the others as passive.
         * @param {(LegacyDialog|OwlDialog)} dialog
         */
        static display(dialog) {
            const activeDialog = this.displayed[this.displayed.length - 1];
            if (activeDialog && activeDialog.state) {
                // If owl dialog, changes state
                activeDialog.state.active = false;
            }
            this.displayed.push(dialog);
            if (dialog.state) {
                // If owl dialog, changes state
                dialog.state.active = true;
            }
            document.body.classList.add('modal-open');
        }

        /**
         * Set the given displayed dialog as passive and the last added displayed dialog
         * as active, then remove it from the displayed list.
         * @param {LegacyDialog|OwlDialog} dialog
         */
        static hide(dialog) {
            const displayedDialog = this.displayed.find(d => d === dialog);
            if (!displayedDialog) {
                // Given dialog not in the list
                return;
            }
            // Removes given dialog from the list
            this.displayed.splice(this.displayed.indexOf(displayedDialog), 1);
            if (dialog.state) {
                // If owl dialog, changes state
                dialog.state.active = false;
            }

            const lastDialog = this.displayed[this.displayed.length - 1];
            if (lastDialog) {
                if (lastDialog.state) {
                    // If owl dialog, changes state
                    lastDialog.state.active = true;
                }
                lastDialog.el.focus();
                document.body.classList.add('modal-open');
            } else {
                document.body.classList.remove('modal-open');
            }
        }
    }

    Dialog.displayed = [];

    Dialog.components = { Portal };
    Dialog.defaultProps = {
        backdrop: 'static',
        buttons: [],
        dialogClass: '',
        focusFirstButton: true,
        fullscreen: false,
        renderFooter: true,
        renderHeader: true,
        sizeClass: 'large',
        subtitle: '',
        technical: true,
        title: _lt("Odoo"),
    };
    Dialog.props = {
        backdrop: { type: [Boolean, String], optional: 1 },
        buttons: {
            type: Array,
            element: {
                type: Object,
                shape: {
                    class: { type: String, optional: 1 },
                    disabled: { type: Boolean, optional: 1 },
                    icon: { type: String, optional: 1 },
                    metadata: { type: Object, optional: 1 },
                    name: { type: String, optional: 1 },
                    size: { type: String, optional: 1 },
                    style: { type: String, optional: 1 },
                    text: { type: String, optional: 1 },
                    value: { type: String, optional: 1 },
                },
            },
            optional: 1,
        },
        dialogClass: { type: String, optional: 1 },
        focusFirstButton: { type: Boolean, optional: 1 },
        fullscreen: { type: Boolean, optional: 1 },
        renderFooter: { type: Boolean, optional: 1 },
        renderHeader: { type: Boolean, optional: 1 },
        sizeClass: { validate: s => ['extra-large', 'large', 'medium', 'small'].includes(s), optional: 1 },
        subtitle: { type: String, optional: 1 },
        technical: { type: Boolean, optional: 1 },
        title: { type: String, optional: 1 },
    };
    Dialog.template = 'OwlDialog';

    return Dialog;
});
