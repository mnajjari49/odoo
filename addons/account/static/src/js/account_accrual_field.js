odoo.define('account.ShowGroupedList', function (require) {
"use strict";

const { Component } = owl;
const { useState } = owl.hooks;
const AbstractRendererOwl = require('web.AbstractRendererOwl');

class ListItem extends Component { }
ListItem.template = 'account.GroupedItemTemplate';
ListItem.props = ["item_vals", "options"];

class ListGroup extends Component { }
ListGroup.template = 'account.GroupedItemsTemplate';
ListGroup.components = { ListItem }
ListGroup.props = ["group_vals", "options"];


class ShowGroupedList extends AbstractRendererOwl {
    constructor(...args) {
        super(...args);
        this.props = useState({
            groups_vals: [],
            options: {
                discarded_number: '',
                columns: [],
            },
        });
    }
    updateProps(props) {
        Object.assign(this.props.groups_vals, JSON.parse(props).preview_vals);
        Object.assign(this.props.options, JSON.parse(props).preview_options);
    }
}
ShowGroupedList.template = 'account.GroupedListTemplate';
ShowGroupedList.components = { ListGroup }

require('web.field_registry_owl').add('account_accrual_widget', ShowGroupedList);
return ShowGroupedList;
});
