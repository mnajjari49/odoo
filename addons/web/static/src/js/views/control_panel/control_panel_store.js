odoo.define('web.ControlPanelStore', function (require) {
    "use strict";

    /**
     * DATA STRUCTURES
     *
     * 1. FILTER
     * ---------
     *
     * A filter is an object defining a specific domain. Each filter is defined
     * at least by :
     * @param {number} id unique identifier, also the filter's corresponding key
     * @param {string} description the description of the filter
     * @param {string} type either: (filter | groupBy | timeRange | favorite)
     *
     *  a. Filter
     *
     * @param {*} domain
     * @param {*} groupId
     * @param {*} groupNumber
     *
     *  b. GroupBy
     *
     * @param {*} fieldName
     * @param {*} fieldType
     * @param {*} groupId
     * @param {*} groupNumber
     *
     *  c. TimeRange
     *
     *  d. Favorite
     *
     * @param {*} context
     * @param {*} domain
     * @param {*} groupBys
     * @param {*} groupNumber
     * @param {*} isDefault
     * @param {*} removable
     * @param {*} editable
     * @param {*} orderedBy
     * @param {*} serverSideId
     * @param {*} userId
     * @param {*} [timeRanges]
     *
     *
     * 2. QUERY
     * --------
     *
     * queryElements format
     *
     * type 'filter', 'groupBy', 'favorite' without options
     * { groupId, filterId }
     *
     * type 'filter' or 'groupBy' with hasOptions to true
     * { groupId, filterId, optionId }
     *
     * type 'field'
     * { groupId, filterId, value }
     * { groupId, filterId, value, label }
     *
     * type 'timeRange'
     * { groupId, filterId, fieldName, rangeId }
     * { groupId, filterId, fieldName, rangeId, comparisonRangeId }
     *
     */

    const dataManager = require('web.data_manager');
    const Domain = require('web.Domain');
    const pyUtils = require('web.py_utils');

    const { parseArch } = require('web.viewUtils');

    const { Store } = owl;
    const { COMPARISON_TIME_RANGE_OPTIONS,
        DEFAULT_INTERVAL, DEFAULT_PERIOD, DEFAULT_YEAR,
        INTERVAL_OPTIONS, OPTION_GENERATORS,
        TIME_RANGE_OPTIONS, YEAR_OPTIONS } = require('web.controlPanelParameters');

    const FAVORITE_PRIVATE_GROUP = 1;
    const FAVORITE_SHARED_GROUP = 2;

    let filterId = 0;
    let groupId = 0;
    let groupNumber = 0;

    //-----------------------------------------------------------------------------------------------
    // ControlPanelStore
    //-----------------------------------------------------------------------------------------------

    class ControlPanelStore extends Store {
        constructor(config) {
            super({
                actions: {},
                env: config.env,
                getters: {},
                state: {
                    cp_content: {},
                    pager: null,
                    sidebar: null,
                    title: "",
                },
            });

            this._setProperties(config);
            this._defineActions();
            this._defineGetters();

            if (this.withSearchBar) {
                if (config.importedState) {
                    this.importState(config.importedState);
                } else {
                    this._prepareInitialState();
                }
            }

            this.isReady = Promise.all(this.labelPromisses);
        }

        //-----------------------------------------------------------------------------------------------
        // Actions
        //-----------------------------------------------------------------------------------------------

        /**
         * Activate the unique filter of type 'timeRange' with provided 'options' fieldName, rangeId,
         * and optional comparisonRangeId.
         *
         * @param {string} fieldName
         * @param {string} rangeId
         * @param {string} [comparisonRangeId]
         */
        activateTimeRange({ state }, fieldName, rangeId, comparisonRangeId) {
            const filter = Object.values(state.filters).find(f => f.type === 'timeRange');
            const activityDetail = { fieldName, rangeId };
            if (comparisonRangeId) {
                activityDetail.comparisonRangeId = comparisonRangeId;
            }
            const activity = state.query.find(queryElem => queryElem.filterId === filter.id);
            if (activity) {
                Object.assign(activity, activityDetail);
                if (!comparisonRangeId) {
                    delete activity.comparisonRangeId;
                }
            } else {
                state.query.push(Object.assign({ groupId: filter.groupId, filterId: filter.id }, activityDetail));
            }
        }

        /**
         * Remove all the items from query.
         */
        clearQuery({ state }) {
            state.query = [];
        }

        /**
         * Create a new filter of type 'favorite' and toggle it.
         * It belongs to the unique group of favorites.
         *
         * @param {Object} preFilter
         */
        async createNewFavorite({ state, dispatch }, preFilter) {
            const preFavorite = await this._saveQuery(preFilter);
            dispatch('clearQuery');
            const filter = Object.assign(preFavorite, {
                groupId,
                id: filterId,
            });
            state.filters[filterId] = filter;
            state.query.push({ groupId, filterId });
            groupId++;
            filterId++;
        }

        /**
         * @param {Object[]} filters
         */
        createNewFilters({ state }, prefilters) {
            if (!prefilters.length) {
                return;
            }
            prefilters.forEach(preFilter => {
                const filter = Object.assign(preFilter, {
                    groupId,
                    groupNumber,
                    id: filterId,
                    type: 'filter',
                });
                state.filters[filterId] = filter;
                state.query.push({ groupId, filterId });
                filterId++;
            });
            groupId++;
            groupNumber++;
        }

        /**
         * @param {Object} field
         */
        createNewGroupBy({ state, dispatch }, field) {
            const groupBy = Object.values(state.filters).find(f => f.type === 'groupBy');
            const filter = {
                description: field.string || field.name,
                fieldName: field.name,
                fieldType: field.type,
                groupId: groupBy ? groupBy.groupId : groupId++,
                groupNumber,
                id: filterId,
                type: 'groupBy',
            };
            state.filters[filterId] = filter;
            if (['date', 'datetime'].includes(field.type)) {
                filter.hasOptions = true;
                filter.defaultOptionId = DEFAULT_INTERVAL;
                dispatch('toggleFilterWithOptions', filterId);
            } else {
                dispatch('toggleFilter', filterId);
            }
            groupNumber++;
            filterId++;
        }

        /**
         * Deactivate a group with provided groupId
         *
         * @param {number} groupId
         */
        deactivateGroup({ state }, groupId) {
            state.query = state.query.filter(queryElem => queryElem.groupId !== groupId);
        }

        /**
         * Delete a filter of type 'favorite' with given filterId server side and
         * in control panel store. Of course the filter is also removed
         * from the search query.
         *
         * @param {string} filterId
         */
        async deleteFavorite({ state }, filterId) {
            const { serverSideId } = state.filters[filterId];
            await dataManager.delete_filter(serverSideId);
            const index = state.query.findIndex(queryElem => queryElem.filterId === filterId);
            delete state.filters[filterId];
            if (index >= 0) {
                state.query.splice(index, 1);
            }
        }

        /**
         * Edit a filter of type 'favorite' with given filterId server side and
         * in control panel store.
         * @param {string} filterId
         * @param {Object} values
         */
        async editFavorite({ state }, filterId, values) {
            const favorite = state.filters[filterId];
            let updateQuery = false;

            // Create an ir.filter object.
            const irFilter = this._favoriteToIrFilter(values);
            // Re-create a favorite from that object to ensure that only the right keys are kept.
            const newFavoriteProps = this._irFilterToFavorite(irFilter);
            Object.assign(favorite, newFavoriteProps);

            if (!Object.keys(irFilter).length) {
                return;
            }
            if (Object.keys(irFilter).some(k => ['context', 'domain', 'sort'].includes(k))) {
                updateQuery = true;
            }
            if ('userId' in values) {
                favorite.groupNumber = values.userId ?
                    FAVORITE_PRIVATE_GROUP :
                    FAVORITE_SHARED_GROUP;
            }

            // Trigger a query change if needed
            if (updateQuery) {
                const queryElement = state.query.find(e => e.filterId === filterId);
                if (queryElement) {
                    queryElement.revNumber = (queryElement.revNumber || 0) + 1;
                }
            }

            await dataManager.edit_filter(irFilter);
        }

        /**
         * Activate a filter of type 'field' with given 'autocompleteValues' value and label
         * @todo
         */
        addAutoCompletionValues({ state }, filterId, value, operator, label) {
            let activity = state.query.find(queryElem => {
                return queryElem.filterId === filterId && queryElem.value === value;
            });
            if (!activity) {
                const { groupId } = state.filters[filterId];
                state.query.push({ filterId, groupId, operator, label, value });
            }
        }

        /**
         * Activate or deactivate a filter from the query.
         * @param {string} filterId
         */
        toggleFilter({ state }, filterId) {
            const index = state.query.findIndex(queryElem => queryElem.filterId === filterId);
            if (index >= 0) {
                state.query.splice(index, 1);
            } else {
                const { groupId } = state.filters[filterId];
                state.query.push({ groupId, filterId });
            }
        }

        /**
         * Used to toggle a given filter(Id) that has options with a given option(Id).
         * @param {string} filterId
         * @param {string} [optionId]
         */
        toggleFilterWithOptions({ state }, filterId, optionId) {
            const filter = state.filters[filterId];
            optionId = optionId || filter.defaultOptionId;

            const noYearSelected = (filterId) => !state.query.some(queryElem => {
                return queryElem.filterId === filterId && YEAR_OPTIONS[queryElem.optionId];
            });

            const index = state.query.findIndex(queryElem => queryElem.filterId === filterId && queryElem.optionId === optionId);
            if (index >= 0) {
                state.query.splice(index, 1);
                if (filter.type === 'filter' && noYearSelected(filterId)) {
                    // This is the case where optionId was the last option
                    // of type 'year' to be there before being removed above.
                    // Since other options of type 'month' or 'quarter' do
                    // not make sense without a year we deactivate all options.
                    state.query = state.query.filter(queryElem => queryElem.filterId !== filterId);
                }
            } else {
                state.query.push({ groupId: filter.groupId, filterId, optionId });
                if (filter.type === 'filter' && noYearSelected(filterId)) {
                    // Here we add 'this_year' as options if no option of type year is already selected.
                    state.query.push({ groupId: filter.groupId, filterId, optionId: DEFAULT_YEAR });
                }
            }
        }

        /**
         * @todo the way it is done could be improved, but the actual state of the
         * searchView doesn't allow to do much better.
         *
         * Update the domain of the search view by adding and/or removing filters.
         * @param {Object[]} newFilters list of filters to add, described by
         *   objects with keys domain (the domain as an Array), description (the text
         *   to display in the facet) and type with value 'filter'.
         * @param {string[]} filtersToRemove list of filter ids to remove
         *   (previously added ones)
         * @returns {string[]} list of added filters (to pass as filtersToRemove
         *   for a further call to this function)
         */
        updateFilters({ state, dispatch }, newFilters, filtersToRemove) {
            const newFilterIDS = dispatch('createNewFilters', newFilters);
            state.query = state.query.filter(queryElem => !filtersToRemove.includes(queryElem.filterId));
            return newFilterIDS;
        }

        updateActionProps({ state }, newProps) {
            if ('cp_content' in newProps) {
                for (const key in newProps.cp_content) {
                    const content = newProps.cp_content[key];
                    state.cp_content[key] = () => content;
                }
                delete newProps.cp_content;
            }
            Object.assign(state, newProps);
        }

        //-----------------------------------------------------------------------------------------------
        // Getters
        //-----------------------------------------------------------------------------------------------

        getFacets() {
            const groups = this._getGroups();
            const facets = groups.reduce((acc, group) => {
                const { activities, type, id } = group;
                const filters = activities.map(({ filter, filterActivities }) => this._enrichFilterCopy(filter, filterActivities));
                const facet = { group: { type, id }, filters };
                acc.push(facet);
                return acc;
            }, []);
            return facets;
        }

        /**
         * Return an array containing enriched copies of the filters of the provided type.
         * @param {string} type
         * @returns {Object[]}
         */
        getFiltersOfType({ state }, type) {
            const fs = Object.values(state.filters).reduce((acc, filter) => {
                if (filter.type === type && !filter.invisible) {
                    const activities = state.query.filter(queryElem => queryElem.filterId === filter.id);
                    const f = this._enrichFilterCopy(filter, activities);
                    acc.push(f);
                }
                return acc;
            }, []);
            if (type === 'favorite') {
                fs.sort((f1, f2) => f1.groupNumber - f2.groupNumber);
            }
            return fs;
        }

        //-----------------------------------------------------------------------------------------------
        // Public
        //-----------------------------------------------------------------------------------------------

        /**
         * Return the state of the control panel store (the filters and the
         * current query). This state can then be used in an other control panel
         * model (with same key modelName). See importedState
         * @returns {Object}
         */
        exportState() {
            return {
                filters: this.state.filters,
                query: this.state.query,
            };
        }

        /**
         * @returns {Object} An object called search query with keys domain, groupBy,
         *      context, and optionally orderedBy and timeRanges.
         */
        getQuery() {
            let query;
            if (!this.withSearchBar) {
                query = { context: {}, domain: [], groupBy: [] };
                if (this.searchMenuTypes.includes('timeRange')) {
                    query.timeRanges = {};
                }
                return query;
            }

            const requireEvaluation = true;
            const groups = this._getGroups();
            query = {
                context: this._getContext(groups),
                domain: this._getDomain(groups, requireEvaluation),
                groupBy: this._getGroupBy(groups),
                orderedBy: this._getOrderedBy(groups)
            };
            if (this.searchMenuTypes.includes('timeRange')) {
                const timeRanges = this._getTimeRanges(requireEvaluation);
                query.timeRanges = timeRanges || {};
            }
            return query;
        }

        /**
         * @param {Object} state
         */
        importState(state) {
            Object.assign(this.state, state);
        }

        //-----------------------------------------------------------------------------------------------
        // Private
        //-----------------------------------------------------------------------------------------------

        /**
         * @private
         */
        _activateDefaultTimeRanges() {
            const { field, range, comparisonRange } = this.actionContext.time_ranges;
            this.dispatch('activateTimeRange', field, range, comparisonRange);
        }

        /**
         * @private
         */
        _activateFilters() {
            const defaultFilters = [];
            const defaultFavorites = [];
            for (const fId in this.state.filters) {
                if (this.state.filters[fId].isDefault) {
                    if (this.state.filters[fId].type === 'favorite') {
                        defaultFavorites.push(this.state.filters[fId]);
                    } else {
                        defaultFilters.push(this.state.filters[fId]);
                    }
                }
            }
            // Activate default filters
            defaultFilters
                .sort((f1, f2) => (f1.defaultRank || 100) - (f2.defaultRank || 100))
                .forEach(f => {
                    if (f.hasOptions) {
                        this.dispatch('toggleFilterWithOptions', f.id);
                    } else if (f.type === 'field') {
                        let { operator, label, value } = f.defaultAutocompleteValue;
                        this.dispatch('addAutoCompletionValues', f.id, value, operator, label);
                    } else {
                        this.dispatch('toggleFilter', f.id);
                    }
                });
            if (this.activateDefaultFavorite) {
                // Activate default favorites
                defaultFavorites.forEach(f => this.dispatch('toggleFilter', f.id));
            }
            if (this.actionContext.time_ranges) {
                this._activateDefaultTimeRanges();
            }
        }

        /**
         * @private
         */
        _addFilters() {
            this._createGroupOfFiltersFromArch();
            this._createGroupOfDynamicFilters();
            this._createGroupOfFavorites();
            this._createGroupOfTimeRanges();
        }

        _cleanArch(arch) {
            if (arch.children) {
                arch.children = arch.children.reduce(
                    (children, child) => {
                        if (typeof child === 'string') {
                            return children;
                        }
                        this._cleanArch(child);
                        return children.concat(child);
                    },
                    []
                );
            }
            return arch;
        }

        /**
         * @private
         */
        _createGroupOfDynamicFilters() {
            const pregroup = this.dynamicFilters.map(filter => {
                return {
                    description: filter.description,
                    domain: JSON.stringify(filter.domain),
                    isDefault: true,
                    type: 'filter',
                };
            });
            this._createGroupOfFilters(pregroup);
        }

        /**
         * @private
         */
        _createGroupOfFavorites() {
            this.favoriteFilters.forEach(irFilter => {
                const favorite = this._irFilterToFavorite(irFilter);
                this._createGroupOfFilters([favorite]);
            });
        }

        /**
         * Using a list (a 'pregroup') of 'prefilters', create new filters in
         * state.filters for each prefilter. The new filters
         * belong to a same new group.
         * @param {Object[]} pregroup, list of 'prefilters'
         * @param {string} type
         */
        _createGroupOfFilters(pregroup) {
            pregroup.forEach(preFilter => {
                const filter = Object.assign(preFilter, { groupId, id: filterId });
                this.state.filters[filterId] = filter;
                filterId++;
            });
            groupId++;
        }

        /**
         * Parse the arch of a 'search' view and create corresponding filters and groups.
         *
         * A searchview arch may contain a 'searchpanel' node, but this isn't
         * the concern of the ControlPanel (the SearchPanel will handle it).
         * Ideally, this code should whitelist the tags to take into account
         * instead of blacklisting the others, but with the current (messy)
         * structure of a searchview arch, it's way simpler to do it that way.
         * @private
         */
        _createGroupOfFiltersFromArch() {

            const children = this.parsedArch.children.filter(child => child.tag !== 'searchpanel');
            const preFilters = children.reduce((acc, child) => {
                if (child.tag === 'group') {
                    return acc.concat(child.children.map(this._evalArchChild.bind(this)));
                } else {
                    return [...acc, this._evalArchChild(child)];
                }
            }, []);
            preFilters.push({ tag: 'separator' });

            // create groups and filters
            let currentTag;
            let currentGroup = [];
            let pregroupOfGroupBys = [];

            preFilters.forEach(preFilter => {
                if (preFilter.tag !== currentTag || ['separator', 'field'].includes(preFilter.tag)) {
                    if (currentGroup.length) {
                        if (currentTag === 'groupBy') {
                            pregroupOfGroupBys = pregroupOfGroupBys.concat(currentGroup);
                        } else {
                            this._createGroupOfFilters(currentGroup);
                        }
                    }
                    currentTag = preFilter.tag;
                    currentGroup = [];
                    groupNumber++;
                }
                if (preFilter.tag !== 'separator') {
                    const filter = {
                        type: preFilter.tag,
                        // we need to codify here what we want to keep from attrs
                        // and how, for now I put everything.
                        // In some sence, some filter are active (totally determined, given)
                        // and others are passive (require input(s) to become determined)
                        // What is the right place to process the attrs?
                    };
                    if (filter.type === 'filter' || filter.type === 'groupBy') {
                        filter.groupNumber = groupNumber;
                    }
                    this._extractAttributes(filter, preFilter.attrs);
                    currentGroup.push(filter);
                }
            });

            if (pregroupOfGroupBys.length) {
                this._createGroupOfFilters(pregroupOfGroupBys);
            }
        }

        _createGroupOfTimeRanges() {
            const pregroup = [{ type: 'timeRange' }];
            this._createGroupOfFilters(pregroup);
        }

        /**
         * Bind the store actions to the `actions` key.
         * @private
         */
        _defineActions() {
            // default actions
            const actions = ['updateActionProps'];
            if (this.withSearchBar) {
                // search related actions
                actions.push(
                    'createNewFavorite', 'createNewFilters', 'createNewGroupBy',
                    'activateTimeRange',
                    'clearQuery', 'deactivateGroup',
                    'editFavorite', 'deleteFavorite',
                    'addAutoCompletionValues', 'toggleFilter', 'toggleFilterWithOptions',
                    'updateFilters'
                );
            }
            actions.forEach(action => this.actions[action] = this[action].bind(this));
        }

        /**
         * Bind the store getters to the `getters` key.
         * @private
         */
        _defineGetters() {
            const getters = ['getFiltersOfType', 'getFacets'];
            const getterFirstParams = {
                getters: this.getters,
                state: this.state,
            };
            getters.forEach(getter => this.getters[getter] = this[getter].bind(this, getterFirstParams));
        }

        _enrichFilterCopy(filter, activities) {
            const isActive = Boolean(activities.length);
            const f = Object.assign({ isActive }, filter);

            function _enrichOptions(options) {
                return options.map(o => {
                    const { description, optionId, groupNumber } = o;
                    const isActive = activities.some(a => a.optionId === optionId);
                    return { description, optionId, groupNumber, isActive };
                });
            }

            switch (f.type) {
                case 'filter':
                    if (f.hasOptions) {
                        f.options = _enrichOptions(this.optionGenerators);
                    }
                    break;
                case 'groupBy':
                    if (f.hasOptions) {
                        f.options = _enrichOptions(this.intervalOptions);
                    }
                    break;
                case 'field':
                    f.autoCompleteValues = activities.map(({ label, value }) => {
                        return { label, value };
                    });
                    break;
                case 'timeRange':
                    if (activities.length) {
                        const { fieldName, rangeId, comparisonRangeId } = activities[0];
                        Object.assign(f, this._extractTimeRange({ fieldName, rangeId, comparisonRangeId }));
                    }
                    break;
            }

            return f;
        }

        _evalArchChild(child) {
            if (child.attrs.context) {
                try {
                    const context = pyUtils.eval('context', child.attrs.context);
                    child.attrs.context = context;
                    if (context.group_by) {
                        // let us extract basic data since we just evaluated context
                        // and use a correct tag!
                        child.attrs.fieldName = context.group_by.split(':')[0];
                        child.attrs.defaultInterval = context.group_by.split(':')[1];
                        child.tag = 'groupBy';
                    }
                } catch (e) { }
            }
            if (child.attrs.name in this.searchDefaults) {
                child.attrs.isDefault = true;
                let value = this.searchDefaults[child.attrs.name];
                if (child.tag === 'field') {
                    if (value instanceof Array) {
                        value = value[0];
                    }
                    child.attrs.defaultAutocompleteValue = { value, operator: '=' };
                } else if (child.tag === 'groupBy') {
                    child.attrs.defaultRank = typeof value === 'number' ? value : 100;
                }
            }
            return child;
        }

        /**
         * @private
         * @param {Object} filter
         * @param {Object} attrs
         */
        _extractAttributes(filter, attrs) {
            filter.isDefault = attrs.isDefault;
            filter.description = attrs.string || attrs.help || attrs.name || attrs.domain || 'Ω';
            if (attrs.invisible) {
                filter.invisible = true;
            }
            switch (filter.type) {
                case 'filter':
                    if (attrs.context) {
                        filter.context = attrs.context;
                    }
                    if (attrs.date) {
                        filter.hasOptions = true;
                        filter.fieldName = attrs.date;
                        filter.fieldType = this.fields[attrs.date].type;
                        filter.defaultOptionId = attrs.default_period || DEFAULT_PERIOD;
                        filter.basicDomains = this._getDateFilterBasicDomains(filter);
                    } else {
                        filter.domain = attrs.domain;
                    }
                    if (filter.isDefault) {
                        filter.defaultRank = -5;
                    }
                    break;
                case 'groupBy':
                    filter.fieldName = attrs.fieldName;
                    filter.fieldType = this.fields[attrs.fieldName].type;
                    if (['date', 'datetime'].includes(filter.fieldType)) {
                        filter.hasOptions = true;
                        filter.defaultOptionId = attrs.defaultInterval || DEFAULT_INTERVAL;
                    }
                    if (filter.isDefault) {
                        filter.defaultRank = attrs.defaultRank;
                    }
                    break;
                case 'field':
                    const field = this.fields[attrs.name];
                    filter.fieldName = attrs.name;
                    filter.fieldType = field.type;
                    if (attrs.domain) {
                        filter.domain = attrs.domain;
                    }
                    if (attrs.filter_domain) {
                        filter.filterDomain = attrs.filter_domain;
                    } else if (attrs.operator) {
                        filter.operator = attrs.operator;
                    }
                    if (attrs.context) {
                        filter.context = attrs.context;
                    }
                    if (filter.isDefault) {
                        filter.defaultRank = -10;
                        filter.defaultAutocompleteValue = attrs.defaultAutocompleteValue;
                        this._prepareDefaultLabel(filter);
                    }
                    break;
            }
            if (filter.fieldName) {
                const { string } = this.fields[filter.fieldName];
                filter.description = string;
            }
        }

        _prepareDefaultLabel(filter) {
            const { fieldType,  fieldName, defaultAutocompleteValue } = filter;
            const { selection, context, relation } = this.fields[fieldName];
            if (fieldType === 'selection') {
                defaultAutocompleteValue.label = selection.find(
                    ([val, _]) => val === defaultAutocompleteValue.value
                )[1];
            } else if (fieldType === 'many2one') {
                const promise = this.env.services.rpc({
                    args: [defaultAutocompleteValue.value],
                    context: context,
                    method: 'name_get',
                    model: relation,
                }).then(results => {
                    defaultAutocompleteValue.label = results[0][1];
                }).guardedCatch(() => {
                    defaultAutocompleteValue.label = defaultAutocompleteValue.value;
                });
                this.labelPromisses.push(promise);
            } else {
                defaultAutocompleteValue.label = defaultAutocompleteValue.value;
            }
        }

        /**
         * @private
         * @param {string} fieldName
         * @param {number} rangeId
         * @param {number} comparisonRangeId
         */
        _extractTimeRange({ fieldName, rangeId, comparisonRangeId }) {
            const field = this.fields[fieldName];
            const timeRange = {
                fieldName,
                fieldDescription: field.string || fieldName,
                rangeId,
                range: Domain.prototype.constructDomain(fieldName, rangeId, field.type),
                rangeDescription: this.env._t(TIME_RANGE_OPTIONS[rangeId].description),
            };
            if (comparisonRangeId) {
                timeRange.comparisonRangeId = comparisonRangeId;
                timeRange.comparisonRange = Domain.prototype.constructDomain(fieldName, rangeId, field.type, comparisonRangeId);
                timeRange.comparisonRangeDescription = this.env._t(COMPARISON_TIME_RANGE_OPTIONS[comparisonRangeId].description);
            }
            return timeRange;
        }

        /**
         * Return the domain resulting from the combination of the auto-completion
         * values of a field filter.
         * @private
         * @param {Object} filter
         * @param {string} type field type
         * @returns {string}
         */
        _getAutoCompletionFilterDomain(filter, filterActivities) {
            // don't work yet!
            const domains = filterActivities.map(({ label, value, operator }) => {
                let domain;
                if (filter.filterDomain) {
                    domain = Domain.prototype.stringToArray(
                        filter.filterDomain,
                        {
                            self: label,
                            raw_value: value,
                        }
                    );
                } else if (operator) {
                    domain = [[filter.fieldName, operator, value]];
                } else {
                    // Create new domain
                    let operator;
                    if (filter.operator) {
                        operator = filter.operator;
                    } else if (['char', 'text', 'many2many', 'one2many', 'html'].includes(filter.fieldType)) {
                        operator = 'ilike';
                    } else {
                        operator = "=";
                    }
                    domain = [[filter.fieldNname, operator, value]];
                }
                return Domain.prototype.arrayToString(domain);
            });
            return pyUtils.assembleDomains(domains, 'OR');
        }

        /**
         * @private
         * @returns {Object}
         */
        _getContext(groups) {
            const types = ['filter', 'favorite', 'field'];
            const filterContexts = groups.reduce((acc, group) => {
                if (types.includes(group.type)) {
                    acc.concat(this._getGroupContexts(group));
                }
                return acc;
            }, []);

            const userContext = this.env.session.user_context;
            try {
                return pyUtils.eval('contexts', [this.actionContext, ...filterContexts], userContext);
            } catch (err) {
                throw new Error(
                    this.env._t("Failed to evaluate search context") + ":\n" +
                    JSON.stringify(err)
                );
            }
        }

        /**
         * Construct an object containing constious domains based on this.referenceMoment and
         * the field associated with the provided date filter.
         * @private
         * @param {Object} filter
         * @returns {Object}
         */
        _getDateFilterBasicDomains({ fieldName, fieldType }) {

            const _constructBasicDomain = (y, o) => {
                const addParam = Object.assign({}, y.addParam, o ? o.addParam : {});
                const setParam = Object.assign({}, y.setParam, o ? o.setParam : {});
                const granularity = o ? o.granularity : y.granularity;
                const date = this.referenceMoment.clone().set(setParam).add(addParam);
                let leftBound = date.clone().startOf(granularity);
                let rightBound = date.clone().endOf(granularity);

                if (fieldType === 'date') {
                    leftBound = leftBound.format("YYYY-MM-DD");
                    rightBound = rightBound.format("YYYY-MM-DD");
                } else {
                    leftBound = leftBound.utc().format("YYYY-MM-DD HH:mm:ss");
                    rightBound = rightBound.utc().format("YYYY-MM-DD HH:mm:ss");
                }
                const domain = Domain.prototype.arrayToString([
                    '&',
                    [fieldName, ">=", leftBound],
                    [fieldName, "<=", rightBound]
                ]);
                const description = o ? o.description + " " + y.description : y.description;

                return { domain, description };
            };

            const domains = {};
            this.optionGenerators.filter(y => y.groupNumber === 2).forEach(y => {
                domains[y.optionId] = _constructBasicDomain(y);
                this.optionGenerators.filter(y => y.groupNumber === 1).forEach(o => {
                    domains[y.optionId + "__" + o.optionId] = _constructBasicDomain(y, o);
                });
            });
            return domains;
        }

        /**
         * Compute the string representation of the current domain associated to a date filter
         * starting from its currentOptionIds.
         * @private
         * @param {Object} filter
         * @returns {string}
         */
        _getDateFilterDomain(filter, filterActivities) {
            const domains = [];
            const yearIds = [];
            const otherOptionIds = [];
            filterActivities.forEach(({ optionId }) => {
                if (YEAR_OPTIONS[optionId]) {
                    yearIds.push(optionId);
                } else {
                    otherOptionIds.push(optionId);
                }
            });
            // the following case corresponds to years selected only
            if (otherOptionIds.length === 0) {
                yearIds.forEach(yearId => {
                    const d = filter.basicDomains[yearId];
                    domains.push(d.domain);
                });
            } else {
                otherOptionIds.forEach(optionId => {
                    yearIds.forEach(yearId => {
                        const d = filter.basicDomains[`${yearId}__${optionId}`];
                        domains.push(d.domain);
                    });
                });
            }
            return pyUtils.assembleDomains(domains, 'OR');
        }

        /**
         * Return the string or array representation of a domain created by combining
         * appropriately (with an 'AND') the domains coming from the active groups.
         * @private
         * @param {boolean} [evaluation=true]
         * @returns {string} the string representation of a domain
         */
        _getDomain(groups, evaluation = true) {
            const types = ['filter', 'favorite', 'field'];
            const domains = groups.reduce((acc, group) => {
                if (types.includes(group.type)) {
                    acc.push(this._getGroupDomain(group));
                }
                return acc;
            }, []);
            let filterDomain = pyUtils.assembleDomains(domains, 'AND');

            if (evaluation) {
                const userContext = this.env.session.user_context;
                try {
                    return pyUtils.eval('domains', [this.actionDomain, filterDomain], userContext);
                } catch (err) {
                    throw new Error(
                        this.env._t("Failed to evaluate search domain") + ":\n" +
                        JSON.stringify(err)
                    );
                }
            } else {
                return filterDomain;
            }
        }

        /**
        * Return the context of the provided filter.
        * @private
        * @param {Object} filter
        * @returns {Object} context
        */
        _getFilterContext(filter, filterActivities) {
            let context = filter.context || {};
            // for <field> nodes, a dynamic context (like context="{'field1': self}")
            // should set {'field1': [value1, value2]} in the context
            if (filter.type === 'field' && filter.context) {
                context = pyUtils.eval('context',
                    filter.context,
                    { self: filterActivities.map(({ value }) => value) },
                );
            }
            // the following code aims to restore this:
            // https://github.com/odoo/odoo/blob/12.0/addons/web/static/src/js/views/search/search_inputs.js#L498
            // this is required for the helpdesk tour to pass
            // this seems weird to only do that for m2o fields, but a test fails if
            // we do it for other fields (my guess being that the test should simply
            // be adapted)
            if (filter.type === 'field' && filter.isDefault && filter.fieldType === 'many2one') {
                context[`default_${filter.fieldName}`] = filter.defaultAutocompleteValue.value;
            }
            return context;
        }

        /**
         * Compute (if possible) the domain of the provided filter.
         * @private
         * @param {Object} filter
         * @returns {string} domain, string representation of a domain
         */
        _getFilterDomain(filter, filterActivities) {
            if (filter.type === 'filter' && filter.hasOptions) {
                return this._getDateFilterDomain(filter, filterActivities);
            } else if (filter.type === 'field') {
                return this._getAutoCompletionFilterDomain(filter, filterActivities);
            }
            return filter.domain;
        }

        /**
         * Compute the groupBys (if possible) of the provided filter.
         * @private
         * @param {Array} filterId
         * @param {Array} [optionId]
         * @returns {string[]} groupBys
         */
        _getFilterGroupBys(filter, filterActivities) {
            if (filter.type === 'groupBy') {
                let groupBy = filter.fieldName;
                const { optionId } = filterActivities[0];
                if (optionId) {
                    groupBy = `${groupBy}:${optionId}`;
                }
                return [groupBy];
            } else {
                return filter.groupBys;
            }
        }

        /**
         * Return the concatenation of groupBys comming from the active filters.
         * The array state.query encoding the order in which the groups have been
         * activated, the results respect the appropriate logic: the groupBys
         * coming from an active favorite (if any) come first, then come the
         * groupBys comming from the active filters of type 'groupBy'.
         * @private
         * @returns {string[]}
         */
        _getGroupBy(groups) {
            const groupBys = groups.reduce((acc, group) => {
                if (['groupBy', 'favorite'].includes(group.type)) {
                    acc = acc.concat(this._getGroupGroupBys(group));
                }
                return acc;
            }, []);
            const groupBy = groupBys.length ? groupBys : (this.actionContext.group_by || []);
            return typeof groupBy === 'string' ? [groupBy] : groupBy;
        }

        /**
         * Return the list of the contexts of the filters acitve in the given
         * group.
         * @private
         * @param {Object} group
         * @returns {Object[]}
         */
        _getGroupContexts(group) {
            const contexts = group.activities.reduce((acc, { filter, filterActivities }) => {
                const filterContext = this._getFilterContext(filter, filterActivities);
                acc.push(filterContext);
                return acc;
            }, []);
            return contexts;
        }

        /**
         * Return the string representation of a domain created by combining
         * appropriately (with an 'OR') the domains coming from the filters
         * active in the given group.
         * @private
         * @param {Object} group
         * @returns {string} string representation of a domain
         */
        _getGroupDomain(group) {
            const domains = group.activities.map(({ filter, filterActivities }) => {
                return this._getFilterDomain(filter, filterActivities);
            });
            return pyUtils.assembleDomains(domains, 'OR');
        }

        /**
         * Return the groupBys coming form the filters active in the given group.
         * @private
         * @param {Object} group
         * @returns {string[]}
         */
        _getGroupGroupBys(group) {
            const groupBys = group.activities.reduce((acc, { filter, filterActivities }) => {
                acc = acc.concat(this._getFilterGroupBys(filter, filterActivities));
                return acc;
            }, []);
            return groupBys;
        }

        _getGroups() {
            const groups = this.state.query.reduce((acc, queryElem) => {
                const { groupId, filterId } = queryElem;
                let group = acc.find(group => group.id === groupId);
                const filter = this.state.filters[filterId];
                if (!group) {
                    const { type } = filter;
                    group = {
                        id: groupId,
                        type,
                        activities: []
                    };
                    acc.push(group);
                }
                group.activities.push(queryElem);
                return acc;
            }, []);

            groups.forEach(g => this._mergeActivities(g));

            return groups;
        }

        /**
         * Used to get the key orderedBy of a favorite.
         * @private
         * @returns {(Object[]|undefined)} orderedBy
         */
        _getOrderedBy(groups) {
            let orderedBy;
            const lastFavoriteGroup = groups.reduce((last, group) => {
                if (group.type === 'favorite') {
                    last = group;
                }
                return last;
            }, false);
            if (lastFavoriteGroup) {
                const { filter } = lastFavoriteGroup.activities[0];
                if (filter.orderedBy && filter.orderedBy.length) {
                    orderedBy = filter.orderedBy;
                }
            }
            return orderedBy;
        }

        /**
         * @private
         * @param {boolean} [evaluation=false]
         * @returns {Object}
         */
        _getTimeRanges(evaluation = false) {
            let timeRanges = this.state.query.reduce((last, queryElem) => {
                const { filterId } = queryElem;
                const filter = this.state.filters[filterId];
                if (filter.type === 'timeRange') {
                    last = this._extractTimeRange(queryElem);
                } else if (filter.type === 'favorite' && filter.timeRanges) {
                    // we want to make sure that last is not observed! (it is change below in case of evaluation)
                    const { fieldName, rangeId, comparisonRangeId }  = filter.timeRanges;
                    last = this._extractTimeRange({ fieldName, rangeId, comparisonRangeId });
                }
                return last;
            }, false);

            if (timeRanges) {
                if (evaluation) {
                    timeRanges.range = Domain.prototype.stringToArray(timeRanges.range);
                    if (timeRanges.comparisonRangeId) {
                        timeRanges.comparisonRange = Domain.prototype.stringToArray(timeRanges.comparisonRange);
                    }
                }
                return timeRanges;
            }
        }

        /**
         * @private
         * @param {Object} irFilter
         * @returns {Object}
         */
        _irFilterToFavorite(irFilter) {
            const userId = irFilter.user_id ? irFilter.user_id[0] : false;
            const groupNumber = userId ? FAVORITE_PRIVATE_GROUP : FAVORITE_SHARED_GROUP;
            const context = pyUtils.eval('context', irFilter.context, this.env.session.user_context);
            let groupBys = [];
            if (context.group_by) {
                groupBys = context.group_by;
                delete context.group_by;
            }
            let timeRanges;
            if (context.time_ranges) {
                const { field, range, comparisonRange } = context.time_ranges;
                timeRanges = this._extractTimeRange({ fieldName: field, rangeId: range, comparisonRangeId: comparisonRange });
                delete context.time_ranges;
            }
            const sort = JSON.parse(irFilter.sort);
            const orderedBy = sort.map(order => {
                let fieldName;
                let asc;
                const sqlNotation = order.split(' ');
                if (sqlNotation.length > 1) {
                    // regex: \fieldName (asc|desc)?\
                    fieldName = sqlNotation[0];
                    asc = sqlNotation[1] === 'asc';
                } else {
                    // legacy notation -- regex: \-?fieldName\
                    fieldName = order[0] === '-' ? order.slice(1) : order;
                    asc = order[0] === '-' ? false : true;
                }
                return {
                    asc: asc,
                    name: fieldName,
                };
            });
            const favorite = {
                context,
                description: irFilter.name,
                domain: irFilter.domain,
                editable: true,
                groupBys,
                groupNumber,
                isDefault: irFilter.is_default,
                orderedBy,
                removable: true,
                serverSideId: irFilter.id,
                type: 'favorite',
                userId,
            };
            if (timeRanges) {
                favorite.timeRanges = timeRanges;
            }
            return favorite;
        }

        /**
         * @private
         * @param {Object} favorite
         * @returns {Object}
         */
        _favoriteToIrFilter(favorite) {
            const irFilter = {
                action_id: this.actionId,
                model_id: this.modelName,
            };

            // ir.filter fields
            if ('description' in favorite) {
                irFilter.name = favorite.description;
            }
            if ('domain' in favorite) {
                irFilter.domain = favorite.domain;
            }
            if ('isDefault' in favorite) {
                irFilter.is_default = favorite.isDefault;
            }
            if ('orderedBy' in favorite) {
                const sort = favorite.orderedBy.map(
                    ob => ob.name + (ob.asc === false ? " desc" : "")
                );
                irFilter.sort = JSON.stringify(sort);
            }
            if ('serverSideId' in favorite) {
                irFilter.id = favorite.serverSideId;
            }
            if ('userId' in favorite) {
                irFilter.user_id = favorite.userId;
            }

            // Context
            const context = Object.assign({}, favorite.context);
            if ('groupBys' in favorite) {
                context.group_by = favorite.groupBys;
            }
            if ('timeRanges' in favorite) {
                const { fieldName, rangeId, comparisonRangeId } = favorite.timeRanges;
                context.time_ranges = {
                    field: fieldName,
                    range: rangeId,
                    comparisonRange: comparisonRangeId,
                };
            }
            if (Object.keys(context).length) {
                irFilter.context = context;
            }

            console.log({ context: irFilter.context });

            return irFilter;
        }

        _mergeActivities(group) {
            const { activities, type } = group;
            let res = [];
            switch (type) {
                case 'groupBy':
                    for (const activity of activities) {
                        const { filterId } = activity;
                        res.push({
                            filter: this.state.filters[filterId],
                            filterActivities: [activity]
                        });
                    }
                    break;
                case 'filter':
                    for (const activity of activities) {
                        const { filterId } = activity;
                        let a = res.find(({ filter }) => filter.id === filterId);
                        if (!a) {
                            a = {
                                filter: this.state.filters[filterId],
                                filterActivities: []
                            };
                            res.push(a);
                        }
                        a.filterActivities.push(activity);
                    }
                    break;
                case 'field':
                case 'timeRange':
                case 'favorite':
                    // all activities in the group have same filterId
                    const { filterId } = group.activities[0];
                    const filter = this.state.filters[filterId];
                    res.push({
                        filter,
                        filterActivities: group.activities
                    });
                    break;
            }
            group.activities = res;
        }

        /**
         * @private
         */
        _prepareInitialState() {
            Object.assign(this.state, {
                filters: {},
                query: [],
            });

            this._addFilters();
            this._activateFilters();
        }

        /**
         * Compute the search Query and save it as an ir.filter in db.
         * No evaluation of domains is done in order to keep them dynamic.
         * If the operation is successful, a new filter of type 'favorite' is
         * created and activated.
         * @private
         * @param {Object} preFilter
         * @returns {Object}
         */
        async _saveQuery(preFilter) {
            const groups = this._getGroups();

            const userContext = this.env.session.user_context;
            const controllerQueryParams = await new Promise(resolve => {
                this.trigger('get_controller_query_params', resolve);
            });

            const queryContext = this._getContext(groups);
            const context = pyUtils.eval(
                'contexts',
                [userContext, controllerQueryParams.context, queryContext]
            );
            for (const key in userContext) {
                delete context[key];
            }

            const requireEvaluation = false;
            const domain = this._getDomain(groups, requireEvaluation);
            const groupBys = this._getGroupBy(groups);
            const timeRanges = this._getTimeRanges(requireEvaluation);
            const orderedBy = controllerQueryParams.orderedBy ?
                controllerQueryParams.orderedBy :
                (this._getOrderedBy(groups) || []);

            const userId = preFilter.isShared ? false : this.env.session.uid;
            delete preFilter.isShared;

            Object.assign(preFilter, {
                context,
                domain,
                editable: true,
                groupBys,
                groupNumber: userId ? FAVORITE_PRIVATE_GROUP : FAVORITE_SHARED_GROUP,
                orderedBy,
                removable: true,
                userId,
            });
            if (timeRanges) {
                preFilter.timeRanges = timeRanges;
            }
            const irFilter = this._favoriteToIrFilter(preFilter);
            const serverSideId = await dataManager.create_filter(irFilter);

            preFilter.serverSideId = serverSideId;

            return preFilter;
        }

        /**
         * TODO: doc
         * @private
         * @param {Object} config
         */
        _setProperties(config) {
            this.modelName = config.modelName;
            this.actionDomain = config.actionDomain;
            this.actionContext = config.actionContext;
            this.actionId = config.actionId;
            this.withSearchBar = 'withSearchBar' in config ? config.withSearchBar : true;
            this.searchMenuTypes = config.searchMenuTypes || [];

            this.searchDefaults = [];
            for (const key in this.actionContext) {
                const match = /^search_default_(.*)$/.exec(key);
                if (match) {
                    this.searchDefaults[match[1]] = this.actionContext[key];
                    delete this.actionContext[key];
                }
            }
            this.labelPromisses = [];

            const viewInfo = config.viewInfo || {};

            this.parsedArch = this._cleanArch(parseArch(viewInfo.arch || '<search/>'));
            this.fields = viewInfo.fields || {};
            this.favoriteFilters = viewInfo.favoriteFilters || [];
            this.activateDefaultFavorite = config.activateDefaultFavorite;

            this.dynamicFilters = config.dynamicFilters || [];

            this.referenceMoment = moment();
            this.optionGenerators = Object.values(OPTION_GENERATORS).map(option => {
                const description = option.description ?
                    this.env._t(option.description) :
                    this.referenceMoment.clone()
                        .set(option.setParam)
                        .add(option.addParam)
                        .format(option.format);
                return Object.create(option, { description: { value: description } });
            });
            this.intervalOptions = INTERVAL_OPTIONS.map(
                o => Object.create(o, { description: { value: o.description.toString() } })
            );
        }

    }

    return ControlPanelStore;
});
