# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

# NOTE Use black to automatically format this code.

from odoo import api, fields, models, _
from odoo.exceptions import UserError


class PosConfig(models.Model):
    _inherit = "pos.config"

    use_coupon_programs = fields.Boolean(
        "Coupons & Promotions",
        help="Use coupon and promotion programs in this PoS configuration.",
    )
    coupon_program_ids = fields.Many2many(
        "coupon.program",
        relation="coupon_program_pos_config_rel",
        string="Coupon Programs",
        domain=[("program_type", "=", "coupon_program"), ("active", "=", True)],
    )
    promo_program_ids = fields.Many2many(
        "coupon.program",
        relation="promo_program_pos_config_rel",
        string="Promotion Programs",
        domain=[("program_type", "=", "promotion_program"), ("active", "=", True)],
    )
    program_ids = fields.Many2many(
        "coupon.program",
        relation="program_pos_config_rel",
        string="Coupons and Promotions",
        store=True,
        compute="_compute_program_ids",
    )

    @api.depends("promo_program_ids", "coupon_program_ids")
    def _compute_program_ids(self):
        for pos_config in self:
            pos_config.program_ids = (
                pos_config.promo_program_ids | pos_config.coupon_program_ids
            )

    def open_session_cb(self, check_coa=True):
        # Check validity of programs before opening a new session
        invalid_reward_products_msg = ""
        for program in self.program_ids:
            if program.reward_product_id and not program.reward_product_id.available_in_pos:
                reward_product = program.reward_product_id
                invalid_reward_products_msg += (
                    f"\n\tProgram: `{program.name}` ({program.program_type}), Reward Product: `{reward_product.name}`"
                )

        if invalid_reward_products_msg:
            intro = f"To continue, make the following reward products to be available in Point of Sale.\n"
            raise UserError(f"{intro}{invalid_reward_products_msg}")

        return super(PosConfig, self).open_session_cb(check_coa)
