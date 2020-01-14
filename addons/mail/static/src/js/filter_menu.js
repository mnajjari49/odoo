odoo.define('mail.FilterMenu', function (require) {
    "use strict";

    const FilterMenu = require('web.FilterMenu');
    const utils = require('web.utils');

    utils.patch(FilterMenu, 'mail.FilterMenu', {

        /**
         * @override
         */
        get items() {
            const items = this._super();
            return items.filter(
                filter => filter.relation !== 'mail.message' && filter.id !== 'message_ids'
            );
        },
    });

    return FilterMenu;
});
