odoo.define('web.ViewSwitcher', function (require) {
    "use strict";

    const { Component, hooks } = owl;
    const { useStore } = hooks;

    class ViewSwitcher extends Component {
        constructor() {
            super(...arguments);

            this.state = useStore(state => state.viewSwitcher, { store: this.env.cpstore });
        }
    }

    ViewSwitcher.defaultProps = {};
    ViewSwitcher.props = {};
    ViewSwitcher.template = 'ViewSwitcher';

    return ViewSwitcher;
});
