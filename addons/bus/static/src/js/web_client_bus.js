odoo.define('bus.WebClient', function (require) {
"use strict";

const core = require('web.core');
const WebClient = require('web.WebClient');

const _t = core._t;

WebClient.include({
    //----------------------------------------------------------------------
    // Public
    //----------------------------------------------------------------------

    /**
     * Detects the presence of assets in DOM's HEAD
     *
     * @override
     */
    async start() {
        this._assetsChangedNotificationId = null;
        this._assets = {};
        const started = await this._super.apply(this, arguments);
        document.querySelectorAll('*[data-asset-xmlid]').forEach(el => {
            this._assets[el.getAttribute('data-asset-xmlid')] = el.getAttribute('data-asset-version');
        });
        return started;
    },
    /**
     * Assign handler to bus notification
     *
     * @override
     */
    show_application() {
        this.call('bus_service', 'onNotification', this, this._onNotification);
        this.call('bus_service', 'startPolling');
        return this._super.apply(this, arguments);
    },

    //----------------------------------------------------------------------
    // Private
    //----------------------------------------------------------------------

    /**
     * Displays one notification on user's screen when assets have changed
     *
     * @private
     */
    _displayBundleChangedNotification() {
        if (!this._assetsChangedNotificationId) {
            this._assetsChangedNotificationId = this.call('notification', 'notify', {
                title: _t('Update available'),
                message: _t('Refresh your browser to take advantage of the latest update of Odoo in your browser'),
                sticky: true,
                onClose: () => {
                    this._assetsChangedNotificationId = null;
                },
                buttons: [{
                    text: _t('Refresh'),
                    primary: true,
                    click: () => {
                        window.location.reload(true);
                    }
                }],
             });
        }
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Reacts to bus's notification
     *
     * @private
     * @param {Array} notifications: list of received notifications
     */
    _onNotification(notifications) {
        for (const notif of notifications) {
            if (notif[0][1] === 'bundle_changed') {
                const bundleXmlId = notif[1][0];
                const bundleVersion = notif[1][1];
                if (bundleXmlId in this._assets && bundleVersion !== this._assets[bundleXmlId]) {
                    this._displayBundleChangedNotification();
                    break;
                }
            }
        }
    }
});

});
