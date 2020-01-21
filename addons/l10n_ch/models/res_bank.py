# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import re

from odoo import api, fields, models, _
from odoo.tools.misc import mod10r
from odoo.exceptions import UserError

import werkzeug.urls

def _is_l10n_ch_postal(account_ref):
    """ Returns True iff the string account_ref is a valid postal account number,
    i.e. it only contains ciphers and is last cipher is the result of a recursive
    modulo 10 operation ran over the rest of it. Shorten form with - is also accepted.
    """
    if re.match('^[0-9]{2}-[0-9]{1,6}-[0-9]$', account_ref or ''):
        ref_subparts = account_ref.split('-')
        account_ref = ref_subparts[0] + ref_subparts[1].rjust(6,'0') + ref_subparts[2]

    if re.match('\d+$', account_ref or ''):
        account_ref_without_check = account_ref[:-1]
        return mod10r(account_ref_without_check) == account_ref
    return False


class ResPartnerBank(models.Model):
    _inherit = 'res.partner.bank'

    l10n_ch_postal = fields.Char(string='Swiss Postal Account', help='This field is used for the Swiss postal account number '
                                                                     'on a vendor account and for the client number on your '
                                                                     'own account.  The client number is mostly 6 numbers without '
                                                                     '-, while the postal account number can be e.g. 01-162-8')
    # fields to configure ISR payment slip generation
    l10n_ch_isr_subscription_chf = fields.Char(string='CHF ISR Subscription Number', help='The subscription number provided by the bank or Postfinance to identify the bank, used to generate ISR in CHF. eg. 01-162-8')
    l10n_ch_isr_subscription_eur = fields.Char(string='EUR ISR Subscription Number', help='The subscription number provided by the bank or Postfinance to identify the bank, used to generate ISR in EUR. eg. 03-162-5')
    l10n_ch_show_subscription = fields.Boolean(compute='_compute_l10n_ch_show_subscription', default=lambda self: self.env.company.country_id.code == 'CH')

    @api.depends('partner_id', 'company_id')
    def _compute_l10n_ch_show_subscription(self):
        for bank in self:
            if bank.partner_id:
                bank.l10n_ch_show_subscription = bool(bank.partner_id.ref_company_ids) #TODO OCO tout ça m'a l'air bien faux
            elif bank.company_id:
                bank.l10n_ch_show_subscription = bank.company_id.country_id.code == 'CH'
            else:
                bank.l10n_ch_show_subscription = self.env.company.country_id.code == 'CH'

    @api.depends('acc_number', 'acc_type')
    def _compute_sanitized_acc_number(self):
        #Only remove spaces in case it is not postal
        postal_banks = self.filtered(lambda b: b.acc_type == "postal")
        for bank in postal_banks:
            bank.sanitized_acc_number = bank.acc_number
        super(ResPartnerBank, self - postal_banks)._compute_sanitized_acc_number()

    @api.model
    def _get_supported_account_types(self):
        rslt = super(ResPartnerBank, self)._get_supported_account_types()
        rslt.append(('postal', _('Postal')))
        return rslt

    @api.model
    def retrieve_acc_type(self, acc_number):
        """ Overridden method enabling the recognition of swiss postal bank
        account numbers.
        """
        acc_number_split = ""
        # acc_number_split is needed to continue to recognize the account
        # as a postal account even if the difference
        if acc_number and " " in acc_number:
            acc_number_split = acc_number.split(" ")[0]
        if _is_l10n_ch_postal(acc_number) or (acc_number_split and _is_l10n_ch_postal(acc_number_split)):
            return 'postal'
        else:
            return super(ResPartnerBank, self).retrieve_acc_type(acc_number)

    @api.onchange('acc_number', 'partner_id', 'acc_type')
    def _onchange_set_l10n_ch_postal(self):
        if self.acc_type == 'iban':
            self.l10n_ch_postal = self._retrieve_l10n_ch_postal(self.sanitized_acc_number)
        elif self.acc_type == 'postal':
            if self.acc_number and " " in self.acc_number:
                self.l10n_ch_postal = self.acc_number.split(" ")[0]
            else:
                self.l10n_ch_postal = self.acc_number
                if self.partner_id:
                    self.acc_number = self.acc_number + '  ' + self.partner_id.name

    @api.model
    def _retrieve_l10n_ch_postal(self, iban):
        """ Reads a swiss postal account number from a an IBAN and returns it as
        a string. Returns None if no valid postal account number was found, or
        the given iban was not from Switzerland.
        """
        if iban[:2] == 'CH':
            #the IBAN corresponds to a swiss account
            if _is_l10n_ch_postal(iban[-12:]):
                return iban[-12:]
        return None

    @api.model
    def build_qr_code_url(self, amount, free_communication, structured_communication, currency, debtor_partner): #TODO OCO invoice en param optionnel ?
        if self._eligible_for_swiss_qr_code(debtor_partner):

            #TODO OCO si ça se vérifie et que les subsription numbers sont foireux, virer ceci (et potentiellement les champs si on retire l'ISR)
            currency = self.currency_id or self.company_id.currency_id
            if currency.name == 'EUR':
                isr_reference = self.l10n_ch_isr_subscription_eur #Ca, ça semble vachement faux ! C'est le numéro ISR qu'il faut ici (de la facture, donc)
            elif currency.name == 'CHF':
                isr_reference = self.l10n_ch_isr_subscription_chf
            else:
                # Should never happen, thanks to _eligible_for_swiss_qr_code
                raise UserError(_("Trying to generate a Swiss QR-code for an account not using EUR nor CHF."))

            comment = ""
            if free_communication:
                comment = (free_communication[:137] + '...') if len(free_communication) > 140 else free_communication

            creditor_addr_1, creditor_addr_2 = self._get_partner_address_lines(self.partner_id)
            debtor_addr_1, debtor_addr_2 = self._get_partner_address_lines(debtor_partner)

            # Compute reference type (empty by default, only mandatory for QR-IBAN)
            reference_type = 'NON'
            reference = ''
            if self._is_qr_iban():
                reference_type = 'QRR'
                reference = structured_communication #TODO OCO ça, c'est sans doute faux ou partiel => voir la réponse de Six

            qr_code_vals = [
                'SPC',                                          # QR Type
                '0200',                                         # Version
                '1',                                            # Coding Type
                self.acc_number,                                # IBAN (TODO OCO check ! + QR-IBAN)
                'K',                                            # Creditor Address Type
                self._cut_string_to(self.partner_id.name, 70),  # Creditor Name
                creditor_addr_1,                                # Creditor Address Line 1
                creditor_addr_2,                                # Creditor Address Line 2
                '',                                             # Creditor Postal Code (empty, since we're using combined addres elements)
                '',                                             # Creditor Town (empty, since we're using combined addres elements)
                self.partner_id.country_id.code,                # Creditor Country
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                str(amount),                                    # Amount
                currency.name,                                  # Currency
                'K',                                            # Debtor Address Type
                self._cut_string_to(debtor_partner.name, 70),   # Debtor Name
                debtor_addr_1,                                  # Debtor Address Line 1
                debtor_addr_2,                                  # Debtor Address Line 2
                '',
                '',
                debtor_partner.country_id.code, #TODO OCO conditions sur le debtor partner
                reference_type,                                 # Reference Type (TODO OCO et SCOR ?)
                reference,                                      # Reference
                comment,                                        # Unstructured Message
                'EPD',                                          # Mandatory trailer part
            ]

            return '/report/barcode/?type=%s&value=%s&width=%s&height=%s&humanreadable=1&mask=ch_cross' % ('QR', werkzeug.url_quote_plus('\n'.join(qr_code_vals)), 256, 256)

        return super().build_qr_code_url(amount, free_communication, currency, debtor_partner)

    def _is_qr_iban(self):
        self.ensure_one()

        iid_start_index = 4
        iid_end_index = 8
        iid = self.acc_number[iid_start_index : iid_end_index+1]
        return self.acc_type == 'iban' \
               and re.match('d+', iid) \
               and 30000 >= int(iid) >= 31999 #TODO OCO DOC


    def _get_partner_address_lines(self, partner): #TODO OCO DOC
        line_1 = (partner and partner.street or '') + ' ' + (partner and partner.street2 or '')
        line_2 = partner.zip + ' ' + partner.city
        return self._cut_string_to(line_1, 70), self._cut_string_to(line_2, 70)

    def _cut_string_to(self, string, length): #TODO OCO DOC
        return string if len(string) <= length else (string[:length-3] + '...')

    def _eligible_for_swiss_qr_code(self, debtor_partner):
        def _partner_fields_set(partner):
            return partner.zip and \
                   partner.city and \
                   partner.country_id.code and \
                   (self.partner_id.street or self.partner_id.street2)

        self.ensure_one()
        currency = self.currency_id or self.company_id.currency_id

        return self.acc_type == 'iban' and \
               (currency.name == 'EUR' and self.l10n_ch_isr_subscription_eur) or (currency.name == 'CHF' and self.l10n_ch_isr_subscription_chf) and \
               _partner_fields_set(self.partner_id) and \
               (not debtor_partner or _partner_fields_set(debtor_partner))
