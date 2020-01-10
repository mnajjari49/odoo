# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import re
from odoo import models, fields, api, _
from odoo.exceptions import ValidationError

class AccountMove(models.Model):
    _inherit = "account.move"

    debit_origin_id = fields.Many2one('account.move', 'Original Invoice', copy=False)
    debit_note_ids = fields.One2many('account.move', 'debit_origin_id', 'Debit Notes',
                                     help="The debit notes created for this invoice")

