odoo.define('google_drive.Sidebar', function (require) {
    "use strict";

    /**
     * The purpose of this file is to include the Sidebar widget to add Google
     * Drive related items.
     */

    const Sidebar = require('web.Sidebar');
    const utils = require('web.utils');

    utils.patch(Sidebar, 'google_drive.Sidebar', {
        // TO DO: clean me in master

        async willStart() {
            if (this.props.viewType === "form") {
                this.googleDocItems = await this._getGoogleDocItems(this.sidebarProps.activeIds[0]);
            } else {
                this.googleDocItems = [];
            }
        },

        //--------------------------------------------------------------------------
        // Getters
        //--------------------------------------------------------------------------

        /**
         * @override
         */
        get actionItems() {
            return this._super().concat(this.googleDocItems);
        },

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * @private
         * @returns {(Object[]|undefined)}
         */
        async _getGoogleDocItems() {
            if (!this.sidebarProps.activeIds[0]) {
                return [];
            }
            const results = await this.rpc({
                args: [this.props.modelName, this.sidebarProps.activeIds[0]],
                context: this.sidebarProps.context,
                method: 'get_google_drive_config',
                model: 'google.drive.config',
            });
            const mappedItems = results.map(({ id, name }) => {
                return {
                    callback: () => this._onGoogleDocItemClick(id),
                    className: 'oe_share_gdoc',
                    description: name,
                };
            });
            return mappedItems;
        },

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         * @param {number} itemId
         */
        async _onGoogleDocItemClick(itemId) {
            const resID = this.sidebarProps.activeIds[0];
            const domain = [['id', '=', itemId]];
            const fields = ['google_drive_resource_id', 'google_drive_client_id'];
            const configs = await this.rpc({
                args: [domain, fields],
                method: 'search_read',
                model: 'google.drive.config',
            });
            const url = await this.rpc({
                args: [itemId, resID, configs[0].google_drive_resource_id],
                context: this.sidebarProps.context,
                method: 'get_google_drive_url',
                model: 'google.drive.config',
            });
            if (url) {
                window.open(url, '_blank');
            }
        },
    });

    return Sidebar;
});
