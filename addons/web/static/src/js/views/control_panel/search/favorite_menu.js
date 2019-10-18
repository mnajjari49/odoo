odoo.define('web.FavoriteMenu', function (require) {
"use strict";

var config = require('web.config');
var core = require('web.core');
var Dialog = require('web.Dialog');
var DropdownMenu = require('web.DropdownMenu');
var favorites_submenus_registry = require('web.favorites_submenus_registry');

const { qweb: QWeb, _t } = core;

var FavoriteMenu = DropdownMenu.extend({
    template: 'FavoriteMenu',
    events: _.extend({}, DropdownMenu.prototype.events, {
        'click .o_favorite_edit': '_onEditFavorite',
    }),
    /**
     * @override
     * @param {Object} action
     */
    init: function (parent, favorites, action) {
        this._super(parent, favorites);
        this.action = action;
        this.isMobile = config.device.isMobile;
        this.dropdownCategory = 'favorite';
        this.dropdownTitle = _t('Favorites');
        this.dropdownIcon = 'fa fa-star';
        this.dropdownSymbol = this.isMobile ? 'fa fa-chevron-right float-right mt4' : false;
        this.dropdownStyle.mainButton.class = 'o_favorites_menu_button ' +
                                                this.dropdownStyle.mainButton.class;

    },
    /**
     * Render the template used to register a new favorite and append it
     * to the basic dropdown menu.
     *
     * @override
     */
    start: async function () {
        await this._super.apply(this, arguments);
        var params = {
            favorites: this.items,
            action: this.action,
        };
        this.$menu = this.$('.o_dropdown_menu');
        this.$menu.addClass('o_favorites_menu');
        this.$menu.sortable({
            axis: 'y',
            items: '.o_menu_item',
            helper: 'clone',
            stop: (event, ui) => this.trigger_up('move_filter', {
                filterId: ui.item.data('id'),
                to: ui.item.index(),
            }),
        });
        this.subMenus = [];
        favorites_submenus_registry.values().forEach(SubMenu => {
            var subMenu = new SubMenu(this, params);
            subMenu.appendTo(this.$menu);
            this.subMenus.push(subMenu);
        });
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    update: function (items) {
        this._super.apply(this, arguments);
        _.invoke(this.subMenus, 'update', { favorites: this.items });
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
     _closeSubMenus: function () {
        _.invoke(this.subMenus, 'closeMenu');
     },
    /**
     * @override
     * @private
     */
    _renderMenuItems: function () {
        const newMenuItems = QWeb.render('FavoriteMenu.MenuItems', { widget: this });
        this.$el.find('.o_menu_item, .dropdown-divider[data-removable="1"]').remove();
        this.$('.o_dropdown_menu').prepend(newMenuItems);
        this._addTooltips();
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @override
     * @private
     */
    _onBootstrapClose: function () {
        this._super.apply(this, arguments);
        this._closeSubMenus();
    },
    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onEditFavorite: function (ev) {
        ev.preventDefault();
        ev.stopPropagation();

        this.trigger_up('open_filter', { filterId: ev.currentTarget.dataset.id });
        // const favorite = this.items.find(item => item.id === ev.currentTarget.dataset.id);
        // this.trigger_up('update_filter', {
        //     filterId: favorite.id,
        //     changes: {
        //         isDefault: !favorite.isDefault,
        //     },
        // });
    },
    /**
     * @override
     * @private
     * @param {MouseEvent} event
     */
    _onTrashButtonClick: function (event) {
        event.preventDefault();
        event.stopPropagation();
        var self = this;
        var id = $(event.currentTarget).data('id');
        var favorite = this.items.find(function (favorite) {
            return favorite.id === id;
        });
        var globalWarning = _t("This filter is global and will be removed for everybody if you continue.");
        var warning = _t("Are you sure that you want to remove this filter?");
        var message = favorite.userId ? warning : globalWarning;

        Dialog.confirm(self, message, {
            title: _t("Warning"),
            confirm_callback: function () {
                self.trigger_up('item_trashed', {id: id});
            },
        });

    },
});

return FavoriteMenu;

});