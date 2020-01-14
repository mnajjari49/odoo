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
                this.googleDocItems = await this._getGoogleDocItems(this.props.activeIds[0]);
            }
        },

        //--------------------------------------------------------------------------
        // Getters
        //--------------------------------------------------------------------------

        /**
         * @override
         */
        get items() {
            const items = this._super();
            if (this.googleDocItems) {
                const gdItemIndex = items.other.findIndex(i => i.classname === 'oe_share_gdoc');
                if (gdItemIndex !== -1) {
                    items.other.splice(gdItemIndex, 1);
                }
                this.googleDocItems.forEach(gdItem => {
                    const alreadyThere = items.other.some(
                        i => i.classname === 'oe_share_gdoc' && i.label.includes(gdItem.name)
                    );
                    if (!alreadyThere) {
                        items.other.unshift({
                            callback: this._onGoogleDocItemClicked.bind(this, gdItem.id),
                            classname: 'oe_share_gdoc',
                            config_id: gdItem.id,
                            label: gdItem.name,
                            res_id: this.props.activeIds[0],
                            res_model: this.props.model,
                        });
                    }
                });
            }
            return items;
        },

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * @private
         * @returns {(Object[]|undefined)}
         */
        async _getGoogleDocItems() {
            if (!this.props.activeIds[0]) {
                return;
            }
            const results = await this.rpc({
                args: [this.props.model, this.props.activeIds[0]],
                context: this.props.context,
                method: 'get_google_drive_config',
                model: 'google.drive.config',
            });
            if (results.length) {
                return results;
            }
        },

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         * @param {number} configID
         */
        async _onGoogleDocItemClicked(configID) {
            const resID = this.props.activeIds[0];
            const domain = [['id', '=', configID]];
            const fields = ['google_drive_resource_id', 'google_drive_client_id'];
            const configs = await this.rpc({
                args: [domain, fields],
                method: 'search_read',
                model: 'google.drive.config',
            });
            const url = await this.rpc({
                args: [configID, resID, configs[0].google_drive_resource_id],
                context: this.props.context,
                method: 'get_google_drive_url',
                model: 'google.drive.config',
            })
            if (url) {
                window.open(url, '_blank');
            }
        },
    });

    return Sidebar;
});
