odoo.define('web.controlPanelStore', function (require) {
    "use strict";

    const controlPanelParameters = require('web.controlPanelParameters');
    const dataManager = require('web.data_manager');
    const Domain = require('web.Domain');
    const searchBarAutocompleteRegistry = require('web.search_bar_autocomplete_sources_registry');
    const pyUtils = require('web.py_utils');

    const { parseArch } = require('web.viewUtils');

    const DEFAULT_PERIOD = controlPanelParameters.DEFAULT_PERIOD;
    const DEFAULT_TIMERANGE = controlPanelParameters.DEFAULT_TIMERANGE;
    let TIME_RANGE_OPTIONS = controlPanelParameters.TIME_RANGE_OPTIONS;
    let COMPARISON_TIME_RANGE_OPTIONS = controlPanelParameters.COMPARISON_TIME_RANGE_OPTIONS;
    const OPTION_GENERATORS = controlPanelParameters.OPTION_GENERATORS;
    const INTERVAL_OPTIONS = controlPanelParameters.INTERVAL_OPTIONS;
    const YEAR_OPTIONS = controlPanelParameters.YEAR_OPTIONS;

    //-----------------------------------------------------------------------------------------------
    // Helpers
    //-----------------------------------------------------------------------------------------------

    function _activateFilters({ state }, activateDefaultFavorite) {
        // not sure activateDefaultFavorite is still usefull with new specs on favorites
        const defaultFilterIds = [];
        const defaultFavoriteIds = [];
        for (const filter of Object.values(state.filters)) {
            if (filter.isDefault) {
                if (filter.type === 'favorite') {
                    defaultFavoriteIds.push(filter.id);
                } else {
                    defaultFilterIds.push(filter.id);
                }
            }
        }
        // won't work yet!
        // defaultFilterIds.forEach(id => actions.toggleFilter(id));
        // if (activateDefaultFavorite) {
        //     defaultFavoriteIds.forEach(id => actions.toggleFilter(id));
        // }
        // TODO: self._activateDefaultTimeRanges(params.timeRanges);

    }

    /**
     * @private
     */
    function _createGroupOfDynamicFilters({ state }, dynamicFilters) {
        const dynamicFiltersPregroup = dynamicFilters.map(filter => {
            return {
                description: filter.description,
                domain: JSON.stringify(filter.domain),
                isDefault: true,
                type: 'filter',
            };
        });
        actions.createGroupOfFilters({ state }, dynamicFiltersPregroup, 'filter');
    }

    /**
     * Add a group of type 'timeRange' in this.groups and generate a filter
     * of the same type for each suitable field in this.fields. The new filters
     * are put in the new group.
     *
     * @private
     */
    function _createGroupOfTimeRanges({ state }, fields) {
        // Tricks to avoid losing information on filter descriptions in control panel model configuration
        const timeRangeOptions = TIME_RANGE_OPTIONS.map(function (option) {
            return _.extend({}, option, { description: option.description.toString() });
        });
        const comparisonTimeRangeOptions = COMPARISON_TIME_RANGE_OPTIONS.map(function (option) {
            return _.extend({}, option, { description: option.description.toString() });
        });

        const timeRangesPregroup = [];
        // we could use Object.values (check if field name is on field)
        Object.keys(fields).forEach(function (fieldName) {
            var field = fields[fieldName];
            var fieldType = field.type;
            if (_.contains(['date', 'datetime'], fieldType) && field.sortable) {
                timeRangesPregroup.push({
                    type: 'timeRange',
                    description: field.string,
                    fieldName: fieldName,
                    fieldType: fieldType,
                    timeRangeId: false,
                    comparisonTimeRangeId: false,
                    defaultTimeRangeId: DEFAULT_TIMERANGE,
                    timeRangeOptions: timeRangeOptions,
                    comparisonTimeRangeOptions: comparisonTimeRangeOptions,
                });
            }
        });
        actions.createGroupOfFilters({ state }, timeRangesPregroup, 'timeRange');
    }

    /**
     * @private
     * @param {Object} child parsed arch node
     * @returns {Object}
     */
    function _evalArchChild(child) {
        if (child.attrs.context) {
            try {
                const context = pyUtils.eval('context', child.attrs.context);
                if (context.group_by) {
                    // let us extract basic data since we just evaluated context
                    // and use a correct tag!
                    child.tag = 'groupBy';
                    child.attrs.fieldName = context.group_by.split(':')[0];
                    child.attrs.defaultInterval = context.group_by.split(':')[1];
                }
            } catch (e) { }
        }
        return child;
    }

    /**
     * @private
     * @param {Object} filter
     * @param {Object} attrs
     */
    function _extractAttributes(filter, attrs, extraParams, env) {

        const { searchDefaults, fields, optionGenerators, intervalOptions} = extraParams;

        filter.isDefault = searchDefaults[attrs.name] ? true : false;
        filter.description = attrs.string ||
            attrs.help ||
            attrs.name ||
            attrs.domain ||
            'Ω';
        if (filter.type === 'filter') {
            if (filter.isDefault) {
                filter.defaultRank = -5;
            }
            filter.domain = attrs.domain;
            filter.context = pyUtils.eval('context', attrs.context);
            if (attrs.date) {
                filter.fieldName = attrs.date;
                filter.fieldType = fields[attrs.date].type;
                filter.hasOptions = true;
                filter.options = optionGenerators;
                filter.defaultOptionId = attrs.default_period ||
                    DEFAULT_PERIOD;
                filter.currentOptionIds = new Set();
                filter.basicDomains = _getDateFilterBasicDomains(filter, extraParams);
            }
            if (attrs.invisible) {
                filter.invisible = true;
            }
        } else if (filter.type === 'groupBy') {
            if (filter.isDefault) {
                const val = searchDefaults[attrs.name];
                filter.defaultRank = typeof val === 'number' ? val : 100;
            }
            filter.fieldName = attrs.fieldName;
            filter.fieldType = fields[attrs.fieldName].type;
            if (['date', 'datetime'].includes(filter.fieldType)) {
                filter.hasOptions = true;
                filter.options = intervalOptions;
                filter.defaultOptionId = attrs.defaultInterval ||
                    DEFAULT_INTERVAL;
                filter.currentOptionIds = new Set();
            }
        } else if (filter.type === 'field') {
            if (filter.isDefault) {
                filter.defaultRank = -10;
            }
            const field = fields[attrs.name];
            filter.attrs = attrs;
            filter.autoCompleteValues = [];
            if (filter.isDefault) {
                // on field, default can be used with a value
                filter.defaultValue = searchDefaults[filter.attrs.name];
                _processFieldFilter(filter, field, env);
            }
            if (!attrs.string) {
                attrs.string = field.string;
            }
        }
    }

    /**
     * Parse the arch of a 'search' view and create corresponding filters and groups
     *
     * @private
     * @param {Object} state // ?
     * @param {Object} arch arch with root node <search>
     * @param {Object} extraParams
     */
    function _extractGroupOfFiltersFromArch({ state }, arch, extraParams, env) {
        // A searchview arch may contain a 'searchpanel' node, but this isn't
        // the concern of the ControlPanelView (the SearchPanel will handle it).
        // Ideally, this code should whitelist the tags to take into account
        // instead of blacklisting the others, but with the current (messy)
        // structure of a searchview arch, it's way simpler to do it that way.

        // get prefilters

        const children = arch.children.filter(child => child.tag !== 'searchpanel');
        const preFilters = children.reduce((acc, child) => {
            if (child.tag === 'group') {
                acc = acc.concat(children.map(_evalArchChild));
            } else {
                acc.push(_evalArchChild(child));
            }
            return acc;
        }, []);
        preFilters.push({ tag: 'separator' });

        // create groups and filters

        let currentTag;
        let currentGroup = [];
        let groupOfGroupBys = [];
        let groupNumber = 1;

        preFilters.forEach(preFilter => {
            if (preFilter.tag !== currentTag || ['separator', 'field'].includes(preFilter.tag)) {
                if (currentGroup.length) {
                    if (currentTag === 'groupBy') {
                        groupOfGroupBys = groupOfGroupBys.concat(currentGroup);
                    } else {
                        actions.createGroupOfFilters({ state }, currentGroup, currentTag);
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
                _extractAttributes(filter, preFilter.attrs, extraParams, env);
                currentGroup.push(filter);
            }
        });
        if (groupOfGroupBys.length) {
            actions.createGroupOfFilters({ state }, groupOfGroupBys, 'groupBy');
        }
    }

    /**
     * @private
     * @param {Object} filter
     * @returns {string} domain
     */
    function _getAutoCompletionFilterDomain(filter, field, env) {
        var domain = "";
        // TODO: should not do that, the domain logic should be put somewhere else
        var Obj = searchBarAutocompleteRegistry.getAny([filter.attrs.widget, field.type]);
        if (Obj) {
            var obj = new (Obj)(this, filter, field, env.actionContext);
            domain = obj.getDomain(filter.autoCompleteValues);
        }
        return domain;
    }

    /**
     * Constructs an object containing constious domains based on this.referenceMoment and
     * the field associated with the provided date filter.
     *
     * @private
     * @param {Object} filter
     * @returns {Object}
     */
    function _getDateFilterBasicDomains({ fieldName, fieldType } , { referenceMoment, optionGenerators }) {
        const _constructBasicDomain = (y, o) => {
            const addParam = Object.assign({}, y.addParam, o ? o.addParam : {});
            const setParam = Object.assign({}, y.setParam, o ? o.setParam : {});
            const granularity = o ? o.granularity : y.granularity;
            const date = referenceMoment.clone().set(setParam).add(addParam);
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

            let description;
            if (o) {
                description = o.description + " " + y.description;
            } else {
                description = y.description;
            }

            return { domain, description };
        };

        const domains = {};
        optionGenerators.filter(y => y.groupId === 2).forEach(y => {
            domains[y.optionId] = _constructBasicDomain(y);
            optionGenerators.filter(y => y.groupId === 1).forEach(o => {
                domains[y.optionId + "__" + o.optionId] = _constructBasicDomain(y, o);
            });
        });
        return domains;
    }

    /**
     * Load custom filters in db, then create a group of type 'favorite' and a
     * filter of type 'favorite' for each loaded custom filters.
     * The new filters are put in the new group.
     * Finally, if there exists (a necessarily unique) default favorite, it is activated
     * if this.activateDefaultFavorite is true.
     *
     * @private
     * @returns {Promise}
     */
    async function _loadFavorites({ state, env }) {
        debugger
        // TODO: see with AAB how use dataManager -> should be in env somewhere
        // const favorites = await dataManager._cache.load_filters(env.modelName, env.actionId);
        const favorites = [];

        const pregroupOfFavorites = favorites.map(favorite => {
            var userId = favorite.user_id ? favorite.user_id[0] : false;
            var groupNumber = userId ? 1 : 2;
            var context = pyUtils.eval('context', favorite.context, env.session.user_context);
            var groupBys = [];
            if (context.group_by) {
                groupBys = context.group_by;
                delete context.group_by;
            }
            var sort = JSON.parse(favorite.sort);
            var orderedBy = sort.map(function (order) {
                var fieldName;
                var asc;
                var sqlNotation = order.split(' ');
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
                    name: fieldName,
                    asc: asc,
                };
            });
            return {
                type: 'favorite',
                description: favorite.name,
                isRemovable: true,
                groupNumber: groupNumber,
                isDefault: favorite.is_default,
                domain: favorite.domain,
                groupBys: groupBys,
                // we want to keep strings as long as possible
                context: favorite.context,
                orderedBy: orderedBy,
                userId: userId,
                serverSideId: favorite.id,
            };
        });
        actions.createGroupOfFilters({ state }, pregroupOfFavorites, 'favorite');
    }

    /**
     * @private
     * @param {Object} filter
     */
    async function _processFieldFilter(filter, field, env) {
        var value = filter.defaultValue;
        if (field.type === 'many2one') {
            if (value instanceof Array) {
                // M2O search fields do not currently handle multiple default values
                // there are many cases of {search_default_$m2ofield: [id]}, need
                // to handle this as if it were a single value.
                value = value[0];
            }
            const result = await env.services.rpc({
                model: field.relation,
                method: 'name_get',
                args: [value],
                context: env.context,
            });
            var autocompleteValue = {
                label: result[0][1],
                value: value,
            };
            filter.autoCompleteValues.push(autocompleteValue);
            filter.domain = _getAutoCompletionFilterDomain(filter, field, env);
            filter.isReady = true;
        } else {
            var autocompleteValue;
            if (field.type === 'selection') {
                var match = _.find(field.selection, function (sel) {
                    return sel[0] === value;
                });
                autocompleteValue = {
                    label: match[1],
                    value: match[0],
                };
            } else {
                autocompleteValue = {
                    label: String(value),
                    value: value,
                };
            }
            filter.autoCompleteValues.push(autocompleteValue);
            filter.domain = _getAutoCompletionFilterDomain(filter, field);
            filter.isReady = true;
        }
    }

    //-----------------------------------------------------------------------------------------------
    // Actions
    //-----------------------------------------------------------------------------------------------

    const actions = {

        /**
         * Using a list (a 'pregroup') of 'prefilters', create a new group in state.groups and a new
         * filter in state.filters for each prefilter. The new filters are part of the new group.
         *
         * @private
         * @param {Object[]} pregroup, list of 'prefilters'
         * @param {string} type
         */
        createGroupOfFilters: function ({ state }, pregroup, type) {
            const groupId = _.uniqueId('__group__');
            state.groups[groupId] = {
                id: groupId,
                type: type,
                activeFilterIds: [],
            };
            pregroup.forEach(filter => {
                const id = _.uniqueId('__filter__');
                filter.id = id;
                filter.groupId = groupId;
                state.filters[id] = filter;
            });
        },

    };

    //-----------------------------------------------------------------------------------------------
    // Getters
    //-----------------------------------------------------------------------------------------------

    const getters = {

        /**
         * Returns the id of the group with the provided type
         *
         * @param {'groupBy'|'favorite'|'timeRange'} type
         * @returns {string|undefined}
         */
        getGroupIdOfType: function ({ state }, type) {
            const group = state.groups.find(g => g.type === type);
            if (group) {
                return group.id;
            }
        },

        /**
         * Returns an array containing copies of the filter of the provided type.
         *
         * @param {string} type
         * @returns {Object[]}
         */
        getFiltersOfType: function({ state }, type) {
            const fs = []
            for (const filter of Object.values(state.filters)) {
                if (filter.type === type) {
                    const group = state.groups[filter.groupId];
                    const isActive = group.activeFilterIds.some(id => id[0] === filter.id);
                    const f = Object.assign({ isActive }, filter);
                    fs.push(f);
                }
            }
            if (type === 'favorite') {
                // TODO: no more underscore
                _.sortBy(fs, 'groupNumber');
            }
            return fs;
        },

        /**
         * @returns {Object} An object called search query with keys domain, groupBy,
         *                   context, orderedBy.
         */
        getQuery: function ({ state, env }) {
            return {
                context: {},
                domain: [],
                groupBy: [],
                orderedBy: [],
            }
            // var userContext = env.session.user_context;
            // var context = _.extend(
            //     pyUtils.eval('contexts', this._getQueryContext(), userContext),
            //     this._getTimeRangeMenuData(true)
            // );
            // var domain = Domain.prototype.stringToArray(this._getDomain(), userContext);
            // // this must be done because pyUtils.eval does not know that it needs to evaluate domains within contexts
            // if (context.timeRangeMenuData) {
            //     if (typeof context.timeRangeMenuData.timeRange === 'string') {
            //         context.timeRangeMenuData.timeRange = pyUtils.eval('domain', context.timeRangeMenuData.timeRange);
            //     }
            //     if (typeof context.timeRangeMenuData.comparisonTimeRange === 'string') {
            //         context.timeRangeMenuData.comparisonTimeRange = pyUtils.eval('domain', context.timeRangeMenuData.comparisonTimeRange);
            //     }
            // }
            // var action_context = this.actionContext;
            // var results = pyUtils.eval_domains_and_contexts({
            //     domains: [this.actionDomain].concat([domain] || []),
            //     contexts: [action_context].concat(context || []),
            //     eval_context: session.user_context,
            // });
            // if (results.error) {
            //     throw new Error(_.str.sprintf(_t("Failed to evaluate search criterions") + ": \n%s",
            //         JSON.stringify(results.error)));
            // }

            // var groupBys = this._getGroupBy();
            // var groupBy = groupBys.length ?
            //     groupBys :
            //     (this.actionContext.group_by || []);
            // groupBy = (typeof groupBy === 'string') ? [groupBy] : groupBy;

            // context = _.omit(results.context, 'time_ranges');

            // return {
            //     context: context,
            //     domain: results.domain,
            //     groupBy: groupBy,
            //     orderedBy: this._getOrderedBy(),
            // };
        },

    };

    //-----------------------------------------------------------------------------------------------
    // Main function
    //-----------------------------------------------------------------------------------------------


    async function getControlPanelStoreConfig(env, params) {

        const withSearchBar = 'withSearchBar' in params ? params.withSearchBar : true;

        if (withSearchBar && params.state) {
            return {
                state: params.state,
                actions,
                getters,
                env
            };
        }

        const searchDefaults = {};
        for (const key in env.context) {
            const match = /^search_default_(.*)$/.exec(key);
            if (match) {
                searchDefaults[match[1]] = env.context[key];
                delete env.context[key];
            }
        }

        let { arch, fields } = params.viewInfo || { arch: '<search/>', fields: {} };
        arch = parseArch(arch);

        const referenceMoment = moment();
        const optionGenerators = OPTION_GENERATORS.map(option => {
            const description = option.description ?
                option.description.toString() :
                referenceMoment.clone()
                    .set(option.setParam)
                    .add(option.addParam)
                    .format(option.format);
            return Object.assign({}, option, { description });
        });
        const intervalOptions = INTERVAL_OPTIONS.map(option =>
            Object.assign({}, option, { description: option.description.toString() })
        );

        const extraParams = {
            fields: fields,
            searchDefaults,
            referenceMoment,
            optionGenerators,
            intervalOptions,
        };

        // state  with test data
        let state = {
            filters: {},
            groups: {},
            query: [],

            // will be removed
            breadcrumbs: {
                breadcrumbs: [],
                title: "",
            },
            buttons: [],
            pager: {
                limit: 0,
                minimum: 0,
                size: 0,
            },
            sidebar: {
                actions: {},
                items: [],
                sections: [],
            },
            viewSwitcher: {
                views: [],
                viewType: null,
                views: [
                    {
                        icon: 'fas fa-heart',
                        type: 'form',
                    },
                    {
                        icon: 'fa fa-lg fa-th-large',
                        type: 'kanban',
                    },
                    {
                        icon: 'fa fa-lg fa-list-ul',
                        type: 'list',
                    },
                ],
                viewType: 'kanban',
            },
        };

        if (withSearchBar) {
            _extractGroupOfFiltersFromArch({ state, env }, arch, extraParams);
            // add a filter group with the dynamic filters, if any
            if (params.dynamicFilters && params.dynamicFilters.length) {
                _createGroupOfDynamicFilters({ state }, params.dynamicFilters);
            }
            _createGroupOfTimeRanges({ state }, fields);
        }
        await _loadFavorites({ state, env });

        _activateFilters({ state }, params.activateDefaultFavorite);

        return { actions, getters, state };
    }

    return getControlPanelStoreConfig;

});












    //         /**
    //          * Activate a given filter of type 'timeRange' with a timeRangeId
    //          * and optionaly a comparsionTimeRangeId
    //          *
    //          * @param {string} filterId
    //          * @param {string} timeRangeId
    //          * @param {string} [comparisonTimeRangeId]
    //          */
    //         activateTimeRange: function (filterId, timeRangeId, comparisonTimeRangeId) {
    //             var filter = this.filters[filterId];
    //             filter.timeRangeId = timeRangeId || filter.defaultTimeRangeId;
    //             filter.comparisonTimeRangeId = comparisonTimeRangeId;
    //             var group = this.groups[filter.groupId];
    //             var groupActive = group.activeFilterIds.length;
    //             if (groupActive) {
    //                 group.activeFilterIds = [[filterId]];
    //             } else {
    //                 this.toggleFilter(filterId);
    //             }
    //         },
    //         /**
    //          * Ccreate an ir_filter server side. If the operation is successful, a new
    //          * filter of type 'favorite' is created and activated.
    //          *
    //          * @param {Object} newFavorite
    //          */
    //         createNewFavorite: function (newFavorite) {
    //             return this._saveQuery(_.pick(
    //                 newFavorite,
    //                 ['description', 'isDefault', 'isShared', 'type']
    //             )).then(function () {
    //                 newFavorite.on_success();
    //             });
    //         },
    //         /**
    //          * Create new filters of type 'filter' with same new groupId and groupNumber.
    //          * They are activated.
    //          *
    //          * @param {Object[]} newFilters
    //          * @returns {string[]} filterIds, ids of the newly created filters
    //          */
    //         createNewFilters: function (newFilters) {
    //             var self = this;
    //             var filterIds = [];
    //             var groupNumber = this._generateNewGroupNumber();
    //             this._createGroupOfFilters(newFilters);
    //             newFilters.forEach(function (filter) {
    //                 filter.groupNumber = groupNumber;
    //                 self.toggleFilter(filter.id);
    //                 filterIds.push(filter.id);
    //             });
    //             return filterIds;
    //         },
    //         /**
    //          * Create a new groupBy with the groupId shared by all filters of type 'groupBy'
    //          * but a new groupNumber
    //          * It is activated.
    //          *
    //          * @param {Object} newGroupBy
    //          */
    //         createNewGroupBy: function (newGroupBy) {
    //             var id = _.uniqueId('__filter__');
    //             newGroupBy.id = id;
    //             newGroupBy.groupId = this._getGroupIdOfType('groupBy');
    //             newGroupBy.groupNumber = this._generateNewGroupNumber();
    //             this.filters[id] = newGroupBy;
    //             if (_.contains(['date', 'datetime'], newGroupBy.fieldType)) {
    //                 this.toggleFilterWithOptions(newGroupBy.id);
    //             } else {
    //                 this.toggleFilter(newGroupBy.id);
    //             }
    //         },
    //         /**
    //          * Ensure that the filters determined by the given filterIds are
    //          * deactivated (if one or many of them are already deactivated, nothing bad happens)
    //          *
    //          * @param {string[]} filterIds
    //          */
    //         deactivateFilters: function (filterIds) {
    //             var self = this;
    //             filterIds.forEach(function (filterId) {
    //                 var filter = self.filters[filterId];
    //                 var group = self.groups[filter.groupId];
    //                 if (group.activeFilterIds.some(isEqualTo([filterId]))) {
    //                     self.toggleFilter(filterId);
    //                 }
    //             });
    //         },
    //         /**
    //          * Deactivate all filters in a given group with given id.
    //          *
    //          * @param {string} groupId
    //          */
    //         deactivateGroup: function (groupId) {
    //             var self = this;
    //             var group = this.groups[groupId];
    //             _.each(group.activeFilterIds, id => {
    //                 var filter = self.filters[id[0]];
    //                 // TODO: put this logic in toggleFilter 'field' type
    //                 if (filter.autoCompleteValues) {
    //                     filter.autoCompleteValues = [];
    //                 }
    //                 if (filter.currentOptionIds) {
    //                     filter.currentOptionIds.clear();
    //                 }
    //             });
    //             // TODO: use toggleFilter here
    //             group.activeFilterIds = [];
    //             this.query.splice(this.query.indexOf(groupId), 1);
    //         },
    //         /**
    //          * Delete a filter of type 'favorite' with given filterId server side and in control panel model.
    //          * Of course this forces the filter to be removed from the search query.
    //          *
    //          * @param {string} filterId
    //          */
    //         deleteFilterEverywhere: function (filterId) {
    //             var self = this;
    //             var filter = this.filters[filterId];
    //             var def = this.deleteFilter(filter.serverSideId).then(function () {
    //                 const groupOfFavorites = self.groups[filter.groupId];
    //                 const isActive = groupOfFavorites.activeFilterIds.some(isEqualTo([filterId]));
    //                 if (isActive) {
    //                     self.toggleFilter(filterId);
    //                 }
    //                 delete self.filters[filterId];
    //             });
    //             return def;
    //         },
    //         /**
    //          * Return the state of the control panel (the filters, groups and the
    //          * current query). This state can then be used in an other control panel
    //          * model (with same key modelName) via the importState method.
    //          *
    //          * @returns {Object}
    //          */
    //         exportState: function () {
    //             return {
    //                 filters: this.filters,
    //                 groups: this.groups,
    //                 query: this.query,
    //             };
    //         },
    //         /**
    //          * @override
    //          *
    //          * @returns {Object}
    //          */
    //         get: function () {
    //             var self = this;
    //             // we maintain a unique source activeFilterIds that contain information
    //             // on active filters. But the renderer can have more information since
    //             // it does not modifies filters activity.
    //             // We thus give a different structure to renderer that may contain duplicated
    //             // information.
    //             // Note that filters are filters of filter type only, groupbys are groupbys,...!

    //             var facets = this._getFacets();
    //             return {
    //                 facets: facets,
    //                 groups: this.groups,
    //                 query: _.extend([], this.query),
    //                 fields: this.fields,
    //             };
    //         },
    //
    //         /**
    //          * Set filters, groups, and query keys according to the given state.
    //          *
    //          * @param {Object} state
    //          */
    //         importState: function (state) {
    //             this.filters = state.filters;
    //             this.groups = state.groups;
    //             this.query = state.query;
    //         },
    //
    //         /**
    //          * Toggle a filter with given id in a way appropriate to its type.
    //          *
    //          * @param {Object} params
    //          * @param {string} params.filterId
    //          * @param {Object} params.autoCompleteValues
    //          */
    //         toggleAutoCompletionFilter: function (params) {
    //             var filter = this.filters[params.filterId];
    //             if (filter.type === 'field') {
    //                 filter.autoCompleteValues = params.autoCompleteValues;
    //                 // the autocompletion filter is dynamic
    //                 filter.domain = this._getAutoCompletionFilterDomain(filter);
    //                 // active the filter
    //                 var group = this.groups[filter.groupId];
    //                 if (!group.activeFilterIds.some(isEqualTo([filter.id]))) {
    //                     group.activeFilterIds.push([filter.id]);
    //                     this.query.push(group.id);
    //                 }
    //             } else {
    //                 if (filter.hasOptions) {
    //                     this.toggleFilterWithOptions(filter.id);
    //                 } else {
    //                     this.toggleFilter(filter.id);
    //                 }
    //             }
    //         },
    //         /**
    //          * Toggle a filter throught the modification of this.groups and potentially
    //          * of this.query and this.filters.
    //          *
    //          * @param {string} filterId
    //          */
    //         toggleFilter: function (filterId) {
    //             var self = this;
    //             var filter = this.filters[filterId];
    //             var group = this.groups[filter.groupId];
    //             var index = group.activeFilterIds.findIndex(isEqualTo([filterId]));
    //             var initiaLength = group.activeFilterIds.length;
    //             if (index === -1) {
    //                 // we need to deactivate all groups when activating a favorite
    //                 if (filter.type === 'favorite') {
    //                     this.query.forEach(function (groupId) {
    //                         const group = self.groups[groupId];
    //                         group.activeFilterIds.forEach(id => {
    //                             const filter = self.filters[id[0]];
    //                             if (filter.autoCompleteValues) {
    //                                 filter.autoCompleteValues = [];
    //                             }
    //                             if (filter.currentOptionIds) {
    //                                 filter.currentOptionIds.clear();
    //                             }
    //                         });
    //                         group.activeFilterIds = [];
    //                     });
    //                     this.query = [];
    //                 }
    //                 group.activeFilterIds.push([filterId]);
    //                 // if initiaLength is 0, the group was not active.
    //                 if (filter.type === 'favorite' || initiaLength === 0) {
    //                     this.query.push(group.id);
    //                 }
    //             } else {
    //                 if (filter.type === 'field' && filter.autoCompleteValues) {
    //                     filter.autoCompleteValues = [];
    //                 }
    //                 group.activeFilterIds.splice(index, 1);
    //                 // if initiaLength is 1, the group is now inactive.
    //                 if (initiaLength === 1) {
    //                     this.query.splice(this.query.indexOf(group.id), 1);
    //                 }
    //             }
    //         },
    //         /**
    //          * Used to toggle a given filter(Id) that has options with a given option(Id).
    //          *
    //          * @param {string} filterId
    //          * @param {string} [optionId]
    //          */
    //         toggleFilterWithOptions: function (filterId, optionId) {
    //             const filter = this.filters[filterId];
    //             optionId = optionId || filter.defaultOptionId;
    //             const group = this.groups[filter.groupId];

    //             const selectedYears = () => YEAR_OPTIONS.reduce(
    //                 (acc, y) => {
    //                     if (filter.currentOptionIds.has(y.optionId)) {
    //                         acc.push(y.optionId);
    //                     }
    //                     return acc;
    //                 },
    //                 []
    //             );

    //             if (filter.type === 'filter') {
    //                 const alreadyActive = group.activeFilterIds.some(isEqualTo([filterId]));
    //                 if (alreadyActive) {
    //                     if (filter.currentOptionIds.has(optionId)) {
    //                         filter.currentOptionIds.delete(optionId);
    //                         if (!selectedYears().length) {
    //                             // This is the case where optionId was the last option of type 'year' to be there before being removed above.
    //                             // Since other options of type 'month' or 'quarter' do not make sense without a year
    //                             // we deactivate all options.
    //                             filter.currentOptionIds.clear();
    //                         }
    //                         if (!filter.currentOptionIds.size) {
    //                             // Here no option is selected so that the filter becomes inactive.
    //                             this.toggleFilter(filterId);
    //                         }
    //                     } else {
    //                         filter.currentOptionIds.add(optionId);
    //                     }
    //                 } else {
    //                     this.toggleFilter(filterId);
    //                     filter.currentOptionIds.add(optionId);
    //                     if (!selectedYears().length) {
    //                         // Here we add 'this_year' as options if no option of type year is already selected.
    //                         filter.currentOptionIds.add('this_year');
    //                     }
    //                 }
    //             } else if (filter.type === 'groupBy') {
    //                 const combinationId = [filterId, optionId];
    //                 const initiaLength = group.activeFilterIds.length;
    //                 const index = group.activeFilterIds.findIndex(isEqualTo(combinationId));
    //                 if (index === -1) {
    //                     group.activeFilterIds.push(combinationId);
    //                     filter.currentOptionIds.add(optionId);
    //                     if (initiaLength === 0) {
    //                         this.query.push(group.id);
    //                     }
    //                 } else {
    //                     group.activeFilterIds.splice(index, 1);
    //                     filter.currentOptionIds.delete(optionId);
    //                     if (initiaLength === 1) {
    //                         this.query.splice(this.query.indexOf(group.id), 1);
    //                     }
    //                 }
    //             }
    //         },

    //         //--------------------------------------------------------------------------
    //         // Private
    //         //--------------------------------------------------------------------------

    //         /**
    //          * Activate all filters (but favorites) with key isDefault=true
    //          *
    //          * @private
    //          */
    //         _activateDefaultFilters: function () {
    //             Object.values(this.filters)
    //                 .filter(f => f.isDefault && f.type !== 'favorite')
    //                 .sort((f1, f2) => (f1.defaultRank || 100) - (f2.defaultRank || 100))
    //                 .forEach(f => {
    //                     if (f.hasOptions) {
    //                         this.toggleFilterWithOptions(f.id);
    //                     } else {
    //                         this.toggleFilter(f.id);
    //                     }
    //                 });
    //         },
    //         /**
    //          * If defaultTimeRanges param is provided, activate the filter of type
    //          * 'timeRange' it determines with the correct options.
    //          *
    //          * @private
    //          * @param {Object} [defaultTimeRanges]
    //          * @param {string} [defaultTimeRanges.field], field of type 'date' or 'datetime'
    //          * @param {string} [defaultTimeRanges.range], to choose among the following:
    //          *  'last_7_days', 'last_30_days', 'last_365_days', 'today', 'this_week',
    //          *  'this_month', 'this_quarter', 'this_year', 'yesterday', 'last_week',
    //          *  'last_month', 'last_quarter', 'last_year'
    //          * @param {'previous_period'|'previous_year'} [defaultTimeRanges.comparisonRange]
    //          */
    //         _activateDefaultTimeRanges: function (defaultTimeRanges) {
    //             if (defaultTimeRanges) {
    //                 var filter = _.find(this.filters, function (filter) {
    //                     return filter.type === 'timeRange' && filter.fieldName === defaultTimeRanges.field;
    //                 });
    //                 if (filter) {
    //                     this.activateTimeRange(
    //                         filter.id,
    //                         defaultTimeRanges.range,
    //                         defaultTimeRanges.comparisonRange
    //                     );
    //                 }
    //             }
    //         },
    //         /**
    //          * Create a new filter of type 'favorite' and toggle it.
    //          * It belongs to the unique group of favorites.
    //          *
    //          * @private
    //          * @param {Object} favorite
    //          */
    //         _addNewFavorite: function (favorite) {
    //             var id = _.uniqueId('__filter__');
    //             favorite.id = id;
    //             favorite.groupId = this._getGroupIdOfType('favorite');
    //             this.filters[id] = favorite;
    //             this.toggleFilter(favorite.id);
    //         },
    //         /**
    //          * Computes the string representation of the current domain associated to a date filter
    //          * starting from its currentOptionIds.
    //          *
    //          * @param {Object} filter
    //          * @returns {string}
    //          */
    //         _computeDateFilterDomain: function (filter) {
    //             const domains = [];
    //             const p = _.partition([...filter.currentOptionIds], optionId =>
    //                 OPTION_GENERATORS.find(o => o.optionId === optionId).groupId === 1);
    //             const yearIds = p[1];
    //             const otherOptionIds = p[0];
    //             // the following case corresponds to years selected only
    //             if (otherOptionIds.length === 0) {
    //                 yearIds.forEach(yearId => {
    //                     const d = filter.basicDomains[yearId];
    //                     domains.push(d.domain);
    //                 });
    //             } else {
    //                 otherOptionIds.forEach(optionId => {
    //                     yearIds.forEach(yearId => {
    //                         const d = filter.basicDomains[yearId + '__' + optionId];
    //                         domains.push(d.domain);
    //                     });
    //                 });
    //             }
    //             return pyUtils.assembleDomains(domains, 'OR');
    //         },



    //         /**
    //          * Create a new groupNumber not already used elsewhere.
    //          * Group numbers are used to separate graphically groups of items  in the
    //          * search menus (filter menu, groupBy menu,...).
    //          *
    //          * @private
    //          * @returns {number} groupNumber
    //          */
    //         _generateNewGroupNumber: function () {
    //             var self = this;
    //             var groupNumber = 1 + Object.keys(this.filters).reduce(
    //                 function (max, filterId) {
    //                     var filter = self.filters[filterId];
    //                     if (filter.groupNumber) {
    //                         max = Math.max(filter.groupNumber, max);
    //                     }
    //                     return max;
    //                 },
    //                 1
    //             );
    //             return groupNumber;
    //         },

    //         /**
    //          * Return the string representation of a domain created by combining
    //          * appropriately (with an 'AND') the domains coming from the active groups.
    //          *
    //          * @private
    //          * @returns {string} the string representation of a domain
    //          */
    //         _getDomain: function () {
    //             var self = this;
    //             var domains = this.query.map(function (groupId) {
    //                 var group = self.groups[groupId];
    //                 return self._getGroupDomain(group);
    //             });
    //             return pyUtils.assembleDomains(domains, 'AND');
    //         },
    //         /**
    //          * Return an array containing 'facets' used to create the content of the search bar.
    //          *
    //          * @returns {Object}
    //          */
    //         _getFacets: function () {
    //             var self = this;
    //             // resolve active filters for facets
    //             return this.query.map(groupId => {
    //                 var group = self.groups[groupId];
    //                 var facet = _.extend({}, group);
    //                 if (group.type === 'groupBy') {
    //                     facet.filters = group.activeFilterIds.map(id => {
    //                         let filter = _.extend({}, self.filters[id[0]]);
    //                         if (filter.hasOptions) {
    //                             filter.optionId = id[1];
    //                         }
    //                         return filter;
    //                     });
    //                 } else {
    //                     facet.filters = _.compact(group.activeFilterIds.map(id => self.filters[id[0]]));
    //                 }
    //                 return facet;
    //             });
    //         },
    //         /**
    //          * Return the context of the provided filter.
    //          *
    //          * @private
    //          * @param {Object} filter
    //          * @returns {Object} context
    //          */
    //         _getFilterContext: function (filter) {
    //             var context = filter.context || {};

    //             // for <field> nodes, a dynamic context (like context="{'field1': self}")
    //             // should set {'field1': [value1, value2]} in the context
    //             if (filter.type === 'field' && filter.attrs.context) {
    //                 context = pyUtils.eval('context', filter.attrs.context, {
    //                     self: _.map(filter.autoCompleteValues, function (autoCompleteValue) {
    //                         return autoCompleteValue.value;
    //                     }),
    //                 });
    //             }
    //             // the following code aims to restore this:
    //             // https://github.com/odoo/odoo/blob/12.0/addons/web/static/src/js/views/search/search_inputs.js#L498
    //             // this is required for the helpdesk tour to pass
    //             // this seems weird to only do that for m2o fields, but a test fails if
    //             // we do it for other fields (my guess being that the test should simply
    //             // be adapted)
    //             if (filter.type === 'field' && filter.isDefault) {
    //                 if (this.fields[filter.attrs.name].type === 'many2one') {
    //                     var value = filter.defaultValue;
    //                     // the following if required to make the main_flow_tour pass (see
    //                     // https://github.com/odoo/odoo/blob/12.0/addons/web/static/src/js/views/search/search_inputs.js#L461)
    //                     if (_.isArray(filter.defaultValue)) {
    //                         value = filter.defaultValue[0];
    //                     }
    //                     context['default_' + filter.attrs.name] = value;
    //                 }
    //             }
    //             return context;
    //         },
    //         /**
    //          * Compute (if possible) the domain of the provided filter.
    //          *
    //          * @private
    //          * @param {Object} filter
    //          * @returns {string|undefined} domain, string representation of a domain
    //          */
    //         _getFilterDomain: function (filter) {
    //             let domain;
    //             if (filter.type === 'filter') {
    //                 domain = filter.domain;
    //                 if (filter.hasOptions) {
    //                     domain = this._computeDateFilterDomain(filter);
    //                 }
    //             } else if (filter.type === 'favorite') {
    //                 domain = filter.domain;
    //             } else if (filter.type === 'field') {
    //                 domain = filter.domain;
    //             }
    //             return domain;
    //         },
    //         /**
    //          * Compute the groupBys (if possible) of the provided filter.
    //          *
    //          * @private
    //          * @param {Array} filterId
    //          * @returns {string[]|undefined} groupBys
    //          */
    //         _getFilterGroupBys: function (filterId) {
    //             var groupBys;
    //             var filter = this.filters[filterId[0]];
    //             if (filter.type === 'groupBy') {
    //                 var optionId = filterId[1];
    //                 var groupBy = filter.fieldName;
    //                 if (optionId) {
    //                     groupBy = groupBy + ':' + optionId;
    //                 }
    //                 groupBys = [groupBy];
    //             }
    //             if (filter.type === 'favorite') {
    //                 groupBys = filter.groupBys;
    //             }
    //             return groupBys;
    //         },
    //         /**
    //          * Return the concatenation of groupBys comming from the active filters.
    //          * The array this.query encoding the order in which the groups have been
    //          * activated, the results respect the appropriate logic: the groupBys
    //          * coming from an active favorite (if any) come first, then come the
    //          * groupBys comming from the active filters of type 'groupBy'.
    //          *
    //          * @private
    //          * @returns {string[]} groupBys
    //          */
    //         _getGroupBy: function () {
    //             var self = this;
    //             var groupBys = this.query.reduce(
    //                 function (acc, groupId) {
    //                     var group = self.groups[groupId];
    //                     return acc.concat(self._getGroupGroupBys(group));
    //                 },
    //                 []
    //             );
    //             return groupBys;
    //         },
    //         /**
    //          * Return the list of the contexts of the filters acitve in the given
    //          * group.
    //          *
    //          * @private
    //          * @param {Object} group
    //          * @returns {Object[]}
    //          */
    //         _getGroupContexts: function (group) {
    //             var self = this;
    //             var contexts = group.activeFilterIds.map(function (filterId) {
    //                 var filter = self.filters[filterId[0]];
    //                 return self._getFilterContext(filter);
    //             });
    //             return _.compact(contexts);
    //         },
    //         /**
    //          * Return the string representation of a domain created by combining
    //          * appropriately (with an 'OR') the domains coming from the filters
    //          * active in the given group.
    //          *
    //          * @private
    //          * @param {Object} group
    //          * @returns {string} string representation of a domain
    //          */
    //         _getGroupDomain: function (group) {
    //             var self = this;
    //             var domains = group.activeFilterIds.map(function (filterId) {
    //                 var filter = self.filters[filterId[0]];
    //                 return self._getFilterDomain(filter);
    //             });
    //             return pyUtils.assembleDomains(_.compact(domains), 'OR');
    //         },
    //         /**
    //          * Return the groupBys coming form the filters active in the given group.
    //          *
    //          * @private
    //          * @param {Object} group
    //          * @returns {string[]}
    //          */
    //         _getGroupGroupBys: function (group) {
    //             var self = this;
    //             var groupBys = group.activeFilterIds.reduce(
    //                 function (acc, filterId) {
    //                     acc = acc.concat(self._getFilterGroupBys(filterId));
    //                     return acc;
    //                 },
    //                 []
    //             );
    //             return _.compact(groupBys);
    //         },

    //         /**
    //          * Used to get the key orderedBy of a favorite.
    //          *
    //          * @private
    //          * @returns {Object[]|undefined} orderedBy
    //          */
    //         _getOrderedBy: function () {
    //             var orderedBy;
    //             var id = this._getGroupIdOfType('favorite');
    //             if (this.query.indexOf(id) !== -1) {
    //                 // if we are here, this means that the group of favorite is
    //                 // active and activeFilterIds is a list of length one.
    //                 var group = this.groups[id];
    //                 var activeFavoriteId = group.activeFilterIds[0][0];
    //                 var favorite = this.filters[activeFavoriteId];
    //                 if (favorite.orderedBy && favorite.orderedBy.length) {
    //                     orderedBy = favorite.orderedBy;
    //                 }
    //             }
    //             return orderedBy;
    //         },
    //         /**
    //          * Return the list of the contexts of active filters.
    //          *
    //          * @private
    //          * @returns {Object[]}
    //          */
    //         _getQueryContext: function () {
    //             var self = this;
    //             var contexts = this.query.reduce(
    //                 function (acc, groupId) {
    //                     var group = self.groups[groupId];
    //                     acc = acc.concat(self._getGroupContexts(group));
    //                     return acc;
    //                 },
    //                 []
    //             );
    //             return _.compact(contexts);
    //         },
    //         /**
    //          * Return an empty object or an object with a key timeRangeMenuData
    //          * containing info on time ranges and their descriptions if a filter of type
    //          * 'timeRange' is activated (only one can be).
    //          * The key timeRange and comparisonTimeRange will be string or array
    //          * representation of domains according to the value of evaluation:
    //          * array if evaluation is true, string if false.
    //          *
    //          * @private
    //          * @param {boolean} [evaluation=false]
    //          * @returns {Object}
    //          */
    //         _getTimeRangeMenuData: function (evaluation) {
    //             var context = {};
    //             // groupOfTimeRanges can be undefined in case with withSearchBar is false
    //             var groupOfTimeRanges = this.groups[this._getGroupIdOfType('timeRange')];
    //             if (groupOfTimeRanges && groupOfTimeRanges.activeFilterIds.length) {
    //                 var filter = this.filters[groupOfTimeRanges.activeFilterIds[0][0]];

    //                 var comparisonTimeRange = "[]";
    //                 var comparisonTimeRangeDescription;

    //                 var timeRange = Domain.prototype.constructDomain(
    //                     filter.fieldName,
    //                     filter.timeRangeId,
    //                     filter.fieldType
    //                 );
    //                 var timeRangeDescription = _.find(filter.timeRangeOptions, function (option) {
    //                     return option.optionId === filter.timeRangeId;
    //                 }).description.toString();
    //                 if (filter.comparisonTimeRangeId) {
    //                     comparisonTimeRange = Domain.prototype.constructDomain(
    //                         filter.fieldName,
    //                         filter.timeRangeId,
    //                         filter.fieldType,
    //                         filter.comparisonTimeRangeId
    //                     );
    //                     comparisonTimeRangeDescription = _.find(filter.comparisonTimeRangeOptions, function (comparisonOption) {
    //                         return comparisonOption.optionId === filter.comparisonTimeRangeId;
    //                     }).description.toString();
    //                 }
    //                 if (evaluation) {
    //                     timeRange = Domain.prototype.stringToArray(timeRange);
    //                     comparisonTimeRange = Domain.prototype.stringToArray(comparisonTimeRange);
    //                 }
    //                 context = {
    //                     timeRangeMenuData: {
    //                         comparisonField: filter.fieldName,
    //                         timeRange: timeRange,
    //                         timeRangeDescription: timeRangeDescription,
    //                         comparisonTimeRange: comparisonTimeRange,
    //                         comparisonTimeRangeDescription: comparisonTimeRangeDescription,
    //                     }
    //                 };
    //             }
    //             return context;
    //         },
    //
    //         /**
    //             * Load search defaults and set the `domain` key on filter (of type `field`).
    //             * Some search defaults need to fetch data (like m2o for example) so this
    //             * is asynchronous.
    //             *
    //             * @private
    //             * @returns {Promise[]}
    //             */
    //
    //         /**
    //             * Compute the search Query and save it as an ir.filter in db.
    //             * No evaluation of domains is done in order to keep them dynamic.
    //             * If the operatio is successful, a new filter of type 'favorite' is
    //             * created and activated.
    //             *
    //             * @private
    //             * @param {Object} favorite
    //             * @returns {Promise}
    //             */
    //         _saveQuery: function (favorite) {
    //             var self = this;
    //             var userContext = session.user_context;
    //             var controllerQueryParams;
    //             this.trigger_up('get_controller_query_params', {
    //                 callback: function (state) {
    //                     controllerQueryParams = state;
    //                 },
    //             });
    //             var queryContext = this._getQueryContext();
    //             var timeRangeMenuInfo = this._getTimeRangeMenuData(false);
    //             var context = pyUtils.eval(
    //                 'contexts',
    //                 [userContext, controllerQueryParams.context, timeRangeMenuInfo].concat(queryContext)
    //             );
    //             context = _.omit(context, Object.keys(userContext));
    //             var groupBys = this._getGroupBy();
    //             if (groupBys.length) {
    //                 context.group_by = groupBys;
    //             }
    //             var domain = this._getDomain();
    //             var userId = favorite.isShared ? false : session.uid;
    //             var orderedBy = this._getOrderedBy() || [];
    //             if (controllerQueryParams.orderedBy) {
    //                 orderedBy = controllerQueryParams.orderedBy;
    //             }
    //             var sort = orderedBy.map(function (order) {
    //                 return order.name + ((order.asc === false) ? " desc" : "");
    //             });

    //             var irFilter = {
    //                 name: favorite.description,
    //                 context: context,
    //                 domain: domain,
    //                 is_default: favorite.isDefault,
    //                 user_id: userId,
    //                 model_id: this.modelName,
    //                 action_id: this.actionId,
    //                 sort: JSON.stringify(sort),
    //             };
    //             return this.createFilter(irFilter).then(function (serverSideId) {
    //                 // we don't want the groupBys to be located in the context in control panel model
    //                 delete context.group_by;
    //                 favorite.isRemovable = true;
    //                 favorite.groupNumber = userId ? 1 : 2;
    //                 favorite.context = context;
    //                 favorite.groupBys = groupBys;
    //                 favorite.domain = domain;
    //                 favorite.orderedBy = orderedBy;
    //                 // not sure keys are usefull
    //                 favorite.userId = userId;
    //                 favorite.serverSideId = serverSideId;
    //                 self._addNewFavorite(favorite);
    //             });
    //         },
    //     };

    //     const getters = {
    //         getFavorites() {
    //             return this.state.filters.filter(f => f.type === 'favorite');
    //         },
    //         getFilters() {
    //             return this.state.filters.filter(f => f.type === 'filter');
    //         },
    //         getGroupbys() {
    //             return this.state.filters.filter(f => f.type === 'groupby');
    //         },
    //         getQuery() {
    //             return {
    //                 context: {},
    //                 domain: [],
    //                 groupBy: [],
    //                 orderedBy: [],
    //             };
    //             // var userContext = session.user_context;
    //             // var context = _.extend(
    //             //     pyUtils.eval('contexts', this._getQueryContext(), userContext),
    //             //     this._getTimeRangeMenuData(true)
    //             // );
    //             // var domain = Domain.prototype.stringToArray(this._getDomain(), userContext);
    //             // // this must be done because pyUtils.eval does not know that it needs to evaluate domains within contexts
    //             // if (context.timeRangeMenuData) {
    //             //     if (typeof context.timeRangeMenuData.timeRange === 'string') {
    //             //         context.timeRangeMenuData.timeRange = pyUtils.eval('domain', context.timeRangeMenuData.timeRange);
    //             //     }
    //             //     if (typeof context.timeRangeMenuData.comparisonTimeRange === 'string') {
    //             //         context.timeRangeMenuData.comparisonTimeRange = pyUtils.eval('domain', context.timeRangeMenuData.comparisonTimeRange);
    //             //     }
    //             // }
    //             // var action_context = this.actionContext;
    //             // var results = pyUtils.eval_domains_and_contexts({
    //             //     domains: [this.actionDomain].concat([domain] || []),
    //             //     contexts: [action_context].concat(context || []),
    //             //     eval_context: session.user_context,
    //             // });
    //             // if (results.error) {
    //             //     throw new Error(_.str.sprintf(_t("Failed to evaluate search criterions")+": \n%s",
    //             //                     JSON.stringify(results.error)));
    //             // }

    //             // var groupBys = this._getGroupBy();
    //             // var groupBy = groupBys.length ?
    //             //                 groupBys :
    //             //                 (this.actionContext.group_by || []);
    //             // groupBy = (typeof groupBy === 'string') ? [groupBy] : groupBy;

    //             // context = _.omit(results.context, 'time_ranges');

    //             // return {
    //             //     context: context,
    //             //     domain: results.domain,
    //             //     groupBy: groupBy,
    //             //     orderedBy: this._getOrderedBy(),
    //             // };
    //         },
    //         getTimeranges() {
    //             return this.state.filters.filter(f => f.type === 'timerange');
    //         },
    //     };


    //     return { actions, getters, state };
    // }
