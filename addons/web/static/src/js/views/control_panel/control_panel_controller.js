odoo.define('web.ControlPanelController', function (require) {
    "use strict";

    // const ControlPanelRenderer = require('web.ControlPanelRenderer');

    // const { Component, useState } = owl;
    // const ALLOWED_PROPS = [
    //     'breadcrumbs',
    //     'buttons',
    //     'context',
    //     'facets',
    //     'fields',
    //     'filterFields',
    //     'filters',
    //     'groupBys',
    //     'pager',
    //     'searchbar',
    //     'sidebar',
    //     'title',
    //     'views',
    //     'viewType',
    //     'withBreadcrumbs',
    // ];

    // /**
    //  * @private
    //  * @param {*} target
    //  * @param {*} initial
    //  * @returns {*}
    //  */
    // function deepCopy(target, initial) {
    //     if (Array.isArray(initial)) {
    //         // target = target || [];
    //         // return Object.assign(target, initial);
    //         if (!Array.isArray(target)) {
    //             target = [];
    //         }
    //         for (let i = 0; i < initial.length; i ++) {
    //             target[i] = deepCopy(target[i], initial[i]);
    //         }
    //     } else if (typeof initial === 'object' && initial !== null) {
    //         // target = target || {};
    //         // return Object.assign(target, initial);
    //         try {
    //             if (typeof target !== 'object') {
    //                 target = initial.constructor ? new initial.constructor() : {};
    //             }
    //             for (const key in initial) {
    //                 if (initial.hasOwnProperty(key)) {
    //                     target[key] = deepCopy(target[key], initial[key]);
    //                 }
    //             }
    //         } catch (err) {
    //             if (!(err instanceof TypeError)) {
    //                 throw err;
    //             }
    //             target = err.message === 'Illegal constructor' ?
    //                 initial :
    //                 Object.assign({}, initial);
    //         }
    //     } else {
    //         target = initial;
    //     }
    //     return target;
    // }

    // /**
    //  * Control panel controller
    //  *
    //  *    ActionManager
    //  *          │
    //  *    ViewController > AbstractController
    //  *         /                 \
    //  *   ViewRenderer        CPController
    //  *                            │
    //  *                        CPRenderer
    //  *
    //  * @extends Component
    //  */
    // class ControlPanelController extends Component {
    //     constructor() {
    //         super(...arguments);
    //         this.model = this.props.model;
    //         this.renderer = this.props.renderer;
    //         this.modelName = this.props.modelName;

    //         this.rendererProps = useState(this.props.rendererProps);
    //         this.state = useState({ updateFlag: false });

    //         if (!window.top.cpcontroller) {
    //             window.top.cpcontroller = this;
    //         }
    //     }

    //     //--------------------------------------------------------------------------
    //     // Properties
    //     //--------------------------------------------------------------------------

    //     /**
    //      * Compute the search related values that will be used to fetch data.
    //      * @returns {Object} object with keys 'context', 'domain', 'groupBy'
    //      */
    //     get searchQuery() {
    //         return this.model.getQuery();
    //     }

    //     //--------------------------------------------------------------------------
    //     // Public
    //     //--------------------------------------------------------------------------

    //     /**
    //      * @see ControlPanelModel (exportState)
    //      * @returns {Object}
    //      */
    //     exportState() {
    //         return this.model.exportState();
    //     }

    //     /**
    //      * Called by the abstract controller to give focus to the searchbar
    //      */
    //     focusSearchBar() {
    //         if (this.renderer.searchBar) {
    //             this.renderer.searchBar.focus();
    //         }
    //     }

    //     /**
    //      * @param {Object} state a ControlPanelModel state
    //      * @returns {Promise<Object>} the result of `getSearchState`
    //      */
    //     async importState(state) {
    //         this.model.importState(state);
    //         this._updateRendererProps();
    //         return this.searchQuery;
    //     }

    //     /**
    //      * Called at each switch view. This is required until the control panel is
    //      * shared between controllers of an action.
    //      * @param {string} controllerID
    //      */
    //     setControllerID(controllerID) {
    //         this.controllerID = controllerID;
    //     }

    //     /**
    //      * Update the content of the control panel.
    //      * @see  ControlPanelRenderer (updateContents)
    //      * @param {Object} status
    //      * @param {Object} [options]
    //      */
    //     updateProps(props) {
    //         this._updateRendererProps(props);
    //     }

    //     /**
    //      * Update the domain of the search view by adding and/or removing filters.
    //      *
    //      * @todo: the way it is done could be improved, but the actual state of the
    //      * searchview doesn't allow to do much better.

    //      * @param {Object[]} newFilters list of filters to add, described by
    //      *   objects with keys domain (the domain as an Array), description (the text
    //      *   to display in the facet) and type with value 'filter'.
    //      * @param {string[]} filtersToRemove list of filter ids to remove
    //      *   (previously added ones)
    //      * @returns {string[]} list of added filters (to pass as filtersToRemove
    //      *   for a further call to this function)
    //      */
    //     updateFilters(newFilters, filtersToRemove) {
    //         const newFilterIDS = this.model.createNewFilters(newFilters);
    //         this.model.deactivateFilters(filtersToRemove);
    //         this._reportNewQueryAndRender();
    //         return newFilterIDS;
    //     }

    //     //--------------------------------------------------------------------------
    //     // Private
    //     //--------------------------------------------------------------------------

    //     _filterProps(props) {
    //         const validProps = {};
    //         for (const key in props) {
    //             if (ALLOWED_PROPS.includes(key)) {
    //                 validProps[key] = props[key];
    //             }
    //         }
    //         return validProps;
    //     }

    //     /**
    //      * @private
    //      */
    //     _reportNewQueryAndRender() {
    //         this.trigger('search', this.model.getQuery());
    //         this._updateRendererProps();
    //     }

    //     _updateControlPanel() {
    //         this.state.updateFlag = !this.state.updateFlag;
    //     }

    //     /**
    //      * @private
    //      * @param {Object} props
    //      */
    //     _updateRendererProps(props) {
    //         const newProps = props || this.model.get();
    //         deepCopy(this.rendererProps, this._filterProps(newProps));
    //     }

    //     //--------------------------------------------------------------------------
    //     // Handlers
    //     //--------------------------------------------------------------------------

    //     /**
    //      * @private
    //      * @param {OwlEvent} ev
    //      */
    //     _onActivateTimeRange(ev) {
    //         const { id, timeRangeId, comparisonTimeRangeId } = ev.detail;
    //         this.model.activateTimeRange(id, timeRangeId, comparisonTimeRangeId);
    //         this._reportNewQueryAndRender();
    //     }

    //     /**
    //      * @private
    //      * @param {OwlEvent} ev
    //      */
    //     _onAutoCompletionFilter(ev) {
    //         this.model.toggleAutoCompletionFilter(ev.detail);
    //         this._reportNewQueryAndRender();
    //     }

    //     /**
    //      * @private
    //      * @param {OwlEvent} ev
    //      */
    //     _onFacetRemoved(ev) {
    //         const group = ev.detail.group || this.renderer.getLastFacet();
    //         if (group) {
    //             this.model.deactivateGroup(group.id);
    //             this._reportNewQueryAndRender();
    //         }
    //     }

    //     /**
    //      * @private
    //      * @param {OwlEvent} ev
    //      */
    //     _onGetSearchQuery(ev) {
    //         ev.detail.callback(this.searchQuery);
    //     }

    //     /**
    //      * @private
    //      * @param {OwlEvent} ev
    //      */
    //     _onItemOptionClicked(ev) {
    //         this.model.toggleFilterWithOptions(ev.detail.id, ev.detail.optionId);
    //         this._reportNewQueryAndRender();
    //     }

    //     /**
    //      * @private
    //      * @param {OwlEvent} ev
    //      */
    //     async _onItemTrashed(ev) {
    //         await this.model.deleteFilterEverywhere(ev.detail.id);
    //         this._reportNewQueryAndRender();
    //     }

    //     /**
    //      * @private
    //      * @param {OwlEvent} ev
    //      */
    //     _onMenuItemClicked(ev) {
    //         this.model.toggleFilter(ev.detail.id);
    //         this._reportNewQueryAndRender();
    //     }

    //     /**
    //      * @private
    //      * @param {OwlEvent} ev
    //      */
    //     async _onNewFavorite(ev) {
    //         await this.model.createNewFavorite(ev.detail);
    //         this._reportNewQueryAndRender();
    //     }

    //     /**
    //      * @private
    //      * @param {OwlEvent} ev
    //      */
    //     _onNewFilters(ev) {
    //         this.model.createNewFilters(ev.detail.filters);
    //         this._reportNewQueryAndRender();
    //     }

    //     /**
    //      * @private
    //      * @param {OwlEvent} ev
    //      */
    //     _onNewGroupBy(ev) {
    //         this.model.createNewGroupBy(ev.detail);
    //         this._reportNewQueryAndRender();
    //     }

    //     /**
    //      * @private
    //      */
    //     _onReload() {
    //         this.trigger('search', this.model.getQuery());
    //     }

    //     /**
    //      * @private
    //      */
    //     _onReset() {
    //         this._updateRendererProps();
    //     }
    // }

    // ControlPanelController.components = { ControlPanelRenderer };
    // ControlPanelController.template = 'ControlPanelController';

    // return ControlPanelController;
});
