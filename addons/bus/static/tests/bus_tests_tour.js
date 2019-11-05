odoo.define("bus.tour", function(require) {
    "use strict";

var tour = require("web_tour.tour");

tour.register("bundle_changed_notification", {
    test: true,
}, [{
		trigger: '.o_notification_title:contains(Update available)',
	},

	tour.STEPS.SHOW_APPS_MENU_ITEM,

	{
		trigger: '.o_app[data-menu-xmlid="base.menu_administration"]',
		position: "bottom",
	}, {
		extra_trigger: '.o_menu_brand:contains(Settings)',
		trigger: '.o_notification_buttons button:contains(Refresh)',
	}, {
		trigger: '.o_menu_brand:contains(Settings)',
		run: function () {},
	}
]);
});
