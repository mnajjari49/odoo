odoo.define('web.Action', function (require) {
"use strict";

/**
 * This file defines the Action component which is instantiated by the
 * ActionManager.
 *
 * For the sake of backward compatibility, it uses an AdapterComponent.
 */

const AbstractView = require('web.AbstractView');
const AdapterComponent = require('web.AdapterComponent');

class Action extends AdapterComponent {
    constructor(parent, props) {
        super(...arguments);
        if (!(props.Component.prototype instanceof owl.Component)) {
            this.legacy = true;
        }
    }

    async willStart() {
        if (this.props.Component.prototype instanceof AbstractView) {
            this.legacy = 'view';
            this.starting = true;
            const action = this.props.action;
            const viewDescr = action.views.find(view => view.type === action.controller.viewType);
            const view = new viewDescr.View(viewDescr.fieldsView, action.controller.viewOptions);
            this.widget = await view.getController(this);
            return this.widget._widgetRenderAndInsert(() => {});
        } else if (this.legacy) {
            this.legacy = 'action';
        }
        return super.willStart();
    }

    get widgetArgs() {
        return [this.props.action, this.props.options];
    }

    shouldUpdate(nextProps) {
        if (this.legacy) {
            const starting = this.starting;
            this.starting = false
            return nextProps.shouldUpdateWidget && !starting;
        }
        return super.shouldUpdate(nextProps);
    }
    async willUpdateProps(nextProps) {
        if (this.legacy === 'view') {
            const options = nextProps.options;
            await this.widget.reload(options);
        }
        return super.willUpdateProps(...arguments);
    }

    // TODO: override destroy to keep actions in action stack alive?
}

return Action;

});
