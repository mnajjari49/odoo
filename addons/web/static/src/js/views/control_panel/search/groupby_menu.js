odoo.define('web.GroupByMenu', function (require) {
    "use strict";

    const DropdownMenu = require('web.DropdownMenu');
    const GroupByMenuGenerator = require('web.GroupByMenuGenerator');

    const { useDispatch, useGetters } = owl.hooks;

    class GroupByMenu extends DropdownMenu {

        constructor() {
            super(...arguments);

            if (this.env.controlPanelStore) {
                this.dispatch = useDispatch(this.env.controlPanelStore);
                this.getters = useGetters(this.env.controlPanelStore);
            }
        }

        //--------------------------------------------------------------------------
        // Getters
        //--------------------------------------------------------------------------

        get items() {
            return this.getters.getFiltersOfType('groupBy');
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        _onCreateNewGroupBy(ev) {
            this.dispatch('createNewGroupBy', ev.detail);
        }

        /**
         * @private
         * @param {OwlEvent} ev
         */
        _onItemSelected(ev) {
            const { item, option } = ev.detail;
            if (option) {
                this.dispatch('toggleFilterWithOptions', item.id, option.optionId);
            } else {
                this.dispatch('toggleFilter', item.id);
            }
        }
    }

    GroupByMenu.components = Object.assign({}, DropdownMenu.components, {
        GroupByMenuGenerator,
    });
    GroupByMenu.defaultProps = Object.assign({}, DropdownMenu.defaultProps, {
        icon: 'fa fa-bars',
        title: "Group By",
        fields: {},
    });
    GroupByMenu.props = Object.assign({}, DropdownMenu.props, {
        fields: Object,
    });
    GroupByMenu.template = 'GroupByMenu';

    return GroupByMenu;
});
