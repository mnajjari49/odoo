# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime, timedelta

from odoo import api, fields, models, _
from odoo.exceptions import UserError


class SaleOrder(models.Model):
    _inherit = 'sale.order'

    sale_order_template_id = fields.Many2one(
        'sale.order.template', 'Quotation Template',
        readonly=True, check_company=True,
        states={'draft': [('readonly', False)], 'sent': [('readonly', False)]},
        domain="['|', ('company_id', '=', False), ('company_id', '=', company_id)]")
    sale_order_option_ids = fields.One2many(
        'sale.order.option', 'order_id', 'Optional Products Lines',
        copy=True, readonly=True,
        states={'draft': [('readonly', False)], 'sent': [('readonly', False)]})

    @api.returns('self', lambda value: value.id)
    def copy(self, default=None):
        if self.sale_order_template_id and self.sale_order_template_id.number_of_days > 0:
            default = dict(default or {})
            default['validity_date'] = fields.Date.to_string(datetime.now() + timedelta(self.sale_order_template_id.number_of_days))
        return super(SaleOrder, self).copy(default=default)

    @api.depends('partner_id', 'company_id', 'sale_order_template_id')
    def _compute_note(self):
        super()._compute_note()

    def _get_note(self):
        return self.sale_order_template_id.note or super()._get_note()

    def update_prices(self):
        self.ensure_one()
        super().update_prices()
        self.sale_order_option_ids._compute_price_unit()

    @api.depends('company_id', 'sale_order_template_id')
    def _compute_company_defaults(self):
        template_based_order = self.filtered('sale_order_template_id')
        for order in template_based_order:
            template = order.sale_order_template_id
            order.require_signature = template.require_signature
            order.require_payment = template.require_payment
            order.validity_date = template.number_of_days > 0 and \
                fields.Date.to_string(datetime.now() + timedelta(template.number_of_days))
        super(SaleOrder, self-template_based_order)._compute_company_defaults()

    @api.onchange('sale_order_template_id')
    def onchange_sale_order_template_id(self):
        self = self.with_context(lang=self.partner_id.lang)
        template = self.sale_order_template_id

        order_lines = [(5, 0, 0)]
        for line in template.sale_order_template_line_ids:
            data = line._prepare_soline_values()
            if line.product_id:
                discount = 0
                if self.pricelist_id:
                    price = self.pricelist_id.get_product_price(
                        line.product_id, 1, False, uom_id=line.product_uom)
                    if self.pricelist_id.discount_policy == 'without_discount' and line.price_unit:
                        discount = (line.price_unit - price) / line.price_unit * 100
                        # negative discounts (= surcharge) are included in the display price
                        if discount < 0:
                            discount = 0
                        else:
                            price = line.price_unit
                    elif line.price_unit:
                        price = line.price_unit

                else:
                    price = line.price_unit

                data.update({
                    'price_unit': price,
                    'discount': 100 - ((100 - discount) * (100 - line.discount) / 100),
                    'customer_lead': self._get_customer_lead(line.product_id.product_tmpl_id),
                })
            order_lines.append((0, 0, data))

        self.order_line = order_lines

        option_lines = [(5, 0, 0)]
        for option in template.sale_order_template_option_ids:
            data = option._prepare_sooption_values()
            if self.pricelist_id:
                price = self.pricelist_id.get_product_price(
                    option.product_id, 1, False, uom_id=option.uom_id)
            else:
                price = option.price_unit
            data.update({'price_unit': price})
            option_lines.append((0, 0, data))

        self.sale_order_option_ids = option_lines

        if template.note:
            self.note = template.note

    def action_confirm(self):
        res = super(SaleOrder, self).action_confirm()
        for order in self:
            if order.sale_order_template_id and order.sale_order_template_id.mail_template_id:
                self.sale_order_template_id.mail_template_id.send_mail(order.id)
        return res

    def get_access_action(self, access_uid=None):
        """ Instead of the classic form view, redirect to the online quote if it exists. """
        self.ensure_one()
        user = access_uid and self.env['res.users'].sudo().browse(access_uid) or self.env.user

        if not self.sale_order_template_id or (not user.share and not self.env.context.get('force_website')):
            return super(SaleOrder, self).get_access_action(access_uid)
        return {
            'type': 'ir.actions.act_url',
            'url': self.get_portal_url(),
            'target': 'self',
            'res_id': self.id,
        }


class SaleOrderLine(models.Model):
    _inherit = "sale.order.line"
    _description = "Sales Order Line"

    sale_order_option_ids = fields.One2many('sale.order.option', 'line_id', 'Optional Products Lines')


class SaleOrderOption(models.Model):
    _name = "sale.order.option"
    _description = "Sale Options"
    _order = 'sequence, id'
    _check_company_auto = True

    order_id = fields.Many2one('sale.order', 'Sales Order Reference', ondelete='cascade', index=True)
    company_id = fields.Many2one('res.company', related='order_id.company_id', store=True)
    currency_id = fields.Many2one('res.currency', related='order_id.currency_id', store=True)

    name = fields.Text('Description', compute="_compute_name", store=True, readonly=False)
    product_id = fields.Many2one(
        'product.product', string='Product',
        domain="[('sale_ok', '=', True), '|', ('company_id', '=', False), ('company_id', '=', company_id)]",
        change_default=True, ondelete='restrict', check_company=True)

    uom_id = fields.Many2one(
        'uom.uom', 'Unit of Measure ',
        compute="_compute_product_information", store=True, readonly=False,
        domain="[('category_id', '=', product_uom_category_id)]")
    product_uom_category_id = fields.Many2one(related='product_id.uom_id.category_id')
    quantity = fields.Float(
        'Quantity', digits='Product Unit of Measure',
        compute="_compute_product_information", store=True, readonly=False)

    price_unit = fields.Float(
        'Unit Price', digits='Product Price',
        compute="_compute_price_unit", store=True, readonly=False)
    discount = fields.Float('Discount (%)', digits='Discount')

    line_id = fields.Many2one('sale.order.line', ondelete="set null", copy=False)
    is_present = fields.Boolean(
        string="Present on Quotation",
        compute="_compute_is_present", search="_search_is_present",
        help="This field will be checked if the option line's product is "
        "already present in the quotation.")

    sequence = fields.Integer('Sequence', help="Gives the sequence order when displaying a list of optional products.")

    @api.depends('product_id', 'company_id', 'quantity', 'uom_id')
    def _compute_price_unit(self):
        for option in self:
            option = option.with_company(option.company_id)
            if option.order_id.pricelist_id:
                option.price_unit = option.order_id.pricelist_id.get_product_price(
                    option.product_id, option.quantity,
                    option.order_id.partner_id, uom_id=option.uom_id)
            else:
                option.price_unit = 0.0

    @api.depends('product_id')
    def _compute_product_information(self):
        for option in self:
            option.product_uom = option.product_id.uom_id  # if category different else option.product_uom ?
            option.product_uom_qty = 1.0

    @api.depends('product_id')
    def _compute_name(self):
        for option in self:
            if option.order_id.partner_id:
                option = option.with_context(lang=option.order_id.partner_id)
            option.name = option.product_id.get_product_multiline_description_sale()

    @api.depends('line_id', 'order_id.order_line', 'product_id')
    def _compute_is_present(self):
        # NOTE: this field cannot be stored as the line_id is usually removed
        # through cascade deletion, which means the compute would be false
        for option in self:
            option.is_present = bool(option.order_id.order_line.filtered(lambda l: l.product_id == option.product_id))

    def _search_is_present(self, operator, value):
        if (operator, value) in [('=', True), ('!=', False)]:
            return [('line_id', '=', False)]
        return [('line_id', '!=', False)]

    # VFE TODO remove one of the two methods ???
    def button_add_to_order(self):
        self.add_option_to_order()

    def add_option_to_order(self):
        self.ensure_one()

        if self.order_id.state not in ['draft', 'sent']:
            raise UserError(_('You cannot add options to a confirmed order.'))

        values = self._get_values_to_add_to_order()
        order_line = self.env['sale.order.line'].create(values)

        self.write({'line_id': order_line.id})

    def _get_values_to_add_to_order(self):
        self.ensure_one()
        return {
            'order_id': self.order_id.id,
            'price_unit': self.price_unit,
            'name': self.name,
            'product_id': self.product_id.id,
            'product_uom_qty': self.quantity,
            'product_uom': self.uom_id.id,
            'discount': self.discount,
        }
