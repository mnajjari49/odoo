odoo.define('web_tour.Tour', function(require) {
"use strict";

var core = require('web.core');

function getCurrentStep(name) {
    var key = 'tour_' + name + '_step';
    return parseInt(window.localStorage.getItem(key)) || 0;
}

return core.Class.extend({
    init: function() {
        this.active_tooltips = [];
        this.tours = {};
        this.displayed_tips = [];
    },
    register: function() {
        var args = Array.prototype.slice.call(arguments);
        var name = args[0];
        var options = args.length === 2 ? {} : args[1];
        var steps = args[args.length - 1];

        if (!(steps instanceof Array)) {
            steps = [steps];
        }
        var tour = {
            name: name,
            current_step: getCurrentStep(name),
            steps: steps,
            url: options.url,
        };
        this.tours[name] = tour;
        this.active_tooltips.push(steps[tour.current_step]);
    },
    check_for_tooltip: function() {
        var self = this;
        this.active_tooltips = _.filter(this.active_tooltips, function (tip) {
            var $trigger = $(tip.trigger);
            if ($trigger.length) {
                self.remove_displayed_tips();
                self.show_tip($trigger, tip);
                return false;
            } else {
                return true;
            }
        });
    },
    remove_displayed_tips: function() {
        // debugger;
        while (this.displayed_tips.length) {
            this.displayed_tips.pop().popover('destroy');
        }
    },
    show_tip: function($trigger, tip) {
        var popover = $trigger.popover({
            title: tip.title,
            content: tip.content,
            html: true,
            // container: 'body',
            animation: false,
            placement: tip.position,
        });
        popover.popover('show');

        this.displayed_tips.push(popover);
    },
});

});
