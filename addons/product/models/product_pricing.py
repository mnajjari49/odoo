# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from odoo import api, fields, models, _

_logger = logging.getLogger(__name__)


class ProductPricing(models.Model):
    _name = "product.pricing"
    _description = "Product Pricing"
    _order = 'sequence'

    def _get_default_currency_id(self):
        return self.env.company.currency_id.id

    def _get_default_company_id(self):
        return self.env.company.id

    # pricing_code = fields.Char('Pricing name', compute='_compute_code', store=True)
    product_template_id = fields.Many2one('product.template', 'Product Template', ondelete="cascade", required=True)
    list_price = fields.Monetary(string='List price', currency_field='currency_id', required=True)
    currency_id = fields.Many2one('res.currency', 'Currency', default=_get_default_currency_id, required=True)
    company_id = fields.Many2one('res.company', 'Company', default=_get_default_company_id, copy=True)
    # item_ids = fields.One2many('product.pricing.item', 'product_pricing_id', 'Pricing Items', copy=True)
    sequence = fields.Integer(default=10)

    _sql_constraints = [
        ('_unique_composition', 'unique (product_template_id, currency_id, company_id)',
         'You cannot create more than one product pricing per currency and per company.'),
    ]

    def name_get(self):
        result = []
        for rec in self:
            result.append((rec.id, f"{rec.product_template_id.name}-{rec.currency_id.name}-{rec.sequence}"))
        return result

    def update_sequences(self):
        for rec in self:
            rec.sequence += 1

# class PricelistItem(models.Model):
#     _name = "product.pricing.item"
#     _description = "Pricing Rule"
#     _rec_name = 'id'
#
#     product_pricing_id = fields.Many2one('product.pricing', required=True)
#     # values_ids = fields.Many2many('product.attribute.value') #fixme later
#     # extra_price = fields.Float()
