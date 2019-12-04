odoo.define('website_slides.course.enroll.email', function (require) {
'use strict';

var core = require('web.core');
var Dialog = require('web.Dialog');
var publicWidget = require('web.public.widget');
var _t = core._t;

var SlideEnrollEmailDialog = Dialog.extend({
    template: 'slide.course.email',

    init: function (parent, options, modalOptions) {
        modalOptions = _.defaults(modalOptions || {}, {
            title: _t('Request course\'s access to responsible.'),
            size: 'medium',
            buttons: [{
                text: _t('Yes'),
                classes: 'btn-primary',
                click: this._onSendEmail.bind(this)
            }, {
                text: _t('Cancel'),
                close: true
            }]
        });
        this.$element = options.$element;
        this.channelId = options.channelId;
        this._super(parent, modalOptions);
    },

    _onSendEmail: function () {
        var self = this;
        this._rpc({
            route: '/slides/channel/email/responsible',
            params: {
                'channel_id': this.channelId
            }
        }).then(function (result) {
            if (result.length) {
                self.$element.replaceWith('<div class="alert alert-success" role="alert"><strong>' + _t('Request sent !') + '</strong></div>');
            } else {
                self.$element.replaceWith('<div class="alert alert-danger" role="alert"><strong>' + _t('Error !') + '</strong></div>');
            }
            self.close();
        });
    }
    
});

publicWidget.registry.websiteSlidesEnrollEmail = publicWidget.Widget.extend({
    selector: '.o_wslides_send_email_responsible',
    xmlDependencies: ['/website_slides/static/src/xml/channel_management.xml'],
    events: {
        'click': '_onSendEmailClick',
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------
    
    _openDialog: function (channelId) {
        new SlideEnrollEmailDialog(this, {
            channelId: channelId,
            $element: this.$el
        }).open();
    },
    
    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------
    
    _onSendEmailClick: function (ev) {
        ev.preventDefault();
        this._openDialog($(ev.currentTarget).data('channelId'));
    }
});

return {
    slideEnrollEmailDialog: SlideEnrollEmailDialog,
    websiteSlidesEnrollEmail: publicWidget.registry.websiteSlidesEnrollEmail
};

});
