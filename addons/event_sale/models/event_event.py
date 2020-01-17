# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class Event(models.Model):
    _inherit = 'event.event'

    # sale
    sale_order_lines_ids = fields.One2many(
        'sale.order.line', 'event_id',
        string='All sale order lines pointing to this event')
    sale_total_price = fields.Monetary(compute='_compute_sale_total_price')
    currency_id = fields.Many2one(
        'res.currency', string='Currency',
        default=lambda self: self.env.company.currency_id.id, readonly=True)

    @api.depends('sale_order_lines_ids')
    def _compute_sale_total_price(self):
        for event in self:
            event.sale_total_price = sum([
                event.currency_id._convert(
                    sale_order_line_id.price_reduce_taxexcl,
                    sale_order_line_id.currency_id,
                    sale_order_line_id.company_id,
                    sale_order_line_id.order_id.date_order)
                for sale_order_line_id in event.sale_order_lines_ids
            ])
