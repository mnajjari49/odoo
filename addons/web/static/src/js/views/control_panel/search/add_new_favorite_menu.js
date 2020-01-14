odoo.define('web.AddNewFavoriteMenu', function (require) {
    "use strict";

    const DropdownMenuItem = require('web.DropdownMenuItem');
    const { useFocusOnUpdate } = require('web.custom_hooks');

    const { useDispatch, useRef, useState } = owl.hooks;

    let favoriteId = 0;

    class AddNewFavoriteMenu extends DropdownMenuItem {

        /**
         * @param {Object} props
         * @param {Object} [props.actionName]
         * @param {Object} props.favorites
         */
        constructor() {
            super(...arguments);

            this.descriptionRef = useRef('description');
            this.dispatch = useDispatch(this.env.controlPanelStore);
            this.favId = favoriteId++;
            this.interactive = true;
            this.state = useState({
                description: this.props.actionName || "",
                isDefault: false,
                isShared: false,
                open: false,
            });

            this.focusOnUpdate = useFocusOnUpdate();
            this.focusOnUpdate();
        }

        //--------------------------------------------------------------------------
        // Getters
        //--------------------------------------------------------------------------

        get useByDefaultId() {
            return `o_favorite_use_by_default_${this.favId}`;

        }

        get shareAllUsersId() {
            return `o_favorite_share_all_users_${this.favId}`;
        }

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * @private
         * @param {string} title
         * @param {string} message
         */
        _doWarn(title, message) {
            return new Promise(resolve => {
                this.env.bus.trigger('call_service', {
                    data: {
                        args: [{ title, message, type: 'danger' }],
                        callback: resolve,
                        method: 'notify',
                        service: 'notification',
                    },
                });
            });
        }

        /**
         * @private
         */
        _saveFavorite() {
            if (!this.state.description.length) {
                this._doWarn(
                    this.env._t("Error"),
                    this.env._t("A name for your favorite is required.")
                );
                return this.descriptionRef.el.focus();
            }
            if (this.props.favorites.some(f => f.description === this.state.description)) {
                this._doWarn(
                    this.env._t("Error"),
                    this.env._t("Filter with same name already exists.")
                );
                return this.descriptionRef.el.focus();
            }
            this.dispatch('createNewFavorite', {
                type: 'favorite',
                description: this.state.description,
                isDefault: this.state.isDefault,
                isShared: this.state.isShared,
            });
            this.state.open = false;
        }

        /**
         * Hide and display the submenu which allows adding custom filters.
         * @private
         */
        _toggleOpen() {
            this.state.open = !this.state.open;
            if (this.state.open) {
                this.focusOnUpdate();
            }
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         * @param {Event} ev change Event
         */
        _onCheckboxChange(ev) {
            const { checked, id } = ev.target;
            if (this.useByDefaultId === id) {
                this.state.isDefault = checked;
                if (checked) {
                    this.state.isShared = false;
                }
            } else {
                this.state.isShared = checked;
                if (checked) {
                    this.state.isDefault = false;
                }
            }
        }

        /**
         * @private
         * @param {InputEvent} ev
         */
        _onInput(ev) {
            this.state.description = ev.target.value;
        }

        /**
         * @private
         * @param {jQueryEvent} ev
         */
        _onInputKeydown(ev) {
            switch (ev.key) {
                case 'Enter':
                    ev.preventDefault();
                    this._saveFavorite();
                    break;
                case 'Escape':
                    // Gives the focus back to the component.
                    ev.preventDefault();
                    ev.target.blur();
                    break;
            }
        }
    }

    AddNewFavoriteMenu.props = {
        actionName: String,
        favorites: Array,
    };
    AddNewFavoriteMenu.template = 'AddNewFavoriteMenu';

    return AddNewFavoriteMenu;
});
