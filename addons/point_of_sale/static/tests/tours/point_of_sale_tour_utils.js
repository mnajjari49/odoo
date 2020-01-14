odoo.define('point_of_sale.tour.utils', function(require) {
    'use strict';

    /**
     * Use this function to make the wrapped function return additional
     * steps (`STARTING ...` at beginning and `DONE with ...` at end).
     * This is useful in reading the logs for debugging.
     *
     * NOTE: It is recommended to wrap the outermost function in order
     *  to prevent deeply nested function wrapping.
     *
     * @param {Function} steps_func function that returns steps
     */
    function mark_start_end(steps_func) {
        return function() {
            let func_call = `${steps_func.name}(${[...arguments].map(val => `"${val}"`)})`;
            return [
                {
                    content: `STARTING \`${func_call}\`...`,
                    trigger: '.pos',
                    run: function() {},
                },
                ...steps_func.apply(null, arguments),
                {
                    content: `DONE with \`${func_call}\`!`,
                    trigger: '.pos',
                    run: function() {},
                },
            ];
        };
    }

    /**
     * Add the product to the order widget by clicking the product with name
     * that contains product_name.
     *
     * @param {String} product_name
     */
    function add_product_to_order(product_name) {
        return [
            {
                content: 'buy ' + product_name,
                trigger: '.product-list .product-name:contains("' + product_name + '")',
            },
            {
                content: 'the ' + product_name + ' have been added to the order',
                trigger: '.order .product-name:contains("' + product_name + '")',
                run: function() {}, // it's a check
            },
        ];
    }

    /**
     * Click in series the characters in amount_str in the specified keypad_selector.
     *
     * @param {String} amount_str
     * @param {String} keypad_selector .numpad or .payment-numpad
     */
    function generate_keypad_steps(amount_str, keypad_selector) {
        var i,
            steps = [],
            current_char;
        for (i = 0; i < amount_str.length; ++i) {
            current_char = amount_str[i];
            steps.push({
                content: 'press ' + current_char + ' on payment keypad',
                trigger:
                    keypad_selector + ' .input-button:contains("' + current_char + '"):visible',
            });
        }

        return steps;
    }

    /**
     * Enter the specified amount string when in payment screen
     *
     * @param {String} amount_str
     */
    function generate_payment_screen_keypad_steps(amount_str) {
        return generate_keypad_steps(amount_str, '.payment-numpad');
    }

    /**
     * Enter the specified amount string when in product screen
     *
     * @param {String} amount_str
     */
    function generate_product_screen_keypad_steps(amount_str) {
        return generate_keypad_steps(amount_str, '.numpad');
    }

    /**
     * Check if the order total is equivalent to the given total_str.
     *
     * @param {String} total_str total amount in string
     */
    function verify_order_total(total_str) {
        return [
            {
                content: 'order total contains ' + total_str,
                trigger: '.order .total .value:contains("' + total_str + '")',
                run: function() {}, // it's a check
            },
        ];
    }

    function goto_payment_screen_and_select_payment_method(payment_method_name) {
        return [
            {
                content: 'go to payment screen',
                trigger: '.button.pay',
            },
            {
                content: 'pay with cash',
                trigger: `.paymentmethod:contains("${payment_method_name}")`,
            },
        ];
    }

    /**
     * Validates the order then leaves the default product category in
     * the product screen.
     */
    function finish_order() {
        return [
            {
                content: 'validate the order',
                trigger: '.button.next:visible',
            },
            {
                content: 'verify that the order is being sent to the backend',
                trigger: '.js_connecting:visible',
                run: function() {}, // it's a check
            },
            {
                content: 'verify that the order has been successfully sent to the backend',
                trigger: '.js_connected:visible',
                run: function() {}, // it's a check
            },
            {
                content: 'next order',
                trigger: '.button.next:visible',
            },
            {
                // Leave category displayed by default
                content: 'click category switch',
                trigger: '.js-category-switch',
                run: 'click',
            },
        ];
    }

    /**
     * Switch the product screen to no category.
     */
    function start_no_category_screen() {
        return [
            {
                content: 'waiting for loading to finish',
                trigger: 'body:has(.loader:hidden)',
                run: function() {}, // it's a check
            },
            {
                // Leave category displayed by default
                content: 'click category switch',
                trigger: '.js-category-switch',
                run: 'click',
            },
        ];
    }

    /**
     * Selects the order line the product name that contains the given name.
     *
     * @param {String} name
     */
    function select_order_line(name) {
        return [
            {
                content: 'select reward line',
                trigger: `.orderline .product-name:contains("${name}"):not(.program-reward)`,
                run: 'click',
            },
            {
                content: 'check reward line if selected',
                trigger: `.orderline.selected .product-name:contains("${name}"):not(.program-reward)`,
                run: function() {}, // it's a check
            },
        ];
    }

    function single_backspace(label) {
        return [
            {
                content: label ? `${label}` : 'pressing backspace',
                trigger: '.numpad-backspace',
                run: 'click',
            },
        ];
    }

    function double_backspace() {
        return [
            ...single_backspace('first backspace to set to zero quantity'),
            ...single_backspace('second backspace to remove the line'),
        ];
    }

    /**
     * Removes the order line in the order widget by selecting the
     * orderline then performing double backspace.
     *
     * @param {String} name order line name
     */
    function remove_order_line(name) {
        return [...select_order_line(name), ...double_backspace()];
    }

    /**
     * Clicks the product in the product screen then presses
     * the numpad generate quantity_str.
     *
     * @param {String} name product name
     * @param {String} quantity_str quantity in string form
     */
    function add_product_with_quantity(name, quantity_str) {
        return [
            ...add_product_to_order(name),
            ...(quantity_str ? generate_product_screen_keypad_steps(quantity_str) : []),
        ];
    }

    function set_order_line_to_zero(name) {
        return [
            ...select_order_line(name),
            ...single_backspace('setting selected orderline to zero'),
        ];
    }

    function set_order_line_quantity(name, quantity_str) {
        return [
            ...set_order_line_to_zero(name),
            ...generate_product_screen_keypad_steps(quantity_str),
        ];
    }

    /**
     * Finishes the order by going to the payment screen then selecting
     * the specified payment method, registering the amount and finally,
     * clicking next order button.
     *
     * @param {String} payment_name name of the payment method
     * @param {String} amount_str amount that will be paid
     */
    function finalize_order(payment_name, amount_str) {
        return [
            ...goto_payment_screen_and_select_payment_method(payment_name),
            ...generate_payment_screen_keypad_steps(amount_str),
            ...finish_order(),
        ];
    }

    return {
        mark_start_end,
        add_product_to_order,
        generate_keypad_steps,
        generate_payment_screen_keypad_steps,
        generate_product_screen_keypad_steps,
        verify_order_total,
        goto_payment_screen_and_select_payment_method,
        finish_order,
        start_no_category_screen,
        select_order_line,
        single_backspace,
        double_backspace,
        remove_order_line,
        add_product_with_quantity,
        set_order_line_to_zero,
        set_order_line_quantity,
        finalize_order,
    };
});
