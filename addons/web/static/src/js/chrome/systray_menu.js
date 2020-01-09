odoo.define('web.SystrayMenu', function (require) {
"use strict";

const AdapterComponent = require('web.AdapterComponent');
const UserMenu = require('web.UserMenu');

class ItemAdapter extends AdapterComponent {
    get widgetArgs() {
        return [];
    }
}

class SystrayMenu extends owl.Component {
    constructor() {
        super(...arguments);
        this.Items = SystrayMenu.Items.sort((ItemA, ItemB) => {
            const seqA = ItemA.prototype.sequence !== undefined ? ItemA.prototype.sequence : 50;
            const seqB = ItemB.prototype.sequence !== undefined ? ItemB.prototype.sequence : 50;
            return seqA < seqB;
        });
    }
}
SystrayMenu.components = { ItemAdapter, UserMenu };
SystrayMenu.template = 'web.SystrayMenu';
SystrayMenu.Items = []; // FIXME: use a registry?

return SystrayMenu;

});
