# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, api, _

class Lead(models.Model):
    _inherit = 'crm.lead'

    event_id = fields.Many2one('event.event')

    registration_ids = fields.Many2many('event.registration')
    attendees_count = fields.Integer(compute='_compute_attendees_count')

    @api.depends('registration_ids')
    def _compute_attendees_count(self):
        for record in self:
            record.attendees_count = len(record.registration_ids)

    def action_get_attendee(self):
        self.ensure_one()
        action = self.env.ref('event.event_registration_action_tree').read()[0]
        action['domain'] = [('id', 'in', self.registration_ids.ids)]
        action['context'] = {'create': False}
        action['help'] = _("""<p class="o_view_nocontent_empty_folder">
            No attendee found
        </p><p>
            No attendee could be generated according to your search criteria
        </p>""")
        return action
