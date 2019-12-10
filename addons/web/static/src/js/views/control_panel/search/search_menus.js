odoo.define('web.SearchMenus', function (require) {
    "use strict";

    const { Component, hooks } = owl;
    const { useStore } = hooks;

    class SearchMenus extends Component {
        constructor() {
            super(...arguments);

            this.filters = useStore(state => state.filters, { store: this.env.controlPanelStore });
            this.groups = useStore(state => state.groups, { store: this.env.controlPanelStore });
            this.query = useStore(state => state.query, { store: this.env.controlPanelStore });
        }
    }

    SearchMenus.defaultProps = {};
    SearchMenus.props = {};
    SearchMenus.template = 'SearchMenus';

    return SearchMenus;
});
