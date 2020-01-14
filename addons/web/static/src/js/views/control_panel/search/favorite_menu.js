odoo.define('web.FavoriteMenu', function (require) {
    "use strict";

    const AddNewFavoriteMenu = require('web.AddNewFavoriteMenu');
    const Dialog = require('web.OwlDialog');
    const Domain = require('web.Domain');
    const DomainSelector = require('web.DomainSelector');
    const DropdownMenu = require('web.DropdownMenu');
    const { sprintf } = require('web.utils');
    const { FIELD_OPERATORS, FIELD_TYPES } = require('web.controlPanelParameters');

    const { useRef, useState } = owl.hooks;

    class FavoriteMenu extends DropdownMenu {
        constructor() {
            super(...arguments);

            this.state = useState({
                deleteDialog: false,
                editDialog: false,
            });
            this.domainSelectorRef = useRef('domain-selector');
            this.domainSelector = new DomainSelector(this, this.props.action.res_model, '', {
                readonly: false,
                debugMode: this.env.isDebug(),
            });
            // this.style.mainButton.class = 'o_favorites_menu_button ' + this.style.mainButton.class;
        }

        async willStart() {
            await this.domainSelector.appendTo(document.createDocumentFragment());
        }

        patched() {
            if (this.state.editDialog) {
                this.domainSelectorRef.el.innerHTML = "";
                this.domainSelectorRef.el.appendChild(this.domainSelector.el);
            }
        }

        _trigger_up(ev) {
            switch (ev.name) {
                case 'get_session':
                    ev.data.callback(this.env.session);
                    break;
                case 'call_service':
                    this.env.bus.trigger('call_service', { data: ev.data });
                    break;
                case 'domain_changed':
                    this.state.editDialog.domain = Domain.prototype.arrayToString(
                        this.domainSelector.getDomain()
                    );
                    break;
                default:
                    console.warn('Trigger up:', ev);
            }
        }

        //--------------------------------------------------------------------------
        // Getters
        //--------------------------------------------------------------------------

        /**
         * @override
         */
        get items() {
            return this.getters.getFiltersOfType('favorite');
        }

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * @private
         */
        _closeEditDialog() {
            this.state.editDialog = false;
        }

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
        _removeFavorite() {
            this.dispatch('deleteFavorite', this.state.deleteDialog.favorite.id);
            this.state.deleteDialog = false;
        }

        /**
         * @private
         */
        _saveFavorite() {
            const { description, domain, favoriteId, isDefault, userId } = this.state.editDialog;

            if (!description.length) {
                return this._doWarn(
                    this.env._t("Error"),
                    this.env._t("A name for your favorite is required.")
                );
            }
            if (this.items.some(f => f.id !== favoriteId && f.description === description)) {
                return this._doWarn(
                    this.env._t("Error"),
                    this.env._t("Filter with same name already exists.")
                );
            }

            this.dispatch('editFavorite', favoriteId, {
                description,
                domain,
                isDefault,
                userId,
            });
            this._closeEditDialog();
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         * @param {Event} ev
         */
        _onCheckboxChange(ev) {
            const { checked, id } = ev.target;
            if (id.startsWith('o_default_name_')) {
                this.state.editDialog.isDefault = checked;
                if (checked) {
                    this.state.editDialog.userId = this.env.session.uid;
                }
            } else {
                this.state.editDialog.userId = false;
                if (checked) {
                    this.state.editDialog.isDefault = false;
                }
            }
        }

        /**
         * @private
         * @param {Event} ev
         */
        _onDefaultChange(ev) {
            this.state.editDialog.isDefault = ev.target.checked;
        }

        /**
         * @private
         * @param {InputEvent} ev
         */
        _onDescriptionInput(ev) {
            this.state.editDialog.description = ev.target.value;
        }

        _onDrag(item, ev) {
            if (!item.editable) {
                return;
            }
            console.log({ dragstart: ev });

            ev.target.style.opacity = 0.1;

            let initialPosition = ev.target.offsetTop + ev.target.offsetHeight / 2;
            let indexDiff = 0;
            const breakpoint = ev.target.offsetHeight;

            const onDrag = ev => {
                if (ev.pageX <= 0 || ev.pageY <= 0) {
                    return;
                }
                console.log({ dragging: ev });
                ev.preventDefault();
                const delta = ev.pageY - initialPosition;
                if (Math.abs(delta) > breakpoint) {
                    if (delta > 0) {
                        const next = ev.target.nextElementSibling;
                        if (next && next.classList.contains('o_dropdown_item')) {
                            indexDiff++;
                            ev.target.parentNode.insertBefore(next, ev.target);
                        }
                    } else {
                        const previous = ev.target.previousElementSibling;
                        if (previous && previous.classList.contains('o_dropdown_item')) {
                            indexDiff--;
                            ev.target.parentNode.insertBefore(ev.target, ev.target.previousElementSibling);
                        }
                    }
                    initialPosition = ev.target.offsetTop + ev.target.offsetHeight / 2;
                }
            };
            const onDragEnd = ev => {
                console.log({ dragend: ev });
                ev.target.style.opacity = 1;
                if (indexDiff) {
                    this.env.store.dispatch('resequenceFavorite', item, indexDiff);
                }
                window.removeEventListener('drag', onDrag, true);
                window.removeEventListener('dragend', onDragEnd, true);
            };

            window.addEventListener('drag', onDrag, true);
            window.addEventListener('dragend', onDragEnd, true);
        }

        /**
         * @private
         * @param {OwlEvent} ev
         */
        async _onItemEdited(ev) {
            const { description, domain, id, isDefault, userId } = this.items.find(fav => fav.id === ev.detail.item.id);
            const title = sprintf(this.env._t("Edit filter"), description);

            await this.domainSelector.setDomain(domain, true);

            this.state.editDialog = {
                description,
                domain,
                favoriteId: id,
                isDefault,
                title,
                userId,
            };
        }

        /**
         * @private
         * @param {OwlEvent} ev
         */
        _onItemRemoved(ev) {
            const favorite = this.items.find(fav => fav.id === ev.detail.item.id);
            this.state.deleteDialog = { favorite };
        }

        /**
         * @private
         * @param {OwlEvent} ev
         */
        _onItemSelected(ev) {
            const { item, option } = ev.detail;
            if (option) {
                this.dispatch('toggleFilterWithOptions', item.id, option.optionId);
            } else {
                this.dispatch('toggleFilter', item.id);
            }
        }

        /**
         * @private
         * @param {Event} ev
         */
        _onSharedChange(ev) {
            this.state.editDialog.userId = ev.target.checked ? false : this.env.session.uid;
        }
    }

    FavoriteMenu.components = Object.assign({}, DropdownMenu.components, {
        AddNewFavoriteMenu,
        Dialog,
    });
    FavoriteMenu.defaultProps = Object.assign({}, DropdownMenu.defaultProps, {
        icon: 'fa fa-star',
        title: "Favorites",
    });
    FavoriteMenu.props = Object.assign({}, DropdownMenu.props, {
        action: Object,
        fields: Object,
        viewType: String,
    });
    FavoriteMenu.template = 'FavoriteMenu';

    return FavoriteMenu;
});