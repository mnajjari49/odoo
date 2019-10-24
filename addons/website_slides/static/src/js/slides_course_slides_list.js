odoo.define('website_slides.course.slides.list', function (require) {
'use strict';

var publicWidget = require('web.public.widget');

publicWidget.registry.websiteSlidesCourseSlidesList = publicWidget.Widget.extend({
    selector: '.o_wslides_slides_list',
    xmlDependencies: ['/website_slides/static/src/xml/website_slides_upload.xml'],

    start: function () {
        this._super.apply(this,arguments);

        this.channelId = this.$el.data('channelId');

        this._updateHref();
        this._bindSortable();
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------,

    /**
     * Bind the sortable jQuery widget to both
     * - course sections
     * - course slides
     *
     * @private
     */
    _bindSortable: function () {
        this.$('ul.o_wslides_js_slides_list_container').sortable({
            handle: '.o_wslides_slides_list_drag',
            stop: this._reorderSlides.bind(this),
            items: '.o_wslides_slide_list_category',
            placeholder: 'o_wslides_slides_list_slide_hilight position-relative mb-1'
        });

        this.$('.o_wslides_js_slides_list_container ul').sortable({
            handle: '.o_wslides_slides_list_drag',
            connectWith: '.o_wslides_js_slides_list_container ul',
            stop: this._reorderSlides.bind(this),
            items: '.o_wslides_slides_list_slide:not(.o_wslides_js_slides_list_empty)',
            placeholder: 'o_wslides_slides_list_slide_hilight position-relative mb-1'
        });
    },
    _getSlides: function (){
        var categories = [];
        this.$('.o_wslides_js_list_item').each(function (){
            categories.push(parseInt($(this).data('slideId')));
        });
        return categories;
    },
    _reorderSlides: function (){
        var self = this;
        self._rpc({
            route: '/web/dataset/resequence',
            params: {
                model: "slide.slide",
                ids: self._getSlides()
            }
        }).then(function (res) {
            self._toggleCategoryEmptyFlag();
        });
    },
    _toggleCategoryEmptyFlag: function (){
        var categories = $('.o_wslides_slide_list');
        for (var i = 0; i < categories.length; i++){
            var categoryID = $(categories[i]).data('categoryId');
            var categorySlideCount = $(categories[i]).find('.o_wslides_slides_list_slide:not(.o_not_editable)').length;
            if (categorySlideCount === 0){
                $('.category-empty[data-category-id='+ categoryID +']').removeClass('d-none');
            } else {
                $('.category-empty[data-category-id='+ categoryID +']').addClass('d-none');
            }
        }
    },

    /**
     * Change links href to fullscreen mode for SEO.
     *
     * Specifications demand that links are generated (xml) without the "fullscreen"
     * parameter for SEO purposes.
     *
     * This method then adds the parameter as soon as the page is loaded.
     *
     * @private
     */
    _updateHref: function () {
        this.$(".o_wslides_js_slides_list_slide_link").each(function (){
            var href = $(this).attr('href');
            var operator = href.indexOf('?') !== -1 ? '&' : '?';
            $(this).attr('href', href + operator + "fullscreen=1");
        });
    }
});

return publicWidget.registry.websiteSlidesCourseSlidesList;

});
