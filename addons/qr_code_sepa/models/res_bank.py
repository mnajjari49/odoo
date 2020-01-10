# -*- coding: utf-8 -*-

from odoo import models, fields, api


class ResPartnerBank(models.Model):
    _inherit = 'res.partner.bank'

    def build_qr_code_url(self, amount, comment, currency): #TODO OCO currency
        if currency.name == 'EUR' and self.eligible_for_sepa_qr_code():
            communication = ''
            if comment:
                communication = (comment[:137] + '...') if len(comment) > 140 else comment
            qr_code_string = 'BCD\n001\n1\nSCT\n%s\n%s\n%s\nEUR%s\n\n\n%s' % (self.bank_bic or '', self.partner_id.name, self.acc_number, amount, communication)
            qr_code_url = '/report/barcode/?type=%s&value=%s&width=%s&height=%s&humanreadable=1' % ('QR', werkzeug.url_quote_plus(qr_code_string), 128, 128)
            return qr_code_url

        return super(ResPartnerBank, self).build_qr_code_url(amount, comment, currency)

    def _eligible_for_sepa_qr_code(self):
        self.ensure_one()

        sepa_country_codes = self.env.ref('base.sepa_zone').country_ids.mapped('code')
        # Some countries share the same IBAN country code
        # (e.g. Åland Islands and Finland IBANs are 'FI', but Åland Islands' code is 'AX').
        non_iban_codes = {'AX', 'NC', 'YT', 'TF', 'BL', 'RE', 'MF', 'GP', 'PM', 'PF', 'GF', 'MQ', 'JE', 'GG', 'IM'}
        sepa_iban_codes = {code for code in sepa_country_codes if code not in non_iban_codes}

        return self.partner_id.name and self.acc_type == 'iban' and self.sanitized_acc_number[:2] in sepa_iban_codes)
