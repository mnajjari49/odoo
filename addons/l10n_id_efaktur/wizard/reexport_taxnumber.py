# -*- encoding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError

import re


class ReexportTaxnumber(models.TransientModel):
    _name = 'reexport.taxnumber'
    _description = "Report Tax-Number"

    start_number = fields.Char('From', default="0000000000000")
    end_number = fields.Char('To', default="0000000000000")
    company_id = fields.Many2one('res.company', default=lambda self: self.env.company)
    number_available = fields.Integer(compute='_compute_available')
    last_available = fields.Many2one('l10n_id_efaktur.efaktur', compute='_compute_available')

    def generate_number(self):
        """Generate tax number."""
        start_str = re.sub(r'\D', '', self.start_number)
        end_str = re.sub(r'\D', '', self.end_number)

        start_int = int(start_str)
        end_int = int(end_str)

        if not len(start_str) == 13 or not len(end_str) == 13:
            raise ValidationError(_("There should be 13 digits in each number."))

        if start_str[:5] != end_str[:5]:
            raise ValidationError(_("First 5 digits should be same in Start Number and End Number."))

        if int(start_str[-8:]) >= int(end_str[-8:]):
            raise ValidationError(_("Last 8 digits of End Number should be greater than the last 8 digit of Start Number"))

        if (end_int - start_int) > 10000:
            raise ValidationError(_("The difference between the two numbers must not be greater than 10.000"))

        self.env['l10n_id_efaktur.efaktur'].create([{
                'name': '%013d' % num,
                'company_id': self.company_id.id,
            } for num in range(start_int, end_int + 1)])

    @api.depends('company_id')
    def _compute_available(self):
        for record in self:
            record.last_available = self.env['l10n_id_efaktur.efaktur'].search([('company_id', '=', record.company_id.id), ('invoice_id', '=', False)], order='name DESC', limit=1)
            record.number_available = self.env['l10n_id_efaktur.efaktur'].search_count([('company_id', '=', record.company_id.id), ('invoice_id', '=', False)])

    @api.onchange('start_number')
    def _onchange_start_number(self):
        self.start_number = re.sub(r'\D', '', self.start_number)
        if not self.end_number or int(self.start_number) > int(self.end_number):
            self.end_number = self.start_number

    @api.onchange('end_number')
    def _onchange_end_number(self):
        self.end_number = re.sub(r'\D', '', self.end_number)
        if not self.start_number or int(self.end_number) < int(self.start_number):
            self.start_number = self.end_number
