# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, _
from odoo.exceptions import UserError


class LostReason(models.Model):
    _name = "crm.lost.reason"
    _description = 'Opp. Lost Reason'

    name = fields.Char('Description', required=True, translate=True)
    active = fields.Boolean('Active', default=True)
    leads_count = fields.Integer('Leads Count', compute='_compute_leads_count')

    def _compute_leads_count(self):
        lead_data = self.env['crm.lead'].with_context(active_test=False).read_group([('lost_reason', 'in', self.ids)], ['lost_reason'], ['lost_reason'])
        mapped_data = {l['lost_reason'][0]: l['lost_reason_count'] for l in lead_data}
        for reason in self:
            reason.leads_count = mapped_data.get(reason.id, 0)

    def unlink(self):
        if self.filtered(lambda r: r.leads_count):
            raise UserError(_('You cannot delete this Lost Reason because leads still reference it. You can however archive it if you wish to stop using it from now on.'))
        return super().unlink()

    def action_lost_leads(self):
        return {
            'name': _('Leads'),
            'view_mode': 'tree,form',
            'domain': [('lost_reason', '=', self.id)],
            'res_model': 'crm.lead',
            'type': 'ir.actions.act_window',
            'context': {'create': False, 'active_test': False},
        }
