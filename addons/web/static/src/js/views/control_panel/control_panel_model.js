odoo.define('web.ControlPanelModel', function (require) {
"use strict";

var Domain = require('web.Domain');
var mvc = require('web.mvc');
var pyUtils = require('web.py_utils');
var controlPanelViewParameters = require('web.controlPanelViewParameters');

var DEFAULT_TIMERANGE = controlPanelViewParameters.DEFAULT_TIMERANGE;
var TIME_RANGE_OPTIONS = controlPanelViewParameters.TIME_RANGE_OPTIONS;
var COMPARISON_TIME_RANGE_OPTIONS = controlPanelViewParameters.COMPARISON_TIME_RANGE_OPTIONS;

var ControlPanelModel = mvc.Model.extend({
    init: function (parent) {
        this._super.apply(this, arguments);
        this.filters = {};
        this.groups = {};
        this.query = [];
        this.fields = {};
        this.modelName = null;
        this.actionId = null;
        this.groupOfFiltersIds = [];
        this.groupOfGroupBysId = null;
        this.groupOfFavoritesId = null;
        this.groupOfTimeRangesId = null;
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    load: function (params) {
        var self = this;
        this.fields = params.fields;
        this.modelName = params.modelName;
        this.actionId = params.actionId;
        params.groups.forEach(function (group) {
            self._createGroupOfFilters(group);
        });
        if (this.groupOfGroupBysId === null) {
            this._createEmptyGroup('groupBy');
        }
        this._createGroupOfTimeRanges();
        return this._loadFavorites().then(function () {
            if (self.query.length === 0) {
                self._activateDefaultFilters();
                self._activateDefaultTimeRanges(params.timeRanges);
            }
        });
    },

    reload: function (params) {
        var self = this;
        var def;
        var id;
        if (params.toggleFilter) {
            this._toggleFilter(params.toggleFilter.id);
        }
        if (params.deactivateGroup) {
            this._deactivateGroup(params.deactivateGroup.id);
        }
        if (params.toggleAutoCompletionFilter) {
            this._toggleAutoCompletionFilter(params.toggleAutoCompletionFilter);
        }
        if (params.toggleOption) {
            this._toggleFilterWithOptions(
                // id is a filter id
                params.toggleOption.id,
                params.toggleOption.optionId
            );
        }
        if (params.activateTimeRange) {
            this._activateTimeRange(
                params.activateTimeRange.id,
                params.activateTimeRange.timeRangeId,
                params.activateTimeRange.comparisonTimeRangeId
            );
        }
        if (params.newFilters) {
            var newFilters = params.newFilters.filters;
            this._createGroupOfFilters(newFilters);
            newFilters.forEach(function (filter) {
                self._toggleFilter(filter.id);
            });

        }
        if (params.newGroupBy) {
            var newGroupBy = params.newGroupBy.groupBy;
            id = _.uniqueId('__filter__');
            newGroupBy.id = id;
            newGroupBy.groupId = this.groupOfGroupBysId;
            this.filters[id] = newGroupBy;
            if (_.contains(['date', 'datetime'], newGroupBy.fieldType)) {
                this._toggleFilterWithOptions(newGroupBy.id);
            } else {
                this._toggleFilter(newGroupBy.id);
            }
        }
        if (params.newFavorite) {
            var newFavorite = params.newFavorite;
            def = this._saveQuery(_.pick(
                newFavorite,
                ['description', 'isDefault', 'isShared', 'type']
            )).then(function () {
                newFavorite.on_success();
            }).fail(function () {
                return $.when();
            });
        }
        if (params.trashItem) {
            id = params.trashItem.id;
            def = this._deleteFilter(id);
        }
        return $.when(def);
    },

    get: function () {
        var self = this;
        // we maintain a unique source activeFilterIds that contain information
        // on active filters. But the renderer can have more information since
        // it does not change that.
        // copy this.filters;
        // we want to give a different structure to renderer.
        // filters are filters of filter type only, groupbys are groupbys,...!
        var filterFields = [];
        var filters = [];
        var groupBys = [];
        var timeRanges = [];
        var favorites = [];
        Object.keys(this.filters).forEach(function (filterId) {
            var filter = _.extend({}, self.filters[filterId]);
            var group = self.groups[filter.groupId];
            filter.isActive = group.activeFilterIds.indexOf(filterId) !== -1;
            if (filter.type === 'field') {
                filterFields.push(filter);
            }
            if (filter.type === 'filter') {
                filters.push(filter);
            }
            if (filter.type === 'groupBy') {
                groupBys.push(filter);
            }
            if (filter.type === 'favorite') {
                favorites.push(filter);
            }
            if (filter.type === 'timeRange') {
                timeRanges.push(filter);
            }
        });
        var facets = [];
        // resolve active filters for facets
        this.query.forEach(function (groupID) {
            var group = self.groups[groupID];
            var facet = _.extend({}, group);
            facet.filters = facet.activeFilterIds.map(function (filterID) {
                return self.filters[filterID];
            });
            facets.push(facet);
        });
        favorites = _.sortBy(favorites, 'groupNumber');
        return {
            facets: facets,
            filterFields: filterFields,
            filters: filters,
            groupBys: groupBys,
            timeRanges: timeRanges,
            favorites: favorites,
            groups: this.groups,
            query: this.query,
            fields: this.fields,
        };
    },

    getQuery: function () {
        var userContext = this.getSession().user_context;
        var domain = Domain.prototype.stringToArray(
            this._getDomain(),
            userContext
        );
        var domainsEvaluation = true;
        var context = _.extend(
            pyUtils.eval('contexts', this._getQueryContext(), userContext),
            this._getTimeRangeMenuData(domainsEvaluation)
        );
        var groupBys = this._getGroupBys();
        return {
            // for now action manager wants domains and contexts I would prefer
            // to use domain and context.
            domain: domain,
            context: context,
            groupBys: groupBys,
        };
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    _activateDefaultFilters: function () {
        var self = this;
        Object.keys(this.filters).forEach(
            function (filterId) {
                var filter = self.filters[filterId];
                // if we are here, this means there is no favorite with isDefault set to true
                if (filter.isDefault) {
                    if (filter.hasOptions) {
                        self._toggleFilterWithOptions(filter.id);
                    } else {
                        self._toggleFilter(filter.id);
                    }
                }
        });
    },
    _activateDefaultTimeRanges: function (defaultTimeRanges) {
        var self = this;
        if (defaultTimeRanges) {
            var filterId = Object.keys(this.filters).find(function (filterId) {
                var filter = self.filters[filterId];
                return filter.type === 'timeRange' && filter.fieldName === defaultTimeRanges.field;
            });
            if (filterId) {
                this._activateTimeRange(
                    filterId,
                    defaultTimeRanges.range,
                    defaultTimeRanges.comparisonRange
                );
            }
        }
    },
    _activateTimeRange: function (filterId, timeRangeId, comparisonTimeRangeId) {
        var filter = this.filters[filterId];
        filter.timeRangeId = timeRangeId || filter.defaultTimeRangeId;
        filter.comparisonTimeRangeId = comparisonTimeRangeId;
        var group = this.groups[filter.groupId];
        var groupActive = group.activeFilterIds.length;
        if (groupActive) {
            group.activeFilterIds = [filterId];
        } else {
            this._toggleFilter(filterId);
        }
    },
    // if _saveQuery succeed we create a new favorite and activate it
    _addNewFavorite: function (favorite) {
        var id = _.uniqueId('__filter__');
        favorite.id = id;
        favorite.groupId = this.groupOfFavoritesId;
        this.filters[id] = favorite;
        this._toggleFilter(favorite.id);
    },
    // create empty group of a specific type
    _createEmptyGroup: function (type) {
        var id = _.uniqueId('__group__');
        this.groups[id] = {
            id: id,
            type: type,
            activeFilterIds: [],
        };
        this._memorizeGroupId(id, type);
    },
    // group is a list of (pre) filters
    _createGroupOfFilters: function (group) {
        var self= this;
        var type;
        var groupId = _.uniqueId('__group__');
        group.forEach(function (filter) {
            var id = _.uniqueId('__filter__');
            filter.id = id;
            filter.groupId = groupId;
            type = filter.type;
            self.filters[id] = filter;
        });
        this.groups[groupId] = {
            id: groupId,
            type: type,
            activeFilterIds: [],
        };
        this._memorizeGroupId(groupId, type);
    },

    _createGroupOfTimeRanges: function () {
        var self = this;
        var timeRanges = [];
        Object.keys(this.fields).forEach(function (fieldName) {
            var field = self.fields[fieldName];
            var fieldType = field.type;
            if (_.contains(['date', 'datetime'], fieldType) && field.sortable) {
                timeRanges.push({
                    type: 'timeRange',
                    description: field.string,
                    fieldName : fieldName,
                    fieldType: fieldType,
                    timeRangeId: false,
                    comparisonTimeRangeId: false,
                    defaultTimeRangeId: DEFAULT_TIMERANGE,
                    timeRangeOptions: TIME_RANGE_OPTIONS,
                    comparisonTimeRangeOptions: COMPARISON_TIME_RANGE_OPTIONS
                });
            }
        });
        if (timeRanges.length) {
            this._createGroupOfFilters(timeRanges);
        } else {
            // create empty timeRange group
            this._createEmptyGroup('timeRange');
        }
    },
    _deleteFilter: function (filterId) {
        var self = this;
        var filter = this.filters[filterId];
        var def = this.deleteFilter(filter.serverSideId).then(function () {
            var activeFavoriteId = self.groups[filter.groupId].activeFilterIds[0];
            var isActive = activeFavoriteId === filterId;
            if (isActive) {
                self._toggleFilter(filterId);
            }
            delete self.filters[filterId];
        });
        return def;
    },
    // get context (without controller context (this is usefull only for favorite))
    _getQueryContext: function () {
        var self = this;
        var contexts = this.query.reduce(
            function (acc, groupId) {
                var group = self.groups[groupId];
                acc = acc.concat(self._getGroupContexts(group));
                return acc;
            },
            []
        );
        return _.compact(contexts);
    },
    _getDomain: function () {
        var self = this;
        var domains = this.query.map(function (groupId) {
            var group = self.groups[groupId];
            return self._getGroupDomain(group);
        });
        return pyUtils.assembleDomains(domains, 'AND');
    },
    _getFilterContext: function (filter) {
        var context;
        if (filter.type === 'favorite') {
            context = filter.context;
        }
        return context;
    },
    _getFilterDomain: function (filter) {
        var domain;
        if (filter.type === 'filter') {
            domain = filter.domain;
            if (filter.domain === undefined) {
                domain = Domain.prototype.constructDomain(
                    filter.fieldName,
                    filter.currentOptionId,
                    filter.fieldType
                );
            }
        }
        if (filter.type === 'favorite') {
            domain = filter.domain;
        }
        if (filter.type === 'field') {
            domain = filter.domain;
        }
        return domain;
    },
    // should send back a list
    _getFilterGroupBys: function (filter) {
        var groupBys;
        if (filter.type === 'groupBy') {
            var groupBy = filter.fieldName;
            if (filter.currentOptionId) {
                groupBy = groupBy + ':' + filter.currentOptionId;
            }
            groupBys = [groupBy];
        }
        if (filter.type === 'favorite') {
            groupBys = filter.groupBys;
        }
        return groupBys;
    },

    _getGroupBys: function () {
        var self = this;
        var groupBys = this.query.reduce(
            function (acc, groupId) {
                var group = self.groups[groupId];
                return acc.concat(self._getGroupGroupbys(group));
            },
            []
        );
        return groupBys;
    },
    _getGroupContexts: function (group) {
        var self = this;
        var contexts = group.activeFilterIds.map(function (filterId) {
            var filter = self.filters[filterId];
            return self._getFilterContext(filter);
        });
        return _.compact(contexts);
    },
    _getGroupDomain: function (group) {
        var self = this;
        var domains = group.activeFilterIds.map(function (filterId) {
            var filter = self.filters[filterId];
            return self._getFilterDomain(filter);
        });
        return pyUtils.assembleDomains(_.compact(domains), 'OR');
    },

    _getGroupGroupbys: function (group) {
        var self = this;
        var groupBys = group.activeFilterIds.reduce(
            function (acc, filterId) {
                var filter = self.filters[filterId];
                acc = acc.concat(self._getFilterGroupBys(filter));
                return acc;
            },
            []
        );
        return _.compact(groupBys);
    },
    _getTimeRangeMenuData: function (evaluation) {
        var context = {};

        var groupOfTimeRanges = this.groups[this.groupOfTimeRangesId];
        if (groupOfTimeRanges.activeFilterIds.length) {
            var filter = this.filters[groupOfTimeRanges.activeFilterIds[0]];

            var comparisonTimeRange = "[]";
            var comparisonTimeRangeDescription;

            var timeRange = Domain.prototype.constructDomain(
                    filter.fieldName,
                    filter.timeRangeId,
                    filter.fieldType
                );
            var timeRangeDescription = filter.timeRangeOptions.find(function (option) {
                return option.optionId === filter.timeRangeId;
            }).description.toString();
            if (filter.comparisonTimeRangeId) {
                comparisonTimeRange = Domain.prototype.constructDomain(
                    filter.fieldName,
                    filter.timeRangeId,
                    filter.fieldType,
                    null,
                    filter.comparisonTimeRangeId
                );
                comparisonTimeRangeDescription = filter.comparisonTimeRangeOptions.find(function (comparisonOption) {
                    return comparisonOption.optionId === filter.comparisonTimeRangeId;
                }).description.toString();
            }
            if (evaluation) {
                timeRange = Domain.prototype.stringToArray(timeRange);
                comparisonTimeRange = Domain.prototype.stringToArray(comparisonTimeRange);
            }
            context = {
                timeRangeMenuData: {
                    timeRange: timeRange,
                    timeRangeDescription: timeRangeDescription,
                    comparisonTimeRange: comparisonTimeRange,
                    comparisonTimeRangeDescription: comparisonTimeRangeDescription,
                }
            };
        }
        return context;

    },
    _loadFavorites: function () {
        var self = this;
        var def = this.loadFilters(this.modelName,this.actionId).then(function (favorites) {
            if (favorites.length) {
                favorites = favorites.map(function (favorite) {
                    var userId = favorite.user_id ? favorite.user_id[0] : false;
                    var groupNumber = userId ? 1 : 2;
                    var context = pyUtils.eval('context', favorite.context, self.getSession().user_context);
                    var groupBys = [];
                    if (context.group_by) {
                        groupBys = context.group_by;
                        delete context.group_by;
                    }
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
                        sort: favorite.sort,
                        userId: userId,
                        serverSideId: favorite.id,
                    };
                });
                self._createGroupOfFilters(favorites);
                var defaultFavoriteId = Object.keys(self.filters).find(function (filterId) {
                    var filter = self.filters[filterId];
                    return filter.type === 'favorite' && filter.isDefault;
                });
                if (defaultFavoriteId) {
                    self._toggleFilter(defaultFavoriteId);
                }
            } else {
                self._createEmptyGroup('favorite');
            }
        });
        return def;
    },
    // save favorites should call this method. Here no evaluation of domains,...
    _saveQuery: function (favorite) {
        var self = this;
        var userContext = this.getSession().user_context;
        var controllerContext;
        this.trigger_up('get_controller_context', {
            callback: function (context) {
                controllerContext = context;
            },
        });
         // var ctx = results.context;
        // _(_.keys(session.user_context)).each(function (key) {
        //     delete ctx[key];
        // });
        var queryContext = this._getQueryContext();
        // TO DO: find a way to compose context as string without evaluate them (like for domains)
        // Or we could encode in favorite the timeRange menu data as fieldName, timeRangeId,...
        // or better in a separated key.
        var timeRangeMenuInfo = this._getTimeRangeMenuData(false);
        var context = pyUtils.eval(
            'contexts',
            [userContext, controllerContext, timeRangeMenuInfo].concat(queryContext)
        );
        context = _.omit(context, Object.keys(userContext));
        var groupBys = this._getGroupBys();
        if (groupBys.length) {
            context.group_by = groupBys;
        }
        // we need to remove keys in session.userContext from context.
        var domain = this._getDomain();
        var userId = favorite.isShared ? false : this.getSession().uid;
        var irFilter = {
            name: favorite.description,
            context: context,
            domain: domain,
            is_default: favorite.isDefault,
            user_id: userId,
            model_id: this.modelName,
            action_id: this.actionId,
        };
        // we don't want the groupBys to be located in the context in search view
        return this.createFilter(irFilter).then(function (serverSideId) {
            delete context.group_by;
            favorite.isRemovable = true;
            favorite.groupNumber = userId ? 1 : 2;
            favorite.context = context;
            favorite.groupBys = groupBys;
            favorite.domain = domain;
            favorite.sort = [];
            // not sure keys are usefull
            favorite.userId = userId;
            favorite.serverSideId = serverSideId;
            self._addNewFavorite(favorite);
        });
    },
    _memorizeGroupId: function (groupId, type) {
        if (type === 'groupBy') {
            this.groupOfGroupBysId = groupId;
        } else if (type === 'favorite') {
            this.groupOfFavoritesId = groupId;
        } else if (type === 'timeRange') {
            this.groupOfTimeRangesId = groupId;
        } else if (type === 'filter') {
            this.groupOfFiltersIds.push(groupId);
        }
    },
    _toggleAutoCompletionFilter: function (params) {
        var filter = this.filters[params.filterId];

        if (filter.type === 'field') {
            // update domain & autoCompleteValues
            // the autocompletion filter is dynamic
            filter.domain = params.domain;
            filter.autoCompleteValues = params.autoCompleteValues;
            // active the filter
            var group = this.groups[filter.groupId];
            if (!group.activeFilterIds.includes(filter.id)) {
                group.activeFilterIds.push(filter.id);
                this.query.push(group.id);
            }
        } else {
            if (filter.hasOptions) {
                this._toggleFilterWithOptions(filter.id);
            } else {
                this._toggleFilter(filter.id);
            }
        }
    },
    // This method could work in batch and take a list of ids as args.
    // (it would be useful for initialization and deletion of a facet/group)
    _toggleFilter: function (filterId) {
        var self = this;
        var filter = this.filters[filterId];
        var group = this.groups[filter.groupId];
        var index = group.activeFilterIds.indexOf(filterId);
        var initiaLength = group.activeFilterIds.length;
        if (index === -1) {
            // we need to deactivate all groups when activating a favorite
            if (filter.type === 'favorite') {
                this.query.forEach(function (groupId) {
                    self.groups[groupId].activeFilterIds = [];
                });
                this.query = [];
            }
            group.activeFilterIds.push(filterId);
            // if initiaLength is 0, the group was not active.
            if (filter.type === 'favorite' || initiaLength === 0) {
                this.query.push(group.id);
            }
        } else {
            group.activeFilterIds.splice(index, 1);
            // if initiaLength is 1, the group is now inactive.
            if (initiaLength === 1) {
                this.query.splice(this.query.indexOf(group.id), 1);
            }
        }
    },
    /**
     * Remove the group from the query.
     *
     * @private
     * @param {string} groupId
     */
    _deactivateGroup: function (groupId) {
        var self = this;
        var group = this.groups[groupId];
        _.each(group.activeFilterIds, function (filterId) {
            var filter = self.filters[filterId];
            if (filter.autoCompleteValues) {
                filter.autoCompleteValues = [];
            }
        });
        group.activeFilterIds = [];
        this.query.splice(this.query.indexOf(groupId), 1);
    },
    // This method should work in batch too
    // TO DO: accept selection of multiple options?
    // for now: activate an option forces the deactivation of the others
    // optionId optional: the method could be used at initialization...
    // --> one falls back on defautlOptionId.
    /**
     * Used to toggle a given filter(Id) that has options with a given option(Id).
     *
     * @private
     * @param {string} filterId
     * @param {string} optionId
     */
    _toggleFilterWithOptions: function (filterId, optionId) {
        var filter = this.filters[filterId];
        var group = this.groups[filter.groupId];
        var alreadyActive = group.activeFilterIds.indexOf(filterId) !== -1;
        if (alreadyActive) {
            if (filter.currentOptionId === optionId) {
                this._toggleFilter(filterId);
                filter.currentOptionId = false;
            } else {
                filter.currentOptionId = optionId || filter.defaultOptionId;
            }
        } else {
            this._toggleFilter(filterId);
            filter.currentOptionId = optionId || filter.defaultOptionId;
        }
    },
});

return ControlPanelModel;

});
