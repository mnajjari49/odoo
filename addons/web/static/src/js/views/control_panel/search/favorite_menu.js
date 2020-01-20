odoo.define('web.FavoriteMenu', function (require) {
    "use strict";

    const AddNewFavoriteMenu = require('web.AddNewFavoriteMenu');
    const Dialog = require('web.OwlDialog');
    const DropdownMenu = require('web.DropdownMenu');
    const FilterEditor = require('web.FilterEditor');
    const { sprintf } = require('web.utils');

    const { useDispatch, useGetters, useState } = owl.hooks;

    class FavoriteMenu extends DropdownMenu {
        constructor() {
            super(...arguments);

            this.state = useState({
                deleteDialog: false,
                editDialog: false,
            });
            this.dispatch = useDispatch(this.env.controlPanelStore);
            this.getters = useGetters(this.env.controlPanelStore);
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
            const { description, id } = this.state.editDialog.favorite;

            if (!description.length) {
                return this._doWarn(
                    this.env._t("Error"),
                    this.env._t("A name for your favorite is required.")
                );
            }
            if (this.items.some(f => f.id !== id && f.description === description)) {
                return this._doWarn(
                    this.env._t("Error"),
                    this.env._t("Filter with same name already exists.")
                );
            }

            this.dispatch('editFavorite', id, this.state.editDialog.favorite);
            this._closeEditDialog();
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

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
        _onFilterChange(ev) {
            Object.assign(this.state.editDialog.favorite, ev.detail);
            if (ev.detail.timeRanges === false) {
                delete this.state.editDialog.favorite.timeRanges;
            }
        }

        /**
         * @private
         * @param {OwlEvent} ev
         */
        async _onItemEdited(ev) {
            const storeFavorite = this.items.find(fav => fav.id === ev.detail.item.id);
            const favorite = Object.assign({}, storeFavorite, {
                orderedBy: Object.assign([], storeFavorite.orderedBy),
                groupBys: Object.assign([], storeFavorite.groupBys),
            });
            if (storeFavorite.timeRanges) {
                favorite.timeRanges = Object.assign({}, storeFavorite.timeRanges);
            }
            const title = sprintf(this.env._t("Edit filter"), favorite.description);

            this.state.editDialog = { title, favorite };
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
    }

    FavoriteMenu.components = Object.assign({}, DropdownMenu.components, {
        AddNewFavoriteMenu,
        Dialog,
        FilterEditor,
    });
    FavoriteMenu.defaultProps = Object.assign({}, DropdownMenu.defaultProps, {
        icon: 'fa fa-star',
        title: "Favorites",
        // todo remove this and think!
        viewType: "",
    });
    FavoriteMenu.props = Object.assign({}, DropdownMenu.props, {
        fields: Object,
        viewType: String,
    });
    FavoriteMenu.template = 'FavoriteMenu';

    return FavoriteMenu;
});
