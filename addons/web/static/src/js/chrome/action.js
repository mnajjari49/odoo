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

const { Component, tags } = owl;

class Action extends AdapterComponent {
    constructor(parent, props) {
        if (props.Component.prototype instanceof Component) {
            // FIXME: move this to adapter_component + handle class (t-attf)
            // FIXME: try to set it on Action again
            Action.components[props.Component] = props.Component;
            Action.template = tags.xml`<t t-component="props.Component" class="o_action" action="props.action" options="props.options"/>`;
            super(...arguments);
            this.components = Action.components;
            this.template = Action.template;
            // Action.components = null;
            Action.template = null;
        } else {
            super(...arguments);
        }
    }

    async willStart() {
        if (this.props.Component.prototype instanceof AbstractView) {
            const action = this.props.action;
            const viewDescr = action.views.find(view => view.type === action.controller.viewType);
            const view = new viewDescr.View(viewDescr.fieldsView, action.controller.viewOptions);
            this.widget = await view.getController(this);
            return this.widget._widgetRenderAndInsert(() => {});
        }
        return super.willStart();
    }

    get widgetArgs() {
        return [this.props.action, this.props.options];
    }

    shouldUpdate() {
        return false;
    }

    // TODO: override destroy to keep actions in action stack alive?
}

return Action;

});
