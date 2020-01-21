odoo.define('web.field_registry_owl', function (require) {
"use strict";

var field_registry = require('web.field_registry');
var Class = require('web.Class');
var AbstractField = require('web.AbstractField');
/*const WidgetAdapterMixin;
const ComponentWrapper;*/

var FieldAdapter = AbstractField.extend({
    start: function () {
        this.component = new this.ComponentWrapper(this, this.ComponentClass, this.value);
        return this._super.apply(this, arguments);
    },
    reset: function(record, event) {
        this.component.updateProps(this.value);
        return this._super.apply(this, arguments);
    },
    _render: function() {
        let prom;
        this.component.updateProps(this.value);
        if (this.component.__owl__.isMounted) {
            prom = this.component.render();
        } else {
            prom = this.component.mount(this.$el[0], true);
        }
        return prom;
    }
});

function addToFieldRegistry(key, value, score) {
    const fieldClass = value;
    if (fieldClass.prototype instanceof Component) { // to check
        value = FieldAdapter.extend({
            ComponentClass: fieldClass,
        });
    field_registry.add(key, value);
    }
}

return {
    FieldAdapter,
    addToFieldRegistry,
}

// const registry_add = field_registry.add;
// field_registry.add = function (key, value, score) {
//     const fieldClass = value;
    
//     registry_add.call(field_registry, key, value, score);
// }

});
