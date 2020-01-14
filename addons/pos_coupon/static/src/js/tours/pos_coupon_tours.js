odoo.define('pos_coupon.tours.basic', function(require) {
    'use strict';

    /**
     * PoS Coupon Basic Tour
     * A 2-part tour considering no pricelist and fiscal position.
     */

    let Tour = require('web_tour.tour');
    let {
        start_no_category_screen,
        add_product_with_quantity,
        verify_order_total,
        finalize_order,
        check_reward_line,
        check_notification,
        select_reward_line,
        remove_reward_line,
        enter_code,
        reset_active_programs,
        set_order_line_quantity,
    } = require('pos_coupon.tour.utils');

    // --- PoS Coupon Tour Basic Part 1 ---

    let steps_part1 = start_no_category_screen();

    // basic order
    // just accept the automatically applied promo program
    // applied programs:
    //   - on cheapest product
    steps_part1 = steps_part1.concat(
        add_product_with_quantity('Whiteboard Pen', '5'),
        check_reward_line('90.0% discount on cheapest product', '-2.88'),
        select_reward_line('on cheapest product'),
        verify_order_total('13.12'),
        finalize_order('Cash', '13.12')
    );

    // remove the reward from auto promo program
    // no applied programs
    steps_part1 = steps_part1.concat(
        add_product_with_quantity('Whiteboard Pen', '6'),
        check_reward_line('on cheapest product', '-2.88'),
        verify_order_total('16.32'),
        remove_reward_line('90.0% discount on cheapest product'),
        check_notification("'Auto Promo Program - Cheapest Product' program has been deactivated."),
        verify_order_total('19.2'),
        finalize_order('Cash', '19.2')
    );

    // order with coupon code from coupon program
    // applied programs:
    //   - coupon program
    steps_part1 = steps_part1.concat(
        add_product_with_quantity('Desk Organizer', '9'),
        remove_reward_line('90.0% discount on cheapest product'),
        verify_order_total('45.90'),
        // Enter invalid code then check notification
        enter_code('invalid_code'),
        check_notification('Coupon not found.'),
        enter_code('1234'),
        check_reward_line('Free Product - Desk Organizer', '-15.30'),
        finalize_order('Cash', '30.6')
    );

    // Use coupon but eventually remove the reward
    // applied programs:
    //   - on cheapest product
    steps_part1 = steps_part1.concat(
        add_product_with_quantity('Letter Tray', '4'),
        add_product_with_quantity('Desk Organizer', '9'),
        check_reward_line('90.0% discount on cheapest product', '-4.32'),
        verify_order_total('62.27'),
        enter_code('5678'),
        check_reward_line('Free Product - Desk Organizer', '-15.30'),
        verify_order_total('46.97'),
        remove_reward_line('Free Product - Desk Organizer'),
        verify_order_total('62.27'),
        finalize_order('Cash', '62.27')
    );

    // specific product discount
    // applied programs:
    //   - on cheapest product
    //   - on specific products
    steps_part1 = steps_part1.concat(
        add_product_with_quantity('Magnetic Board', '10'), // 1.98
        add_product_with_quantity('Desk Organizer', '3'), // 5.1
        add_product_with_quantity('Letter Tray', '4'), // 4.8 tax 10%
        check_reward_line('90.0% discount on cheapest product', '-1.78'),
        verify_order_total('54.44'),
        enter_code('promocode'),
        check_reward_line('50.0% discount on products', '-17.55'),
        verify_order_total('36.89'),
        finalize_order('Cash', '36.89')
    );

    Tour.register('pos_coupon_tour_basic_part1', { test: true, url: '/pos/web' }, steps_part1);

    // --- PoS Coupon Tour Basic Part 2 ---
    // Using the coupons generated from the initial tour.

    let steps_part2 = start_no_category_screen();

    // Cheapest product discount should be replaced by the global discount
    // because it's amount is lower.
    // Applied programs:
    //   - global discount
    steps_part2 = steps_part2.concat(
        add_product_with_quantity('Desk Organizer', '10'), // 5.1
        check_reward_line('on cheapest product', '-4.59'),
        add_product_with_quantity('Letter Tray', '4'), // 4.8 tax 10%
        check_reward_line('on cheapest product', '-4.32'),
        enter_code('123456'),
        check_reward_line('10.0% discount on total amount', '-5.10'),
        check_reward_line('10.0% discount on total amount', '-1.92'),
        verify_order_total('64.91'),
        finalize_order('Cash', '64.91')
    );

    // Use coupon from global discount but on cheapest discount prevails.
    // The global discount coupon should be consumed during the order as it is
    // activated in the order. But upon validation, the coupon should return
    // to new state.
    // Applied programs:
    //   - on cheapest discount
    steps_part2 = steps_part2.concat(
        add_product_with_quantity('Small Shelf', '3'), // 2.83
        check_reward_line('90.0% discount on cheapest product', '-2.55'),
        enter_code('345678'),
        check_reward_line('90.0% discount on cheapest product', '-2.55'),
        set_order_line_quantity('Small Shelf', '15'),
        check_reward_line('10.0% discount on total amount', '-4.25'),
        set_order_line_quantity('Small Shelf', '2'),
        check_reward_line('90.0% discount on cheapest product', '-2.55'),
        add_product_with_quantity('Desk Pad'), // 1.98
        check_reward_line('90.0% discount on cheapest product', '-1.78'),
        verify_order_total('5.86'),
        finalize_order('Cash', '5.86')
    );

    // Scanning coupon twice.
    // Also apply global discount on top of free product to check if the
    // calculated discount is correct.
    // Applied programs:
    //  - coupon program (free product)
    //  - global discount
    steps_part2 = steps_part2.concat(
        add_product_with_quantity('Desk Organizer', '11'), // 5.1
        check_reward_line('90.0% discount on cheapest product', '-4.59'),
        // add global discount and the discount will be replaced
        enter_code('345678'),
        check_reward_line('10.0% discount on total amount', '-5.61'),
        // add free product coupon (for qty=11, free=4)
        // the discount should change after having free products
        // it should go back to cheapest discount as it is higher
        enter_code('5678'),
        check_reward_line('Free Product - Desk Organizer', '-20.40'),
        check_reward_line('90.0% discount on cheapest product', '-4.59'),
        // set quantity to 18
        // should result to 'charged qty'=12, 'free qty'=6
        set_order_line_quantity('Desk Organizer', '18'),
        check_reward_line('10.0% discount on total amount', '-6.12'),
        check_reward_line('Free Product - Desk Organizer', '-30.60'),
        // scan the code again and check notification
        enter_code('5678'),
        check_notification('That coupon code has been scanned and activated.'),
        verify_order_total('55.08'),
        finalize_order('Cash', '55.08')
    );

    // Specific products discount (with promocode) and free product (1357)
    // Applied programs:
    //   - discount on specific products
    //   - free product
    steps_part2 = steps_part2.concat(
        add_product_with_quantity('Desk Organizer', '6'), // 5.1
        remove_reward_line('90.0% discount on cheapest product'),
        enter_code('promocode'),
        check_reward_line('50.0% discount on products', '-15.30'),
        enter_code('1357'),
        check_reward_line('Free Product - Desk Organizer', '-10.20'),
        check_reward_line('50.0% discount on products', '-10.20'),
        verify_order_total('10.20'),
        finalize_order('Cash', '10.20')
    );

    // Check reset program
    // Enter to codes and reset the programs.
    // The codes should be checked afterwards. They should return to new.
    // Applied programs:
    //   - cheapest product
    steps_part2 = steps_part2.concat(
        add_product_with_quantity('Monitor Stand', '6'), // 3.19
        enter_code('2468'),
        enter_code('098765'),
        check_reward_line('90.0% discount on cheapest product', '-2.87'),
        remove_reward_line('90.0% discount on cheapest product'),
        check_reward_line('10.0% discount on total amount', '-1.91'),
        reset_active_programs(),
        check_reward_line('90.0% discount on cheapest product', '-2.87'),
        verify_order_total('16.27'),
        finalize_order('Cash', '16.27')
    );

    Tour.register('pos_coupon_tour_basic_part2', { test: true, url: '/pos/web' }, steps_part2);
});
