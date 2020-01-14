# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

# NOTE Use black to automatically format this code.

from odoo import api, fields, models, _


class Coupon(models.Model):
    _inherit = "coupon.coupon"

    source_pos_order_id = fields.Many2one(
        "pos.order",
        string="PoS Order Reference",
        help="PoS order where this coupon is generated.",
    )
    pos_order_id = fields.Many2one(
        "pos.order",
        string="Applied on PoS Order",
        help="PoS order where this coupon is consumed/booked.",
    )

    def set_state(self, new_state):
        for coupon in self:
            coupon.state = new_state
