odoo.define('web.Sidebar', function (require) {
    "use strict";

    const Context = require('web.Context');
    const DropdownMenu = require('web.DropdownMenu');
    const pyUtils = require('web.py_utils');

    const { Component, hooks } = owl;
    const { useStore } = hooks;

    class Sidebar extends Component {
        constructor() {
            super(...arguments);

            this.sidebarProps = useStore(state => state.sidebar, {
                store: this.env.controlPanelStore,
            });
        }

        mounted() {
            this._addTooltips();
        }

        patched() {
            this._addTooltips();
        }

        //--------------------------------------------------------------------------
        // Getters
        //--------------------------------------------------------------------------

        /**
         * @returns {Object[]}
         */
        get actionItems() {
            const actionActions = this.sidebarProps.items.action || [];
            const relateActions = this.sidebarProps.items.relate || [];
            const callbackActions = this.sidebarProps.items.other || [];

            const formattedActions = [...actionActions, ...relateActions].map(action => {
                return {
                    action: action,
                    description: action.name,
                };
            });
            const actionItems = callbackActions.concat(formattedActions);
            console.log({ actionItems });
            return actionItems;
        }

        /**
         * @returns {Object[]}
         */
        get printItems() {
            const printActions = this.sidebarProps.items.print || [];

            const printItems = printActions.map(action => {
                return {
                    action: action,
                    description: action.name,
                };
            });
            console.log({ printItems });
            return printItems;
        }

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * Add teh tooltips to the items
         * @private
         */
        _addTooltips() {
            $(this.el.querySelectorAll('[title]')).tooltip({
                delay: { show: 500, hide: 0 }
            });
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * Perform the action for the item clicked after getting the data
         * necessary with a trigger.
         * @private
         * @param {OwlEvent} ev
         */
        async _executeAction(action) {
            const activeIdsContext = {
                active_id: this.sidebarProps.activeIds[0],
                active_ids: this.sidebarProps.activeIds,
                active_model: this.props.modelName,
            };
            if (this.sidebarProps.domain) {
                activeIdsContext.active_domain = this.sidebarProps.domain;
            }

            const context = pyUtils.eval('context', new Context(this.sidebarProps.context, activeIdsContext));
            const result = await this.rpc({
                route: '/web/action/load',
                params: {
                    action_id: action.id,
                    context: context,
                },
            });
            result.context = new Context(result.context || {}, activeIdsContext)
                .set_eval_context(context);
            result.flags = result.flags || {};
            result.flags.new_window = true;
            this.trigger('do_action', { action: result });
        }

        /**
         * @private
         * @param {OwlEvent} ev
         */
        _onItemSelected(ev) {
            const { item } = ev.detail;
            if (item.callback) {
                item.callback([item]);
            } else if (item.action) {
                this._executeAction(item.action);
            } else if (item.url) {
                // Event has been prevented at its source: we need to redirect manually.
                window.location = item.url;
            }
        }
    }

    Sidebar.components = { DropdownMenu };
    Sidebar.props = {
        modelName: String,
    };
    Sidebar.template = 'Sidebar';

    return Sidebar;
});
