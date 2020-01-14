odoo.define('web.FilterMenu', function (require) {
    "use strict";

    const DropdownMenu = require('web.DropdownMenu');
    const FilterMenuGenerator = require('web.FilterMenuGenerator');

    class FilterMenu extends DropdownMenu {

        //--------------------------------------------------------------------------
        // Getters
        //--------------------------------------------------------------------------

        /**
         * @override
         */
        get items() {
            return this.getters.getFiltersOfType('filter');
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         * @param {OwlEvent} ev
         */
        _onCreateNewFilters(ev) {
            this.dispatch('createNewFilters', ev.detail);
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

    FilterMenu.components = Object.assign({}, DropdownMenu.components, {
        FilterMenuGenerator,
    });
    FilterMenu.defaultProps = Object.assign({}, DropdownMenu.defaultProps, {
        icon: 'fa fa-filter',
        title: "Filters",
    });
    FilterMenu.props = Object.assign({}, DropdownMenu.props, {
        fields: Object,
    });
    FilterMenu.template = 'FilterMenu';

    return FilterMenu;
});
