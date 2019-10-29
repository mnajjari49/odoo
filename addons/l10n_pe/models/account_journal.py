from odoo import models, api


class AccountJournal(models.Model):
    _inherit = 'account.journal'

    @api.model
    def _l10n_pe_fix_sequence_vals(self, journal_vals, sequence_vals, is_refund):
        ''' For peruvian companies we can not use sequences with **/** due to the edi generation
        which need in the sequence a plain text ended by a *-* and the length of this prefix.

        :param journal_vals:    Parameter of the account.journal's create method.
        :param sequence_vals:   Parameter of the ir.sequence's create method.
        :param is_refund:       Flag indicating if this is applied to a refund sequence or not.
        '''
        company = self.env['res.company'].browse(journal_vals['company_id'])
        if company.country_id != self.env.ref('base.pe') or journal_vals['type'] not in ('sale', 'purchase'):
            return

        prefix = journal_vals['code'].upper()
        if len(prefix) > 3:
            prefix = prefix[:3]
        prefix = prefix.ljust(3, 'X')
        if is_refund:
            prefix = 'R' + prefix[:-1]

        sequence_vals.update({
            'prefix': prefix + '-',
            'use_date_range': False,
        })

    @api.model
    def _create_sequence(self, journal_vals, sequence_vals):
        # OVERRIDE
        self._l10n_pe_fix_sequence_prefix(journal_vals, sequence_vals, True)
        return super()._create_sequence(journal_vals, sequence_vals)

    @api.model
    def _create_refund_sequence(self, journal_vals, sequence_vals):
        # OVERRIDE
        self._l10n_pe_fix_sequence_prefix(journal_vals, sequence_vals, True)
        return super()._create_sequence(journal_vals, sequence_vals)
