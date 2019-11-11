# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class SaleOrder(models.Model):
    _inherit = "sale.order"

    l10n_in_reseller_partner_id = fields.Many2one('res.partner',
        string='Reseller', domain="[('vat', '!=', False), '|', ('company_id', '=', False), ('company_id', '=', company_id)]", readonly=True, states={'draft': [('readonly', False)]})
    l10n_in_journal_id = fields.Many2one('account.journal', string="Journal", readonly=True, states={'draft': [('readonly', False)]})
    l10n_in_gst_treatment = fields.Selection([
        ('regular','Registered Business - Regular'),
        ('composition','Registered Business - Composition'),
        ('unregistered','Unregistered Business'),
        ('consumer','Consumer'),
        ('overseas','Overseas'),
        ('special_economic_zone','Special Economic Zone'),
        ('deemed_export','Deemed Export'),
        ],string="GST Treatment", readonly=True, states={'draft': [('readonly', False)]})
    l10n_in_place_of_supply_id = fields.Many2one('res.country.state', string="Place of Supply",
        domain=[('l10n_in_tin','!=', False)], readonly=True, states={'draft': [('readonly', False)]})
    l10n_in_company_country_code = fields.Char(related='company_id.country_id.code', string="Country code")
    l10n_in_gstin = fields.Char(string="GSTIN", readonly=True, states={'draft': [('readonly', False)]})

    @api.constrains('l10n_in_gstin', 'company_id')
    def _check_l10n_in_gstin(self):
        moves = self.filtered(lambda move:
            move.l10n_in_company_country_code == 'IN' and
            move.l10n_in_gst_treatment in ('regular','composition','special_economic_zone','deemed_export') and
            move.l10n_in_gstin != False)
        check_vat_in = self.env['res.partner'].check_vat_in
        wrong_gstin = []
        for move in moves:
            if not check_vat_in(move.l10n_in_gstin):
                wrong_gstin.append(move.l10n_in_gstin)
        if wrong_gstin:
            raise ValidationError(_("GSTIN '%s' is not valid") %(",".join(wrong_gstin)))

    @api.constrains('l10n_in_gst_treatment','company_id','partner_id')
    def _check_l10n_in_gst_treatment(self):
        wrong_moves = self.filtered(lambda move:
            move.l10n_in_company_country_code == 'IN' and
            move.l10n_in_gst_treatment in ('regular','composition','special_economic_zone','deemed_export') and
            move.l10n_in_gstin == False)
        if wrong_moves:
            name = "".join("%s(%s) "%(m.name, m.id) for m in wrong_moves)
            raise ValidationError(_("GSTIN is required for GST Treatment Regular, Composition, Special Economic Zone and Deemed Export.\nDefine GSTIN in %s") %(name))

    def _prepare_invoice(self):
        invoice_vals = super(SaleOrder, self)._prepare_invoice()
        if self.l10n_in_company_country_code == 'IN':
            invoice_vals['l10n_in_reseller_partner_id'] = self.l10n_in_reseller_partner_id.id
            if self.l10n_in_journal_id:
                invoice_vals['journal_id'] = self.l10n_in_journal_id.id
            invoice_vals['l10n_in_gst_treatment'] = self.l10n_in_gst_treatment
            invoice_vals['l10n_in_place_of_supply_id'] = self.l10n_in_place_of_supply_id.id
            invoice_vals['l10n_in_gstin'] = self.l10n_in_gstin
        return invoice_vals

    @api.onchange('company_id')
    def l10n_in_onchange_company_id(self):
        if self.l10n_in_company_country_code == 'IN':
            domain = [('company_id', '=', self.company_id.id), ('type', '=', 'sale')]
            journal = self.env['account.journal'].search(domain, limit=1)
            if journal:
                self.l10n_in_journal_id = journal.id
        else:
            self.l10n_in_gst_treatment = False
            self.l10n_in_place_of_supply_id = False

    @api.onchange('partner_id')
    def onchange_partner_id(self):
        if self.l10n_in_company_country_code == 'IN':
            self.l10n_in_gst_treatment = self.partner_id.l10n_in_gst_treatment
            self.onchange_l10n_in_gst_treatment()
        return super().onchange_partner_id()

    @api.onchange('l10n_in_gst_treatment')
    def onchange_l10n_in_gst_treatment(self):
        if self.l10n_in_company_country_code == 'IN':
            if self.l10n_in_gst_treatment and self.l10n_in_gst_treatment == self.partner_id.l10n_in_gst_treatment:
                self.l10n_in_gstin = self.partner_id.vat
                place_of_supply_id = self.partner_id.l10n_in_place_of_supply_id
                if not place_of_supply_id and self.partner_id.state_id.l10n_in_tin:
                    place_of_supply_id = self.partner_id.state_id
                self.l10n_in_place_of_supply_id = place_of_supply_id
            else:
                self.l10n_in_gstin = False
                self.l10n_in_place_of_supply_id = False

    @api.onchange('l10n_in_gstin')
    def onchange_l10n_in_gstin(self):
        if self.l10n_in_company_country_code == 'IN':
            check_vat_in = self.env['res.partner'].check_vat_in
            if self.l10n_in_gst_treatment and self.l10n_in_gst_treatment != self.partner_id.l10n_in_gst_treatment and check_vat_in(self.l10n_in_gstin):
                self.l10n_in_place_of_supply_id = self.env['res.country.state'].search([('l10n_in_tin','=', self.l10n_in_gstin[:2])], limit=1)

