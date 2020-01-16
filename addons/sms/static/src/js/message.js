odoo.define('sms.model.Message', function (require) {
"use strict";

var Message = require('mail.model.Message');

Message.include({

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Retrieves the list of SMS
     *
     * @returns {Array} Array of Array(smsID, recipientName, smsStatus)
     */
    getSmsIds: function () {
        return this._smsIds;
    },
    /**
     * Retrieves the SMS status
     *
     * @return {string}
     */
    getSmsStatus: function () {
        var self = this;
        this._smsStatus = 'sent';
        _.each(this._smsIds, function (sms) {
            if (sms[2] === 'bounce' || sms[2] === 'exception') {
                self._smsStatus = 'error';
            }
        });
        return this._smsStatus;
    },
    /**
     * Whether message has nay SMS-related notification
     *
     * @returns {boolean}
     */
    hasSmsData: function () {
        return !!(this._smsIds && (this._smsIds.length > 0));
    },
    /**
     * Does the message contains at least one SMS failure
     *
     * @returns {boolean}
     */
    isError: function () {
        return this.getSmsStatus() === 'error';
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     * @private
     */
    _setInitialData: function (data) {
        this._super.apply(this, arguments);
        this._smsIds = data.sms_ids;
        if (this._smsStatus === false) {
            this._smsStatus = 'sent';
        }
    },
});
});
