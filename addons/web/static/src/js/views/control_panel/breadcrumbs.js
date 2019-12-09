odoo.define('web.Breadcrumbs', function (require) {
    "use strict";

    const { Component, hooks } = owl;
    const { useStore } = hooks;

    class Breadcrumbs extends Component {
        constructor() {
            super(...arguments);

            this.state = useStore(state => state.breadcrumbs, { store: this.env.cpstore });
        }

        get breadcrumbs() {
            return this.state.breadcrumbs.map(bc => {
                return {
                    controllerID: bc.controllerID,
                    title: bc.title && bc.title.trim(),
                };
            }).concat({ title: this.state.title && this.state.title.trim() });
        }
    }

    Breadcrumbs.defaultProps = {};
    Breadcrumbs.props = {};
    Breadcrumbs.template = 'Breadcrumbs';

    return Breadcrumbs;
});
