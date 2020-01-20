# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.exceptions import UserError


class SaleOrderTemplate(models.Model):
    _name = "sale.order.template"
    _description = "Quotation Template"

    def _get_default_require_signature(self):
        return self.env.company.portal_confirmation_sign

    def _get_default_require_payment(self):
        return self.env.company.portal_confirmation_pay

    name = fields.Char('Quotation Template', required=True)
    sale_order_template_line_ids = fields.One2many('sale.order.template.line', 'sale_order_template_id', 'Lines', copy=True)
    note = fields.Text('Terms and conditions', translate=True)
    sale_order_template_option_ids = fields.One2many('sale.order.template.option', 'sale_order_template_id', 'Optional Products', copy=True)
    number_of_days = fields.Integer('Quotation Duration',
        help='Number of days for the validity date computation of the quotation')
    require_signature = fields.Boolean('Online Signature', default=_get_default_require_signature, help='Request a online signature to the customer in order to confirm orders automatically.')
    require_payment = fields.Boolean('Online Payment', default=_get_default_require_payment, help='Request an online payment to the customer in order to confirm orders automatically.')
    mail_template_id = fields.Many2one(
        'mail.template', 'Confirmation Mail',
        domain=[('model', '=', 'sale.order')],
        help="This e-mail template will be sent on confirmation. Leave empty to send nothing.")
    active = fields.Boolean(default=True, help="If unchecked, it will allow you to hide the quotation template without removing it.")
    company_id = fields.Many2one('res.company', string='Company')

    @api.onchange('sale_order_template_line_ids', 'sale_order_template_option_ids')
    def _onchange_template_line_ids(self):
        companies = self.mapped('sale_order_template_option_ids.product_id.company_id') | self.mapped('sale_order_template_line_ids.product_id.company_id')
        if companies and self.company_id not in companies:
            self.company_id = companies[0]

    @api.model_create_multi
    def create(self, vals_list):
        records = super(SaleOrderTemplate, self).create(vals_list)
        records._update_product_translations()
        return records

    def write(self, vals):
        if 'active' in vals and not vals.get('active'):
            template_id = self.env['ir.default'].get('sale.order', 'sale_order_template_id')
            for template in self:
                if template_id and template_id == template.id:
                    raise UserError(_('Before archiving "%s" please select another default template in the settings.') % template.name)
        result = super(SaleOrderTemplate, self).write(vals)
        self._update_product_translations()
        return result

    def _update_product_translations(self):
        languages = self.env['res.lang'].search([('active', '=', 'true')])
        for lang in languages:
            for line in self.sale_order_template_line_ids:
                if line.name == line.product_id.get_product_multiline_description_sale():
                    self.create_or_update_translations(model_name='sale.order.template.line,name', lang_code=lang.code,
                                                       res_id=line.id,src=line.name,
                                                       value=line.product_id.with_context(lang=lang.code).get_product_multiline_description_sale())
            for option in self.sale_order_template_option_ids:
                if option.name == option.product_id.get_product_multiline_description_sale():
                    self.create_or_update_translations(model_name='sale.order.template.option,name', lang_code=lang.code,
                                                       res_id=option.id,src=option.name,
                                                       value=option.product_id.with_context(lang=lang.code).get_product_multiline_description_sale())

    def create_or_update_translations(self, model_name, lang_code, res_id, src, value):
        data = {
            'type': 'model',
            'name': model_name,
            'lang': lang_code,
            'res_id': res_id,
            'src': src,
            'value': value,
            'state': 'inprogress',
        }
        existing_trans = self.env['ir.translation'].search([('name', '=', model_name),
                                                            ('res_id', '=', res_id),
                                                            ('lang', '=', lang_code)])
        if not existing_trans:
            self.env['ir.translation'].create(data)
        else:
            existing_trans.write(data)



class SaleOrderTemplateLine(models.Model):
    _name = "sale.order.template.line"
    _description = "Quotation Template Line"
    _order = 'sale_order_template_id, sequence, id'
    _check_company_auto = True

    sequence = fields.Integer('Sequence', help="Gives the sequence order when displaying a list of sale quote lines.",
        default=10)
    sale_order_template_id = fields.Many2one(
        'sale.order.template', 'Quotation Template Reference',
        required=True, ondelete='cascade', index=True)
    company_id = fields.Many2one('res.company', related='sale_order_template_id.company_id', store=True, index=True)

    name = fields.Text(
        'Description', translate=True,
        compute="_compute_name", store=True, readonly=False)
    product_id = fields.Many2one(
        'product.product', 'Product', check_company=True,
        domain=[('sale_ok', '=', True)])

    product_uom_qty = fields.Float(
        'Quantity', digits='Product Unit of Measure',
        compute="_compute_product_information", store=True, readonly=False)
    product_uom_id = fields.Many2one(
        'uom.uom', 'Unit of Measure',
        compute="_compute_product_information", store=True, readonly=False,
        domain="[('category_id', '=', product_uom_category_id)]")
    product_uom_category_id = fields.Many2one(related='product_id.uom_id.category_id')

    price_unit = fields.Float(
        'Unit Price', digits='Product Price',
        compute="_compute_price_unit", store=True, readonly=False)
    discount = fields.Float('Discount (%)', digits='Discount')

    display_type = fields.Selection([
        ('line_section', "Section"),
        ('line_note', "Note")], help="Technical field for UX purpose.")

    @api.depends('product_id')
    def _compute_product_information(self):
        for line in self:
            line.product_uom = line.product_id.uom_id  # if category different else line.product_uom ?
            line.product_uom_qty = 1.0 # VFE TODO do we really want to reset qty whenever the product_id is changed ?

    @api.depends('product_id', 'company_id')
    def _compute_name(self):
        for line in self:
            line.name = line.product_id.get_product_multiline_description_sale()

    @api.depends('product_id', 'product_uom_id')
    def _compute_price_unit(self):
        for line in self:
            line.price_unit = line.product_id.uom_id._compute_price(
                line.product_id.lst_price, line.product_uom_id)

    @api.model
    def create(self, values):
        if values.get('display_type', self.default_get(['display_type']).get('display_type', False)):
            values.update(product_id=False, price_unit=0, product_uom_qty=0, product_uom_id=False)
        return super(SaleOrderTemplateLine, self).create(values)

    def write(self, values):
        if 'display_type' in values and self.filtered(lambda line: line.display_type != values.get('display_type')):
            raise UserError(_("You cannot change the type of a sale quote line. Instead you should delete the current line and create a new line of the proper type."))
        return super(SaleOrderTemplateLine, self).write(values)

    _sql_constraints = [
        ('accountable_product_id_required',
            "CHECK(display_type IS NOT NULL OR (product_id IS NOT NULL AND product_uom_id IS NOT NULL))",
            "Missing required product and UoM on accountable sale quote line."),

        ('non_accountable_fields_null',
            "CHECK(display_type IS NULL OR (product_id IS NULL AND price_unit = 0 AND product_uom_qty = 0 AND product_uom_id IS NULL))",
            "Forbidden product, unit price, quantity, and UoM on non-accountable sale quote line"),
    ]

    def _prepare_soline_values(self):
        return {
            'display_type': self.display_type,
            'name': self.name,
            'product_uom_qty': self.product_uom_qty,
            'product_id': self.product_id.id,
            'product_uom': self.product_uom_id.id,
            'discount': self.discount,
            'price_unit': self.price_unit
        }


class SaleOrderTemplateOption(models.Model):
    _name = "sale.order.template.option"
    _description = "Quotation Template Option"
    _check_company_auto = True

    sale_order_template_id = fields.Many2one('sale.order.template', 'Quotation Template Reference', ondelete='cascade',
        index=True, required=True)
    company_id = fields.Many2one(
        related='sale_order_template_id.company_id', store=True, index=True)

    product_id = fields.Many2one(
        'product.product', 'Product', domain=[('sale_ok', '=', True)],
        required=True, check_company=True)
    name = fields.Text(
        'Description', translate=True,
        compute="_compute_name", store=True, readonly=False)

    uom_id = fields.Many2one(
        'uom.uom', 'Unit of Measure ',
        compute="_compute_product_information", store=True, readonly=False,
        domain="[('category_id', '=', product_uom_category_id)]")
    product_uom_category_id = fields.Many2one(related='product_id.uom_id.category_id')
    quantity = fields.Float('Quantity', required=True, digits='Product Unit of Measure', default=1)

    price_unit = fields.Float(
        'Unit Price', digits='Product Price',
        compute="_compute_price_unit", store=True, readonly=False)
    discount = fields.Float('Discount (%)', digits='Discount')

    @api.depends('product_id')
    def _compute_product_information(self):
        for line in self:
            line.product_uom = line.product_id.uom_id  # if category different else line.product_uom ?
            line.product_uom_qty = 1.0

    @api.depends('product_id', 'company_id')
    def _compute_name(self):
        for line in self:
            line.name = line.product_id.get_product_multiline_description_sale()

    @api.depends('product_id', 'uom_id')
    def _compute_price_unit(self):
        for line in self:
            line.price_unit = line.product_id.uom_id._compute_price(
                line.product_id.lst_price, line.product_uom_id)

    def _prepare_sooption_values(self):
        return {
            'product_id': self.product_id.id,
            'name': self.name,
            'quantity': self.quantity,
            'uom_id': self.uom_id.id,
            'discount': self.discount,
            'price_unit': self.price_unit,
        }
