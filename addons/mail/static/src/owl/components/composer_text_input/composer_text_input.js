odoo.define('mail.component.ComposerTextInput', function (require) {
'use strict';

const useStore = require('mail.hooks.useStore');

const { Component } = owl;
const { useDispatch, useGetters, useRef } = owl.hooks;

/**
 * ComposerInput relies on a minimal HTML editor in order to support mentions.
 */
class ComposerTextInput extends Component {

    /**
     * @override
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.storeDispatch = useDispatch();
        this.storeGetters = useGetters();
        this.storeProps = useStore((state, props) => {
            return {
                isMobile: state.isMobile,
                composer: state.composers[props.composerLocalId],
            };
        });
        /**
         * Reference of the textarea. Useful to set height, selection and content.
         */
        this._textareaRef = useRef('textarea');
    }

    /**
     * Updates the composer text input content when composer has changed
     * as textarea content can't be changed from the DOM.
     */
    patched() {
        this._textareaRef.el.value = this.storeProps.composer.textInputContent;
        this._updateHeight();
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    focus() {
        this._textareaRef.el.focus();
    }

    focusout() {
        this._textareaRef.el.blur();
    }

    /**
     * Returns textarea current content.
     *
     * @returns {string}
     */
    getContent() {
        return this._textareaRef.el.value;
    }

    /**
     * Returns selection start position.
     *
     * @returns {integer}
     */
    getSelectionStart() {
        return this._textareaRef.el.selectionStart;
    }

    /**
     * Returns selection end position.
     *
     * @returns {integer}
     */
    getSelectionEnd() {
        return this._textareaRef.el.selectionEnd;
    }

    /**
     * Determines whether the textarea is empty or not.
     *
     * @return {boolean}
     */
    isEmpty() {
        return this._textareaRef.el.value === "";
    }

    /**
     * Sets the textarea content.
     *
     * @param content
     */
    setContent(content) {
        this._textareaRef.el.value = content;
    }

    /**
     * @private
     */
    _onInputTextarea() {
        this._updateHeight();
        this.trigger('o-input-composer-text-input');
    }

    /**
     * @private
     * @param {KeyboardEvent} ev
     */
    _onKeydownTextarea(ev) {
        switch (ev.key) {
            case 'Enter':
                this._onKeydownTextareaEnter(ev);
                break;
            case 'Escape':
                this._onKeydownTextareaEscape(ev);
                break;
            default:
                break;
        }
    }

    /**
     * @private
     * @param {KeyboardEvent} ev
     */
    _onKeydownTextareaEnter(ev) {
        if (ev.shiftKey) {
            return;
        }
        if (this.storeProps.isMobile) {
            return;
        }
        this.trigger('o-keydown-enter');
        ev.preventDefault();
    }

    /**
     * @private
     * @param {KeyboardEvent} ev
     */
    _onKeydownTextareaEscape(ev) {
        if (!this.isEmpty()) {
            return;
        }
        this.trigger('o-discard');
        ev.preventDefault();
    }

    /**
     * Updates the textarea height.
     *
     * @private
     */
    _updateHeight() {
        this._textareaRef.el.style.height = "0px";
        this._textareaRef.el.style.height = (this._textareaRef.el.scrollHeight) + "px";
    }
}

ComposerTextInput.props = {
    composerLocalId: {
        type: String,
    },
};

ComposerTextInput.template = 'mail.component.ComposerTextInput';

return ComposerTextInput;

});
