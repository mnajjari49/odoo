# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, api, _
from odoo.exceptions import ValidationError

class AccountCashRounding(models.Model):
    _inherit = 'account.cash.rounding'

    loss_account_id = fields.Many2one('account.account', string='Loss Account')

    def get_loss_account_id(self):
        super(AccountCashRounding, self).get_loss_account_id()
        return self.loss_account_id
