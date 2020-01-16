odoo.define('web.TimeRangeMenu', function (require) {
    "use strict";

    const { DEFAULT_TIMERANGE } = require('web.controlPanelParameters');
    const DropdownMenu = require('web.DropdownMenu');
    const TimeRangeEditor = require('web.TimeRangeEditor');

    const { useDispatch, useGetters, useState } = owl.hooks;

    class TimeRangeMenu extends DropdownMenu {
        constructor() {
            super(...arguments);

            this.dispatch = useDispatch(this.env.controlPanelStore);
            this.getters = useGetters(this.env.controlPanelStore);

            this.fields = Object.keys(this.props.fields).reduce((acc, fieldName) => {
                const { sortable, string, type } = this.props.fields[fieldName];
                if (
                    ['date', 'datetime'].includes(type) && sortable &&
                    !acc.some(f => f.value === fieldName)
                ) {
                    acc.push({
                        value: fieldName,
                        description: string || fieldName,
                    });
                }
                return acc;
            }, []);

            const activeTimeRange = this.getters.getFiltersOfType('timeRange').find(
                timeRange => timeRange.isActive
            );
            const state = activeTimeRange ? {
                    comparisonRangeId: activeTimeRange.comparisonRangeId,
                    fieldName: activeTimeRange.fieldName,
                    rangeId: activeTimeRange.rangeId,
                } : {
                    comparisonRangeId: false,
                    fieldName: this.fields[0] && this.fields[0].value,
                    rangeId: DEFAULT_TIMERANGE,
                };

            this.state = useState(state);
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         */
        _onApply() {
            this.dispatch('activateTimeRange',
                this.state.fieldName,
                this.state.rangeId,
                this.state.comparisonRangeId
            );
        }

        /**
         * @private
         * @param {OwlEvent} ev
         */
        _onTimeRangeChange(ev) {
            Object.assign(this.state, ev.detail);
        }
    }

    TimeRangeMenu.components = Object.assign({}, DropdownMenu.components, {
        TimeRangeEditor,
    });
    TimeRangeMenu.defaultProps = Object.assign({}, DropdownMenu.defaultProps, {
        icon: 'fa fa-calendar',
        title: "Time Ranges",
    });
    TimeRangeMenu.props = Object.assign({}, DropdownMenu.props, {
        fields: Object,
    });
    TimeRangeMenu.template = 'TimeRangeMenu';

    return TimeRangeMenu;

});
