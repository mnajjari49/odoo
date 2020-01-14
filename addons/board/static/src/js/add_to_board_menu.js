odoo.define('board.AddToBoardMenu', function (require) {
    "use strict";

    const Context = require('web.Context');
    const Domain = require('web.Domain');
    const FavoriteMenu = require('web.FavoriteMenu');
    const pyUtils = require('web.py_utils');
    const DropdownMenuItem = require('web.DropdownMenuItem');
    const { sprintf } = require('web.utils');
    const { useFocusOnUpdate } = require('web.custom_hooks');

    const { useState, useStore } = owl.hooks;

    class AddToBoardMenu extends DropdownMenuItem {
        /**
         * @param {Object} props
         * @param {Object} props.action an ir.actions description
         */
        constructor() {
            super(...arguments);

            this.interactive = true;
            this.query = useStore(state => state.query, { store: this.env.controlPanelStore });
            this.state = useState({
                open: false,
                name: this.props.action.name || "",
            });

            this.focusOnUpdate = useFocusOnUpdate();
            this.focusOnUpdate();
        }

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * This is the main function for actually saving the dashboard.  This method
         * is supposed to call the route /board/add_to_dashboard with proper
         * information.
         *
         * @private
         * @returns {Promise}
         */
        async _addToBoard() {
            const searchQuery = this.env.controlPanelStore.getQuery();
            const context = new Context(this.props.action.context);
            context.add(searchQuery.context);
            context.add({
                group_by: searchQuery.groupBy,
                orderedBy: searchQuery.orderedBy,
            });

            this.trigger('get_controller_query_params', {
                callback(params) {
                    const controllerQueryParams = Object.assign({}, params);
                    const queryContext = controllerQueryParams.context;
                    delete controllerQueryParams.context;
                    context.add(Object.assign(controllerQueryParams, queryContext));
                }
            });

            const domainArray = new Domain(this.props.action.domain || []);
            const domain = Domain.prototype.normalizeArray(domainArray.toArray().concat(searchQuery.domain));

            const evalutatedContext = pyUtils.eval('context', context);
            for (const key in evalutatedContext) {
                if (evalutatedContext.hasOwnProperty(key) && /^search_default_/.test(key)) {
                    delete evalutatedContext[key];
                }
            }
            evalutatedContext.dashboard_merge_domains_contexts = false;

            this.state.open = false;

            const result = await this.rpc({
                route: '/board/add_to_dashboard',
                params: {
                    action_id: this.props.action.id || false,
                    context_to_save: evalutatedContext,
                    domain: domain,
                    // TODO: include viewType in props or transmit it another way
                    view_mode: this.props.viewType,
                    name: this.state.name,
                },
            });
            if (result) {
                this._doNotify(
                    sprintf(this.env._t("'%s' added to dashboard"), this.state.name),
                    this.env._t('Please refresh your browser for the changes to take effect.')
                );
            } else {
                this._doWarn(this.env._t("Could not add filter to dashboard"));
            }
        }

        _doNotify(title, message) {
            this.env.bus.trigger('call_service', {
                data: {
                    args: [{ title, message, type: 'warning' }],
                    callback: x => x,
                    method: 'notify',
                    service: 'notification',
                },
            });
        }

        _doWarn(title, message) {
            this.env.bus.trigger('call_service', {
                data: {
                    args: [{ title, message, type: 'danger' }],
                    callback: x => x,
                    method: 'notify',
                    service: 'notification',
                },
            });
        }

        /**
         * Hide and display the submenu which allows adding to board.
         * @private
         */
        _toggleOpen() {
            this.state.open = !this.state.open;
            if (this.state.open) {
                this.focusOnUpdate();
            }
        }


        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         * @param {KeyboardEvent} ev
         */
        _onInputKeydown(ev) {
            switch (ev.key) {
                case 'Enter':
                    ev.preventDefault();
                    this._addToBoard();
                    break;
                case 'Escape':
                    // Gives the focus back to the component.
                    ev.preventDefault();
                    ev.target.blur();
                    break;
            }
        }

        /**
         * @private
         * @param {InputEvent} ev
         */
        _onInput(ev) {
            this.state.name = ev.target.value;
        }
    }

    AddToBoardMenu.props = {
        action: Object,
        viewType: String,
    };
    AddToBoardMenu.template = 'AddToBoardMenu';

    // Add to the FavoriteMenu components object.
    FavoriteMenu.components.AddToBoardMenu = AddToBoardMenu;

    return AddToBoardMenu;
});
