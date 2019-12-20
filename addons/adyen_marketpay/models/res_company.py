# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ResCompany(models.Model):
    _inherit = "res.company"

    adyen_proxy_token = fields.Char('Adyen Proxy Token')
    adyen_uuid = fields.Char('Adyen UUID')
    adyen_account_holder_code = fields.Char('Adyen Account Holder Code')
