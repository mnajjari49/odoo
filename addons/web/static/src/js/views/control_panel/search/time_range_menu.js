odoo.define('web.TimeRangeMenu', function (require) {
    "use strict";

    const DropdownMenu = require('web.DropdownMenu');
    const { COMPARISON_TIME_RANGE_OPTIONS, DEFAULT_TIMERANGE,
            DEFAULT_COMPARISON_TIME_RANGE, TIME_RANGE_OPTIONS} = require('web.controlPanelParameters');

    const { useState } = owl.hooks;

    class TimeRangeMenu extends DropdownMenu {
        constructor() {
            super(...arguments);

            this.fields = Object.keys(this.props.fields).reduce((acc, fieldName) => {
                const field = this.props.fields[fieldName];
                if (['date', 'datetime'].includes(field.type) && field.sortable && !acc.find(f => f.name === fieldName)) {
                    acc.push({
                        name: fieldName,
                        description: field.string || fieldName,
                    });
                }
                return acc;
            }, []);
            this.periodOptions = TIME_RANGE_OPTIONS;
            this.comparisonTimeRangeOptions = COMPARISON_TIME_RANGE_OPTIONS;
            this.periodGroups = Object.values(this.periodOptions).reduce((acc, o) => {
                if (!acc.includes(o.groupNumber)) {
                    acc.push(o.groupNumber);
                }
                return acc;
            }, []);

            const { comparisonRangeId, fieldName, rangeId } = this.items.find(timeRange => timeRange.isActive) ||
                { rangeId: DEFAULT_TIMERANGE, comparisonRangeId: false, fieldName: (this.fields[0] || {}) .name };

            this.state = useState({
                isComparing: Boolean(comparisonRangeId),
                fieldName,
                comparisonRangeId,
                rangeId,
            });
        }

        //--------------------------------------------------------------------------
        // Getters
        //--------------------------------------------------------------------------

        get items() {
            return this.getters.getFiltersOfType('timeRange');
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         */
        _onApply() {
            this.dispatch('activateTimeRange',
                this.state.fieldName, // Field name
                this.state.rangeId, // Time range option id
                this.state.isComparing ? (this.state.comparisonRangeId || DEFAULT_COMPARISON_TIME_RANGE) : undefined // Comparison time range id
            );
        }

        /**
         * @private
         * @param {Event} ev
         */
        _onComparisonRangeChanged(ev) {
            this.state.comparisonRangeId = ev.target.value;
        }

        /**
         * @private
         * @param {Event} ev
         */
        _onFieldNameChanged(ev) {
            this.state.fieldName = ev.target.value;
        }

        /**
         * @private
         * @param {Event} ev
         */
        _onRangeChanged(ev) {
            this.state.rangeId = ev.target.value;
        }
    }

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
