odoo.define('board.AddToGoogleSpreadsheetMenu', function (require) {
    "use strict";

    const ActionManager = require('web.ActionManager');
    const { DataSet } = require('web.data');
    const Domain = require('web.Domain');
    const FavoriteMenu = require('web.FavoriteMenu');
    const pyUtils = require('web.py_utils');
    const DropdownMenuItem = require('web.DropdownMenuItem');

    class AddToGoogleSpreadsheetMenu extends DropdownMenuItem {

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         */
        async _onAddToSpreadsheet() {
            const searchQuery = this.env.controlPanelStore.getQuery();
            const listView = this.env.action.views.find(view => view.type === 'list');

            const modelName = this.env.action.res_model;
            const domain = Domain.prototype.arrayToString(searchQuery.domain);
            const groupBys = pyUtils.eval('groupbys', searchQuery.groupBys).join(" ");
            const listViewId = listView ? listView.viewID : false;

            const dataset = new DataSet(this, 'google.drive.config');
            const result = await dataset.call(
                'set_spreadsheet',
                [modelName, domain, groupBys, listViewId]
            );
            if (result.url) {
                window.open(result.url, '_blank');
            }
        }
    }

    AddToGoogleSpreadsheetMenu.props = {};
    AddToGoogleSpreadsheetMenu.template = 'AddToGoogleSpreadsheetMenu';

    // Add to the FavoriteMenu components object.
    FavoriteMenu.components.AddToGoogleSpreadsheetMenu = AddToGoogleSpreadsheetMenu;

    return AddToGoogleSpreadsheetMenu;
});
