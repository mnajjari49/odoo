odoo.define('website_livechat.tour_common', function(require) {
'use strict';

var startStep = [{
    content: "click on livechat widget",
    trigger: "div.o_livechat_button"
}, {
    content: "Say hello!",
    trigger: "input.o_composer_text_field",
    run: "text Coucou!"
}, {
    content: "Send the message",
    trigger: "input.o_composer_text_field",
    run: function() {
        $('input.o_composer_text_field').trigger($.Event('keydown', {which: $.ui.keyCode.ENTER}));
    }
}, {
    content: "Verify your message has been typed",
    trigger: "div.o_thread_message_content>p:contains('Coucou!')"
}, {
    content: "Close the chatter",
    trigger: "a.o_thread_window_close",
    run: function() {
        $('a.o_thread_window_close').click();
    }
}];

var feedbackStep = [{
    content: "Type a feedback",
    trigger: "div.o_livechat_rating_reason > textarea",
    run: "text ;-) You're the best déboulonneur I've ever met ;-)!"
}, {
    content: "Send the feedback",
    trigger: "input[type='button'].o_rating_submit_button",
}, {
    content: "Check if feedback has been sent",
    trigger: "div.o_thread_window_header.feedback_sent",
}, {
    content: "Thanks for your feedback",
    trigger: "div.o_livechat_rating_box:has(div:contains('Thank you for your feedback'))",
}];

var transcriptStep = [{
    content: "Type your email",
    trigger: "input[id='o_email']",
    run: "text deboul@onner.com"
}, {
    content: "Send the conversation to your email address",
    trigger: "button.o_email_chat_button",
}, {
    content: "Type your email",
    trigger: "div.o_livechat_email:has(strong:contains('Conversation Sent'))",
}];

var closeStep = [{
    content: "Close the conversation with the x button",
    trigger: "a.o_thread_window_close",
},  {
    content: "Check that the chat window is closed",
    trigger: 'body',
    run: function () {
        if ($('div.o_livechat_button').length === 1 && !$('div.o_livechat_button').is(':visible')) {
            $('body').addClass('tour_success');
        }
    }
}, {
    content: "Is the Test succeded ?",
    trigger: 'body.tour_success'
}];

return {
    'startStep': startStep,
    'transcriptStep': transcriptStep,
    'feedbackStep': feedbackStep,
    'closeStep': closeStep,
};

});




