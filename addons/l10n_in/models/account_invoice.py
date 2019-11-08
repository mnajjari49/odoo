# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class AccountMove(models.Model):
    _inherit = "account.move"

    @api.depends('amount_total')
    def _compute_amount_total_words(self):
        for invoice in self:
            invoice.amount_total_words = invoice.currency_id.amount_to_text(invoice.amount_total)

    amount_total_words = fields.Char("Total (In Words)", compute="_compute_amount_total_words")
    l10n_in_gst_treatment = fields.Selection([
        ('regular','Registered Business - Regular'),
        ('composition','Registered Business - Composition'),
        ('unregistered','Unregistered Business'),
        ('consumer','Consumer'),
        ('overseas','Overseas'),
        ('special_economic_zone','Special Economic Zone'),
        ('deemed_export','Deemed Export'),
        ],string="GST Treatment", readonly=True, states={'draft': [('readonly', False)]})
    l10n_in_place_of_supply_id = fields.Many2one('res.country.state', string="Place of Supply", domain=[('l10n_in_tin','!=', False)], readonly=True, states={'draft': [('readonly', False)]})
    l10n_in_company_country_code = fields.Char(related='company_id.country_id.code', string="Country code")
    l10n_in_gstin = fields.Char(string="GSTIN", readonly=True, states={'draft': [('readonly', False)]})
    # For Export invoice this data is need in GSTR report
    l10n_in_shipping_bill_number = fields.Char('Shipping bill number', readonly=True, states={'draft': [('readonly', False)]})
    l10n_in_shipping_bill_date = fields.Date('Shipping bill date', readonly=True, states={'draft': [('readonly', False)]})
    l10n_in_shipping_port_code_id = fields.Many2one('l10n_in.port.code', 'Shipping port code', states={'draft': [('readonly', False)]})
    l10n_in_reseller_partner_id = fields.Many2one('res.partner', 'Reseller', domain=[('vat', '!=', False)], help="Only Registered Reseller", readonly=True, states={'draft': [('readonly', False)]})

    @api.constrains('l10n_in_gst_treatment','journal_id','partner_id')
    def _check_l10n_in_gst_treatment(self):
        wrong_moves = self.filtered(lambda move:
            move.l10n_in_company_country_code == 'IN' and
            move.l10n_in_gst_treatment in ['regular','composition','special_economic_zone','deemed_export'] and
            move.partner_id.vat == False)
        if wrong_moves:
            partners_name = "".join("%s(%s) "%(m.partner_id.name,m.partner_id.id) for m in wrong_moves)
            raise ValidationError(_("GSTIN is required for GST Treatment Regular, Composition, Special Economic Zone and Deemed Export.\nDefine GSTIN in %s") %(partners_name))

    @api.constrains('l10n_in_gstin', 'journal_id')
    def _check_l10n_in_gstin(self):
        moves = self.filtered(lambda move:
            move.l10n_in_company_country_code == 'IN' and
            move.l10n_in_gst_treatment in ['regular','composition','special_economic_zone','deemed_export'] and
            move.l10n_in_gstin != False)
        check_vat_in = self.env['res.partner'].check_vat_in
        wrong_gstin = []
        for move in moves:
            if not check_vat_in(move.l10n_in_gstin):
                wrong_gstin.append(move.l10n_in_gstin)
        if wrong_gstin:
            raise ValidationError(_("GSTIN '%s' is not valid") %(",".join(wrong_gstin)))

    @api.onchange('partner_id')
    def _onchange_partner_id(self):
        if self.l10n_in_company_country_code == 'IN':
            self.l10n_in_gst_treatment = self.partner_id.l10n_in_gst_treatment
            self._onchange_l10n_in_gst_treatment()
        return super()._onchange_partner_id()

    @api.onchange('journal_id')
    def _onchange_journal(self):
        if self.l10n_in_company_country_code == 'IN':
            if self.type in ('in_invoice','in_refund','in_receipt'):
                place_of_supply_id = self.journal_id.l10n_in_gstin_partner_id.l10n_in_place_of_supply_id
                if not place_of_supply_id and self.journal_id.l10n_in_gstin_partner_id.state_id.l10n_in_tin:
                    place_of_supply_id = self.journal_id.l10n_in_gstin_partner_id.state_id
                self.l10n_in_place_of_supply_id = place_of_supply_id
        else:
            self.l10n_in_gst_treatment = False
            self.l10n_in_place_of_supply_id = False
            self.l10n_in_gstin = False
        return super()._onchange_journal()

    @api.onchange('l10n_in_gst_treatment')
    def _onchange_l10n_in_gst_treatment(self):
        if self.l10n_in_company_country_code == 'IN':
            if self.l10n_in_gst_treatment and self.l10n_in_gst_treatment == self.partner_id.l10n_in_gst_treatment:
                self.l10n_in_gstin = self.partner_id.vat
                if self.type in ('out_invoice','out_refund','out_receipt'):
                    place_of_supply_id = self.partner_id.l10n_in_place_of_supply_id
                    if not place_of_supply_id and self.partner_id.state_id.l10n_in_tin:
                        place_of_supply_id = self.partner_id.state_id
                    self.l10n_in_place_of_supply_id = place_of_supply_id
            else:
                self.l10n_in_gstin = False
                if self.type in ('out_invoice','out_refund','out_receipt'):
                    self.l10n_in_place_of_supply_id = False


    @api.onchange('l10n_in_gstin')
    def _onchange_l10n_in_gstin(self):
        if self.l10n_in_company_country_code == 'IN':
            check_vat_in = self.env['res.partner'].check_vat_in
            if self.l10n_in_gst_treatment and self.l10n_in_gst_treatment != self.partner_id.l10n_in_gst_treatment and check_vat_in(self.l10n_in_gstin) and self.type in ('out_invoice','out_refund','out_receipt'):
                self.l10n_in_place_of_supply_id = self.env['res.country.state'].search([('l10n_in_tin','=', self.l10n_in_gstin[:2])], limit=1)

    @api.model
    def _get_tax_grouping_key_from_tax_line(self, tax_line):
        # OVERRIDE to group taxes also by product.
        res = super()._get_tax_grouping_key_from_tax_line(tax_line)
        res['product_id'] = tax_line.product_id.id
        return res

    @api.model
    def _get_tax_grouping_key_from_base_line(self, base_line, tax_vals):
        # OVERRIDE to group taxes also by product.
        res = super()._get_tax_grouping_key_from_base_line(base_line, tax_vals)
        res.update({
            'product_id': base_line.product_id.id,
            'product_uom_id': base_line.product_uom_id.id,
            'quantity': base_line.quantity,
        })
        return res

    @api.model
    def _get_tax_key_for_group_add_base(self, line):
        tax_key = super(AccountMove, self)._get_tax_key_for_group_add_base(line)

        tax_key += [
            line.product_id.id,
        ]
        return tax_key
