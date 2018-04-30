# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, api, _
from odoo.exceptions import UserError


class InvoiceFinancingOffer(models.Model):
    _name = 'invoice.financing.offer'
    _description = 'Financing Request'
    _inherit = ['mail.thread']
    _order = "request_date desc, name desc, id desc"

    name = fields.Char('Refernce/Name', index=True, readonly=True, copy=False, default=lambda self: _('New'))
    request_date = fields.Datetime('Request date')
    invoice_amount = fields.Monetary('Invoice Amount', compute='_compute_invoice_amount')
    company_id = fields.Many2one('res.company', default=lambda self: self.env.user.company_id.id)
    currency_id = fields.Many2one('res.currency', related='company_id.currency_id')
    invoice_ids = fields.Many2many('account.invoice', string='Invoices')

    state = fields.Selection([
        ('draft', 'Draft'),
        ('request', 'Requested'),
        ('accept', 'Accepted'),
        ('reject', 'Rejected'),
        ('cancel', 'Cancelled')
    ], track_visibility='onchange', string='Status', index=True, copy=False, default='draft')

    @api.multi
    def _compute_invoice_amount(self):
        for rec in self:
            rec.invoice_amount = sum(self.invoice_ids.mapped('amount_total'))

    def create(self, vals):
        if 'name' not in vals or vals['name'] == _('New'):
            vals['name'] = self.env['ir.sequence'].next_by_code(self._name)
        return super(InvoiceFinancingOffer, self).create(vals)


class InvoiceFinancingRequest(models.TransientModel):
    _name = "account.invoice.financing"

    invoice_ids = fields.Many2many('account.invoice', string="Invoices ready for financing")
    ignored_invoice_ids = fields.Many2many('account.invoice', string="Invoices not allowed for financing", readonly=True)

    @api.model
    def default_get(self, fields):
        """ Default get for valid invoices and ignored invoices"""
        result = super(InvoiceFinancingRequest, self).default_get(fields)
        active_ids = self._context.get('active_ids', [])
        invoices = self.env['account.invoice'].browse(active_ids)
        ignored_invoices = invoices.filtered(lambda i: i._valid_for_factoring() is not None)
        open_invoices = invoices - ignored_invoices

        if not open_invoices:
            raise UserError(_("No any open invoices for financing. Only Open and Company invoice allowed"))
        result['invoice_ids'] = list(open_invoices.ids)
        result['ignored_invoice_ids'] = list(ignored_invoices.ids)
        return result

    @api.multi
    def send_for_financing(self):
        values = {
            'request_date': fields.Datetime.now(),
            'invoice_ids': [(6, False, self.invoice_ids.ids)]
        }
        offer = self.env['invoice.financing.offer'].create(values)
        return {
            'name': _('Factoring'),
            'view_type': 'form',
            'view_mode': 'form',
            'res_model': 'invoice.financing.offer',
            'type': 'ir.actions.act_window',
            'target': 'current',
            'res_id': offer.id,
        }
