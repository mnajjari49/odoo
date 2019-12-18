odoo.define('website.s_table_of_content', function (require) {
'use strict';

const publicWidget = require('web.public.widget');

const TableOfContent = publicWidget.Widget.extend({
    selector: 'section.s_table_of_content',
    disabledInEditableMode: false,

    /**
     * @override
     */
    start: function () {
        const $menuLoading = $('.o_menu_loading');
        if (!$menuLoading.length) {
            this._initializeNavbarTopPosition();
        } else {
            $(document.body).one('menu_loaded', () => this._initializeNavbarTopPosition());
        }
        return this._super.apply(this, arguments);
    },
    /**
     * @override
     */
    destroy: function () {
        this.$target.find('.s_table_of_content_navbar').css('top', '');
        this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------
    /**
     * Initialize the top position of the snippet navbar according to the height
     * of the headers of the page.
     * @private
     */
    _initializeNavbarTopPosition: function () {
        // TODO: find a way to adjust the horizontal navbar position according
        // the header height/position when scrolling. (same issue whith s_scrollTo in snippets.animation) Event ?
        let headerHeight = 0;
        const $navbarFixed = $('.o_navbar_fixed');
        const $tableOfContentNavBar = this.$target.find('.s_table_of_content_navbar_wrap');
        const isHorizontalNavbar = $tableOfContentNavBar.hasClass('s_table_of_content_horizontal_navbar');
        _.each($navbarFixed, el => headerHeight += $(el).outerHeight());
        $tableOfContentNavBar.css('top', isHorizontalNavbar ? headerHeight : '');
        $tableOfContentNavBar.find('.s_table_of_content_navbar').css('top', !isHorizontalNavbar ? headerHeight : '');
        $('body').scrollspy({target: '.s_table_of_content_navbar', offset: headerHeight + 100});
    },
});

publicWidget.registry.snippetTableOfContent = TableOfContent;

return TableOfContent;
});
