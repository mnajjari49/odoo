odoo.define('web.FilterMenuGenerator', function (require) {
    "use strict";

    const { DatePicker, DateTimePicker } = require('web.datepicker_owl');
    const Domain = require('web.Domain');
    const DropdownMenuItem = require('web.DropdownMenuItem');
    const { FIELD_OPERATORS, FIELD_TYPES } = require('web.controlPanelParameters');
    const { parse } = require('web.field_utils');

    const { useDispatch, useState } = owl.hooks;

    class FilterMenuGenerator extends DropdownMenuItem {
        constructor() {
            super(...arguments);

            this.dispatch = useDispatch(this.env.controlPanelStore);
            this.fields = Object.keys(this.props.fields).reduce(
                (fields, fieldName) => {
                    const field = Object.assign({}, this.props.fields[fieldName], {
                        name: fieldName,
                    });
                    if (!field.deprecated && field.searchable) {
                        fields.push(field);
                    }
                    return fields;
                },
                []
            ).sort(({ string: a }, { string: b }) => a > b ? 1 : a < b ? -1 : 0);
            this.state = useState({
                conditions: [],
                open: false,
            });
            // Add default empty condition
            this._addDefaultCondition();

            // Give access to constants variables to the template.
            this.DECIMAL_POINT = this.env._t.database.parameters.decimal_point;
            this.OPERATORS = FIELD_OPERATORS;
            this.FIELD_TYPES = FIELD_TYPES;
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
        // Private
        //--------------------------------------------------------------------------

        /**
         * Populates the conditions list with a default condition having as properties:
         * - the first available field
         * - the first available operator
         * - an empty value
         * @private
         */
        _addDefaultCondition() {
            const condition = {
                field: 0,
                operator: 0,
                value: null,
            };
            this.state.conditions.push(condition);
        }

        /**
         * @private
         * @param {Object} operator
         * @returns {boolean}
         */
        _hasValue(operator) {
            return 'value' in operator;
        }

        /**
         * Returns a sequence of numbers which length is equal to the given size.
         * @private
         * @param {number} size
         * @returns {number[]}
         */
        _range(size) {
            return new Array(size).fill().map((_, i) => i);
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * Convert all conditions to prefilters.
         * @private
         */
        _onApply() {
            const preFilters = this.state.conditions.map(condition => {
                const field = this.fields[condition.field];
                const type = this.FIELD_TYPES[field.type];
                const operator = this.OPERATORS[type][condition.operator];
                const preDescription = [];
                const preDomain = [];
                let values;
                // Field type specifics
                if (this._hasValue(operator)) {
                    values = [operator.value];
                } else if (['date', 'datetime'].includes(field.type)) {
                    values = condition.value.map(val =>
                        val._isAMomentObject ? val.locale('en').format(
                            field.type === 'date' ?
                                'YYYY-MM-DD' :
                                'YYYY-MM-DD HH:mm:ss'
                        ) : val
                    );
                } else {
                    values = [condition.value];
                }
                // Operator specifics
                if (operator.symbol === 'between') {
                    preDomain.push(
                        [field.name, '>=', values[0]],
                        [field.name, '<=', values[1]]
                    );
                } else {
                    preDomain.push([field.name, operator.symbol, values[0]]);
                }
                preDescription.push(field.string, operator.text);
                if (!this._hasValue(operator)) {
                    let value = values.join(` ${this.env._t("and")} `);
                    if (this.FIELD_TYPES[field.type] === 'char') {
                        value = `"${value}"`;
                    }
                    preDescription.push(value);
                }
                const preFilter = {
                    description: preDescription.join(" "),
                    domain: Domain.prototype.arrayToString(preDomain),
                    type: 'filter',
                };
                return preFilter;
            });

            this.trigger('create-new-filters', preFilters);

            // Reset state
            this.state.open = false;
            this.state.conditions = [];
            this._addDefaultCondition();
        }

        /**
         * @private
         * @param {Object} condition
         * @param {number} valueIndex
         * @param {OwlEvent} ev
         */
        _onDateChanged(condition, valueIndex, ev) {
            condition.value[valueIndex] = ev.detail;
        }

        /**
         * @private
         * @param {Object} condition
         * @param {Event} ev
         */
        _onFieldSelected(condition, ev) {
            Object.assign(condition, {
                field: ev.target.selectedIndex,
                operator: 0,
                value: [],
            });
        }

        /**
         * @private
         * @param {Object} condition
         * @param {Event} ev
         */
        _onOperatorSelected(condition, ev) {
            condition.operator = ev.target.selectedIndex;
        }

        /**
         * @private
         * @param {Object} condition
         */
        _onRemoveCondition(conditionIndex) {
            this.state.conditions.splice(conditionIndex, 1);
        }

        /**
         * @private
         * @param {Object} condition
         * @param {Event} ev
         */
        _onValueInput(condition, ev) {
            const type = this.fields[condition.field].type;
            if (['float', 'integer'].includes(type)) {
                const previousValue = condition.value;
                const defaultValue = type === 'float' ? '0.0' : '0';
                try {
                    const parsed = parse[type](ev.target.value || defaultValue);
                    // Force parsed value in the input.
                    ev.target.value = condition.value = (parsed || defaultValue);
                } catch (err) {
                    // Force previous value if non-parseable.
                    ev.target.value = previousValue || defaultValue;
                }
            } else {
                condition.value = ev.target.value || "";
            }
        }
    }

    FilterMenuGenerator.components = { DatePicker, DateTimePicker };
    FilterMenuGenerator.props = {
        fields: Object,
    };
    FilterMenuGenerator.template = 'FilterMenuGenerator';

    return FilterMenuGenerator;
});
