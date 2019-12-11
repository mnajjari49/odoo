odoo.define('website.content.menu', function (require) {
'use strict';

var dom = require('web.dom');
var publicWidget = require('web.public.widget');
var wUtils = require('website.utils');
var animations = require('website.content.snippets.animation');

const BaseFixedHeader = animations.Animation.extend({
    effects: [{
        startEvents: 'scroll',
        update: '_updateHeaderOnScroll',
    }, {
        startEvents: 'resize',
        update: '_updateHeaderOnResize',
    }],

    /**
     * @override
     */
    start: function () {
        this.smallLogo = false;
        this.scrolled = false;
        this.noTransition = false;
        this.$dropdowns = this.$el.find('.dropdown');
        this.$dropdownMenus = this.$el.find('.dropdown-menu');
        this.$navbarCollapses = this.$el.find('.navbar-collapse');
        // While scrolling through navbar menus on medium devices, body should not be scrolled with it
        this.$el.find('div.navbar-collapse').on('show.bs.collapse', function () {
            if ($(window).width() <= 768) {
                $(document.body).addClass('overflow-hidden');
            }
        }).on('hide.bs.collapse', function () {
            $(document.body).removeClass('overflow-hidden');
        });

        return this._super.apply(this, arguments);
    },
    /**
     * @override
     */
    destroy: function () {
        this._removeFixedHeader();
        this.$el.removeClass('fixed_logo scrolled');
        this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _initializeFixedHeader: function () {
        this.headerHeight = this.$el.height();
        $('main').css('padding-top', this.headerHeight);
        this.$el.addClass('o_header_affix affixed');
    },

    /**
     * @private
     */
    _removeFixedHeader: function () {
        $('main').css('padding-top', '');
        this.$el.removeClass('o_header_affix affixed');
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Called when the window is scrolled
     *
     * @private
     * @param {integer} scrollTop
     */
    _updateHeaderOnScroll: function (scrollTop) {
        const scroll = scrollTop;
        // Change logo size
        if (!this.scrolled) {
            this.$el.addClass('scrolled');
            this.scrolled = true;
            // disable css transition if refresh with scrollTop > 0
            if (scrollTop > 0) {
                this.$el.addClass('no_transition');
                this.noTransition = true;
            }
        } else if (this.noTransition) {
            this.$el.removeClass('no_transition');
            this.noTransition = false;
        }
        if (!this.smallLogo && scroll > 1) {
            this.smallLogo = true;
            this.$el.toggleClass('fixed_logo');
        } else if (this.smallLogo && scroll <= 1) {
            this.smallLogo = false;
            this.$el.toggleClass('fixed_logo');
        }
        // Reset opened menus
        if (this.$navbarCollapses.hasClass('show')) {
            return;
        }
        this.$dropdowns.add(this.$dropdownMenus).removeClass('show');
        this.$navbarCollapses.removeClass('show').attr('aria-expanded', false);
    },

    /**
     * Called when the window is resized
     *
     * @private
     */
    _updateHeaderOnResize: function () {
        if ($(document.body).hasClass('overflow-hidden') && $(window).width() > 768) {
            $(document.body).removeClass('overflow-hidden');
            this.$el.find('.navbar-collapse').removeClass('show');
        }
    },
});

publicWidget.registry.standardHeader = BaseFixedHeader.extend({
    selector: 'header.o_header_standard',

    /**
     * @override
     */
    start: function () {
        this.fixedHeader = false;
        this.fixedHeaderShow = false;
        this.headerHeight = this.$el.height();
        return this._super.apply(this, arguments);
    },

    /**
     * @override
     */
    destroy: function () {
        this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Called when the window is scrolled
     * 
     *
     * @private
     * @param {integer} scrollTop
     */
    _updateHeaderOnScroll: function (scrollTop) {
        this._super(...arguments);
        const scroll = scrollTop;
        // switch between static/fixed position of the header
        if (!this.fixedHeader && scroll > this.headerHeight) {
            this.fixedHeader = true;
            this.$el.css('transform', 'translate(0, -100%)');
            this._initializeFixedHeader();
        } else if (this.fixedHeader && scroll <= this.headerHeight) {
            this.fixedHeader = false;
            this._removeFixedHeader();
            this.$el.css('transform', '');
        }
        // show/hide header
        if (!this.fixedHeaderShow && scroll > (this.headerHeight + 250)) {
            this.fixedHeaderShow = true;
            this.$el.css('transform', '');
        } else if (this.fixedHeaderShow && scroll <= (this.headerHeight + 250)) {
            this.fixedHeaderShow = false;
            this.$el.css('transform', 'translate(0, -100%)');
        }
    },
});

publicWidget.registry.autohideMenu = publicWidget.Widget.extend({
    selector: 'header #top_menu',

    /**
     * @override
     */
    start: function () {
        var self = this;
        var defs = [this._super.apply(this, arguments)];
        this.noAutohide = this.$el.closest('.o_no_autohide_menu').length;
        if (!this.noAutohide) {
            var $navbar = this.$el.closest('.navbar');
            defs.push(wUtils.onceAllImagesLoaded($navbar));

            // The previous code will make sure we wait for images to be fully
            // loaded before initializing the auto more menu. But in some cases,
            // it is not enough, we also have to wait for fonts or even extra
            // scripts. Those will have no impact on the feature in most cases
            // though, so we will only update the auto more menu at that time,
            // no wait for it to initialize the feature.
            var $window = $(window);
            $window.on('load.autohideMenu', function () {
                $window.trigger('resize');
            });
        }
        return Promise.all(defs).then(function () {
            if (!self.noAutohide) {
                dom.initAutoMoreMenu(self.$el, {unfoldable: '.divider, .divider ~ li'});
            }
            self.$el.removeClass('o_menu_loading');
            self.$el.trigger('menu_loaded');
        });
    },
    /**
     * @override
     */
    destroy: function () {
        this._super.apply(this, arguments);
        if (!this.noAutohide) {
            $(window).off('.autohideMenu');
            dom.destroyAutoMoreMenu(this.$el);
        }
    },
});

/**
 * Note: this works well with the affixMenu... by chance (menuDirection is
 * called after alphabetically).
 *
 * @todo check bootstrap v4: maybe handled automatically now ?
 */
publicWidget.registry.menuDirection = publicWidget.Widget.extend({
    selector: 'header .navbar .nav',
    events: {
        'show.bs.dropdown': '_onDropdownShow',
    },

    /**
     * @override
     */
    start: function () {
        this.defaultAlignment = this.$el.is('.ml-auto, .ml-auto ~ *') ? 'right' : 'left';
        return this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {string} alignment - either 'left' or 'right'
     * @param {integer} liOffset
     * @param {integer} liWidth
     * @param {integer} menuWidth
     * @returns {boolean}
     */
    _checkOpening: function (alignment, liOffset, liWidth, menuWidth, windowWidth) {
        if (alignment === 'left') {
            // Check if ok to open the dropdown to the right (no window overflow)
            return (liOffset + menuWidth <= windowWidth);
        } else {
            // Check if ok to open the dropdown to the left (no window overflow)
            return (liOffset + liWidth - menuWidth >= 0);
        }
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onDropdownShow: function (ev) {
        var $li = $(ev.target);
        var $menu = $li.children('.dropdown-menu');
        var liOffset = $li.offset().left;
        var liWidth = $li.outerWidth();
        var menuWidth = $menu.outerWidth();
        var windowWidth = $(window).outerWidth();

        $menu.removeClass('dropdown-menu-left dropdown-menu-right');

        var alignment = this.defaultAlignment;
        if ($li.nextAll(':visible').length === 0) {
            // The dropdown is the last menu item, open to the left
            alignment = 'right';
        }

        // If can't open in the current direction because it would overflow the
        // window, change the direction. But if the other direction would do the
        // same, change back the direction.
        for (var i = 0 ; i < 2 ; i++) {
            if (!this._checkOpening(alignment, liOffset, liWidth, menuWidth, windowWidth)) {
                alignment = (alignment === 'left' ? 'right' : 'left');
            }
        }

        $menu.addClass('dropdown-menu-' + alignment);
    },
});

publicWidget.registry.freezeHeader = BaseFixedHeader.extend({
    selector: 'header.o_header_freeze',

    /**
     * @override
     */
    start: function () {
        const menuLoading = this.$('.o_menu_loading');
        this.headerWidth = this.$el.width();
        this.mobileView = this.headerWidth <= 768 ? true : false;
        if (!menuLoading.length) {
            this._initializeFixedHeader();
        } else {
            this.$el.one('menu_loaded', () => this._initializeFixedHeader());
        }
        return this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _refreshPublicWidgets: function () {
        this.trigger_up('widgets_start_request', {
            editableMode: false,
            $target: this.$el,
        });
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Called when the window is resized: refresh the widgets when switching
     * mobile/desktop view to keep the right <main> padding-top.
     *
     * @private
     */
    _updateHeaderOnResize: function () {
        this._super(...arguments);
        this.headerWidth = this.$el.width();
        if (this.headerWidth <= 768 && !this.mobileView) {
            this.mobileView = true;
            this._refreshPublicWidgets();
        } else if (this.headerWidth > 768 && this.mobileView) {
            this.mobileView = false;
            this._refreshPublicWidgets();
        }
    },
});

const BaseDisappearingHeader = BaseFixedHeader.extend({

    /**
     * @override
     */
    start: function () {
        this.scrollingDownwards = true;
        this.hiddenHeader = false;
        this.position = 0;
        this.checkPoint = 0;
        return this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @abstract
     */
    _hideHeader: function () {},
    /**
     * @private
     */
    _showHeader: function () {},

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Called when the window is scrolled
     *
     * @private
     * @param {integer} scrollTop
     */
    _updateHeaderOnScroll: function (scrollTop) {
        const scroll = scrollTop;
        if (scroll > this.position) {
            if (!this.scrollingDownwards) {
                this.checkPoint = scroll;
            }
            if (!this.hiddenHeader && scroll - this.checkPoint > 200) {
                this.hiddenHeader = true;
                this._hideHeader();
            }
            this.scrollingDownwards = true;
        } else {
            if (this.scrollingDownwards) {
                this.checkPoint = scroll;
            }
            if (this.hiddenHeader && scroll - this.checkPoint < -100) {
                this.hiddenHeader = false;
                this._showHeader();
            }
            this.scrollingDownwards = false;
        }
        this.position = scroll;
    },
});

publicWidget.registry.DisappearingHeader = BaseDisappearingHeader.extend({
    selector: 'header.o_header_disappears',

    /**
     * @override
     */
    start: function () {
        return this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    _hideHeader: function () {
        this.$el.css('transform', 'translate(0, -100%)');
    },
    /**
     * @override
     */
    _showHeader: function () {
        this.$el.css('transform', '');
    },
});

publicWidget.registry.FadeOutHeader = BaseDisappearingHeader.extend({
    selector: 'header.o_header_fade_out',

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    _hideHeader: function () {
        this.$el.stop(false, true).fadeOut();
    },
    /**
     * @override
     */
    _showHeader: function () {
        this.$el.stop(false, true).fadeIn();
    },
});
});
