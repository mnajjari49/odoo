odoo.define('website_event_track.website_event_track_proposal', function (require) {
'use strict';

var publicWidget = require('web.public.widget');
var weDefaultOptions = require('web_editor.wysiwyg.default_options');
var wysiwygLoader = require('web_editor.loader');

publicWidget.registry.websiteEventTrackProposal = publicWidget.Widget.extend({
    selector: '.o_website_event_talk_proposal',

    start: function() {
        var self = this;
        _.each($('textarea.o_wysiwyg_loader'), function (textarea) {
            var $textarea = $(textarea);
            var toolbar = [
                ['style', ['style']],
                ['font', ['bold', 'italic', 'underline', 'clear']],
                ['para', ['ul', 'ol', 'paragraph']],
                ['table', ['table']],
                ['history', ['undo', 'redo']],
            ];

            var options = {
                height: 200,
                minHeight: 80,
                toolbar: toolbar,
                styleWithSpan: false,
                styleTags: _.without(weDefaultOptions.styleTags, 'h1', 'h2', 'h3'),
            };
            wysiwygLoader.load(self, $textarea[0], options);
        });
        return this._super.apply(this, arguments);
    },

});
});
