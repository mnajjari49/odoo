odoo.define('web.datepicker_tests', function (require) {
    "use strict";

    QUnit.module('Components', {}, function () {

        // This module cannot be tested as thoroughly as we want it to be:
        // browsers do not let scripts programmatically assign values to inputs
        // of type file
        QUnit.module('DatePicker', {}, function () {

        });
    });
});
