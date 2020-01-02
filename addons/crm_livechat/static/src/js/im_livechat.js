odoo.define('crm_livechat.im_livechat', function (require) {
"use strict";

var core = require('web.core');
var LivechatButton = require('im_livechat.im_livechat').LivechatButton;
var Timer = require('mail.model.Timer');
var WebsiteLivechatWindow = require('im_livechat.WebsiteLivechatWindow');

var _t = core._t;
var QWeb = core.qweb;

LivechatButton.include({
    /**
     * @override
     * @param {Object} options
     * @param {boolean} [options.generate_lead] true to genarate the lead
     *   when not getting any reply from the operator within 30 mins
     */
    init(parent, serverURL, options) {
        this._super.apply(this, arguments);
        // Timer of current user that was typing something, but
        // there is no response from the operator within 30 mins.
        // This is used in order to create a lead for the current visitor.
        if (this.options.generate_lead) {
            this._LeadGenerationTimer = new Timer({
                duration: 30 * 60 * 1000,
                onTimeout: this._notifyNoOperator.bind(this),
            });
        }
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     * @private
     */
    _addMessage(data, options) {
        this._super.apply(this, arguments);
        if (this.options.generate_lead && this._livechat && this._messages.slice(-1)[0].getAuthorID() === this._livechat._operatorPID[0]) {
            this._LeadGenerationTimer.clear();
        }
    },
    /**
     * generate lead for the visitor when operator is not available
     *
     * @private
     * @param {Object} threadwindow
     * @param {string} channelUUID unique id
     */
    _generateLead(threadwindow, channelUUID) {
        var self = this;
        var $content = $(QWeb.render('crm_livechat.lead_generation_form', { channel_uuid: channelUUID }));
        threadwindow.$('.o_mail_thread').append($content);
        threadwindow.$el.find('#lead-form')[0].addEventListener('submit', function (event) {
            event.preventDefault();
            return self._rpc({
                route: event.target.action,
                params: $.deparam($(event.target).serialize()),
            }).then(function (resId) {
                self._LeadGenerationTimer.clear();
                if (channelUUID) {
                    self.leadId = resId;
                    threadwindow.$('.o_mail_thread_content, .o_thread_composer, .o_lead_creation_form').toggle();
                } else {
                    threadwindow.$('.o_lead_creation_form').html(_t('Thanks for connecting with us. we will contact you soon'));
                }
           });
        });
    },
    /**
     * @override
     * @private
     */
    _notifyNoOperator() {
        var self = this;
        if (this.options.generate_lead) {
            if (this._livechat) {
                this._chatWindow.$('.o_mail_thread_content, .o_thread_composer').toggle();
                this._generateLead(this._chatWindow, this._livechat._uuid);
            } else {
                this._chatWindow = new WebsiteLivechatWindow(this, null);
                this._chatWindow = _.extend({}, this._chatWindow, {
                    getTitle: function() { return _t('Leave us a message'); }
                })
                this._chatWindow.appendTo($('body')).then(function () {
                    var cssProps = { bottom: 0 };
                    cssProps[_t.database.parameters.direction === 'rtl' ? 'left' : 'right'] = 0;
                    self._chatWindow.$el.css(cssProps);
                    self.$el.hide();
                    self._generateLead(self._chatWindow);
                });
            }
        } else {
            this._super.apply(this, arguments);
        }
    },
    /**
     * @override
     * @private
     */
    _onPostMessageChatWindow(ev) {
        this._super.apply(this, arguments);
        if (this.options.generate_lead) {
            if (this.leadId) {
                this._rpc({
                    route: '/livechat/update_lead_description',
                    params: {
                        lead_id: this.leadId,
                        description: ev.data.messageData.content,
                        channel_uuid: this._livechat._uuid
                    },
                });
            } else {
                this._LeadGenerationTimer.reset();
            }
        }
    },
});
});
