# -*- encoding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.exceptions import UserError

import re


class Efaktur(models.Model):
    _name = "l10n_id_efaktur.efaktur"
    _description = "E-faktur"

    name = fields.Char('E-Faktur code')
    invoice_id = fields.One2many('account.move', 'l10n_id_efaktur_id', string='Invoice', readonly=True)
    company_id = fields.Many2one('res.company', required=True)

    _sql_constraints = [
        ('name_uniq', 'unique (name)', 'E-Faktur code already exists (maybe for another company)!'),
    ]

    @api.constrains('name', 'invoice_id')
    def _constrains_efaktur(self):
        for record in self:
            if record.name and record.name != re.sub(r'\D', '', record.name):
                record.name = re.sub(r'\D', '', record.name)
            if len(record.invoice_id) > 1 and record.name[1] == '0':
                # same number can be used multiple times if it is for a correction done multiple times
                raise UserError(_('Only one invoice per number'))
            elif len(record.invoice_id) >= 1 and len(record.name) != 16:
                raise UserError(_('A number linked to an invoice should have 16 digits'))
            elif len(record.invoice_id) == 0 and len(record.name) != 13:
                raise UserError(_('A number not linked to an invoice should have 13 digits'))

    @api.onchange('name')
    def _onchange_name(self):
        if self.name:
            self.name = re.sub(r'\D', '', self.name)
