odoo.define('web.SearchFacet', function (require) {
"use strict";

const Tooltip = require('web.Tooltip');

const { Component, hooks } = owl;
const { useDispatch, useState } = hooks;

class SearchFacet extends Component {
    constructor() {
        super(...arguments);

        this.state = useState({ displayTooltip: false });
        this._isComposing = false;
    }

    //--------------------------------------------------------------------------
    // Getters
    //--------------------------------------------------------------------------

    get domains() {
        switch (this.props.group.type) {
            case 'filter':
            case 'favorite':
                // todo avoid duplicates
                return this.props.filters.map(filter => filter.domain);
            case 'groupBy':
                return [this.props.filters[0].fieldName];
        }
    }

    /**
     * @returns {string}
     */
    get icon() {
        switch (this.props.group.type) {
            case 'filter':
                return 'fa-filter';
            case 'groupBy':
                return 'fa-bars';
            case 'favorite':
                return 'fa-star';
            case 'timeRange':
                return 'fa-calendar';
        }
    }

    /**
     * @returns {string}
     */
    get separator() {
        switch (this.props.group.type) {
            case 'field':
            case 'filter':
                return this.env._t('or');
            case 'groupBy':
                return '>';
        }
    }

    /**
     * @returns {string[]}
     */
    get values() {
        return Object.values(this.props.filters).map(this._getFilterDescription.bind(this));
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Get the correct description according to filter.
     *
     * @private
     * @returns {string}
     */
    _getFilterDescription(filter) {
        if (filter.type === 'field') {
            return filter.autoCompleteValues.map(f => f.label).join(this.env._t(" or "));
        }
        if (filter.type === 'timeRange') {
            let description = `${filter.fieldDescription}: ${filter.rangeDescription}`;
            if (filter.comparisonRangeDescription) {
                description += ` / ${filter.comparisonRangeDescription}`;
            }
            return description;
        }

        let description = filter.description;
        if (filter.hasOptions) {

            const currentOptions = filter.options.filter(o => o.isActive);
            const descriptions = [];

            if (filter.type === 'filter') {
                const unsortedYearIds = [];
                const unsortedOtherOptionIds = [];
                currentOptions.forEach(o => {
                    if (o.groupNumber === 2) {
                        unsortedYearIds.push(o.optionId);
                    } else {
                        unsortedOtherOptionIds.push(o.optionId);
                    }
                });
                const sortOptionIds = (a, b) =>
                    filter.options.findIndex(({ optionId }) => optionId === a) -
                    filter.options.findIndex(({ optionId }) => optionId === b);

                const yearIds = unsortedYearIds.sort(sortOptionIds);
                const otherOptionIds = unsortedOtherOptionIds.sort(sortOptionIds);

                if (otherOptionIds.length) {
                    otherOptionIds.forEach(optionId => {
                        yearIds.forEach(yearId => {
                            descriptions.push(filter.basicDomains[`${yearId}__${optionId}`].description);
                        });
                    });
                } else {
                    yearIds.forEach(yearId => {
                        descriptions.push(filter.basicDomains[yearId].description);
                    });
                }
            } else {
                descriptions.push(...currentOptions.map(o => o.description));
            }
            description += `: ${descriptions.join(" / ")}`;
        }
        return description;

    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {KeyboardEvent} ev
     */
    _onKeydown(ev) {
        if (this._isComposing) {
            return;
        }
        switch (ev.key) {
            case 'ArrowLeft':
                this.trigger('navigation-move', { direction: 'left' });
                break;
            case 'ArrowRight':
                this.trigger('navigation-move', { direction: 'right' });
                break;
            case 'Backspace':
                this.trigger('remove-facet', this.props);
                break;
        }
    }
}

SearchFacet.components = { Tooltip };
SearchFacet.props = {
    // todo specify formats
    filters: Object,
    group: Object,
    tooltipPosition: { type: String, optional: 1 },
};
SearchFacet.template = 'SearchFacet';

return SearchFacet;
});
