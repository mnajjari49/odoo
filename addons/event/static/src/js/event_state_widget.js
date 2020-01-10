odoo.define('event.event_state_widget', function (require) {
"use strict";

var core = require('web.core');
var registry = require('web.field_registry');
var AbstractField = require('web.AbstractField');
var QWeb = core.qweb;

var EventStateWidget = AbstractField.extend({
    template: 'event.EventStateWidget',

    /**
     * @override
     * @private
     */
    init: function () {
        this._super.apply(this, arguments);
    },

    /**
     * @override
     * @private
     */
    _render: function () {
        this._super.apply(this, arguments);
        if (this.value === 'sent') {
            this.icon = 'fa fa-check';
            this.title = 'Sent';
        } else if (this.value === 'scheduled') {
            this.icon = 'fa fa-hourglass-half';
            this.title = 'Scheduled';
        } else {
            this.icon = 'fa fa-cogs';
            this.title = 'Automated';
        }
        this.$el.html(QWeb.render('event.EventStateWidget', {'widget': this}));
    },

});

registry.add('event_state_widget', EventStateWidget);

return EventStateWidget;

});
