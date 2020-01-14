odoo.define('pos_coupon.tour.utils', function(require) {
    'use strict';

    let {
        verify_order_total,
        start_no_category_screen,
        double_backspace,
        add_product_with_quantity,
        set_order_line_quantity,
        finalize_order,
        mark_start_end,
    } = require('point_of_sale.tour.utils');

    function check_reward_line(reward_name, amount_str) {
        return [
            {
                content: 'check if reward line is there',
                trigger: `.orderline.program-reward span.product-name:contains("${reward_name}")`,
                run: function() {}, // it's a check
            },
            {
                content: 'check if the reward price is correct',
                trigger: `.orderline.program-reward span.price:contains("${amount_str}")`,
                run: function() {}, // it's a check
            },
        ];
    }

    function check_notification(message) {
        return [
            {
                content: 'check if notification is shown',
                trigger: `.notifications .notification:not(.oe_hidden) span:contains("${message}")`,
                run: function() {}, // it's a check
            },
        ];
    }

    function select_reward_line(reward_name) {
        return [
            {
                content: 'select reward line',
                trigger: `.orderline.program-reward .product-name:contains("${reward_name}")`,
                run: 'click',
            },
            {
                content: 'check reward line if selected',
                trigger: `.orderline.selected.program-reward .product-name:contains("${reward_name}")`,
                run: function() {}, // it's a check
            },
        ];
    }

    /**
     * Removes the reward line in the order widget by selecting the
     * reward line then performing double backspace.
     *
     * @param {String} name reward line name
     */
    function remove_reward_line(name) {
        return [...select_reward_line(name), ...double_backspace()];
    }

    function enter_code(code_val) {
        return [
            {
                content: 'open code input dialog',
                trigger: '.control-button:contains("Enter Code")',
                run: 'click',
            },
            {
                content: 'enter code value',
                trigger: '.popup-textinput input[type="text"]',
                run: function() {
                    $('.popup-textinput input[type="text"]').val(code_val);
                },
            },
            {
                content: 'confirm inputted code',
                trigger: '.popup-textinput .button.confirm',
                run: 'click',
            },
        ];
    }

    function reset_active_programs() {
        return [
            {
                content: 'open code input dialog',
                trigger: '.control-button:contains("Reset Programs")',
                run: 'click',
            },
        ];
    }

    // we wrap the returned functions to know when the steps started
    // and ended.
    return {
        start_no_category_screen: mark_start_end(start_no_category_screen),
        add_product_with_quantity: mark_start_end(add_product_with_quantity),
        verify_order_total: mark_start_end(verify_order_total),
        finalize_order: mark_start_end(finalize_order),
        check_reward_line: mark_start_end(check_reward_line),
        check_notification: mark_start_end(check_notification),
        select_reward_line: mark_start_end(select_reward_line),
        remove_reward_line: mark_start_end(remove_reward_line),
        enter_code: mark_start_end(enter_code),
        reset_active_programs: mark_start_end(reset_active_programs),
        set_order_line_quantity: mark_start_end(set_order_line_quantity),
    };
});
