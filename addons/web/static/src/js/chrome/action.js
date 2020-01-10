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
            const viewParams = Object.assign(
                {},
                { action: action, controllerState: action.controllerState },
                action.controller.viewOptions,
            );
            const view = new viewDescr.View(viewDescr.fieldsView, viewParams);
            this.widget = await view.getController(this);
            this._reHookControllerMethods();
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
            const action = nextProps.action;
            const controllerState = action.controllerState;
            await this.widget.reload(
                {
                    offset: 0,
                    domain: action.domain,
                    groupBy: action.groupBy,
                    context: action.context,
                    controllerState
                }
            );
        }
        return super.willUpdateProps(...arguments);
    }

    _reHookControllerMethods() {
        const self = this;
        const widget = this.widget;
        const controllerReload = widget.reload;
        this.widget.reload = async function(params) {
            const controllerState = widget.exportState();
            const commonState = {};
            commonState.domain = params.domain || widget._getSearchDomain();
            if (params) {
                if (params.groupBy) {commonState.groupBy = params.groupBy;}
                if (params.context) {commonState.context = params.context;}
            }

            self.trigger('reloading-legacy', { commonState , controllerState });
            return controllerReload.call(widget, ...arguments);
        }
    }
    destroy() {
        if (this.legacy) {
            // keep legacy stuff alive because some stuff
            // are kept by AbstractModel (e.g.: orderedBy)
            return;
        }
        return super.destroy();
    }
}

return Action;

});
