# -*- encoding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models

class StockMoveLine(models.Model):
    _inherit = 'stock.move.line'

    batch_id = fields.Many2one(related='picking_id.batch_id')
