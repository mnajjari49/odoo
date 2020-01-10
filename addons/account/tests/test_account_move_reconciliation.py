# -*- coding: utf-8 -*-
from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.tests import tagged, new_test_user
from odoo.tests.common import Form
from odoo import fields


@tagged('post_install', '-at_install')
class TestAccountMoveReconciliation(AccountTestInvoicingCommon):
    ''' Tests about the account.partial.reconcile model, not the reconciliation itself but mainly the computation of
    the residual amounts on account.move.line.
    '''

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.currency_data_2 = cls.setup_multi_currency_data(default_values={
            'name': 'Diamond',
            'symbol': '💎',
            'currency_unit_label': 'Diamond',
            'currency_subunit_label': 'Carbon',
        }, rate2016=6.0, rate2017=4.0)

    def assertFullReconcile(self, full_reconcile, lines):
        exchange_difference_move = full_reconcile.exchange_move_id
        partials = lines.mapped('matched_debit_ids') + lines.mapped('matched_credit_ids')

        if full_reconcile.exchange_move_id:
            lines += exchange_difference_move.line_ids

        # Use sets to not depend of the order.
        self.assertEquals(set(full_reconcile.partial_reconcile_ids), set(partials))
        self.assertEquals(set(full_reconcile.reconciled_line_ids), set(lines))

        # Ensure there is no residual amount left.
        self.assertRecordValues(lines, [{
            'amount_residual': 0.0,
            'amount_residual_currency': 0.0,
            'reconciled': bool(line.account_id.reconcile),
        } for line in lines])

    def test_residual_single_currency(self):
        ''' Test how the residual amounts evolve when reconciling lines in single currency.
        The reconciliations are made by creating the partials directly in order to test only
        the computation of amount_residual/amount_residual_currency/reconciled.
        '''
        account_id = self.company_data['default_account_receivable'].id

        move = self.env['account.move'].create({
            'type': 'entry',
            'date': fields.Date.from_string('2016-01-01'),
            'line_ids': [
                (0, 0, {'debit': 1000.0,    'credit': 0.0,      'account_id': account_id}),
                (0, 0, {'debit': 200.0,     'credit': 0.0,      'account_id': account_id}),
                (0, 0, {'debit': 0.0,       'credit': 300.0,    'account_id': account_id}),
                (0, 0, {'debit': 0.0,       'credit': 400.0,    'account_id': account_id}),
                (0, 0, {'debit': 0.0,       'credit': 500.0,    'account_id': account_id}),
            ]
        })
        move.post()

        line_1 = move.line_ids.filtered(lambda line: line.debit == 1000.0)
        line_2 = move.line_ids.filtered(lambda line: line.debit == 200.0)
        line_3 = move.line_ids.filtered(lambda line: line.credit == 300.0)
        line_4 = move.line_ids.filtered(lambda line: line.credit == 400.0)
        line_5 = move.line_ids.filtered(lambda line: line.credit == 500.0)

        self.assertRecordValues(line_1 + line_2 + line_3 + line_4 + line_5, [
            {'amount_residual': 1000.0,     'amount_residual_currency': 1000.0,     'reconciled': False},
            {'amount_residual': 200.0,      'amount_residual_currency': 200.0,      'reconciled': False},
            {'amount_residual': -300.0,     'amount_residual_currency': -300.0,     'reconciled': False},
            {'amount_residual': -400.0,     'amount_residual_currency': -400.0,     'reconciled': False},
            {'amount_residual': -500.0,     'amount_residual_currency': -500.0,     'reconciled': False},
        ])

        self.env['account.partial.reconcile'].create({
            'amount': 300.0,
            'debit_move_id': line_1.id,
            'credit_move_id': line_3.id,
        })

        self.assertRecordValues(line_1 + line_3, [
            {'amount_residual': 700.0,      'amount_residual_currency': 700.0,      'reconciled': False},
            {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
        ])

        self.env['account.partial.reconcile'].create({
            'amount': 400.0,
            'debit_move_id': line_1.id,
            'credit_move_id': line_4.id,
        })

        self.assertRecordValues(line_1 + line_4, [
            {'amount_residual': 300.0,      'amount_residual_currency': 300.0,      'reconciled': False},
            {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
        ])

        self.env['account.partial.reconcile'].create({
            'amount': 300.0,
            'debit_move_id': line_1.id,
            'credit_move_id': line_5.id,
        })

        self.assertRecordValues(line_1 + line_5, [
            {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            {'amount_residual': -200.0,     'amount_residual_currency': -200.0,     'reconciled': False},
        ])

        self.env['account.partial.reconcile'].create({
            'amount': 200.0,
            'debit_move_id': line_2.id,
            'credit_move_id': line_5.id,
        })

        self.assertRecordValues(line_2 + line_5, [
            {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
        ])

    def test_residual_foreign_currency(self):
        ''' Test how the residual amounts evolve when reconciling lines in foreign currency.
        The reconciliations are made by creating the partials directly in order to test only
        the computation of amount_residual/amount_residual_currency/reconciled.

        The 5 first lines are balanced regarding amount_currency but not with the balance. At the end of
        the test, the difference should be equals to the balance of the 6th line that corresponds to the
        exchange difference to handle.
        '''
        account_id = self.company_data['default_account_receivable'].id
        currency_id = self.currency_data['currency'].id

        move = self.env['account.move'].create({
            'type': 'entry',
            'date': fields.Date.from_string('2016-01-01'),
            'line_ids': [
                (0, 0, {'debit': 1100.0,    'credit': 0.0,      'amount_currency': 3000.0,  'account_id': account_id,   'currency_id': currency_id}),
                (0, 0, {'debit': 180.0,     'credit': 0.0,      'amount_currency': 600.0,   'account_id': account_id,   'currency_id': currency_id}),
                (0, 0, {'debit': 0.0,       'credit': 330.0,    'amount_currency': -900.0,  'account_id': account_id,   'currency_id': currency_id}),
                (0, 0, {'debit': 0.0,       'credit': 360.0,    'amount_currency': -1200.0, 'account_id': account_id,   'currency_id': currency_id}),
                (0, 0, {'debit': 0.0,       'credit': 550.0,    'amount_currency': -1500.0, 'account_id': account_id,   'currency_id': currency_id}),

                (0, 0, {'debit': 0.0,       'credit': 40.0,     'account_id': account_id}),
            ]
        })
        move.post()

        line_1 = move.line_ids.filtered(lambda line: line.amount_currency == 3000.0)
        line_2 = move.line_ids.filtered(lambda line: line.amount_currency == 600.0)
        line_3 = move.line_ids.filtered(lambda line: line.amount_currency == -900.0)
        line_4 = move.line_ids.filtered(lambda line: line.amount_currency == -1200.0)
        line_5 = move.line_ids.filtered(lambda line: line.amount_currency == -1500.0)

        self.assertRecordValues(line_1 + line_2 + line_3 + line_4 + line_5, [
            {'amount_residual': 1100.0,     'amount_residual_currency': 3000.0,     'reconciled': False},
            {'amount_residual': 180.0,      'amount_residual_currency': 600.0,      'reconciled': False},
            {'amount_residual': -330.0,     'amount_residual_currency': -900.0,     'reconciled': False},
            {'amount_residual': -360.0,     'amount_residual_currency': -1200.0,    'reconciled': False},
            {'amount_residual': -550.0,     'amount_residual_currency': -1500.0,    'reconciled': False},
        ])

        self.env['account.partial.reconcile'].create({
            'amount': 330.0,
            'amount_currency': 900.0,
            'debit_move_id': line_1.id,
            'credit_move_id': line_3.id,
            'currency_id': currency_id,
        })

        self.assertRecordValues(line_1 + line_3, [
            {'amount_residual': 770.0,      'amount_residual_currency': 2100.0,     'reconciled': False},
            {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
        ])

        self.env['account.partial.reconcile'].create({
            'amount': 360.0,
            'amount_currency': 1200.0,
            'debit_move_id': line_1.id,
            'credit_move_id': line_4.id,
            'currency_id': currency_id,
        })

        self.assertRecordValues(line_1 + line_4, [
            {'amount_residual': 410.0,      'amount_residual_currency': 900.0,      'reconciled': False},
            {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
        ])

        self.env['account.partial.reconcile'].create({
            'amount': 410.0,
            'amount_currency': 900.0,
            'debit_move_id': line_1.id,
            'credit_move_id': line_5.id,
            'currency_id': currency_id,
        })

        self.assertRecordValues(line_1 + line_5, [
            {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            {'amount_residual': -140.0,     'amount_residual_currency': -600.0,     'reconciled': False},
        ])

        self.env['account.partial.reconcile'].create({
            'amount': 140.0,
            'amount_currency': 600.0,
            'debit_move_id': line_2.id,
            'credit_move_id': line_5.id,
            'currency_id': currency_id,
        })

        self.assertRecordValues(line_2 + line_5, [
            {'amount_residual': 40.0,       'amount_residual_currency': 0.0,        'reconciled': True},
            {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
        ])

    def test_residual_multiple_currencies(self):
        ''' Test how the residual amounts evolve when reconciling lines using multiple currencies.
        The reconciliations are made by creating the partials directly in order to test only
        the computation of amount_residual/amount_residual_currency/reconciled.

        When a line has a foreign currency that is not shared by the partial, a conversion is made based on
        the amount in company's currency. In this specific case, the amount_residual_currency could get a different
        sign than than the balance. E.g:

        Suppose an invoice having a balance of 1000.0$ and an amount_currency of 1200€, a payment having a balance
        of -1000.0$ without a foreign currency but equivalent to -1300.0€ regarding its date.
        Reconciling both lines leads to an amount_residual_currency of -100.0€ in the invoice.
        '''
        account_id = self.company_data['default_account_receivable'].id

        # Rate is 3.0 in 2016, 2.0 in 2017.
        currency1_id = self.currency_data['currency'].id

        move_1 = self.env['account.move'].create({
            'type': 'entry',
            'date': fields.Date.from_string('2016-01-01'),
            'line_ids': [
                (0, 0, {'debit': 1000.0,    'credit': 0.0,      'amount_currency': 3000.0,  'account_id': account_id,   'currency_id': currency1_id}),
                (0, 0, {'debit': 200.0,     'credit': 0.0,      'amount_currency': 600.0,   'account_id': account_id,   'currency_id': currency1_id}),

                (0, 0, {'debit': 0.0,       'credit': 1200.0,   'account_id': account_id}),
            ]
        })

        # Rate is 6.0 in 2016, 4.0 in 2017.
        currency2_id = self.currency_data_2['currency'].id

        move_2 = self.env['account.move'].create({
            'type': 'entry',
            'date': fields.Date.from_string('2017-01-01'),
            'line_ids': [
                (0, 0, {'debit': 0.0,       'credit': 300.0,    'amount_currency': -1200.0, 'account_id': account_id,   'currency_id': currency2_id}),
                (0, 0, {'debit': 0.0,       'credit': 400.0,    'amount_currency': -1600.0, 'account_id': account_id,   'currency_id': currency2_id}),
                (0, 0, {'debit': 0.0,       'credit': 500.0,    'amount_currency': -2000.0, 'account_id': account_id,   'currency_id': currency2_id}),

                (0, 0, {'debit': 1200.0,    'credit': 0.0,      'account_id': account_id}),
            ]
        })

        (move_1 + move_2).post()

        line_1 = move_1.line_ids.filtered(lambda line: line.debit == 1000.0)
        line_2 = move_1.line_ids.filtered(lambda line: line.debit == 200.0)
        line_3 = move_2.line_ids.filtered(lambda line: line.credit == 300.0)
        line_4 = move_2.line_ids.filtered(lambda line: line.credit == 400.0)
        line_5 = move_2.line_ids.filtered(lambda line: line.credit == 500.0)

        self.assertRecordValues(line_1 + line_2 + line_3 + line_4 + line_5, [
            {'amount_residual': 1000.0,     'amount_residual_currency': 3000.0,     'reconciled': False},
            {'amount_residual': 200.0,      'amount_residual_currency': 600.0,      'reconciled': False},
            {'amount_residual': -300.0,     'amount_residual_currency': -1200.0,    'reconciled': False},
            {'amount_residual': -400.0,     'amount_residual_currency': -1600.0,    'reconciled': False},
            {'amount_residual': -500.0,     'amount_residual_currency': -2000.0,    'reconciled': False},
        ])

        self.env['account.partial.reconcile'].create({
            'amount': 300.0,
            'debit_move_id': line_1.id,
            'credit_move_id': line_3.id,
        })

        self.assertRecordValues(line_1 + line_3, [
            #                               3000.0 - (300.0 * 2)
            {'amount_residual': 700.0,      'amount_residual_currency': 2400.0,     'reconciled': False},
            #                               -1200.0 + (300.0 * 6) /!\ sign changed
            {'amount_residual': 0.0,        'amount_residual_currency': 600.0,      'reconciled': False},
        ])

        self.env['account.partial.reconcile'].create({
            'amount': 400.0,
            'debit_move_id': line_1.id,
            'credit_move_id': line_4.id,
        })

        self.assertRecordValues(line_1 + line_4, [
            #                               2400.0 - (400.0 * 2)
            {'amount_residual': 300.0,      'amount_residual_currency': 1600.0,     'reconciled': False},
            #                               -1600.0 + (400.0 * 6) /!\ sign changed
            {'amount_residual': 0.0,        'amount_residual_currency': 800.0,      'reconciled': False},
        ])

        self.env['account.partial.reconcile'].create({
            'amount': 300.0,
            'debit_move_id': line_1.id,
            'credit_move_id': line_5.id,
        })

        self.assertRecordValues(line_1 + line_5, [
            #                               1600.0 - (300.0 * 2)
            {'amount_residual': 0.0,        'amount_residual_currency': 1000.0,     'reconciled': False},
            #                               -2000.0 + (300.0 * 6)
            {'amount_residual': -200.0,     'amount_residual_currency': -200.0,     'reconciled': False},
        ])

        self.env['account.partial.reconcile'].create({
            'amount': 200.0,
            'debit_move_id': line_2.id,
            'credit_move_id': line_5.id,
        })

        self.assertRecordValues(line_2 + line_5, [
            #                               600.0 - (200.0 * 2)
            {'amount_residual': 0.0,        'amount_residual_currency': 200.0,      'reconciled': False},
            #                               -200.0 + (200.0 * 6) /!\ sign changed
            {'amount_residual': 0.0,        'amount_residual_currency': 1000.0,     'reconciled': False},
        ])

    def test_reconcile_single_currency(self):
        ''' Test the way the 'reconcile' method perform the reconciliation in single currency.
        The generated partials should be the same as in 'test_residual_single_currency'.
        At the end, a full reconcile must be generated.
        '''
        account_id = self.company_data['default_account_receivable'].id

        move = self.env['account.move'].create({
            'type': 'entry',
            'date': fields.Date.from_string('2016-01-01'),
            'line_ids': [
                (0, 0, {'debit': 1000.0,    'credit': 0.0,      'account_id': account_id}),
                (0, 0, {'debit': 200.0,     'credit': 0.0,      'account_id': account_id}),
                (0, 0, {'debit': 0.0,       'credit': 300.0,    'account_id': account_id}),
                (0, 0, {'debit': 0.0,       'credit': 400.0,    'account_id': account_id}),
                (0, 0, {'debit': 0.0,       'credit': 500.0,    'account_id': account_id}),
            ]
        })
        move.post()

        line_1 = move.line_ids.filtered(lambda line: line.debit == 1000.0)
        line_2 = move.line_ids.filtered(lambda line: line.debit == 200.0)
        line_3 = move.line_ids.filtered(lambda line: line.credit == 300.0)
        line_4 = move.line_ids.filtered(lambda line: line.credit == 400.0)
        line_5 = move.line_ids.filtered(lambda line: line.credit == 500.0)

        self.assertRecordValues(line_1 + line_2 + line_3 + line_4 + line_5, [
            {'amount_residual': 1000.0,     'amount_residual_currency': 1000.0,     'reconciled': False},
            {'amount_residual': 200.0,      'amount_residual_currency': 200.0,      'reconciled': False},
            {'amount_residual': -300.0,     'amount_residual_currency': -300.0,     'reconciled': False},
            {'amount_residual': -400.0,     'amount_residual_currency': -400.0,     'reconciled': False},
            {'amount_residual': -500.0,     'amount_residual_currency': -500.0,     'reconciled': False},
        ])

        res = (line_1 + line_3).reconcile2()

        self.assertRecordValues(res['partials'], [{
            'amount': 300.0,
            'debit_move_id': line_1.id,
            'credit_move_id': line_3.id,
        }])

        self.assertRecordValues(line_1 + line_3, [
            {'amount_residual': 700.0,      'amount_residual_currency': 700.0,      'reconciled': False},
            {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
        ])

        res = (line_1 + line_4).reconcile2()

        self.assertRecordValues(res['partials'], [{
            'amount': 400.0,
            'debit_move_id': line_1.id,
            'credit_move_id': line_4.id,
        }])

        self.assertRecordValues(line_1 + line_4, [
            {'amount_residual': 300.0,      'amount_residual_currency': 300.0,      'reconciled': False},
            {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
        ])

        res = (line_1 + line_5).reconcile2()

        self.assertRecordValues(res['partials'], [{
            'amount': 300.0,
            'debit_move_id': line_1.id,
            'credit_move_id': line_5.id,
        }])

        self.assertRecordValues(line_1 + line_5, [
            {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            {'amount_residual': -200.0,     'amount_residual_currency': -200.0,     'reconciled': False},
        ])

        res = (line_2 + line_5).reconcile2()

        self.assertRecordValues(res['partials'], [{
            'amount': 200.0,
            'debit_move_id': line_2.id,
            'credit_move_id': line_5.id,
        }])

        self.assertRecordValues(res['full_reconcile'], [{'exchange_move_id': False}])
        self.assertFullReconcile(res['full_reconcile'], line_1 + line_2 + line_3 + line_4 + line_5)

    def test_reconcile_foreign_currency(self):
        ''' Test the way the 'reconcile' method perform the reconciliation in single currency.
        The generated partials should be the same as in 'test_residual_single_currency'.
        At the end, a full reconcile must be generated.
        '''
        account_id = self.company_data['default_account_receivable'].id
        currency_id = self.currency_data['currency'].id

        move = self.env['account.move'].create({
            'type': 'entry',
            'date': fields.Date.from_string('2016-01-01'),
            'line_ids': [
                (0, 0, {'debit': 1100.0,    'credit': 0.0,      'amount_currency': 3000.0,  'account_id': account_id,   'currency_id': currency_id}),
                (0, 0, {'debit': 180.0,     'credit': 0.0,      'amount_currency': 600.0,   'account_id': account_id,   'currency_id': currency_id}),
                (0, 0, {'debit': 0.0,       'credit': 330.0,    'amount_currency': -900.0,  'account_id': account_id,   'currency_id': currency_id}),
                (0, 0, {'debit': 0.0,       'credit': 360.0,    'amount_currency': -1200.0, 'account_id': account_id,   'currency_id': currency_id}),
                (0, 0, {'debit': 0.0,       'credit': 550.0,    'amount_currency': -1500.0, 'account_id': account_id,   'currency_id': currency_id}),

                (0, 0, {'debit': 0.0,       'credit': 40.0,     'account_id': account_id}),
            ]
        })
        move.post()

        line_1 = move.line_ids.filtered(lambda line: line.amount_currency == 3000.0)
        line_2 = move.line_ids.filtered(lambda line: line.amount_currency == 600.0)
        line_3 = move.line_ids.filtered(lambda line: line.amount_currency == -900.0)
        line_4 = move.line_ids.filtered(lambda line: line.amount_currency == -1200.0)
        line_5 = move.line_ids.filtered(lambda line: line.amount_currency == -1500.0)

        self.assertRecordValues(line_1 + line_2 + line_3 + line_4 + line_5, [
            {'amount_residual': 1100.0,     'amount_residual_currency': 3000.0,     'reconciled': False},
            {'amount_residual': 180.0,      'amount_residual_currency': 600.0,      'reconciled': False},
            {'amount_residual': -330.0,     'amount_residual_currency': -900.0,     'reconciled': False},
            {'amount_residual': -360.0,     'amount_residual_currency': -1200.0,    'reconciled': False},
            {'amount_residual': -550.0,     'amount_residual_currency': -1500.0,    'reconciled': False},
        ])

        res = (line_1 + line_3).reconcile2()

        self.assertRecordValues(res['partials'], [{
            'amount': 330.0,
            'amount_currency': 900.0,
            'debit_move_id': line_1.id,
            'credit_move_id': line_3.id,
            'currency_id': currency_id,
        }])

        self.assertRecordValues(line_1 + line_3, [
            {'amount_residual': 770.0,      'amount_residual_currency': 2100.0,     'reconciled': False},
            {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
        ])

        res = (line_1 + line_4).reconcile2()

        self.assertRecordValues(res['partials'], [{
            'amount': 360.0,
            'amount_currency': 1200.0,
            'debit_move_id': line_1.id,
            'credit_move_id': line_4.id,
            'currency_id': currency_id,
        }])

        self.assertRecordValues(line_1 + line_4, [
            {'amount_residual': 410.0,      'amount_residual_currency': 900.0,      'reconciled': False},
            {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
        ])

        res = (line_1 + line_5).reconcile2()

        self.assertRecordValues(res['partials'], [{
            'amount': 410.0,
            'amount_currency': 900.0,
            'debit_move_id': line_1.id,
            'credit_move_id': line_5.id,
            'currency_id': currency_id,
        }])

        self.assertRecordValues(line_1 + line_5, [
            {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            {'amount_residual': -140.0,     'amount_residual_currency': -600.0,     'reconciled': False},
        ])

        res = (line_2 + line_5).reconcile2()

        self.assertTrue(res.get('full_reconcile'))

        exchange_diff = res['full_reconcile'].exchange_move_id
        exchange_diff_lines = exchange_diff.line_ids.sorted(lambda line: (abs(line.balance), -line.balance))

        self.assertRecordValues(exchange_diff_lines, [
            {
                'debit': 40.0,
                'credit': 0.0,
                'amount_currency': 0.0,
                'currency_id': currency_id,
                'account_id': exchange_diff.company_id.expense_currency_exchange_account_id.id,
            },
            {
                'debit': 0.0,
                'credit': 40.0,
                'amount_currency': 0.0,
                'currency_id': currency_id,
                'account_id': account_id,
            },
        ])

        self.assertRecordValues(res['partials'], [
            # Partial generated when reconciling line_2 & line_5:
            {
                'amount': 140.0,
                'amount_currency': 600.0,
                'debit_move_id': line_2.id,
                'credit_move_id': line_5.id,
                'currency_id': currency_id,
            },
            # Partial fixing line_2 (exchange difference):
            {
                'amount': 40.0,
                'amount_currency': 0.0,
                'debit_move_id': line_2.id,
                'credit_move_id': exchange_diff_lines[1].id,
                'currency_id': self.currency_data['currency'].id,
            },
        ])

        self.assertFullReconcile(res['full_reconcile'], line_1 + line_2 + line_3 + line_4 + line_5)

    def test_reconcile_multiple_currencies(self):
        ''' Test the way the 'reconcile' method perform the reconciliation in single currency.
        The generated partials should be the same as in 'test_residual_single_currency'.
        At the end, a full reconcile must be generated.
        '''
        account_id = self.company_data['default_account_receivable'].id

        # Rate is 3.0 in 2016, 2.0 in 2017.
        currency1_id = self.currency_data['currency'].id
        # Rate is 6.0 in 2016, 4.0 in 2017.
        currency2_id = self.currency_data_2['currency'].id

        moves = self.env['account.move'].create([
            {
                'type': 'entry',
                'date': fields.Date.from_string('2016-01-01'),
                'line_ids': [
                    (0, 0, {'debit': 1000.0,    'credit': 0.0,      'amount_currency': 3000.0,  'account_id': account_id,   'currency_id': currency1_id}),
                    (0, 0, {'debit': 200.0,     'credit': 0.0,      'amount_currency': 600.0,   'account_id': account_id,   'currency_id': currency1_id}),

                    (0, 0, {'debit': 0.0,       'credit': 1200.0,   'account_id': account_id}),
                ]
            },
            {
                'type': 'entry',
                'date': fields.Date.from_string('2017-01-01'),
                'line_ids': [
                    (0, 0, {'debit': 0.0,       'credit': 300.0,    'amount_currency': -600.0,  'account_id': account_id,   'currency_id': currency1_id}),
                    (0, 0, {'debit': 0.0,       'credit': 400.0,    'amount_currency': -1600.0, 'account_id': account_id,   'currency_id': currency2_id}),
                    (0, 0, {'debit': 0.0,       'credit': 500.0,    'amount_currency': -2000.0, 'account_id': account_id,   'currency_id': currency2_id}),

                    (0, 0, {'debit': 1200.0,    'credit': 0.0,      'account_id': account_id}),
                ]
            }
        ])

        moves.post()

        line_1 = moves.line_ids.filtered(lambda line: line.debit == 1000.0)
        line_2 = moves.line_ids.filtered(lambda line: line.debit == 200.0)
        line_3 = moves.line_ids.filtered(lambda line: line.credit == 300.0)
        line_4 = moves.line_ids.filtered(lambda line: line.credit == 400.0)
        line_5 = moves.line_ids.filtered(lambda line: line.credit == 500.0)

        self.assertRecordValues(line_1 + line_2 + line_3 + line_4 + line_5, [
            {'amount_residual': 1000.0,     'amount_residual_currency': 3000.0,     'reconciled': False},
            {'amount_residual': 200.0,      'amount_residual_currency': 600.0,      'reconciled': False},
            {'amount_residual': -300.0,     'amount_residual_currency': -600.0,     'reconciled': False},
            {'amount_residual': -400.0,     'amount_residual_currency': -1600.0,    'reconciled': False},
            {'amount_residual': -500.0,     'amount_residual_currency': -2000.0,    'reconciled': False},
        ])

        res = (line_1 + line_3 + line_4).reconcile2()

        partials = res['partials'].sorted(lambda part: (part.currency_id.id, part.amount, part.amount_currency))
        self.assertRecordValues(partials, [
            # Partial generated when reconciling line_1 & line_3:
            # TODO: This partial is correct regarding the old reconcile method.
            #       However, since line_1.currency_id == line_3.currency_id, it's strange the currency
            #       is missing on the partial.
            #       I didn't change this behavior right now because I want to fix existing tests first,
            #       but it's something to check.
            {
                'amount': 300.0,
                'amount_currency': 300.0,                           # TODO: expected: 600.0
                'debit_move_id': line_1.id,
                'credit_move_id': line_3.id,
                'currency_id': self.company_data['currency'].id,    # TODO: expected: currency1_id
            },
            # Partial generated when reconciling line_1 & line_4:
            {
                'amount': 400.0,
                'amount_currency': 400.0,
                'debit_move_id': line_1.id,
                'credit_move_id': line_4.id,
                'currency_id': self.company_data['currency'].id,
            },
        ])

        # line_1's amount_residual_currency = 3000.0 - (300.0 * 2) - (400.0 * 2) = 1600.0
        # line_3's amount_residual_currency = -1200.0 + (300.0 * 6) = 600.0 /!\ sign changed
        # line_4's amount_residual_currency = -1600.0 + (400.0 * 6) = 800.0 /!\ sign changed

        res = (line_1 + line_5).reconcile2()

        self.assertRecordValues(res['partials'], [{
            'amount': 300.0,
            'debit_move_id': line_1.id,
            'credit_move_id': line_5.id,
        }])

        self.assertRecordValues(line_1 + line_5, [
            #                               1600.0 - (300.0 * 2)
            {'amount_residual': 0.0,        'amount_residual_currency': 1000.0,     'reconciled': False},
            #                               -2000.0 + (300.0 * 6)
            {'amount_residual': -200.0,     'amount_residual_currency': -200.0,     'reconciled': False},
        ])

        res = (line_2 + line_5).reconcile2()

        # line_2's amount_residual_currency = 600.0 - (200.0 * 2) = 200.0
        # line_5's amount_residual_currency = -200.0 + (200.0 * 6) = 1000.0

        self.assertTrue(res.get('full_reconcile'))

        exchange_diff = res['full_reconcile'].exchange_move_id
        exchange_diff_lines = exchange_diff.line_ids.sorted(lambda line: (line.currency_id, abs(line.amount_currency), -line.amount_currency))

        self.assertRecordValues(exchange_diff_lines, [
            # Fix line_2:
            {
                'debit': 0.0,
                'credit': 0.0,
                'amount_currency': 200.0,
                'currency_id': currency1_id,
                'account_id': exchange_diff.journal_id.default_debit_account_id.id,
            },
            {
                'debit': 0.0,
                'credit': 0.0,
                'amount_currency': -200.0,
                'currency_id': currency1_id,
                'account_id': account_id,
            },
            # Fix line_5:
            {
                'debit': 0.0,
                'credit': 0.0,
                'amount_currency': 1000.0,
                'currency_id': currency2_id,
                'account_id': exchange_diff.journal_id.default_debit_account_id.id,
            },
            {
                'debit': 0.0,
                'credit': 0.0,
                'amount_currency': -1000.0,
                'currency_id': currency2_id,
                'account_id': account_id,
            },
            # Fix line_3:
            {
                'debit': 0.0,
                'credit': 0.0,
                'amount_currency': 300.0,
                'currency_id': currency1_id,
                'account_id': exchange_diff.journal_id.default_debit_account_id.id,
            },
            {
                'debit': 0.0,
                'credit': 0.0,
                'amount_currency': -300.0,
                'currency_id': currency1_id,
                'account_id': account_id,
            },
            # Fix line_1:
            {
                'debit': 0.0,
                'credit': 0.0,
                'amount_currency': 1000.0,
                'currency_id': currency1_id,
                'account_id': exchange_diff.journal_id.default_debit_account_id.id,
            },
            {
                'debit': 0.0,
                'credit': 0.0,
                'amount_currency': -1000.0,
                'currency_id': currency1_id,
                'account_id': account_id,
            },
            # Fix line_4:
            {
                'debit': 0.0,
                'credit': 0.0,
                'amount_currency': 800.0,
                'currency_id': currency2_id,
                'account_id': exchange_diff.journal_id.default_debit_account_id.id,
            },
            {
                'debit': 0.0,
                'credit': 0.0,
                'amount_currency': -800.0,
                'currency_id': currency2_id,
                'account_id': account_id,
            },
        ])

        partials = res['partials'].sorted(lambda part: (part.currency_id.id, part.amount, part.amount_currency))
        self.assertRecordValues(partials, [
            # Partial generated when reconciling line_2 & line_5:
            {
                'amount': 200.0,
                'amount_currency': 200.0,
                'debit_move_id': line_2.id,
                'credit_move_id': line_5.id,
                'currency_id': self.company_data['currency'].id,
            },
            # Partial fixing line_2 (exchange difference):
            {
                'amount': 0.0,
                'amount_currency': 200.0,
                'debit_move_id': line_2.id,
                'credit_move_id': exchange_diff_lines[1].id,
                'currency_id': currency1_id,
            },
            # Partial fixing line_3 (exchange difference):
            {
                'amount': 0.0,
                'amount_currency': 300.0,
                'debit_move_id': line_3.id,
                'credit_move_id': exchange_diff_lines[5].id,
                'currency_id': currency1_id,
            },
            # Partial fixing line_1 (exchange difference):
            {
                'amount': 0.0,
                'amount_currency': 1000.0,
                'debit_move_id': line_1.id,
                'credit_move_id': exchange_diff_lines[7].id,
                'currency_id': currency1_id,
            },
            # Partial fixing line_4 (exchange difference):
            {
                'amount': 0.0,
                'amount_currency': 800.0,
                'debit_move_id': line_4.id,
                'credit_move_id': exchange_diff_lines[9].id,
                'currency_id': currency2_id,
            },
            # Partial fixing line_5 (exchange difference):
            {
                'amount': 0.0,
                'amount_currency': 1000.0,
                'debit_move_id': line_5.id,
                'credit_move_id': exchange_diff_lines[3].id,
                'currency_id': currency2_id,
            },
        ])

        self.assertFullReconcile(res['full_reconcile'], line_1 + line_2 + line_3 + line_4 + line_5)
