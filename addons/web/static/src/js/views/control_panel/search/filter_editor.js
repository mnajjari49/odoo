odoo.define('web.FilterEditor', function (require) {
    "use strict";

    const { ComponentAdapter } = require('web.OwlCompatibility');
    const { DEFAULT_TIMERANGE } = require('web.controlPanelParameters');
    const Domain = require('web.Domain');
    const DomainSelector = require('web.DomainSelector');
    const TimeRangeEditor = require('web.TimeRangeEditor');
    const { useExternalListener } = require('web.custom_hooks');

    const { Component, hooks } = owl;
    const { useGetters, useRef, useState } = hooks;

    let filterEditorId = 0;

    class DomainSelectorAdapter extends ComponentAdapter {

        /**
         * @override
         * @param {Object} nextProps
         */
        async update(nextProps) {
            await this.widget.setDomain(nextProps.domain, true);
        }
    }

    class FilterEditor extends Component {
        constructor() {
            super(...arguments);

            this.id = filterEditorId ++;
            this.domainSelectorRef = useRef('domain-selector');
            this.DomainSelector = DomainSelector;

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
            this.getters = useGetters(this.env.controlPanelStore);

            const { timeRanges } = this.props.filter;
            const timeRangeState = timeRanges ? {
                    comparisonRangeId: timeRanges.comparisonRangeId,
                    fieldName: timeRanges.fieldName,
                    rangeId: timeRanges.rangeId,
                } : {
                    comparisonRangeId: false,
                    fieldName: this.fields[0] && this.fields[0].value,
                    rangeId: DEFAULT_TIMERANGE,
                };

            this.state = useState({
                activateTimeRange: Boolean(timeRanges),
                editedGroupBy: -1,
                editedOrderedBy: -1,
                invalidContext: false,
                timeRange: timeRangeState,
            });

            useExternalListener(window, 'click', this._onWindowClick, true);
        }

        async willStart() {
            // await this.domainSelector.appendTo(document.createDocumentFragment());
        }

        async willUpdateProps() {
            // await this.domainSelector.setDomain(this.props.filter.domain, true);
        }

        //--------------------------------------------------------------------------
        // Getters
        //--------------------------------------------------------------------------

        get groupByFilters() {
            const filters = this.getters.getFiltersOfType('groupBy');
            return this.props.filter.groupBys.map(gb => {
                const extractedValue = this._extractGroupByValue(gb);
                return Object.assign(
                    extractedValue,
                    filters.find(f => f.fieldName === extractedValue.fieldName)
                );
            });
        }

        get stringContext() {
            const context = Object.assign({}, this.props.context);
            delete context.group_by;
            delete context.time_ranges;
            return JSON.stringify(context);
        }

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * @private
         * @param {string} groupBy
         * @returns {Object} { fieldName [, activeOptionId] }
         */
        _extractGroupByValue(groupBy) {
            const splittedValue =  groupBy.split(':');
            const gbValue = {
                fieldName: splittedValue.shift(),
            };
            if (splittedValue.length) {
                gbValue.activeOptionId = splittedValue.shift();
            }
            return gbValue;
        }

        _getGroupByDescription(groupBy) {
            let description = groupBy.description;
            if (groupBy.hasOptions) {
                const activeOption = groupBy.options.find(
                    o => o.optionId === groupBy.activeOptionId || groupBy.defaultOptionId
                );
                description += ": " + activeOption.description;
            }
            return description;
        }

        /**
         * @private
         * @param {number} index
         */
        _removeGroupBy(index) {
            const groupBys = Object.assign([], this.props.filter.groupBys);
            groupBys.splice(index, 1);
            this.trigger('filter-change', { groupBys });
        }

        /**
         * @private
         * @param {number} index
         */
        _removeOrderedBy(index) {
            const orderedBy = Object.assign([], this.props.filter.orderedBy);
            orderedBy.splice(index, 1);
            this.trigger('filter-change', { orderedBy });
        }

        /**
         * @private
         * @param {Number} index
         */
        _toggleEditedGroupBy(index) {
            this.state.editedGroupBy = index;
        }

        /**
         * @private
         * @param {Number} index
         */
        _toggleEditedOrderedBy(index) {
            this.state.editedOrderedBy = index;
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         * @param {MouseEvent} ev
         */
        _onAddGroupBy() {
            const firstField = Object.keys(this.props.fields)[0];
            this.trigger('filter-change', {
                groupBys: this.props.filter.groupBys.concat(firstField),
            });
        }

        /**
         * @private
         * @param {MouseEvent} ev
         */
        _onAddOrderedBy() {
            const firstField = Object.keys(this.props.fields)[0];
            const orderedBy = {
                asc: true,
                name: firstField,
            };
            this.trigger('filter-change', {
                orderedBy: this.props.filter.orderedBy.concat(orderedBy),
            });
        }

        /**
         * @private
         * @param {Event} ev
         */
        _onCheckboxChange(ev) {
            const { checked, id } = ev.target;
            const detail = {};
            if (id.startsWith('o_default_name_')) {
                detail.isDefault = checked;
                if (checked) {
                    detail.userId = this.env.session.uid;
                }
            } else {
                detail.userId = false;
                if (checked) {
                    detail.isDefault = false;
                }
            }
            this.trigger('filter-change', detail);
        }

        _onContextChange(ev) {
            try {
                const parsedContext = JSON.parse(ev.target.value);
                if (this.state.invalidContext) {
                    this.state.invalidContext = false;
                }
                this.trigger('filter-change', { context: parsedContext });
            } catch (err) {
                this.state.invalidContext = true;
            }
        }

        /**
         * @private
         * @param {Event} ev
         */
        _onDefaultChange(ev) {
            this.trigger('filter-change', {
                isDefault: ev.target.checked,
            });
        }

        /**
         * @private
         * @param {InputEvent} ev
         */
        _onDescriptionInput(ev) {
            this.trigger('filter-change', {
                description: ev.target.value,
            });
        }

        /**
         * @private
         * @param {OwlEvent} ev
         */
        _onDomainChange(ev) {
            const domain = Domain.prototype.arrayToString(
                this.domainSelectorRef.comp.widget.getDomain()
            );
            this.trigger('filter-change', { domain });
        }

        /**
         * @private
         * @param {string} index
         * @param {Event} ev
         */
        _onGroupByChange(index, ev) {
            const groupBys = Object.assign([], this.props.filter.groupBys);
            groupBys[index] = ev.target.value;
            this.trigger('filter-change', { groupBys });
        }

        /**
         * @private
         * @param {number} index
         * @param {KeyboardEvent} ev
         */
        _onGroupByKeydown(index, ev) {
            if (ev.key === 'Backspace') {
                this._removeGroupBy(index);
            }
        }

        /**
         * @private
         * @param {string} index
         * @param {Event} ev
         */
        _onOrderedByChange(index, ev) {
            const orderedBy = Object.assign([], this.props.filter.orderedBy);
            const [name, asc] = ev.target.value.split(' ');
            orderedBy[index] = {
                asc: asc === 'asc',
                name,
            };
            this.trigger('filter-change', { orderedBy });
        }

        /**
         * @private
         * @param {number} index
         * @param {KeyboardEvent} ev
         */
        _onOrderedByKeydown(index, ev) {
            if (ev.key === 'Backspace') {
                this._removeOrderedBy(index);
            }
        }

        /**
         * @private
         * @param {KeyboardEvent} ev
         */
        _onKeydown(ev) {
            switch (ev.key) {
                case 'Escape':
                    if (this.state.editedGroupBy >= 0) {
                        ev.stopPropagation();
                        this._toggleEditedGroupBy(-1);
                    } else if (this.state.editedOrderedBy >= 0) {
                        ev.stopPropagation();
                        this._toggleEditedOrderedBy(-1);
                    }
                    break;
            }
        }

        /**
         * @private
         * @param {Event} ev
         */
        _onSharedChange(ev) {
            this.trigger('filter-change', {
                userId: ev.target.checked ? false : this.env.session.uid,
            });
        }

        /**
         * @private
         * @param {OwlEvent} ev
         */
        _onTimeRangeChange(ev) {
            Object.assign(this.state.timeRange, ev.detail);
        }

        /**
         * @private
         * @param {Event} ev
         */
        _onToggleTimeRanges(ev) {
            this.state.activateTimeRange = ev.target.checked;
        }

        /**
         * Prevent window clicks to unselect a groupby being edited.
         * @private
         * @param {MouseEvent} ev
         */
        _onWindowClick(ev) {
            if (!ev.target.closest('.o_fieldname_cell')) {
                if (this.state.editedGroupBy >= 0) {
                    ev.preventDefault();
                    this._toggleEditedGroupBy(-1);
                } else if (this.state.editedOrderedBy >= 0) {
                    ev.preventDefault();
                    this._toggleEditedOrderedBy(-1);
                }
            }
        }
    }

    FilterEditor.components = {
        DomainSelector,
        DomainSelectorAdapter,
        TimeRangeEditor,
    };
    FilterEditor.props = {
        action: Object,
        fields: Object,
        filter: Object,
    };
    FilterEditor.template = 'FilterEditor';

    return FilterEditor;
});