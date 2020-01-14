odoo.define('web.GroupByMenuGenerator', function (require) {
    "use strict";

    const DropdownMenuItem = require('web.DropdownMenuItem');
    const { GROUPABLE_TYPES } = require('web.controlPanelParameters');

    const { useState } = owl.hooks;

    class GroupByMenuGenerator extends DropdownMenuItem {
        constructor() {
            super(...arguments);

            this.fieldIndex = 0;

            this.fields = Object.keys(this.props.fields).reduce(
                (fields, fieldName) => {
                    const field = Object.assign({}, this.props.fields[fieldName], {
                        name: fieldName,
                    });
                    if (
                        field.sortable &&
                        field.name !== "id" &&
                        GROUPABLE_TYPES.includes(field.type)
                    ) {
                        fields.push(field);
                    }
                    return fields;
                },
                []
            ).sort(({ string: a }, { string: b }) => a > b ? 1 : a < b ? -1 : 0);
            this.state = useState({ open: false });
        }

        //--------------------------------------------------------------------------
        // Getters
        //--------------------------------------------------------------------------

        /**
         * @override
         */
        get canBeOpened() {
            return true;
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         */
        _onApply() {
            this.trigger('create-new-groupby', this.fields[this.fieldIndex]);
            this.state.open = false;
        }

        /**
         * @private
         * @param {Event} ev
         */
        _onFieldSelected(ev) {
            this.fieldIndex = ev.target.selectedIndex;
        }
    }

    GroupByMenuGenerator.template = 'GroupByMenuGenerator';
    GroupByMenuGenerator.props = {
        fields: Object,
    };

    return GroupByMenuGenerator;
});
