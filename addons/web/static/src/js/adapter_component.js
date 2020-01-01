odoo.define('web.AdapterComponent', function (require) {

/**
 * This file defines an OWL component meant to be used as universal adapter for
 * components that embed both OWL components and Odoo legacy widgets uniformly.
 * The adapter takes the component/widget class as 'component' prop, and the
 * arguments (except first arg parent) to initialize it as 'args' prop.
 */

const { Component, tags } = owl;

class AdapterComponent extends Component {
    constructor(parent, props) {
        if (!props.Component) {
            throw Error(`AdapterComponent: 'component' prop is missing.`);
        } else if (!(props.Component.prototype instanceof Component)) {
            AdapterComponent.template = tags.xml`<div/>`;
            super(...arguments);
            this.template = AdapterComponent.template;
            AdapterComponent.template = null;
        } else {
            super(...arguments);
        }

        this.widget = null;
    }

    willStart() {
        if (!(this.props.Component.prototype instanceof Component)) {
            this.widget = new this.props.Component(this, ...this.widgetArgs);
            return this.widget._widgetRenderAndInsert(() => {});
        }
    }

    get widgetArgs() {
        throw new Error('widgetArgs must be implemented by specializations of AdapterComponent');
    }

    /**
     * Mocks _trigger_up to redirect Odoo legacy events to OWL events.
     *
     * @private
     * @param {OdooEvent} ev
     */
    _trigger_up(ev) {
        const evType = ev.name;
        const payload = ev.data;
        if (evType === 'call_service') {
            let args = payload.args || [];
            if (payload.service === 'ajax' && payload.method === 'rpc') {
                // ajax service uses an extra 'target' argument for rpc
                args = args.concat(ev.target);
            }
            const service = this.env.services[payload.service];
            const result = service[payload.method].apply(service, args);
            payload.callback(result);
        } else if (evType === 'get_session') {
            if (payload.callback) {
                payload.callback(this.env.session);
            }
        } else if (evType === 'load_views') {
            const params = {
                model: payload.modelName,
                context: payload.context,
                views_descr: payload.views,
            };
            this.env.dataManager
                .load_views(params, payload.options || {})
                .then(payload.on_success);
        } else if (evType === 'load_filters') {
            return this.env.dataManager
                .load_filters(payload)
                .then(payload.on_success);
        } else {
            this.trigger(evType.replace(/_/g, '-'), payload);
        }
    }

    __patch(vnode) {
        if (this.widget) {
            vnode.elm = this.widget.el;
        }
        return super.__patch(...arguments);
    }

    mounted() {
        if (this.widget && this.widget.on_attach_callback) {
            this.widget.on_attach_callback();
        }
    }

    destroy() {
        if (this.widget) {
            this.widget.destroy();
        }
        super.destroy();
    }
}

return AdapterComponent;

});
