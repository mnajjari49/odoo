# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

# NOTE Use black to automatically format this code.

from datetime import datetime

from odoo import api, fields, models, _


class PosSession(models.Model):
    _inherit = "pos.session"

    use_coupon_programs = fields.Boolean(related="config_id.use_coupon_programs")
    program_ids = fields.Many2many(related="config_id.program_ids")
    promo_program_ids = fields.Many2many(related="config_id.promo_program_ids")
    coupon_program_ids = fields.Many2many(related="config_id.coupon_program_ids")

    def scan_code(self, code, partner_id, program_ids_with_scanned_code):
        """
        Check the code for existing, unconsumed coupon

        Return
          if coupon is valid
            {
                successful: True,
                payload: {
                    program_id,
                    coupon_id,
                }
            }
          else
            {
                successful: False,
                payload: {
                    error_message,
                }
            }

        Flag the coupon as `used` if it is valid.
        """
        programs_to_check = (
            self.promo_program_ids.filtered(
                lambda program: program.promo_applicability == "on_next_order"
            )
            | self.coupon_program_ids
        )
        coupon = self.env["coupon.coupon"].search(
            [("code", "=", code), ("program_id", "in", programs_to_check.ids)]
        )
        if not coupon:
            return {
                "successful": False,
                "payload": {"error_message": "Coupon not found."},
            }

        program_ids_with_scanned_code = program_ids_with_scanned_code or []
        coupon = coupon.filtered(
            lambda c: c.program_id.id not in program_ids_with_scanned_code
        )
        if not coupon:
            return {
                "successful": False,
                "payload": {
                    "error_message": "A coupon from the same program has already been reserved for this order."
                },
            }

        coupon = coupon.filtered(lambda c: c.state == "new")
        if not coupon:
            return {
                "successful": False,
                "payload": {"error_message": "Coupon has already been used."},
            }

        coupon = coupon.filtered(lambda c: c.partner_id.id == (partner_id or False))
        if not coupon:
            return {
                "successful": False,
                "payload": {"error_message": "Coupon isn't owned by the customer."},
            }
        coupon = coupon.filtered(
            lambda c: not c.expiration_date
            or c.expiration_date >= datetime.date(datetime.now())
        )
        if not coupon:
            return {
                "successful": False,
                "payload": {"error_message": "Coupon already expired."},
            }

        coupon.write({"state": "used"})
        return {
            "successful": True,
            "payload": {"program_id": coupon.program_id.id, "coupon_id": coupon.id},
        }
