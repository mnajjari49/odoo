# -*- encoding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ResPartner(models.Model):
    """Inherit res.partner object to add NPWP field and Kode Transaksi"""
    _inherit = "res.partner"

    l10n_id_pkp = fields.Boolean(string="ID PKP")
    l10n_id_npwp = fields.Char(string='NPWP', track_visibility='onchange')
    l10n_id_nik = fields.Char(string='NIK', track_visibility='onchange')
    l10n_id_tax_address = fields.Char('Tax Address', track_visibility='onchange')
    l10n_id_tax_name = fields.Char('Tax Name', track_visibility='onchange')


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    l10n_id_tax_address = fields.Char('Tax Address', related='company_id.partner_id.l10n_id_tax_address', readonly=False)
    l10n_id_tax_name = fields.Char('Tax Name', related='company_id.partner_id.l10n_id_tax_address', readonly=False)
