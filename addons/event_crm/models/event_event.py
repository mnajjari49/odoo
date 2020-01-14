# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, api, _, SUPERUSER_ID

class EventEvent(models.Model):
    _name= "event.event"
    _inherit = "event.event"

    lead_ids = fields.One2many('crm.lead', 'event_id')
    leads_count = fields.Integer(compute='_compute_leads_count')

    @api.depends('lead_ids')
    def _compute_leads_count(self):
        for record in self:
            record.leads_count = len(record.lead_ids)

    def action_get_lead(self):
        self.ensure_one()
        action = self.env.ref('crm.crm_lead_all_leads').read()[0]
        action['domain'] = [('id', 'in', self.lead_ids.ids), ('event_id', '=', self.id)]
        action['context'] = {'create': False}
        action['help'] = _("""<p class="o_view_nocontent_empty_folder">
            No leads found
        </p><p>
            No leads could be generated according to your search criteria
        </p>""")
        return action

    @api.model
    def _name_search(self, name, args=None, operator='ilike', limit=None, name_get_uid=None):
        if ['company_id', '=', False] in args:
            args = []
        event_ids = self.sudo()._search(args, limit=limit, access_rights_uid=SUPERUSER_ID)
        return models.lazy_name_get(self.browse(event_ids).with_user(SUPERUSER_ID))
