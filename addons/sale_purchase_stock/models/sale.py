# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _


class SaleOrder(models.Model):
    _inherit = 'sale.order'

    mto_purchase_order_count = fields.Integer("Number of Generated Purchase", compute='_compute_mto_purchase_order_count', 
                                              store=True, groups='purchase.group_purchase_user')

    @api.depends('procurement_group_id.stock_move_ids.created_purchase_line_id.order_id')
    def _compute_mto_purchase_order_count(self):
        for sale in self:
            sale.mto_purchase_order_count = len(sale._get_mto_purchase_orders())

    def action_view_mto_purchase_orders(self):
        self.ensure_one()
        purchase_order_ids = self._get_mto_purchase_orders().ids
        action = {
            'res_model': 'purchase.order',
            'type': 'ir.actions.act_window',
        }
        if len(purchase_order_ids) == 1:
            action.update({
                'view_mode': 'form',
                'res_id': purchase_order_ids[0],
            })
        else:
            action.update({
                'name': _("Purchase Order generated from %s" % self.name),
                'domain': [('id', 'in', purchase_order_ids)],
                'view_mode': 'tree,form',
            })
        return action

    def _get_mto_purchase_orders(self):
        return self.procurement_group_id.stock_move_ids.created_purchase_line_id.order_id
