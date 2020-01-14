odoo.define('web.ControlPanel', function (require) {
    "use strict";

    const ControlPanelStore = require('web.ControlPanelStore');
    const FavoriteMenu = require('web.FavoriteMenu');
    const FilterMenu = require('web.FilterMenu');
    const GroupByMenu = require('web.GroupByMenu');
    const Pager = require('web.Pager');
    const SearchBar = require('web.SearchBar');
    const Sidebar = require('web.Sidebar');
    const TimeRangeMenu = require('web.TimeRangeMenu');

    const { Component, hooks } = owl;
    const { useDispatch, useRef, useState, useSubEnv, useStore, useGetters } = hooks;

    /**
     * Control panel
     *
     * The control panel of the action.
     * @extends Component
     */
    class ControlPanel extends Component {
        constructor() {
            super(...arguments);

            useSubEnv({
                controlPanelStore: this.props.controlPanelStore,
            });

            this.state = useState(this.initialState);
            this.storeState = {};
            this._connectToStore(this.env.controlPanelStore);

            // Reference hooks
            this.contentRefs = {
                buttons: useRef('buttons'),
                searchView: useRef('searchView'),
                searchViewButtons: useRef('searchViewButtons'),
            };
            if (this.constructor.name === 'ControlPanel') window.top.cp = this; // TODO: REMOVE
        }

        mounted() {
            this._appendCPContent();
        }

        patched() {
            this._appendCPContent();
        }

        async willUpdateProps(nextProps) {
            console.log("CP: update", nextProps);
        }

        //--------------------------------------------------------------------------
        // Getters
        //--------------------------------------------------------------------------

        /**
         * @returns {Object}
         */
        get initialState() {
            return {
                displayDropdowns: true,
                openedMenu: null,
            };
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
        // Private
        //--------------------------------------------------------------------------

        /**
         * @todo this is a compatibility adapter and it must be removed as soon
         * as renderers no longer instantiate manually their buttons, their searchView
         * and their searchViewButtons.
         * @private
         */
        _appendCPContent() {
            for (const key in this.storeState.cp_content) {
                const content = this.storeState.cp_content[key]();
                if (this.contentRefs[key].el && content && content.length) {
                    this.contentRefs[key].el.innerHTML = "";
                    this.contentRefs[key].el.append(...content);
                }
            }
        }

        /**
         * Overriden when no store is used (@see ControlPanelX2Many for example).
         * @private
         * @param {ControlPanelStore} store
         */
        _connectToStore(store) {
            this.storeState = useStore(state => state, { store });
            this.query = useStore(state => state.query, { store,
                onUpdate: () => this.trigger('search', store.getQuery()),
            });
            this.dispatch = useDispatch(store);
            this.getters = useGetters(store);
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        _onUpdateQuery() {
            console.log('Query updated', ...arguments);
        }
    }

    ControlPanel.components = { Pager, SearchBar, Sidebar, FilterMenu, TimeRangeMenu, GroupByMenu, FavoriteMenu };
    ControlPanel.defaultProps = {
        breadcrumbs: [],
        views: [],
        withBreadcrumbs: true,
        withSearchBar: true,
    };
    ControlPanel.props = {
        action: Object,
        breadcrumbs: Array,
        controlPanelStore: ControlPanelStore,
        fields: Object,
        modelName: String,
        searchMenuTypes: Array,
        title: { type: String, optional: 1 },
        viewType: String,
        views: Array,
        withBreadcrumbs: Boolean,
        withSearchBar: Boolean,
    };
    ControlPanel.template = 'ControlPanel';

    return ControlPanel;
});
