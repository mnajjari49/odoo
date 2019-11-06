odoo.define('website_livechat.tour', function(require) {
'use strict';

var commonSteps = require("website_livechat.tour_common");
var tour = require("web_tour.tour");

var LivechatButton = require('im_livechat.im_livechat').LivechatButton;
var Feedback = require('im_livechat.im_livechat').Feedback;

/**
 * Alter this method for test purposes.
 *
 * Fake the notification after sending message
 * As bus is not available, it's necessary to add the message in the chatter + in livechat.messages
 *
 * Add a class to the chatter window after sendFeedback is done
 * to force the test to wait until feedback is really done
 * (to check afterwards if the livechat session is set to inactive)
 */
LivechatButton.include({
    _sendMessage: function (message) {
        var self = this;
        return this._super.apply(this, arguments).then(function (){
            if (message.isFeedback) {
                $('div.o_thread_window_header').addClass('feedback_sent');
            }
            else {
                var notification = [
                    self._livechat.getUUID(),
                    {
                        'id': -1,
                        'author_id': [0, 'Website Visitor Test'],
                        'email_from': 'Website Visitor Test',
                        'body': '<p>' + message.content + '</p>',
                        'is_discussion': true,
                        'subtype_id': [1, "Discussions"],
                        'date': moment().format('YYYY-MM-DD HH:mm:ss'),
                    }
                ]
                self._handleNotification(notification);
            }
        });
    },
});

var goodRatingStep = [{
    content: "Send Good Rating",
    trigger: "div.o_livechat_rating_choices > img[data-value=10]",
}, {
    content: "Check if feedback has been sent",
    trigger: "div.o_thread_window_header.feedback_sent",
}, {
    content: "Thanks for your feedback",
    trigger: "div.o_livechat_rating_box:has(div:contains('Thank you for your feedback'))"
}];

var boarfRatingStep = [{
    content: "Send ok Rating",
    trigger: "div.o_livechat_rating_choices > img[data-value=5]",
}];

var sadRatingStep = [{
    content: "Send bad Rating",
    trigger: "div.o_livechat_rating_choices > img[data-value=1]",
}];

tour.register('website_livechat_complete_flow_tour', {
    test: true,
    url: '/',
}, [].concat(commonSteps.startStep, goodRatingStep, commonSteps.transcriptStep, commonSteps.closeStep));

tour.register('website_livechat_happy_rating_tour', {
    test: true,
    url: '/',
}, [].concat(commonSteps.startStep, goodRatingStep));

tour.register('website_livechat_boarf_rating_tour', {
    test: true,
    url: '/',
}, [].concat(commonSteps.startStep, boarfRatingStep, commonSteps.feedbackStep));

tour.register('website_livechat_sad_rating_tour', {
    test: true,
    url: '/',
}, [].concat(commonSteps.startStep, sadRatingStep, commonSteps.feedbackStep));

tour.register('website_livechat_no_rating_tour', {
    test: true,
    url: '/',
}, [].concat(commonSteps.startStep, commonSteps.transcriptStep, commonSteps.closeStep));

tour.register('website_livechat_no_rating_no_close_tour', {
    test: true,
    url: '/',
}, [].concat(commonSteps.startStep));

return {};
});
