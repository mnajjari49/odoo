# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models

class EventCrm(models.Model):
    _inherit = "event.crm"

    def _get_additional_values(self, values, registration):
        values = super(EventCrm, self)._get_additional_values(values, registration)
        values.update({
            'campaign_id': registration.sudo().campaign_id.id,
            'source_id': registration.sudo().source_id.id,
            'medium_id': registration.sudo().medium_id.id,
        })
        return values
