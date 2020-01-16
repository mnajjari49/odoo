odoo.define('web.TimeRangeEditor', function (require) {
    "use strict";

    const { COMPARISON_TIME_RANGE_OPTIONS,
            DEFAULT_COMPARISON_TIME_RANGE, TIME_RANGE_OPTIONS} = require('web.controlPanelParameters');

    const { Component, useState } = owl;

    class TimeRangeEditor extends Component {
        constructor() {
            super(...arguments);

            this.periodOptions = TIME_RANGE_OPTIONS;
            this.comparisonTimeRangeOptions = COMPARISON_TIME_RANGE_OPTIONS;
            this.periodGroups = Object.values(this.periodOptions).reduce((acc, o) => {
                if (!acc.includes(o.groupNumber)) {
                    acc.push(o.groupNumber);
                }
                return acc;
            }, []);

            this.state = useState({
                isComparing: this.props.comparisonRangeId !== false,
            });

        }
        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         * @param {Event} ev
         */
        _onFieldNameChange(ev) {
            this.trigger('time-range-change', { fieldName: ev.target.value });
        }

        /**
         * @private
         * @param {Event} ev
         */
        _onRangeIdChange(ev) {
            this.trigger('time-range-change', { rangeId: ev.target.value });
        }

        /**
         * @private
         * @param {Event} ev
         */
        _onComparingChange(ev) {
            this.state.isComparing = ev.target.checked;
            const value = ev.target.checked ?
                this.props.comparisonRangeId || DEFAULT_COMPARISON_TIME_RANGE :
                false;
            this.trigger('time-range-change', { comparisonRangeId: value });
        }

        /**
         * @private
         * @param {Event} ev
         */
        _onComparisonRangeIdChange(ev) {
            const { value } = ev.target;
            this.trigger('time-range-change', { comparisonRangeId: ev.target.value });
        }
    }

    TimeRangeEditor.defaultProps = {
        comparisonRangeId: false,
    };
    TimeRangeEditor.props = {
        comparisonRangeId: { validate: c => typeof c === 'string' || c === false },
        fieldName: String,
        fields: Array,
        rangeId: String,
    };
    TimeRangeEditor.template = 'TimeRangeEditor';

    return TimeRangeEditor;

});
