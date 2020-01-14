# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, api, fields, models

class EventRegistration(models.Model):
    _inherit = 'event.registration'

    lead_id = fields.Many2one('crm.lead', string='Lead', readonly=True)

    multi = fields.Boolean(default=False)

    @api.model
    def create(self, vals):
        registration = super(EventRegistration, self).create(vals)
        event_crm = self.env['event.crm'].search([])
        if not registration.multi:
            for r in event_crm:
                if r.create_lead == 'one_per_attendee':
                    r._check_rules(event_id=registration.event_id, registration_ids=registration)
        return registration
