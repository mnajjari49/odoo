odoo.define('web.GroupByMenuMixin', function (require) {
"use strict";

const GroupByMenu = require('web.GroupByMenu');
const { DEFAULT_INTERVAL, INTERVAL_OPTIONS } = require('web.controlPanelParameters');

// TODO: find it a name
class TODO_findMeAName extends GroupByMenu {
    constructor() {
        super(...arguments);

        this.symbol = !this.props.noSymbol && this.symbol;
    }

    //--------------------------------------------------------------------------
    // Getters
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    get items() {
        const groupBys = [];
        Object.values(this.props.groupBys).forEach(groupBy => {
            const gb = Object.assign({}, groupBy);
            if (gb.hasOptions) {
                gb.options = gb.options.map(({ description, optionId, groupNumber }) => {
                    const isActive = gb.currentOptionIds.has(optionId);
                    return { description, optionId, groupNumber, isActive};
                });
            }
            groupBys.push(gb);
        });
        return groupBys;
    }

    /**
     * @override
     */
    get displayCaret() {
        return true;
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    async updateProps(newProps = {}) {
        if (!Object.keys(newProps).length) {
            return;
        }
        await this.willUpdateProps(newProps);
        Object.assign(this.props, newProps);
        if (this.__owl__.isMounted) {
            this.render(true);
        }
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    _onItemSelected() {
        return;
    }
}

TODO_findMeAName.props = Object.assign({}, GroupByMenu.props, {
    groupBys: { type: Array, elements: String },
    noSymbol: Boolean,
});

/**
 * The aim of this mixin is to facilitate the interaction between
 * a view controller and a dropdown menu with its control panel
 * TO DO: the pivot subview has two types of groupbys so that it will not
 * understand the current implementation of this mixin
 *
 * @mixin
 * @name GroupByMenuMixin
 */
const GroupByMenuMixin = {

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Instantiate a widget GroupByMenu and incorporate it to the control panel
     * of an embedded view. This is used for instance in the dashboard view in
     * enterprise where there is no GroupBy menu in the search view because it
     * would not make sense to have one at the global level.
     * This function is called by renderButtons when the parameter
     * 'this.isEmbedded' is set to true.
     *
     * @private
     * @param {jQuery} $node
     * @param {Object} groupableFields
     * @param {Promise}
     */
    async _addGroupByMenu(node, groupableFields) {
        this.sortedFieldNames = Object.keys(groupableFields).sort();
        this.groupableFields = groupableFields;
        this.component = new TODO_findMeAName(null, {
            groupBys: this._getGroupBys(this.model.get().groupBy),
            noSymbol: true,
        });
        await this.component.mount(document.createDocumentFragment());

        node.querySelector('div').insertAdjacentElement('afterend', this.component.el);
        // Done here since the parent controller is not always the buttons parent in the DOM.
        node.addEventListener('select-item', ev => this._onItemSelected(ev));

        this.component.__callMounted();
    },

    /**
     * This method puts the active groupBys in a convenient form.
     *
     * @private
     * @param {string[]} activeGroupBys
     * @returns {Object[]} normalizedGroupBys
     */
    _normalizeActiveGroupBys(activeGroupBys) {
        return activeGroupBys.map(groupBy => {
            const fieldName = groupBy.split(':')[0];
            const field = this.groupableFields[fieldName];
            const normalizedGroupBy = { fieldName };
            if (['date', 'datetime'].includes(field.type)) {
                normalizedGroupBy.interval = groupBy.split(':')[1] || DEFAULT_INTERVAL;
            }
            return normalizedGroupBy;
        });
    },

    /**
     * This method has to be implemented by the view controller that needs to
     * interpret the click in an appropriate manner.
     *
     * @private
     * @param {string[]} groupBys
     */
    _setGroupby(groupBys) { },

    /**
     * Return the list of groupBys in a form suitable for the component. We do
     * this each time because we want to be synchronized with the view model.
     *
     * @private
     * @param {string[]} activeGroupBys
     * @returns {Object[]}
     */
    _getGroupBys(activeGroupBys) {
        const normalizedGroupBys = this._normalizeActiveGroupBys(activeGroupBys);
        return this.sortedFieldNames.map(fieldName => {
            const field = this.groupableFields[fieldName];
            const groupByActivity = normalizedGroupBys.filter(gb => gb.fieldName === fieldName);
            const groupBy = {
                id: fieldName,
                isActive: Boolean(groupByActivity.length),
                description: field.string,
            };
            if (['date', 'datetime'].includes(field.type)) {
                groupBy.hasOptions = true;
                groupBy.options = INTERVAL_OPTIONS;
                groupBy.currentOptionIds = new Set(groupByActivity.map(gb => gb.interval));
            }
            return groupBy;
        });
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {OdooEvent} ev
     */
    _onItemSelected(ev) {
        const fieldName = ev.detail.item.id;
        const optionId = ev.detail.option && ev.detail.option.id;
        const activeGroupBys = this.model.get().groupBy;
        if (optionId) {
            const normalizedGroupBys = this._normalizeActiveGroupBys(activeGroupBys);
            const index = normalizedGroupBys.findIndex(ngb =>
                ngb.fieldName === fieldName && ngb.interval === optionId);
            if (index === -1) {
                activeGroupBys.push(fieldName + ':' + optionId);
            } else {
                activeGroupBys.splice(index, 1);
            }
        } else {
            const groupByFieldNames = activeGroupBys.map(gb => gb.split(':')[0]);
            const indexOfGroupby = groupByFieldNames.indexOf(fieldName);
            if (indexOfGroupby === -1) {
                activeGroupBys.push(fieldName);
            } else {
                activeGroupBys.splice(indexOfGroupby, 1);
            }
        }
        this._setGroupby(activeGroupBys);
        this.component.updateProps({
            groupBys: this._getGroupBys(activeGroupBys),
        });
    },
};

return GroupByMenuMixin;
});
