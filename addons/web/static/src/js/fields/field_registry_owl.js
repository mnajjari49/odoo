odoo.define('web.field_registry_owl', function (require) {
"use strict";

var field_registry = require('web.field_registry');
var Class = require('web.Class');
var AbstractField = require('web.AbstractField');

var FieldRegistryOwl = Class.extend({
    /**
     *  Act as a proxy to add an Owl widget into the field registry
     */
    add: function(name, renderer) {

        var OwlAbstractWidget = AbstractField.extend({
            start: function () {
                this.renderer = new renderer();
                return this._super.apply(this, arguments);
            },
            reset: function(record, event) {
                this.renderer.updateProps(this.value);
                return this._super.apply(this, arguments);
            },
            _render: function() {
                let prom;
                this.renderer.updateProps(this.value);
                if (this.renderer.__owl__.isMounted) {
                    prom = this.renderer.render();
                } else {
                    prom = this.renderer.mount(this.$el[0], true);
                }
                return prom;
            }
        });
        field_registry.add(name, OwlAbstractWidget);
    },
});

return new FieldRegistryOwl();

});
