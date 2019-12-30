# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    l10n_eu_services_eu_country = fields.Boolean('Is euripean country?', compute='_compute_l10n_eu_services_european_country')

    @api.depends('company_id')
    def _compute_l10n_eu_services_european_country(self):
        self.l10n_eu_services_eu_country = bool(self.env.ref('base.europe').id in self.company_id.country_id.country_group_ids.ids)
