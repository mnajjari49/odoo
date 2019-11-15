# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class EventTicket(models.Model):
    _inherit = 'event.event.ticket'

    ctxt_price = fields.Float(string="Contextual Price", compute="_compute_price_reduce", digits="Product Price")
    price_reduce = fields.Float(string="Price Reduce", compute="_compute_price_reduce", digits='Product Price')
    price_reduce_taxinc = fields.Float(compute='_compute_price_reduce', string='Price Reduce Tax inc')

    @api.depends('product_id', 'event_id')
    @api.depends_context('pricelist_id', 'uom_id', 'currency_id', 'quantity', 'date')
    def _compute_price_reduce(self):
        for ticket in self:
            ticket = ticket.with_context(
                fixed_sales_price=ticket.price,
                fixed_sales_currency=ticket.currency_id.id,
            )
            product = ticket.product_id
            pricelist, quantity, uom, date, currency = product.product_tmpl_id._get_context_values()
            price, price_without_discount = pricelist._get_detailed_prices(
                product=product,
                quantity=quantity,
                uom=uom,
                date=date,
                currency=currency,
            )
            ticket.ctxt_price = price_without_discount
            ticket.price_reduce = price
            tax_ids = product.sudo().taxes_id.filtered(lambda r: r.company_id == ticket.company_id)
            ticket.price_reduce_taxinc = tax_ids.compute_all(ticket.price_reduce, ticket.currency_id, 1.0, product=product)['total_included']
