# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _


class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'

    mto_sale_order_count = fields.Integer("Number of Source Sale", compute='_compute_mto_sale_order_count', store=True,
                                          groups='sales_team.group_sale_salesman')

    @api.depends('order_line.move_dest_ids.group_id.sale_id')
    def _compute_mto_sale_order_count(self):
        for purchase in self:
            purchase.mto_sale_order_count = len(purchase._get_mto_sale_orders())

    def action_view_mto_sale_orders(self):
        self.ensure_one()
        sale_order_ids = self._get_mto_sale_orders().ids
        action = {
            'res_model': 'sale.order',
            'type': 'ir.actions.act_window',
        }
        if len(sale_order_ids) == 1:
            action.update({
                'view_mode': 'form',
                'res_id': sale_order_ids[0],
            })
        else:
            action.update({
                'name': _('Sources Sale Orders %s' % self.name),
                'domain': [('id', 'in', sale_order_ids)],
                'view_mode': 'tree,form',
            })
        return action

    def _get_mto_sale_orders(self):
        return self.order_line.move_dest_ids.group_id.sale_id
