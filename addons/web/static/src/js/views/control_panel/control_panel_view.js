odoo.define('web.ControlPanel', function (require) {
"use strict";

const Breadcrumbs = require('web.Breadcrumbs');
const Pager = require('web.Pager');
const SearchBar = require('web.SearchBar');
const Sidebar = require('web.Sidebar');
const SearchMenus = require('web.SearchMenus');
const ViewSwitcher = require('web.ViewSwitcher');

const { DEFAULT_INTERVAL, DEFAULT_PERIOD, INTERVAL_OPTIONS, OPTION_GENERATORS } = require('web.controlPanelViewParameters');
const { Factory } = require('web.mvc');
const { loadLibs } = require('web.ajax');
const { parseArch } = require('web.viewUtils');
const pyUtils = require('web.py_utils');
const Domain = require('web.Domain');

const { Component, hooks } = owl;
const { useState, useStore } = hooks;

class ControlPanel extends Component {
    constructor() {
        super(...arguments);

        this.state = useState({
            submenus: false,
        });
        this.buttons = useStore(state => state.buttons, { store: this.env.cpstore });

        // const viewInfo = this.props.viewInfo || { arch: '<search/>', fields: {} };
        // const context = Object.assign({}, this.props.context);
        // const domain = this.props.domain || [];
        // const action = this.props.action || {};

        // this.searchDefaults = {};
        // for (const key in context) {
        //     const match = /^search_default_(.*)$/.exec(key);
        //     if (match) {
        //         this.searchDefaults[match[1]] = context[key];
        //         delete context[key];
        //     }
        // }

        // this.arch = parseArch(viewInfo.arch);
        // this.fields = viewInfo.fields;

        // this.referenceMoment = moment();
        // this.optionGenerators = OPTION_GENERATORS.map(option => {
        //     const description = option.description ?
        //         option.description.toString() :
        //         this.referenceMoment.clone()
        //             .set(option.setParam)
        //             .add(option.addParam)
        //             .format(option.format);
        //     return Object.assign({}, option, { description });
        // });
        // this.intervalOptions = INTERVAL_OPTIONS.map(option =>
        //     Object.assign({}, option, { description: option.description.toString() })
        // );

        // this.controllerParams.modelName = this.props.modelName;

        // this.modelParams.context = context;
        // this.modelParams.domain = domain;
        // this.modelParams.modelName = this.props.modelName;
        // this.modelParams.actionId = action.id;
        // this.modelParams.fields = this.fields;

        // this.rendererParams.action = action;
        // this.rendererParams.breadcrumbs = this.props.breadcrumbs;
        // this.rendererParams.context = context;
        // this.rendererParams.searchMenuTypes = this.props.searchMenuTypes || [];
        // this.rendererParams.template = this.props.template;
        // this.rendererParams.title = this.props.title;
        // this.rendererParams.withBreadcrumbs = this.props.withBreadcrumbs !== false;
        // this.rendererParams.withSearchBar = 'withSearchBar' in this.props ? this.props.withSearchBar : true;

        // this.loadParams.withSearchBar = 'withSearchBar' in this.props ? this.props.withSearchBar : true;
        // this.loadParams.searchMenuTypes = this.props.searchMenuTypes || [];
        // this.loadParams.activateDefaultFavorite = this.props.activateDefaultFavorite;
        // if (this.loadParams.withSearchBar) {
        //     if (this.props.state) {
        //         this.loadParams.initialState = this.props.state;
        //     } else {
        //         // groups are determined in _parseSearchArch
        //         this.loadParams.groups = [];
        //         this.loadParams.timeRanges = context.time_ranges;
        //         this._parseSearchArch(this.arch);
        //     }
        // }

        // // add a filter group with the dynamic filters, if any
        // if (this.props.dynamicFilters && this.props.dynamicFilters.length) {
        //     const dynamicFiltersGroup = params.dynamicFilters.map(filter => {
        //         return {
        //             description: filter.description,
        //             domain: JSON.stringify(filter.domain),
        //             isDefault: true,
        //             type: 'filter',
        //         };
        //     });
        //     this.loadParams.groups.unshift(dynamicFiltersGroup);
        // }
        window.top.cp = this;
    }

    exportState() { }

    importState() { }

    // async willStart() {
    //     this.env.cpstore.dispatch('load', {

    //     });
    // }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Object} child parsed arch node
     * @returns {Object}
     */
    _evalArchChild(child) {
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
            } catch (e) {}
        }
        return child;
    }

    /**
     * @private
     * @param {Object} filter
     * @param {Object} attrs
     */
    _extractAttributes(filter, attrs) {
        filter.isDefault = this.searchDefaults[attrs.name] ? true : false;
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
                filter.fieldType = this.fields[attrs.date].type;
                filter.hasOptions = true;
                filter.options = this.optionGenerators;
                filter.defaultOptionId = attrs.default_period ||
                                            DEFAULT_PERIOD;
                filter.currentOptionIds = new Set();
                filter.basicDomains = this._getDateFilterBasicDomains(filter);
            }
            if (attrs.invisible) {
                filter.invisible = true;
            }
        } else if (filter.type === 'groupBy') {
            if (filter.isDefault) {
                const val = this.searchDefaults[attrs.name];
                filter.defaultRank = typeof val === 'number' ? val : 100;
            }
            filter.fieldName = attrs.fieldName;
            filter.fieldType = this.fields[attrs.fieldName].type;
            if (['date', 'datetime'].includes(filter.fieldType)) {
                filter.hasOptions = true;
                filter.options = this.intervalOptions;
                filter.defaultOptionId = attrs.defaultInterval ||
                                            DEFAULT_INTERVAL;
                filter.currentOptionIds = new Set();
            }
        } else if (filter.type === 'field') {
            if (filter.isDefault) {
                filter.defaultRank = -10;
            }
            const field = this.fields[attrs.name];
            filter.attrs = attrs;
            filter.autoCompleteValues = [];
            if (filter.isDefault) {
                // on field, default can be used with a value
                filter.defaultValue = this.searchDefaults[filter.attrs.name];
            }
            if (!attrs.string) {
                attrs.string = field.string;
            }
        }
    }

    /**
     * Constructs an object containing constious domains based on this.referenceMoment and
     * the field associated with the provided date filter.
     *
     * @private
     * @param {Object} filter
     * @returns {Object}
     */
    _getDateFilterBasicDomains(filter) {
        const _constructBasicDomain = (y, o) => {
            const addParam = Object.assign({}, y.addParam, o ? o.addParam : {});
            const setParam = Object.assign({}, y.setParam, o ? o.setParam : {});
            const granularity = o ? o.granularity : y.granularity;
            const date = this.referenceMoment.clone().set(setParam).add(addParam);
            let leftBound = date.clone().startOf(granularity);
            let rightBound = date.clone().endOf(granularity);

            if (filter.fieldType === 'date') {
                leftBound = leftBound.format("YYYY-MM-DD");
                rightBound = rightBound.format("YYYY-MM-DD");
            } else {
                leftBound = leftBound.utc().format("YYYY-MM-DD HH:mm:ss");
                rightBound = rightBound.utc().format("YYYY-MM-DD HH:mm:ss");
            }
            const domain = Domain.prototype.arrayToString([
                '&',
                [filter.fieldName, ">=", leftBound],
                [filter.fieldName, "<=", rightBound]
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
        this.optionGenerators.filter(y => y.groupId === 2).forEach(y => {
            domains[y.optionId] = _constructBasicDomain(y);
            this.optionGenerators.filter(y => y.groupId === 1).forEach(o => {
                domains[y.optionId + "__" + o.optionId] = _constructBasicDomain(y, o);
            });
        });
        return domains;
    }

    /**
     * Parse the arch of a 'search' view.
     *
     * @private
     * @param {Object} arch arch with root node <search>
     */
    _parseSearchArch(arch) {
        // a searchview arch may contain a 'searchpanel' node, but this isn't
        // the concern of the ControlPanelView (the SearchPanel will handle it).
        // Ideally, this code should whitelist the tags to take into account
        // instead of blacklisting the others, but with the current (messy)
        // structure of a searchview arch, it's way simpler to do it that way.
        const children = arch.children.filter(child =>  child.tag !== 'searchpanel');

        const preFilters = children.reduce((acc, child) => {
            if (child.tag === 'group') {
                acc = acc.concat(children.map(this._evalArchChild));
            } else {
                acc.push(this._evalArchChild(child));
            }
            return acc;
        }, []);

        preFilters.push({ tag: 'separator' });

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
                        this.loadParams.groups.push(currentGroup);
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
        if (groupOfGroupBys.length) {
            this.loadParams.groups.push(groupOfGroupBys);
        }
    }
}

ControlPanel.components = { Breadcrumbs, Pager, SearchBar, Sidebar, SearchMenus, ViewSwitcher };
// ControlPanel.props = {};
ControlPanel.template = 'ControlPanel';

var ControlPanelView = Factory.extend({

    /**
     * @override
     * @param {Object} [params={}]
     * @param {Object} [params.action={}]
     * @param {Object} [params.context={}]
     * @param {string} [params.domain=[]]
     * @param {string} [params.modelName]
     * @param {string[]} [params.searchMenuTypes=[]]
     *   determines search menus displayed.
     * @param {Object} [params.state] used to determine the control panel model
     *   essential content at load. For instance, state can be the state of an
     *   other control panel model that we want to use.
     * @param {string} [params.title] the name of the action, to display in the
     *   breadcrumb
     * @param {string} [params.template] the QWeb template to render
     * @param {Object} [params.viewInfo={arch: '<search/>', fields: {}}] a
     *   search fieldsview
     * @param {string} [params.viewInfo.arch]
     * @param {boolean} [params.withBreadcrumbs=true] if set to false,
     *   breadcrumbs won't be rendered
     * @param {boolean} [params.withSearchBar=true] if set to false, no default
     *   search bar will be rendered
     * @param {Object[]} [params.dynamicFilters=[]] filters to add to the
     *   search (in addition to those described in the arch), each filter being
     *   an object with keys 'description' (what is displayed in the searchbar)
     *   and 'domain'
     */
    init(params={}) {
        this._super();
        const viewInfo = params.viewInfo || { arch: '<search/>', fields: {} };
        const context = Object.assign({}, params.context);
        const domain = params.domain || [];
        const action = params.action || {};

        this.searchDefaults = {};
        for (const key in context) {
            const match = /^search_default_(.*)$/.exec(key);
            if (match) {
                this.searchDefaults[match[1]] = context[key];
                delete context[key];
            }
        }

        this.arch = parseArch(viewInfo.arch);
        this.fields = viewInfo.fields;

        this.referenceMoment = moment();
        this.optionGenerators = OPTION_GENERATORS.map(option => {
            const description = option.description ?
                option.description.toString() :
                this.referenceMoment.clone()
                    .set(option.setParam)
                    .add(option.addParam)
                    .format(option.format);
            return Object.assign({}, option, { description });
        });
        this.intervalOptions = INTERVAL_OPTIONS.map(option =>
            Object.assign({}, option, { description: option.description.toString() })
        );

        this.controllerParams.modelName = params.modelName;

        this.modelParams.context = context;
        this.modelParams.domain = domain;
        this.modelParams.modelName = params.modelName;
        this.modelParams.actionId = action.id;
        this.modelParams.fields = this.fields;

        this.rendererParams.action = action;
        this.rendererParams.breadcrumbs = params.breadcrumbs;
        this.rendererParams.context = context;
        this.rendererParams.searchMenuTypes = params.searchMenuTypes || [];
        this.rendererParams.template = params.template;
        this.rendererParams.title = params.title;
        this.rendererParams.withBreadcrumbs = params.withBreadcrumbs !== false;
        this.rendererParams.withSearchBar = 'withSearchBar' in params ? params.withSearchBar : true;

        this.loadParams.withSearchBar = 'withSearchBar' in params ? params.withSearchBar : true;
        this.loadParams.searchMenuTypes = params.searchMenuTypes || [];
        this.loadParams.activateDefaultFavorite = params.activateDefaultFavorite;
        if (this.loadParams.withSearchBar) {
            if (params.state) {
                this.loadParams.initialState = params.state;
            } else {
                // groups are determined in _parseSearchArch
                this.loadParams.groups = [];
                this.loadParams.timeRanges = context.time_ranges;
                this._parseSearchArch(this.arch);
            }
        }

        // add a filter group with the dynamic filters, if any
        if (params.dynamicFilters && params.dynamicFilters.length) {
            const dynamicFiltersGroup = params.dynamicFilters.map(filter => {
                return {
                    description: filter.description,
                    domain: JSON.stringify(filter.domain),
                    isDefault: true,
                    type: 'filter',
                };
            });
            this.loadParams.groups.unshift(dynamicFiltersGroup);
        }
    },

    /**
     * @override
     */
    async getController(parent) {
        const model = this.getModel(parent);
        const results = await Promise.all([this._loadData(model), loadLibs(this)]);
        const state = results[0];
        const controllerParams = Object.assign({
            model: model,
            rendererProps: Object.assign(state, this.rendererParams),
        }, this.controllerParams);
        const controller = new this.config.Controller(null, controllerParams);
        model.setParent(controller);
        return controller;
    },
});

return ControlPanel;

});
