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
                action: this.props.action,
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

            // <<<<<<<<<<<<<<<<<<< TO REMOVE

            if (this.constructor.name === 'ControlPanel') {
                window.top.cp = this;
                this.getChild = (name, comp = this) => {
                    if (comp.constructor.name === name) {
                        return comp;
                    }
                    for (const child of Object.values(comp.__owl__.children)) {
                        const found = this.getChild(name, child);
                        if (found) {
                            return found;
                        }
                    }
                    return false;
                };
            }

            // >>>>>>>>>>>>>>>>>>>
        }

        async willUpdateProps(nextProps) {
            if ('action' in nextProps) {
                this.env.action = nextProps.action;
            }
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
        // Private
        //--------------------------------------------------------------------------

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
    }

    ControlPanel.components = { Pager, SearchBar, Sidebar, FilterMenu, TimeRangeMenu, GroupByMenu, FavoriteMenu };
    ControlPanel.defaultProps = {
        breadcrumbs: [],
        views: [],
        withBreadcrumbs: true,
        withSearchBar: true,
    };
    // todo review default props and props
    ControlPanel.props = {
        action: Object,
        breadcrumbs: Array,
        controlPanelStore: ControlPanelStore,
        fields: Object,
        modelName: String,
        pager: { validate: p => typeof p === 'object' || p === null, optional: 1 },
        searchMenuTypes: Array,
        sidebar: { validate: s => typeof s === 'object' || s === null, optional: 1 },
        title: { type: String, optional: 1 },
        viewType: { type: String, optional: 1 },
        views: Array,
        withBreadcrumbs: Boolean,
        withSearchBar: Boolean,
    };
    ControlPanel.template = 'ControlPanel';

    return ControlPanel;
});

