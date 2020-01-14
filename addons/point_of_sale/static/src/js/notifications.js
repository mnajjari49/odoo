odoo.define('point_of_sale.notifications', function (require) {
    "use strict";
    /**
     * Display a non-obtrusive toast-based notification.
     */
    var PosBaseWidget = require('point_of_sale.BaseWidget');
    var gui = require('point_of_sale.gui');

    /**
     * Basic notification widget.
     *
     * usage:
     *  gui.show_notification('simple', {'message': 'Basic message.'})
     */
    var BaseNotificationWidget = PosBaseWidget.extend({
        template: 'BaseNotificationWidget',
        init: function (parent, args) {
            this._super(parent, args);
            this.options = {};
        },
        events: {
            'click .button.close': 'click_close',
        },
        show: function (options) {
            var self = this;
            this.options = options && (
                typeof options === 'string' ? {message: options} : options
            );
            this.renderElement();
            // Show the notification
            this.$el.addClass('show');
            // Hide the notification element after the fadeout animation ends
            this.$el.one("animationend webkitAnimationEnd oAnimationEnd MSAnimationEnd", function(event){
                if (event.originalEvent.animationName === 'fadeout') {
                    self.hide();
                }
            });
            this.$el.on("click", function() {
                self.hide();
            })
        },
        // hides the popup. keep in mind that this is called in
        // the initialization pass of the pos instantiation,
        // so you don't want to do anything fancy in here
        hide: function () {
            if (this.$el) {
                this.$el.addClass('oe_hidden');
            }
        },
        click_close: function () {},
    });
    gui.define_notification({ name: 'basic', widget: BaseNotificationWidget });

    return BaseNotificationWidget;
});
