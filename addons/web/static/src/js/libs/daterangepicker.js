odoo.define('web.daterangepicker.extensions', function () {
'use strict';

/**
 * Don't allow user to select off days(Dates which are out of current calendar).
 */
var clickDateFunction = daterangepicker.prototype.clickDate;
daterangepicker.prototype.clickDate = function (ev) {
    if (!$(ev.target).hasClass('off')) {
        clickDateFunction.apply(this, arguments);
    }
};
/**
 * Compute daterangepicker to open up or down based on top/bottom space in window.
 */
const moveFunction = daterangepicker.prototype.move;
daterangepicker.prototype.move = function (ev) {
    const offset = this.element.offset();
    if (offset.top + this.container.height() * 1.5 >= $(window).height() + $(window).scrollTop() && this.container.height() + this.element.outerHeight() < offset.top) {
        this.drops = 'up';
    } else {
        this.drops = 'down';
    }
    moveFunction.apply(this, arguments);
};

});
