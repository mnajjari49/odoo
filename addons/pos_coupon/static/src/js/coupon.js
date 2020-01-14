odoo.define('pos_coupon.pos', function(require) {
    'use strict';

    var core = require('web.core');
    var models = require('point_of_sale.models');
    var screens = require('point_of_sale.screens');
    var rpc = require('web.rpc');
    var session = require('web.session');
    var _t = core._t;
    var QWeb = core.qweb;

    // Some utility functions

    /**
     * Calculate the number of free items based on the given number
     * of items `number_items` and the rule: buy `n` take `m`.
     *
     * e.g.
     *     rule: buy 2 take 1                    rule: buy 2 take 3
     *     +------------+--------+--------+      +------------+--------+--------+
     *     |number_items| charged|    free|      |number_items| charged|    free|
     *     +------------+--------+--------+      +------------+--------+--------+
     *     |           1|       1|       0|      |           1|       1|       0|
     *     |           2|       2|       0|      |           2|       2|       0|
     *     |           3|       2|       1|      |           3|       2|       1|
     *     |           4|       3|       1|      |           4|       2|       2|
     *     |           5|       4|       1|      |           5|       2|       3|
     *     |           6|       4|       2|      |           6|       3|       3|
     *     |           7|       5|       2|      |           7|       4|       3|
     *     |           8|       6|       2|      |           8|       4|       4|
     *     |           9|       6|       3|      |           9|       4|       5|
     *     |          10|       7|       3|      |          10|       4|       6|
     *     +------------+--------+--------+      +------------+--------+--------+
     *
     * @param {Integer} number_items number of items
     * @param {Integer} n items to buy
     * @param {Integer} m item for free
     * @returns {Integer} number of free items
     */
    function compute_free_quantity(number_items, n, m) {
        let factor = Math.trunc(number_items / (n + m));
        let free = factor * m;
        let charged = number_items - free;
        // adjust the calculated free quantities
        let x = (factor + 1) * n;
        let y = x + (factor + 1) * m;
        let adjustment = x <= charged && charged < y ? charged - x : 0;
        return free + adjustment;
    }

    // Load the products used for creating program reward lines.
    var existing_models = models.PosModel.prototype.models;
    var product_index = _.findIndex(existing_models, function(model) {
        return model.model === 'product.product';
    });
    var product_model = existing_models[product_index];
    models.load_models([
        {
            model: 'coupon.program',
            fields: [],
            domain: function(self) {
                return [['id', 'in', self.config.program_ids]];
            },
            loaded: function(self, programs) {
                self.programs = programs;
                self.programs_by_id = {};
                self.coupon_programs = [];
                self.promo_programs = [];
                for (let program of self.programs) {
                    // index by id
                    self.programs_by_id[program.id] = program;
                    // separate coupon programs from promo programs
                    if (program.program_type === 'coupon_program') {
                        self.coupon_programs.push(program);
                    } else {
                        self.promo_programs.push(program);
                    }
                    // cast some arrays to Set for faster membership checking
                    program.valid_product_ids = new Set(program.valid_product_ids);
                    program.valid_partner_ids = new Set(program.valid_partner_ids);
                    program.discount_specific_product_ids = new Set(
                        program.discount_specific_product_ids
                    );
                }
            },
        },
        {
            model: product_model.model,
            fields: product_model.fields,
            order: product_model.order,
            domain: function(self) {
                return [
                    ['id', 'in', self.programs.map(program => program.discount_line_product_id[0])],
                ];
            },
            context: product_model.context,
            loaded: product_model.loaded,
        },
    ]);

    var _posmodel_super = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({
        initialize: function() {
            _posmodel_super.initialize.apply(this, arguments);
            this.ready.then(() => {
                if (this.get('selectedOrder')) {
                    this.get('selectedOrder').trigger('update_rewards');
                }
            });
        },
    });

    var _order_super = models.Order.prototype;
    models.Order = models.Order.extend({
        // OVERIDDEN METHODS

        initialize: function() {
            let res = _order_super.initialize.apply(this, arguments);
            res.initialize_programs();
            res.on('update_rewards', res.update_rewards, res);
            res.on('reset_coupons', res.reset_coupons, res);
            return res;
        },
        set_orderline_options: function(orderline, options) {
            _order_super.set_orderline_options.apply(this, [orderline, options]);
            if (options && options.is_program_reward) {
                orderline.is_program_reward = true;
                orderline.tax_ids = options.tax_ids;
                orderline.program_id = options.program_id;
                orderline.coupon_id = options.coupon_id;
            }
        },
        /**
         * This function's behavior is modified so that the reward lines are
         * rendered at the bottom of the orderlines list.
         */
        get_orderlines: function() {
            var orderlines = _order_super.get_orderlines.apply(this, arguments);
            var regular_lines = orderlines.filter(line => !line.is_program_reward);
            var reward_lines = orderlines.filter(line => line.is_program_reward);
            return regular_lines.concat(reward_lines);
        },
        wait_for_push_order: function() {
            return this.pos.config.use_coupon_programs;
        },
        export_for_printing: function() {
            let result = _order_super.export_for_printing.apply(this, arguments);
            result.generated_coupons = this.get_generated_coupons();
            return result;
        },
        add_product: function(product, options) {
            _order_super.add_product.apply(this, [product, options]);
            if (!options || (options && !options.is_program_reward)) {
                this.trigger('update_rewards');
            }
        },

        // NEW METHODS

        /**
         * These are the coupon programs that are activated
         * via coupon codes. Rewards can only be generated if the coupon
         * program rules are satisfied.
         *
         * @returns Array([program, coupon_id])
         */
        get_booked_coupon_programs: function() {
            let self = this;
            return [...this.booked_coupon_codes.entries()]
                .map(([code, [program_id, coupon_id]]) => [
                    self.pos.programs_by_id[program_id],
                    parseInt(coupon_id, 10),
                ])
                .filter(([program, coupon_id]) => {
                    return program.program_type === 'coupon_program';
                });
        },
        /**
         * These are the on_next_order promo programs that are activated
         * via coupon codes. Rewards can be generated from this program
         * without checking the constraints.
         *
         * @returns Array([program, coupon_id])
         */
        get_booked_promo_programs: function() {
            let self = this;
            return [...this.booked_coupon_codes.entries()]
                .map(([code, [program_id, coupon_id]]) => [
                    self.pos.programs_by_id[program_id],
                    parseInt(coupon_id, 10),
                ])
                .filter(([program, coupon_id]) => {
                    return program.program_type === 'promotion_program';
                });
        },
        /**
         * These are the active on_current_order promo programs that will generate
         * rewards if the program constraints are fully-satisfied.
         *
         * @returns Array(program)
         */
        get_active_on_current_promo_programs: function() {
            let self = this;
            return Array.from(this.active_promo_program_ids)
                .map(program_id => self.pos.programs_by_id[program_id])
                .filter(program => {
                    return program.promo_applicability === 'on_current_order';
                });
        },
        /**
         * These are the active on_next_order promo programs that will generate
         * coupon codes if the program constraints are fully-satisfied.
         */
        get_active_on_next_promo_programs: function() {
            let self = this;
            return Array.from(this.active_promo_program_ids)
                .map(program_id => self.pos.programs_by_id[program_id])
                .filter(program => {
                    return program.promo_applicability === 'on_next_order';
                });
        },
        /**
         * Returns an object with `result` and `reason` fields.
         *
         * `result` is true if rules are satisfied for this order.
         * if `result` is false, check the value of `reason` field.
         *
         * @param {*} program
         */
        check_program_rules: async function(program) {
            let self = this;

            // Check minimum amount
            let amount_to_check;
            if (program.rule_minimum_amount_tax_inclusion === 'tax_included') {
                amount_to_check = self.get_total_with_tax();
            } else {
                amount_to_check = self.get_total_without_tax();
            }
            // TODO jcb rule_minimum_amount has to be converted.
            if (!(amount_to_check >= program.rule_minimum_amount)) {
                return {
                    result: false,
                    reason: 'Minimum amount for this program is not satisfied.',
                };
            }

            // Check minimum quantity
            let valid_quantity = self.orderlines
                .filter(line => {
                    return program.valid_product_ids.has(line.product.id);
                })
                .reduce((total, line) => total + line.quantity, 0);
            if (!(valid_quantity >= program.rule_min_quantity)) {
                return {
                    result: false,
                    reason: "Program's minimum quantity is not satisfied.",
                };
            }

            // Bypass the other rules if program is coupon_program
            if (program.program_type === 'coupon_program') {
                return {
                    result: true,
                };
            }

            // Check if valid customer
            let customer = self.get_client();
            if (
                program.rule_partners_domain &&
                !program.valid_partner_ids.has(customer ? customer.id : 0)
            ) {
                return {
                    result: false,
                    reason: "Current customer can't avail this program.",
                };
            }

            // Check rule date
            let rule_from = program.rule_date_from
                    ? new Date(program.rule_date_from)
                    : new Date(-8640000000000000),
                rule_to = program.rule_date_to
                    ? new Date(program.rule_date_to)
                    : new Date(8640000000000000),
                order_date = new Date();
            if (!(order_date >= rule_from && order_date <= rule_to)) {
                return {
                    result: false,
                    reason: 'Program already expired.',
                };
            }

            // Check max number usage
            if (program.maximum_use_number !== 0) {
                try {
                    let number_use = await rpc.query({
                        model: 'coupon.program',
                        method: 'get_number_usage',
                        args: [program.id],
                        kwargs: { context: session.user_context },
                    });
                    if (!(number_use < program.maximum_use_number)) {
                        return {
                            result: false,
                            reason: "Program's maximum number of usage has been reached.",
                        };
                    }
                } catch (error) {
                    console.error(error);
                    return {
                        result: false,
                        reason: 'Unable to get the number of usage of the program.',
                    };
                }
            }

            return {
                result: true,
            };
        },
        /**
         * Returns an Array of product rewards.
         *
         * @param {*} program
         * @retuns {rewards, reason if no rewards}
         */
        get_product_rewards: function(program, coupon_id) {
            let self = this;
            // Return empty list of reward type is not product
            if (!(program.reward_type === 'product' || self.orderlines.models.length > 0)) {
                return { rewards: [], reason: 'Empty order.' };
            }

            // Calculate the total quantity of the product that belongs to
            // the programs valid products.
            let total_quantity = self.orderlines
                .filter(line => {
                    return program.valid_product_ids.has(line.product.id);
                })
                .reduce((quantity, line) => quantity + line.quantity, 0);

            let free_quantity = compute_free_quantity(
                total_quantity,
                program.rule_min_quantity,
                program.reward_product_quantity
            );
            if (free_quantity === 0) {
                return { rewards: [], reason: 'Zero free product quantity.' };
            } else {
                let reward_product = self.pos.db.get_product_by_id(program.reward_product_id[0]);
                let discount_line_product = self.pos.db.get_product_by_id(
                    program.discount_line_product_id[0]
                );
                return {
                    rewards: [
                        {
                            product: discount_line_product,
                            unit_price: -reward_product.lst_price,
                            quantity: free_quantity,
                            program: program,
                            tax_ids: reward_product.taxes_id,
                            original_product: reward_product,
                            coupon_id: coupon_id,
                        },
                    ],
                    reason: null,
                };
            }
        },
        /**
         * Returns an Array of discount rewards based on the given program.
         * Provided product_rewards will be taken into account.
         *
         * @param {*} program
         * @param {*} product_rewards
         */
        get_discounts: function(program, product_rewards, coupon_id) {
            let self = this;
            // Return empty list if reward type is not discount and
            // there are no orderlines.
            if (!(program.reward_type === 'discount' || self.orderlines.models.length > 0)) {
                return { rewards: [], reason: 'Empty order.' };
            }

            if (program.discount_type === 'fixed_amount') {
                let discount_amount = Math.min(
                    program.discount_fixed_amount,
                    program.discount_max_amount || Infinity
                );
                return {
                    rewards: [
                        {
                            product: self.pos.db.get_product_by_id(
                                program.discount_line_product_id[0]
                            ),
                            unit_price: -discount_amount,
                            quantity: 1,
                            program: program,
                            tax_ids: [],
                            amount: discount_amount,
                            coupon_id: coupon_id,
                        },
                    ],
                    reason: null,
                };
            }

            function get_key(line) {
                let tax_ids = line.get_taxes().map(tax => tax.id);
                return tax_ids.join(',');
            }

            // 1. Get amounts to discount
            let product_ids_to_account = new Set();
            let amounts_to_discount = {};
            if (program.discount_apply_on === 'specific_products') {
                for (let line of self.orderlines.models) {
                    if (program.discount_specific_product_ids.has(line.get_product().id)) {
                        let key = get_key(line);
                        if (!(key in amounts_to_discount)) {
                            amounts_to_discount[key] = line.get_quantity() * line.get_lst_price();
                        } else {
                            amounts_to_discount[key] += line.get_quantity() * line.get_lst_price();
                        }
                        product_ids_to_account.add(line.get_product().id);
                    }
                }
            } else if (program.discount_apply_on === 'cheapest_product') {
                // get line with cheapest product
                if (self.orderlines.models.length > 0) {
                    let cheapest_line = self.orderlines.reduce((min_line, line) => {
                        if (line.get_lst_price() < min_line.get_lst_price()) {
                            return line;
                        } else {
                            return min_line;
                        }
                    }, self.orderlines.models[0]);
                    let key = get_key(cheapest_line);
                    amounts_to_discount[key] = cheapest_line.get_lst_price();
                    product_ids_to_account.add(cheapest_line.get_product().id);
                }
            } else {
                for (let line of self.orderlines.models) {
                    let key = get_key(line);
                    if (!(key in amounts_to_discount)) {
                        amounts_to_discount[key] = line.get_quantity() * line.get_lst_price();
                    } else {
                        amounts_to_discount[key] += line.get_quantity() * line.get_lst_price();
                    }
                    product_ids_to_account.add(line.get_product().id);
                }
            }

            // 2. Take into account the rewarded products
            if (program.discount_apply_on !== 'cheapest_product') {
                for (let reward of product_rewards) {
                    if (product_ids_to_account.has(reward.original_product.id)) {
                        let key = reward.tax_ids.join(',');
                        amounts_to_discount[key] += reward.quantity * reward.unit_price;
                    }
                }
            }

            // 3. Return the discounts
            let discount_rewards = Object.entries(amounts_to_discount).map(([tax_keys, amount]) => {
                let discount_amount = (amount * program.discount_percentage) / 100.0;
                discount_amount = Math.min(
                    discount_amount,
                    program.discount_max_amount || Infinity
                );
                return {
                    product: self.pos.db.get_product_by_id(program.discount_line_product_id[0]),
                    unit_price: -discount_amount,
                    quantity: 1,
                    program: program,
                    tax_ids:
                        tax_keys !== '' ? tax_keys.split(',').map(val => parseInt(val, 10)) : [],
                    amount: discount_amount,
                    coupon_id: coupon_id,
                };
            });
            if (discount_rewards.length === 0) {
                return { rewards: [], reason: 'No items to discount.' };
            } else {
                return { rewards: discount_rewards, reason: null };
            }
        },
        update_rewards: async function(code, numpad_state) {
            let self = this;

            // immediately return if `use_coupon_programs` is not activated in the config.
            if (!self.pos.config.use_coupon_programs) return;

            // activate promo or coupon program when given a `code` before generating the rewards.
            if (code) {
                try {
                    let promo_program = self.pos.promo_programs.filter(
                        program => program.promo_barcode == code || program.promo_code == code
                    );
                    if (promo_program.length > 0) {
                        if (self.active_promo_program_ids.has(promo_program[0].id)) {
                            throw {
                                message: {
                                    message: 'That promo code program has already been activated.',
                                    data: {
                                        type: 'couponError',
                                    },
                                },
                            };
                        } else {
                            self.activate_program(promo_program[0]);
                        }
                    } else {
                        if (self.booked_coupon_codes.has(code)) {
                            throw {
                                message: {
                                    message: 'That coupon code has been scanned and activated.',
                                    data: {
                                        type: 'couponError',
                                    },
                                },
                            };
                        }
                        let programs_with_scanned_coupon = [
                            ...self.booked_coupon_codes.entries(),
                        ].map(([code, [program_id, coupon_id]]) => program_id);
                        let customer = self.get_client();
                        let { successful, payload } = await rpc.query({
                            model: 'pos.session',
                            method: 'scan_code',
                            args: [
                                [self.pos.pos_session.id],
                                code,
                                customer && customer.id,
                                programs_with_scanned_coupon,
                            ],
                            kwargs: { context: session.user_context },
                        });
                        if (successful) {
                            self.activate_program(
                                self.pos.programs_by_id[payload.program_id],
                                payload.coupon_id,
                                code
                            );
                        } else {
                            // TODO jcb IMPORTANT This error message's structure can be better. Perhaps follow a standard.
                            throw {
                                message: {
                                    message: payload.error_message,
                                    data: {
                                        type: 'couponError',
                                    },
                                },
                            };
                        }
                    }
                } catch (error) {
                    if (error.message && error.message.data.type === 'couponError') {
                        // TODO jcb How about the condition of missing promo_code?
                        this.pos.gui.show_notification('basic', {
                            message: error.message.message,
                        });
                    } else {
                        console.error(error);
                        throw error;
                    }
                }
            }

            // We prevent resetting the buffer if numpad_state is passed as argument
            if (numpad_state) {
                numpad_state.set('no_reset', true);
            }

            // 1. remove reward lines
            for (let line of self.orderlines.filter(line => line.is_program_reward)) {
                self.remove_orderline(line);
            }

            // 2. get rewards and add reward lines
            let { rewards, non_generating_programs } = await self.check_rewards();
            for (let {
                product,
                unit_price,
                quantity,
                program,
                tax_ids,
                original_product,
                coupon_id,
            } of rewards) {
                self.add_product(product, {
                    quantity: quantity,
                    price: unit_price,
                    lst_price: unit_price,
                    is_program_reward: true,
                    program_id: program.id,
                    tax_ids: tax_ids,
                    coupon_id: coupon_id,
                });
            }

            // 3. Render active programs in the orderlist
            this.non_generating_programs = non_generating_programs;
            this.render_active_programs();

            // We restore the reset-ability of the buffer after updating the reward lines
            if (numpad_state) {
                numpad_state.set('no_reset', false);
            }
        },
        /**
         * Using the `active_promo_program_ids`, `booked_coupon_codes` and `orderlines`
         * in this order, rewards and non-generating programs are calculated.
         *
         * TODO jcb Put high-level description of the calculation of rewards here.
         *
         * @returns {{
         *  rewards: Array[reward: Reward],
         *  non_generating_programs: Array[
         *      (program: Program, coupon_id: Integer, reason: String)
         *  ],
         * }}
         */
        check_rewards: async function() {
            let self = this,
                free_product_programs = [],
                fixed_amount_discount_programs = [],
                on_specific_programs = [],
                on_cheapest_programs = [],
                on_order_programs = [],
                non_generating_programs = [];

            function update_programs_lists(program, coupon_id) {
                if (program.reward_type === 'product') {
                    free_product_programs.push([program, coupon_id]);
                } else {
                    if (program.discount_type === 'fixed_amount') {
                        fixed_amount_discount_programs.push([program, coupon_id]);
                    } else if (program.discount_apply_on === 'specific_products') {
                        on_specific_programs.push([program, coupon_id]);
                    } else if (program.discount_apply_on === 'cheapest_product') {
                        on_cheapest_programs.push([program, coupon_id]);
                    } else {
                        on_order_programs.push([program, coupon_id]);
                    }
                }
            }

            // 1. Update the programs lists above based on the active and booked programs
            //    and their corresponding rules.
            for (let [program, coupon_id] of self.get_booked_coupon_programs()) {
                let { result, reason } = await self.check_program_rules(program);
                if (result) {
                    update_programs_lists(program, coupon_id);
                } else {
                    non_generating_programs.push([program, coupon_id, reason]);
                }
            }
            for (let [program, coupon_id] of self.get_booked_promo_programs()) {
                // Booked coupons from on next order promo programs do not need
                // checking of rules because checks are done before generating
                // coupons.
                update_programs_lists(program, coupon_id);
            }
            for (let program of self.get_active_on_current_promo_programs()) {
                let { result, reason } = await self.check_program_rules(program);
                if (result) {
                    update_programs_lists(program, null);
                } else {
                    non_generating_programs.push([program, null, reason]);
                }
            }

            // 2. Gather the product rewards
            let free_product_rewards = free_product_programs.reduce(
                (combined_rewards, [program, coupon_id]) => {
                    let { rewards, reason } = self.get_product_rewards(program, coupon_id);
                    if (reason) {
                        non_generating_programs.push([program, coupon_id, reason]);
                    }
                    return combined_rewards.concat(rewards);
                },
                []
            );

            // 3. Gather the fixed amount discounts
            let fixed_amount_discounts = fixed_amount_discount_programs.reduce(
                (combined_rewards, [program, coupon_id]) => {
                    let { rewards, reason } = self.get_discounts(
                        program,
                        free_product_rewards,
                        coupon_id
                    );
                    if (reason) {
                        non_generating_programs.push([program, coupon_id, reason]);
                    }
                    return combined_rewards.concat(rewards);
                },
                []
            );

            // 4. Gather the specific discounts
            let specific_discounts = on_specific_programs.reduce(
                (combined_rewards, [program, coupon_id]) => {
                    let { rewards, reason } = self.get_discounts(
                        program,
                        free_product_rewards,
                        coupon_id
                    );
                    if (reason) {
                        non_generating_programs.push([program, coupon_id, reason]);
                    }
                    return combined_rewards.concat(rewards);
                },
                []
            );

            // 5. Get global discount (choose highest among results of on_cheapest_programs
            //    and on_order_programs)
            // 5a. Collect the discounts from on order and on cheapest discount programs.
            let global_discounts = on_order_programs
                .reduce((combined_rewards, [program, coupon_id]) => {
                    let { rewards, reason } = self.get_discounts(
                        program,
                        free_product_rewards,
                        coupon_id
                    );
                    if (reason) {
                        non_generating_programs.push([program, coupon_id, reason]);
                    }
                    return combined_rewards.concat(rewards);
                }, [])
                .concat(
                    on_cheapest_programs.reduce((combined_rewards, [program, coupon_id]) => {
                        let { rewards, reason } = self.get_discounts(
                            program,
                            free_product_rewards,
                            coupon_id
                        );
                        if (reason) {
                            non_generating_programs.push([program, coupon_id, reason]);
                        }
                        return combined_rewards.concat(rewards);
                    }, [])
                );

            // 5b. Group the discounts by program id.
            let grouped_global_discounts = {};
            for (let discount of global_discounts) {
                let key = [discount.program.id, discount.coupon_id].join(',');
                if (!(key in grouped_global_discounts)) {
                    grouped_global_discounts[key] = [discount];
                } else {
                    grouped_global_discounts[key].push(discount);
                }
            }

            // 5c. We select the group of discounts with highest total amount.
            // Note that the result is an Array that might contain more than one
            // discount lines. This is because discounts are grouped by tax.
            let the_only_global_discount = Object.entries(grouped_global_discounts)
                .reduce(
                    (current_max, [_, discounts]) => {
                        let current_max_total = current_max.reduce(
                            (acc, discount) => acc + discount.amount,
                            0
                        );
                        let new_total = discounts.reduce(
                            (acc, discount) => acc + discount.amount,
                            0
                        );
                        if (new_total > current_max_total) {
                            return discounts;
                        } else {
                            return current_max;
                        }
                    },
                    [{ amount: 0 }]
                )
                .filter(discount => discount.amount !== 0);

            // 5d. Get the messages for the discarded global_discounts
            if (the_only_global_discount.length > 0) {
                let the_only_global_discount_key = [
                    the_only_global_discount[0].program.id,
                    the_only_global_discount[0].coupon_id,
                ].join(',');
                for (let [key, discounts] of Object.entries(grouped_global_discounts)) {
                    if (key !== the_only_global_discount_key) {
                        non_generating_programs.push([
                            discounts[0].program,
                            discounts[0].coupon_id,
                            'Not the greatest global discount.',
                        ]);
                    }
                }
            }

            return {
                rewards: free_product_rewards
                    .concat(fixed_amount_discounts)
                    .concat(specific_discounts)
                    .concat(the_only_global_discount),
                non_generating_programs: non_generating_programs,
            };
        },
        activate_program: function(program, coupon_id, code) {
            if (coupon_id) {
                this.booked_coupon_codes.set(code, [program.id, coupon_id]);
            } else {
                this.active_promo_program_ids.add(program.id);
            }
        },
        get_generated_coupons: function() {
            return this.generated_coupons;
        },
        set_generated_coupons: function(generated_coupons) {
            this.generated_coupons = generated_coupons;
        },
        render_active_programs: function() {
            let non_generating_program_ids = new Set(
                this.non_generating_programs.map(([program, coupon_id, reason]) => program.id)
            );
            let non_generating_coupon_ids = new Set(
                this.non_generating_programs
                    .map(([program, coupon_id, reason]) => coupon_id)
                    .filter(coupon_id => coupon_id)
            );
            let on_next_order_promo_programs = [...this.active_promo_program_ids.values()]
                .filter(program_id => {
                    let program = this.pos.programs_by_id[program_id];
                    return program.promo_applicability === 'on_next_order';
                })
                .map(program_id => this.pos.programs_by_id[program_id]);
            let on_current_order_promo_program_ids = [
                ...this.active_promo_program_ids.values(),
            ].filter(program_id => {
                let program = this.pos.programs_by_id[program_id];
                return program.promo_applicability === 'on_current_order';
            });
            let with_rewards_promo_programs = on_current_order_promo_program_ids
                .filter(program_id => !non_generating_program_ids.has(program_id))
                .map(program_id => {
                    let program = this.pos.programs_by_id[program_id];
                    return {
                        name: program.name,
                        promo_code: program.promo_code,
                    };
                });
            let with_rewards_booked_coupons = [...this.booked_coupon_codes.entries()]
                .filter(
                    ([code, [program_id, coupon_id]]) => !non_generating_coupon_ids.has(coupon_id)
                )
                .map(([code, [program_id, coupon_id]]) => {
                    let program = this.pos.programs_by_id[program_id];
                    return {
                        program_name: program.name,
                        coupon_code: code,
                    };
                });
            let $activeprograms = $('.summary .active-programs');
            $activeprograms.replaceWith(
                $(
                    QWeb.render('ActivePrograms', {
                        with_rewards_promo_programs: with_rewards_promo_programs,
                        with_rewards_booked_coupons: with_rewards_booked_coupons,
                        on_next_order_promo_programs: on_next_order_promo_programs,
                        show:
                            with_rewards_promo_programs.length !== 0 ||
                            with_rewards_booked_coupons.length !== 0 ||
                            on_next_order_promo_programs.length !== 0,
                    })
                )
            );
        },
        reset_coupons: async function(coupon_ids) {
            await rpc.query(
                {
                    model: 'coupon.coupon',
                    method: 'set_state',
                    args: [coupon_ids, 'new'],
                    kwargs: { context: session.user_context },
                },
                {}
            );
        },
        initialize_programs: async function() {
            if (this.booked_coupon_codes) {
                let coupon_ids = [...this.booked_coupon_codes.values()].map(
                    ([program_id, coupon_id]) => coupon_id
                );
                if (coupon_ids.length > 0) {
                    this.trigger('reset_coupons', coupon_ids);
                }
            }
            if (this.active_promo_program_ids) {
                let code_needed_promo_program_ids = [...this.active_promo_program_ids].filter(
                    program_id => {
                        return (
                            this.pos.programs_by_id[program_id].promo_code_usage === 'code_needed'
                        );
                    }
                );
                if (this.booked_coupon_codes.size + code_needed_promo_program_ids.length > 0) {
                    this.pos.gui.show_notification('basic', {
                        message: 'Active coupons and promo codes were deactivated.',
                    });
                }
            }
            // mapping of booked coupon ids to its corresponding program
            // Map code: String -> [program_id: Integer, coupon_id: Integer]
            this.booked_coupon_codes = new Map();
            // These are the other activated promo programs.
            // Initialized with automatic promo programs' ids.
            this.active_promo_program_ids = new Set(
                this.pos.promo_programs
                    .filter(program => {
                        return program.promo_code_usage == 'no_code_needed';
                    })
                    .map(program => program.id)
            );
        },
    });

    var _orderline_super = models.Orderline.prototype;
    models.Orderline = models.Orderline.extend({
        export_as_JSON: function() {
            var result = _orderline_super.export_as_JSON.apply(this);
            result.is_program_reward = this.is_program_reward;
            result.program_id = this.program_id;
            result.coupon_id = this.coupon_id;
            return result;
        },
        init_from_JSON: function(json) {
            if (json.is_program_reward) {
                this.is_program_reward = json.is_program_reward;
                this.program_id = json.program_id;
                this.coupon_id = json.coupon_id;
                this.tax_ids = json.tax_ids[0][2];
            }
            _orderline_super.init_from_JSON.apply(this, [json]);
        },
        set_quantity: function(quantity, keep_price) {
            _orderline_super.set_quantity.apply(this, [quantity, keep_price]);
            // This function removes an order line if we set the quantity to 'remove'
            // We extend its functionality so that if a reward line is removed,
            // other reward lines from the same program are also deleted.
            if (quantity === 'remove' && this.is_program_reward) {
                let related_rewards = this.order.orderlines.filter(
                    line => line.is_program_reward && line.program_id === this.program_id
                );
                for (let line of related_rewards) {
                    line.order.remove_orderline(line);
                }
                if (related_rewards.length !== 0) {
                    this.pos.gui.show_notification('basic', {
                        message: 'Other reward lines from the same program were also removed.',
                    });
                }
            }
        },
    });

    screens.PaymentScreenWidget.include({
        post_push_order_resolve: async function(order, server_ids) {
            let _super = this._super;
            try {
                let program_ids_to_generate_coupons = [];
                let messages = {};
                for (let program of order.get_active_on_next_promo_programs()) {
                    let { result, reason } = await order.check_program_rules(program);
                    if (result) {
                        program_ids_to_generate_coupons.push(program.id);
                    } else {
                        messages[program.id] = reason;
                    }
                }
                // compute unused coupon ids
                let booked_coupon_ids = new Set(
                    [...order.booked_coupon_codes.values()]
                        .map(([program_id, coupon_id]) => coupon_id)
                        .filter(coupon_id => coupon_id)
                );
                let used_coupon_ids = order.orderlines.models
                    .map(line => line.coupon_id)
                    .filter(coupon_id => coupon_id);
                for (let coupon_id of used_coupon_ids) {
                    booked_coupon_ids.delete(coupon_id);
                }
                // what remains in the booked_coupon_ids is the unused
                // coupon_ids
                let unused_coupon_ids = [...booked_coupon_ids.values()];
                order.set_generated_coupons(
                    await rpc.query(
                        {
                            model: 'pos.order',
                            method: 'validate_coupon_programs',
                            args: [server_ids, program_ids_to_generate_coupons, unused_coupon_ids],
                            kwargs: { context: session.user_context },
                        },
                        {}
                    )
                );
            } catch (error) {
                throw error;
            } finally {
                return _super.apply(this, [order, server_ids]);
            }
        },
    });

    screens.ScreenWidget.include({
        // what happens when a coupon barcode is scanned.
        barcode_coupon_action: function(code) {
            this.pos.get_order().trigger('update_rewards', code.base_code);
        },
        show: function() {
            this._super();
            this.pos.barcode_reader.set_action_callback(
                'coupon',
                _.bind(this.barcode_coupon_action, this)
            );
        },
    });

    screens.OrderWidget.include({
        render_orderline: function(orderline) {
            var node = this._super(orderline);
            if (orderline.is_program_reward) {
                node.classList.add('program-reward');
            }
            return node;
        },
        set_value: function(val) {
            // Update the reward lines when numpad buffer is updated
            // except when the selected order line is a reward line.
            let order = this.pos.get_order();
            let selected_line = order.get_selected_orderline();
            this._super(val);
            if (!selected_line) return;
            if (!selected_line.is_program_reward) {
                order.trigger('update_rewards', null, this.numpad_state);
            } else if (val === 'remove') {
                if (selected_line.coupon_id) {
                    let coupon_code = [...selected_line.order.booked_coupon_codes.entries()]
                        .filter(
                            ([coupon_code, [program_id, coupon_id]]) =>
                                coupon_id === selected_line.coupon_id
                        )
                        .map(([coupon_code, [program_id, coupon_id]]) => coupon_code)[0];
                    selected_line.order.booked_coupon_codes.delete(coupon_code);
                    selected_line.order.trigger('reset_coupons', [selected_line.coupon_id]);
                    selected_line.pos.gui.show_notification('basic', {
                        message: `Coupon (${coupon_code}) has been deactivated.`,
                    });
                } else if (selected_line.program_id) {
                    selected_line.order.active_promo_program_ids.delete(selected_line.program_id);
                    selected_line.pos.gui.show_notification('basic', {
                        message: `'${
                            selected_line.pos.programs_by_id[selected_line.program_id].name
                        }' program has been deactivated.`,
                    });
                }
                selected_line.order.trigger('update_rewards');
            }
        },
    });

    var PromoProgramButton = screens.ActionButtonWidget.extend({
        template: 'PromoProgramButton',
        button_click: function() {
            this.pos.get_order().initialize_programs();
            this.pos.get_order().trigger('update_rewards');
        },
    });

    screens.define_action_button({
        name: 'promoProgram',
        widget: PromoProgramButton,
        condition: function() {
            return this.pos.config.use_coupon_programs;
        },
    });

    var PromoCodeButton = screens.ActionButtonWidget.extend({
        template: 'PromoCodeButton',
        button_click: function() {
            var self = this;
            this.pos.gui.show_popup('textinput', {
                title: _t('Enter Promotion or Coupon Code'),
                value: '',
                confirm: function(value) {
                    if (value !== '') self.pos.get_order().trigger('update_rewards', value);
                },
            });
        },
    });

    screens.define_action_button({
        name: 'promoCode',
        widget: PromoCodeButton,
        condition: function() {
            return this.pos.config.use_coupon_programs;
        },
    });
});
