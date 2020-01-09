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

        cls.move_single_currency_1 = cls.env['account.move'].create({
            'type': 'entry',
            'date': fields.Date.from_string('2016-01-01'),
            'line_ids': [(0, None, {
                'name': 'line_%s' % i,
                'account_id': cls.company_data['default_account_receivable'].id,
                'debit': balance if balance > 0.0 else 0.0,
                'credit': -balance if balance < 0.0 else 0.0,
            }) for i, balance in (
                (0, 100.0),
                (1, 300.0),
                (2, 600.0),
                (3, 1000.0),
                (4, -100.0),
                (5, -300.0),
                (6, -600.0),
                (7, -1000.0),
            )],
        })

        # Create a journal entry having containing lines that leads to amount_residual = 0
        # and amount_residual_currency = 0 when all lines are reconciled together.
        cls.move_foreign_currency_1 = cls.env['account.move'].create({
            'type': 'entry',
            'date': fields.Date.from_string('2017-01-01'),
            'line_ids': [(0, None, {
                'name': 'line_%s' % i,
                'account_id': cls.company_data['default_account_receivable'].id,
                'currency_id': cls.currency_data['currency'].id,
                'amount_currency': balance * rate,
                'debit': balance if balance > 0.0 else 0.0,
                'credit': -balance if balance < 0.0 else 0.0,
            }) for i, rate, balance in (
                (0, 9, 100.0),
                (1, 3, 300.0),
                (2, 2, 600.0),
                (3, 3, 1000.0),
                (4, 9, -100.0),
                (5, 3, -300.0),
                (6, 2, -600.0),
                (7, 3, -1000.0),
            )],
        })

        # Create a journal entry having containing lines that leads to amount_residual = 0
        # and amount_residual_currency != 0 when all lines are reconciled together.
        cls.move_foreign_currency_2 = cls.env['account.move'].create({
            'type': 'entry',
            'date': fields.Date.from_string('2017-01-01'),
            'line_ids': [(0, None, {
                'name': 'line_%s' % i,
                'account_id': cls.company_data['default_account_receivable'].id,
                'currency_id': cls.currency_data_2['currency'].id,
                'amount_currency': balance * rate,
                'debit': balance if balance > 0.0 else 0.0,
                'credit': -balance if balance < 0.0 else 0.0,
            }) for i, rate, balance in (
                (0, 3, 100.0),
                (1, 2, 300.0),
                (2, 3, 600.0),
                (3, 9, 1000.0),
                (4, 3, -100.0),
                (5, 2, -300.0),
                (6, 3, -600.0),
                (7, 9, -1000.0),
            )],
        })

        # Create a journal entry having containing lines that leads to amount_residual != 0
        # and amount_residual_currency = 0 when lines 'except the ones at 100.0) are reconciled together.
        cls.move_foreign_currency_3 = cls.env['account.move'].create({
            'type': 'entry',
            'date': fields.Date.from_string('2017-01-01'),
            'line_ids': [(0, None, {
                'name': 'line_%s' % i,
                'account_id': cls.company_data['default_account_receivable'].id,
                'currency_id': cls.currency_data['currency'].id,
                'amount_currency': balance * rate,
                'debit': balance if balance > 0.0 else 0.0,
                'credit': -balance if balance < 0.0 else 0.0,
            }) for i, rate, balance in (
                (0, 6, 100.0),
                (1, 2, 300.0),
                (2, 4, 600.0),
                (3, 3, 1000.0),
                (4, 6, -100.0),
                (5, 2, -300.0),
                (6, 4, -600.0),
                (7, 3, -1000.0),
            )],
        })

    def _get_line(self, move, index):
        return move.line_ids.filtered(lambda line: line.name == 'line_%s' % index)

    def assertFullReconcile(self, full_reconcile, lines):
        exchange_difference_move = full_reconcile.exchange_move_id
        partials = lines.mapped('matched_debit_ids') + lines.mapped('matched_credit_ids')

        if exchange_difference_move:
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

    # -------------------------------------------------------------------------
    # TESTS amount_residual / amount_residual_currency with partials
    # -------------------------------------------------------------------------

    def test_residual_amount_no_reconciliation(self):
        self.assertRecordValues(
            self.move_single_currency_1.line_ids.sorted('name'),
            [
                {'amount_residual': 100.0,      'amount_residual_currency': 100.0,      'reconciled': False},
                {'amount_residual': 300.0,      'amount_residual_currency': 300.0,      'reconciled': False},
                {'amount_residual': 600.0,      'amount_residual_currency': 600.0,      'reconciled': False},
                {'amount_residual': 1000.0,     'amount_residual_currency': 1000.0,     'reconciled': False},
                {'amount_residual': -100.0,     'amount_residual_currency': -100.0,     'reconciled': False},
                {'amount_residual': -300.0,     'amount_residual_currency': -300.0,     'reconciled': False},
                {'amount_residual': -600.0,     'amount_residual_currency': -600.0,     'reconciled': False},
                {'amount_residual': -1000.0,    'amount_residual_currency': -1000.0,    'reconciled': False},
            ]
        )

        self.assertRecordValues(
            self.move_foreign_currency_1.line_ids.sorted('name'),
            [
                {'amount_residual': 100.0,      'amount_residual_currency': 900.0,      'reconciled': False},
                {'amount_residual': 300.0,      'amount_residual_currency': 900.0,      'reconciled': False},
                {'amount_residual': 600.0,      'amount_residual_currency': 1200.0,     'reconciled': False},
                {'amount_residual': 1000.0,     'amount_residual_currency': 3000.0,     'reconciled': False},
                {'amount_residual': -100.0,     'amount_residual_currency': -900.0,     'reconciled': False},
                {'amount_residual': -300.0,     'amount_residual_currency': -900.0,     'reconciled': False},
                {'amount_residual': -600.0,     'amount_residual_currency': -1200.0,    'reconciled': False},
                {'amount_residual': -1000.0,    'amount_residual_currency': -3000.0,    'reconciled': False},
            ]
        )

        self.assertRecordValues(
            self.move_foreign_currency_2.line_ids.sorted('name'),
            [
                {'amount_residual': 100.0,      'amount_residual_currency': 300.0,      'reconciled': False},
                {'amount_residual': 300.0,      'amount_residual_currency': 600.0,      'reconciled': False},
                {'amount_residual': 600.0,      'amount_residual_currency': 1800.0,     'reconciled': False},
                {'amount_residual': 1000.0,     'amount_residual_currency': 9000.0,     'reconciled': False},
                {'amount_residual': -100.0,     'amount_residual_currency': -300.0,     'reconciled': False},
                {'amount_residual': -300.0,     'amount_residual_currency': -600.0,     'reconciled': False},
                {'amount_residual': -600.0,     'amount_residual_currency': -1800.0,    'reconciled': False},
                {'amount_residual': -1000.0,    'amount_residual_currency': -9000.0,    'reconciled': False},
            ]
        )

    def test_partials_residual_no_foreign_currency_debit(self):
        ''' Test a simple flow reconciling multiple times a line having a debit amount.
        The reconciliations are all done in single-currency.
        '''

        debit_line = self._get_line(self.move_single_currency_1, 3)
        credit_line_1 = self._get_line(self.move_single_currency_1, 4)
        credit_line_2 = self._get_line(self.move_single_currency_1, 5)
        credit_line_3 = self._get_line(self.move_single_currency_1, 6)

        self.env['account.partial.reconcile'].create([
            {
                'amount': 100.0,
                'amount_currency': 100.0,
                'debit_move_id': debit_line.id,
                'credit_move_id': credit_line_1.id,
                'currency_id': self.company_data['currency'].id,
            },
        ])

        self.assertRecordValues(
            debit_line + credit_line_1,
            [
                {'amount_residual': 900.0,      'amount_residual_currency': 900.0,      'reconciled': False},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.env['account.partial.reconcile'].create([
            {
                'amount': 300.0,
                'amount_currency': 300.0,
                'debit_move_id': debit_line.id,
                'credit_move_id': credit_line_2.id,
                'currency_id': self.company_data['currency'].id,
            },
        ])

        self.assertRecordValues(
            debit_line + credit_line_2,
            [
                {'amount_residual': 600.0,      'amount_residual_currency': 600.0,      'reconciled': False},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.env['account.partial.reconcile'].create([
            {
                'amount': 600.0,
                'amount_currency': 600.0,
                'debit_move_id': debit_line.id,
                'credit_move_id': credit_line_3.id,
                'currency_id': self.company_data['currency'].id,
            },
        ])

        self.assertRecordValues(
            debit_line + credit_line_3,
            [
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

    def test_partials_residual_no_foreign_currency_credit(self):
        ''' Test a simple flow reconciling multiple times a line having a credit amount.
        The reconciliations are all done in single-currency.
        '''

        credit_line = self._get_line(self.move_single_currency_1, 7)
        debit_line_1 = self._get_line(self.move_single_currency_1, 0)
        debit_line_2 = self._get_line(self.move_single_currency_1, 1)
        debit_line_3 = self._get_line(self.move_single_currency_1, 2)

        self.env['account.partial.reconcile'].create([
            {
                'amount': 100.0,
                'amount_currency': 100.0,
                'debit_move_id': debit_line_1.id,
                'credit_move_id': credit_line.id,
                'currency_id': self.company_data['currency'].id,
            },
        ])

        self.assertRecordValues(
            credit_line + debit_line_1,
            [
                {'amount_residual': -900.0,     'amount_residual_currency': -900.0,     'reconciled': False},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.env['account.partial.reconcile'].create([
            {
                'amount': 300.0,
                'amount_currency': 300.0,
                'debit_move_id': debit_line_2.id,
                'credit_move_id': credit_line.id,
                'currency_id': self.company_data['currency'].id,
            },
        ])

        self.assertRecordValues(
            credit_line + debit_line_2,
            [
                {'amount_residual': -600.0,     'amount_residual_currency': -600.0,     'reconciled': False},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.env['account.partial.reconcile'].create([
            {
                'amount': 600.0,
                'amount_currency': 600.0,
                'debit_move_id': debit_line_3.id,
                'credit_move_id': credit_line.id,
                'currency_id': self.company_data['currency'].id,
            },
        ])

        self.assertRecordValues(
            credit_line + debit_line_3,
            [
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

    def test_partials_residual_same_foreign_currency_debit(self):
        ''' Test a simple flow reconciling multiple times a line having a debit amount.
        The reconciliations are all done in multi-currency.
        '''

        debit_line = self._get_line(self.move_foreign_currency_1, 3)
        credit_line_1 = self._get_line(self.move_foreign_currency_1, 4)
        credit_line_2 = self._get_line(self.move_foreign_currency_1, 5)
        credit_line_3 = self._get_line(self.move_foreign_currency_1, 6)

        self.env['account.partial.reconcile'].create([
            {
                'amount': 100.0,
                'amount_currency': 900.0,
                'debit_move_id': debit_line.id,
                'credit_move_id': credit_line_1.id,
                'currency_id': self.currency_data['currency'].id,
            },
        ])

        self.assertRecordValues(
            debit_line + credit_line_1,
            [
                {'amount_residual': 900.0,      'amount_residual_currency': 2100.0,     'reconciled': False},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.env['account.partial.reconcile'].create([
            {
                'amount': 300.0,
                'amount_currency': 900.0,
                'debit_move_id': debit_line.id,
                'credit_move_id': credit_line_2.id,
                'currency_id': self.currency_data['currency'].id,
            },
        ])

        self.assertRecordValues(
            debit_line + credit_line_2,
            [
                {'amount_residual': 600.0,      'amount_residual_currency': 1200.0,     'reconciled': False},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.env['account.partial.reconcile'].create([
            {
                'amount': 600.0,
                'amount_currency': 1200.0,
                'debit_move_id': debit_line.id,
                'credit_move_id': credit_line_3.id,
                'currency_id': self.currency_data['currency'].id,
            },
        ])

        self.assertRecordValues(
            debit_line + credit_line_3,
            [
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

    def test_partials_residual_same_foreign_currency_credit(self):
        ''' Test a simple flow reconciling multiple times a line having a credit amount.
        The reconciliations are all done in multi-currency.
        '''

        credit_line = self._get_line(self.move_foreign_currency_1, 7)
        debit_line_1 = self._get_line(self.move_foreign_currency_1, 0)
        debit_line_2 = self._get_line(self.move_foreign_currency_1, 1)
        debit_line_3 = self._get_line(self.move_foreign_currency_1, 2)

        self.env['account.partial.reconcile'].create([
            {
                'amount': 100.0,
                'amount_currency': 900.0,
                'debit_move_id': debit_line_1.id,
                'credit_move_id': credit_line.id,
                'currency_id': self.currency_data['currency'].id,
            },
        ])

        self.assertRecordValues(
            credit_line + debit_line_1,
            [
                {'amount_residual': -900.0,     'amount_residual_currency': -2100.0,    'reconciled': False},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.env['account.partial.reconcile'].create([
            {
                'amount': 300.0,
                'amount_currency': 900.0,
                'debit_move_id': debit_line_2.id,
                'credit_move_id': credit_line.id,
                'currency_id': self.currency_data['currency'].id,
            },
        ])

        self.assertRecordValues(
            credit_line + debit_line_2,
            [
                {'amount_residual': -600.0,     'amount_residual_currency': -1200.0,    'reconciled': False},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.env['account.partial.reconcile'].create([
            {
                'amount': 600.0,
                'amount_currency': 1200.0,
                'debit_move_id': debit_line_3.id,
                'credit_move_id': credit_line.id,
                'currency_id': self.currency_data['currency'].id,
            },
        ])

        self.assertRecordValues(
            credit_line + debit_line_3,
            [
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

    def test_partials_residual_mixed_no_and_foreign_currency_debit(self):
        ''' Test a flow reconciling multiple times a line having a debit amount.
        The reconciliations are done by mixing lines without foreign currency with
        ones having a foreign currency.
        '''

        debit_line = self._get_line(self.move_foreign_currency_1, 3)
        credit_line_1 = self._get_line(self.move_single_currency_1, 4)
        credit_line_2 = self._get_line(self.move_single_currency_1, 5)
        credit_line_3 = self._get_line(self.move_single_currency_1, 6)

        self.env['account.partial.reconcile'].create([
            {
                'amount': 100.0,
                'debit_move_id': debit_line.id,
                'credit_move_id': credit_line_1.id,
            },
        ])

        self.assertRecordValues(
            debit_line + credit_line_1,
            [
                {'amount_residual': 900.0,      'amount_residual_currency': 2700.0,     'reconciled': False},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.env['account.partial.reconcile'].create([
            {
                'amount': 300.0,
                'debit_move_id': debit_line.id,
                'credit_move_id': credit_line_2.id,
            },
        ])

        self.assertRecordValues(
            debit_line + credit_line_2,
            [
                {'amount_residual': 600.0,      'amount_residual_currency': 1800.0,     'reconciled': False},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.env['account.partial.reconcile'].create([
            {
                'amount': 600.0,
                'debit_move_id': debit_line.id,
                'credit_move_id': credit_line_3.id,
            },
        ])

        self.assertRecordValues(
            debit_line + credit_line_3,
            [
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

    def test_partials_residual_mixed_no_and_foreign_currency_credit(self):
        ''' Test a flow reconciling multiple times a line having a credit amount.
        The reconciliations are done by mixing lines without foreign currency with
        ones having a foreign currency.
        '''

        credit_line = self._get_line(self.move_foreign_currency_1, 7)
        debit_line_1 = self._get_line(self.move_single_currency_1, 0)
        debit_line_2 = self._get_line(self.move_single_currency_1, 1)
        debit_line_3 = self._get_line(self.move_single_currency_1, 2)

        self.env['account.partial.reconcile'].create([
            {
                'amount': 100.0,
                'debit_move_id': debit_line_1.id,
                'credit_move_id': credit_line.id,
            },
        ])

        self.assertRecordValues(
            credit_line + debit_line_1,
            [
                {'amount_residual': -900.0,     'amount_residual_currency': -2700.0,    'reconciled': False},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.env['account.partial.reconcile'].create([
            {
                'amount': 300.0,
                'debit_move_id': debit_line_2.id,
                'credit_move_id': credit_line.id,
            },
        ])

        self.assertRecordValues(
            credit_line + debit_line_2,
            [
                {'amount_residual': -600.0,     'amount_residual_currency': -1800.0,    'reconciled': False},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.env['account.partial.reconcile'].create([
            {
                'amount': 600.0,
                'debit_move_id': debit_line_3.id,
                'credit_move_id': credit_line.id,
            },
        ])

        self.assertRecordValues(
            credit_line + debit_line_3,
            [
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

    def test_partials_residual_multiple_foreign_currency_debit(self):
        ''' Test a flow reconciling multiple times a line having a debit amount.
        The reconciliations are done using multiple foreign currencies.

        The conversion rate of move_foreign_currency_1 is 2.
        The conversion rate of move_foreign_currency_2 is 4.
        '''

        debit_line = self._get_line(self.move_foreign_currency_1, 3)
        credit_line_1 = self._get_line(self.move_foreign_currency_2, 4)
        credit_line_2 = self._get_line(self.move_foreign_currency_2, 5)
        credit_line_3 = self._get_line(self.move_foreign_currency_2, 6)

        self.env['account.partial.reconcile'].create([
            {
                'amount': 100.0,
                'debit_move_id': debit_line.id,
                'credit_move_id': credit_line_1.id,
            },
        ])

        self.assertRecordValues(
            debit_line + credit_line_1,
            [
                # 1000.0 - 100.0 = 900.0        3000.0 - (100.0 * 2) = 2800.0
                {'amount_residual': 900.0,      'amount_residual_currency': 2800.0,     'reconciled': False},
                # -100.0 + 100.0 = 0.0          -300.0 + (100.0 * 4) = 100.0
                {'amount_residual': 0.0,        'amount_residual_currency': 100.0,      'reconciled': False},
            ]
        )

        self.env['account.partial.reconcile'].create([
            {
                'amount': 300.0,
                'debit_move_id': debit_line.id,
                'credit_move_id': credit_line_2.id,
            },
        ])

        self.assertRecordValues(
            debit_line + credit_line_2,
            [
                # 900.0 - 300.0 = 600.0         2800.0 - (300.0 * 2) = 2200.0
                {'amount_residual': 600.0,      'amount_residual_currency': 2200.0,     'reconciled': False},
                # -300.0 + 300.0 = 0.0          -600.0 + (300.0 * 4) = 600.0
                {'amount_residual': 0.0,        'amount_residual_currency': 600.0,      'reconciled': False},
            ]
        )

        self.env['account.partial.reconcile'].create([
            {
                'amount': 600.0,
                'debit_move_id': debit_line.id,
                'credit_move_id': credit_line_3.id,
            },
        ])

        self.assertRecordValues(
            debit_line + credit_line_3,
            [
                # 600.0 - 600.0 = 0.0           2200.0 - (600.0 * 2) = 1000.0
                {'amount_residual': 0.0,        'amount_residual_currency': 1000.0,     'reconciled': False},
                # -600.0 + 600.0 = 0.0          -1800.0 + (600.0 * 4) = 600.0
                {'amount_residual': 0.0,        'amount_residual_currency': 600.0,      'reconciled': False},
            ]
        )

    def test_partials_residual_multiple_foreign_currency_credit(self):
        ''' Test a flow reconciling multiple times a line having a credit amount.
        The reconciliations are done using multiple foreign currencies.
        '''

        credit_line = self._get_line(self.move_foreign_currency_1, 7)
        debit_line_1 = self._get_line(self.move_foreign_currency_2, 0)
        debit_line_2 = self._get_line(self.move_foreign_currency_2, 1)
        debit_line_3 = self._get_line(self.move_foreign_currency_2, 2)

        self.env['account.partial.reconcile'].create([
            {
                'amount': 100.0,
                'debit_move_id': debit_line_1.id,
                'credit_move_id': credit_line.id,
            },
        ])

        self.assertRecordValues(
            credit_line + debit_line_1,
            [
                # -1000.0 + 100.0 = -900.0       -3000.0 + (100.0 * 2) = -2800.0
                {'amount_residual': -900.0,     'amount_residual_currency': -2800.0,    'reconciled': False},
                # 100.0 - 100.0 = 0.0           300.0 - (100.0 * 4) = -100.0
                {'amount_residual': 0.0,        'amount_residual_currency': -100.0,     'reconciled': False},
            ]
        )

        self.env['account.partial.reconcile'].create([
            {
                'amount': 300.0,
                'debit_move_id': debit_line_2.id,
                'credit_move_id': credit_line.id,
            },
        ])

        self.assertRecordValues(
            credit_line + debit_line_2,
            [
                # -900.0 + 300.0 = -600.0       -2800.0 + (300.0 * 2) = -2200.0
                {'amount_residual': -600.0,     'amount_residual_currency': -2200.0,    'reconciled': False},
                # 300.0 - 300.0 = 0.0           600.0 - (300.0 * 4) = -600.0
                {'amount_residual': 0.0,        'amount_residual_currency': -600.0,     'reconciled': False},
            ]
        )

        self.env['account.partial.reconcile'].create([
            {
                'amount': 600.0,
                'debit_move_id': debit_line_3.id,
                'credit_move_id': credit_line.id,
            },
        ])

        self.assertRecordValues(
            credit_line + debit_line_3,
            [
                # -600.0 + 600.0 = 0.0          -2200.0 + (600.0 * 2) = 1000.0
                {'amount_residual': 0.0,        'amount_residual_currency': -1000.0,    'reconciled': False},
                # 600.0 - 600.0 = 0.0           1800.0 - (600.0 * 4) = -600.0
                {'amount_residual': 0.0,        'amount_residual_currency': -600.0,     'reconciled': False},
            ]
        )

    # -------------------------------------------------------------------------
    # TESTS reconciliation
    # -------------------------------------------------------------------------

    def test_reconcile_no_foreign_currency_debit(self):
        ''' Test a simple flow reconciling multiple times a line having a debit amount.
        The reconciliations are all done in single-currency.
        '''

        debit_line = self._get_line(self.move_single_currency_1, 3)
        credit_line_1 = self._get_line(self.move_single_currency_1, 4)
        credit_line_2 = self._get_line(self.move_single_currency_1, 5)
        credit_line_3 = self._get_line(self.move_single_currency_1, 6)

        res = (debit_line + credit_line_1).reconcile2()

        self.assertRecordValues(
            debit_line + credit_line_1,
            [
                {'amount_residual': 900.0,      'amount_residual_currency': 900.0,      'reconciled': False},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.assertRecordValues(res['partials'], [{
            'amount': 100.0,
            'amount_currency': 100.0,
            'debit_move_id': debit_line.id,
            'credit_move_id': credit_line_1.id,
            'currency_id': self.company_data['currency'].id,
            'full_reconcile_id': False,
        }])

        res = (debit_line + credit_line_2).reconcile2()

        self.assertRecordValues(
            debit_line + credit_line_2,
            [
                {'amount_residual': 600.0,      'amount_residual_currency': 600.0,      'reconciled': False},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.assertRecordValues(res['partials'], [{
            'amount': 300.0,
            'amount_currency': 300.0,
            'debit_move_id': debit_line.id,
            'credit_move_id': credit_line_2.id,
            'currency_id': self.company_data['currency'].id,
            'full_reconcile_id': False,
        }])

        res = (debit_line + credit_line_3).reconcile2()

        self.assertRecordValues(
            debit_line + credit_line_3,
            [
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.assertRecordValues(res['partials'], [{
            'amount': 600.0,
            'amount_currency': 600.0,
            'debit_move_id': debit_line.id,
            'credit_move_id': credit_line_3.id,
            'currency_id': self.company_data['currency'].id,
        }])

        self.assertRecordValues(res['full_reconcile'], [{
            'exchange_move_id': False,
            'partial_reconcile_ids': debit_line.matched_credit_ids.ids,
            'reconciled_line_ids': (debit_line + credit_line_1 + credit_line_2 + credit_line_3).ids,
        }])

    def test_reconcile_no_foreign_currency_credit(self):
        ''' Test a simple flow reconciling multiple times a line having a credit amount.
        The reconciliations are all done in single-currency.
        '''

        credit_line = self._get_line(self.move_single_currency_1, 7)
        debit_line_1 = self._get_line(self.move_single_currency_1, 0)
        debit_line_2 = self._get_line(self.move_single_currency_1, 1)
        debit_line_3 = self._get_line(self.move_single_currency_1, 2)

        res = (debit_line_1 + credit_line).reconcile2()

        self.assertRecordValues(
            credit_line + debit_line_1,
            [
                {'amount_residual': -900.0,     'amount_residual_currency': -900.0,     'reconciled': False},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.assertRecordValues(res['partials'], [{
            'amount': 100.0,
            'amount_currency': 100.0,
            'debit_move_id': debit_line_1.id,
            'credit_move_id': credit_line.id,
            'currency_id': self.company_data['currency'].id,
            'full_reconcile_id': False,
        }])

        res = (debit_line_2 + credit_line).reconcile2()

        self.assertRecordValues(
            credit_line + debit_line_2,
            [
                {'amount_residual': -600.0,     'amount_residual_currency': -600.0,     'reconciled': False},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.assertRecordValues(res['partials'], [{
            'amount': 300.0,
            'amount_currency': 300.0,
            'debit_move_id': debit_line_2.id,
            'credit_move_id': credit_line.id,
            'currency_id': self.company_data['currency'].id,
            'full_reconcile_id': False,
        }])

        res = (debit_line_3 + credit_line).reconcile2()

        self.assertRecordValues(
            credit_line + debit_line_3,
            [
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.assertRecordValues(res['partials'], [{
            'amount': 600.0,
            'amount_currency': 600.0,
            'debit_move_id': debit_line_3.id,
            'credit_move_id': credit_line.id,
            'currency_id': self.company_data['currency'].id,
        }])

        self.assertRecordValues(res['full_reconcile'], [{
            'exchange_move_id': False,
            'partial_reconcile_ids': credit_line.matched_debit_ids.ids,
            'reconciled_line_ids': (debit_line_1 + debit_line_2 + debit_line_3 + credit_line).ids,
        }])

    def test_reconcile_same_foreign_currency_debit(self):
        ''' Test a simple flow reconciling multiple times a line having a debit amount.
        The reconciliations are all done in multi-currency.
        '''

        debit_line = self._get_line(self.move_foreign_currency_1, 3)
        credit_line_1 = self._get_line(self.move_foreign_currency_1, 4)
        credit_line_2 = self._get_line(self.move_foreign_currency_1, 5)
        credit_line_3 = self._get_line(self.move_foreign_currency_1, 6)

        res = (debit_line + credit_line_1).reconcile2()

        self.assertRecordValues(
            debit_line + credit_line_1,
            [
                {'amount_residual': 900.0,      'amount_residual_currency': 2100.0,     'reconciled': False},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.assertRecordValues(res['partials'], [{
            'amount': 100.0,
            'amount_currency': 900.0,
            'debit_move_id': debit_line.id,
            'credit_move_id': credit_line_1.id,
            'currency_id': self.currency_data['currency'].id,
            'full_reconcile_id': False,
        }])

        res = (debit_line + credit_line_2).reconcile2()

        self.assertRecordValues(
            debit_line + credit_line_2,
            [
                {'amount_residual': 600.0,      'amount_residual_currency': 1200.0,     'reconciled': False},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.assertRecordValues(res['partials'], [{
            'amount': 300.0,
            'amount_currency': 900.0,
            'debit_move_id': debit_line.id,
            'credit_move_id': credit_line_2.id,
            'currency_id': self.currency_data['currency'].id,
            'full_reconcile_id': False,
        }])

        res = (debit_line + credit_line_3).reconcile2()

        self.assertRecordValues(
            debit_line + credit_line_3,
            [
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.assertRecordValues(res['partials'], [{
            'amount': 600.0,
            'amount_currency': 1200.0,
            'debit_move_id': debit_line.id,
            'credit_move_id': credit_line_3.id,
            'currency_id': self.currency_data['currency'].id,
        }])

        self.assertRecordValues(res['full_reconcile'], [{
            'exchange_move_id': False,
            'partial_reconcile_ids': debit_line.matched_credit_ids.ids,
            'reconciled_line_ids': (debit_line + credit_line_1 + credit_line_2 + credit_line_3).ids,
        }])

    def test_reconcile_same_foreign_currency_credit(self):
        ''' Test a simple flow reconciling multiple times a line having a credit amount.
        The reconciliations are all done in multi-currency.
        '''

        credit_line = self._get_line(self.move_foreign_currency_1, 7)
        debit_line_1 = self._get_line(self.move_foreign_currency_1, 0)
        debit_line_2 = self._get_line(self.move_foreign_currency_1, 1)
        debit_line_3 = self._get_line(self.move_foreign_currency_1, 2)

        res = (debit_line_1 + credit_line).reconcile2()

        self.assertRecordValues(
            credit_line + debit_line_1,
            [
                {'amount_residual': -900.0,     'amount_residual_currency': -2100.0,    'reconciled': False},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.assertRecordValues(res['partials'], [{
            'amount': 100.0,
            'amount_currency': 900.0,
            'debit_move_id': debit_line_1.id,
            'credit_move_id': credit_line.id,
            'currency_id': self.currency_data['currency'].id,
            'full_reconcile_id': False,
        }])

        res = (debit_line_2 + credit_line).reconcile2()

        self.assertRecordValues(
            credit_line + debit_line_2,
            [
                {'amount_residual': -600.0,     'amount_residual_currency': -1200.0,    'reconciled': False},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.assertRecordValues(res['partials'], [{
            'amount': 300.0,
            'amount_currency': 900.0,
            'debit_move_id': debit_line_2.id,
            'credit_move_id': credit_line.id,
            'currency_id': self.currency_data['currency'].id,
            'full_reconcile_id': False,
        }])

        res = (debit_line_3 + credit_line).reconcile2()

        self.assertRecordValues(
            credit_line + debit_line_3,
            [
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.assertRecordValues(res['partials'], [{
            'amount': 600.0,
            'amount_currency': 1200.0,
            'debit_move_id': debit_line_3.id,
            'credit_move_id': credit_line.id,
            'currency_id': self.currency_data['currency'].id,
        }])

        self.assertRecordValues(res['full_reconcile'], [{
            'exchange_move_id': False,
            'partial_reconcile_ids': credit_line.matched_debit_ids.ids,
            'reconciled_line_ids': (debit_line_1 + debit_line_2 + debit_line_3 + credit_line).ids,
        }])

    def test_reconcile_mixed_no_and_foreign_currency_debit(self):
        ''' Test a flow reconciling multiple times a line having a debit amount.
        The reconciliations are done by mixing lines without foreign currency with
        ones having a foreign currency.
        '''

        debit_line = self._get_line(self.move_foreign_currency_1, 3)
        credit_line_1 = self._get_line(self.move_single_currency_1, 4)
        credit_line_2 = self._get_line(self.move_single_currency_1, 5)
        credit_line_3 = self._get_line(self.move_single_currency_1, 6)

        res = (debit_line + credit_line_1).reconcile2()

        self.assertRecordValues(
            debit_line + credit_line_1,
            [
                {'amount_residual': 900.0,      'amount_residual_currency': 2700.0,     'reconciled': False},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.assertRecordValues(res['partials'], [{
            'amount': 100.0,
            'amount_currency': 100.0,
            'debit_move_id': debit_line.id,
            'credit_move_id': credit_line_1.id,
            'currency_id': self.company_data['currency'].id,
            'full_reconcile_id': False,
        }])

        res = (debit_line + credit_line_2).reconcile2()

        self.assertRecordValues(
            debit_line + credit_line_2,
            [
                {'amount_residual': 600.0,      'amount_residual_currency': 1800.0,     'reconciled': False},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.assertRecordValues(res['partials'], [{
            'amount': 300.0,
            'amount_currency': 300.0,
            'debit_move_id': debit_line.id,
            'credit_move_id': credit_line_2.id,
            'currency_id': self.company_data['currency'].id,
            'full_reconcile_id': False,
        }])

        res = (debit_line + credit_line_3).reconcile2()

        self.assertRecordValues(
            debit_line + credit_line_3,
            [
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.assertRecordValues(res['partials'], [{
            'amount': 600.0,
            'amount_currency': 600.0,
            'debit_move_id': debit_line.id,
            'credit_move_id': credit_line_3.id,
            'currency_id': self.company_data['currency'].id,
        }])

        self.assertRecordValues(res['full_reconcile'], [{
            'exchange_move_id': False,
            'partial_reconcile_ids': debit_line.matched_credit_ids.ids,
            'reconciled_line_ids': (debit_line + credit_line_1 + credit_line_2 + credit_line_3).ids,
        }])

    def test_reconcile_mixed_no_and_foreign_currency_credit(self):
        ''' Test a flow reconciling multiple times a line having a credit amount.
        The reconciliations are done by mixing lines without foreign currency with
        ones having a foreign currency.
        '''

        credit_line = self._get_line(self.move_foreign_currency_1, 7)
        debit_line_1 = self._get_line(self.move_single_currency_1, 0)
        debit_line_2 = self._get_line(self.move_single_currency_1, 1)
        debit_line_3 = self._get_line(self.move_single_currency_1, 2)

        res = (debit_line_1 + credit_line).reconcile2()

        self.assertRecordValues(
            credit_line + debit_line_1,
            [
                {'amount_residual': -900.0,     'amount_residual_currency': -2700.0,    'reconciled': False},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.assertRecordValues(res['partials'], [{
            'amount': 100.0,
            'amount_currency': 100.0,
            'debit_move_id': debit_line_1.id,
            'credit_move_id': credit_line.id,
            'currency_id': self.company_data['currency'].id,
            'full_reconcile_id': False,
        }])

        res = (debit_line_2 + credit_line).reconcile2()

        self.assertRecordValues(
            credit_line + debit_line_2,
            [
                {'amount_residual': -600.0,     'amount_residual_currency': -1800.0,    'reconciled': False},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.assertRecordValues(res['partials'], [{
            'amount': 300.0,
            'amount_currency': 300.0,
            'debit_move_id': debit_line_2.id,
            'credit_move_id': credit_line.id,
            'currency_id': self.company_data['currency'].id,
            'full_reconcile_id': False,
        }])

        res = (debit_line_3 + credit_line).reconcile2()

        self.assertRecordValues(
            credit_line + debit_line_3,
            [
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.assertRecordValues(res['partials'], [{
            'amount': 600.0,
            'amount_currency': 600.0,
            'debit_move_id': debit_line_3.id,
            'credit_move_id': credit_line.id,
            'currency_id': self.company_data['currency'].id,
        }])

        self.assertRecordValues(res['full_reconcile'], [{
            'exchange_move_id': False,
            'partial_reconcile_ids': credit_line.matched_debit_ids.ids,
            'reconciled_line_ids': (debit_line_1 + debit_line_2 + debit_line_3 + credit_line).ids,
        }])

    def test_reconcile_exchange_difference_fix_amount_residual_currency_debit(self):
        ''' Test the reconciliation process on a journal entry leading to the creation
        of a full reconcile with an exchange difference.

        On move_foreign_currency_3, reconcile the lines 3, 5, 6 together because
        3000.0 = (300.0 * 2) + (600.0 * 4) = 600.0 + 2400.0.

        In that case, the residual amount in company's currency remains positive because
        1000.0 - 300.0 - 600.0 = 100.0 > 0.0
        Then, an exchange difference journal entry should be generated to fix this line.
        '''
        debit_line = self._get_line(self.move_foreign_currency_3, 3)
        credit_line_1 = self._get_line(self.move_foreign_currency_3, 5)
        credit_line_2 = self._get_line(self.move_foreign_currency_3, 6)

        res = (debit_line + credit_line_1).reconcile2()

        self.assertRecordValues(
            debit_line + credit_line_1,
            [
                # 1000.0 - 300.0 = 700.0        3000.0 - 600.0 = 2400.0
                {'amount_residual': 700.0,      'amount_residual_currency': 2400.0,     'reconciled': False},
                # -300.0 + 300.0 = 0.0          -600.0 + 600.0 = 0.0
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
            ]
        )

        self.assertRecordValues(res['partials'], [{
            'amount': 300.0,
            'amount_currency': 600.0,
            'debit_move_id': debit_line.id,
            'credit_move_id': credit_line_1.id,
            'currency_id': self.currency_data['currency'].id,
            'full_reconcile_id': False,
        }])

        res = (debit_line + credit_line_2).reconcile2()

        self.assertFullReconcile(res['full_reconcile'], debit_line + credit_line_1 + credit_line_2)

        exchange_diff_lines = res['full_reconcile'].exchange_move_id.line_ids\
            .filtered('reconciled')\
            .sorted('balance')
        self.assertRecordValues(res['partials'], [
            {
                'amount': 600.0,
                'amount_currency': 2400.0,
                'debit_move_id': debit_line.id,
                'credit_move_id': credit_line_2.id,
                'currency_id': self.currency_data['currency'].id,
            },

            # Partials generated by the exchange difference:
            {
                'amount': 100.0,
                'amount_currency': 0.0,
                'debit_move_id': debit_line.id,
                'credit_move_id': exchange_diff_lines[0].id,
                'currency_id': self.currency_data['currency'].id,
            },
        ])

    def test_reconcile_exchange_difference_fix_amount_residual_currency_credit(self):
        ''' Test the reconciliation process on a journal entry leading to the creation
        of a full reconcile with an exchange difference.

        On move_foreign_currency_3, reconcile the lines 3, 5, 6 together because
        3000.0 = (300.0 * 2) + (600.0 * 4) = 600.0 + 2400.0.

        In that case, the residual amount in company's currency remains positive because
        1000.0 - 300.0 - 600.0 = 100.0 > 0.0.
        Then, an exchange difference journal entry should be generated to fix this line.
        '''

        credit_line = self._get_line(self.move_foreign_currency_3, 7)
        debit_line_1 = self._get_line(self.move_foreign_currency_3, 1)
        debit_line_2 = self._get_line(self.move_foreign_currency_3, 2)

        res = (debit_line_1 + credit_line).reconcile2()

        self.assertRecordValues(
            debit_line_1 + credit_line,
            [
                # 300.0 - 300.0 = 0.0           600.0 - 600.0 = 0.0
                {'amount_residual': 0.0,        'amount_residual_currency': 0.0,        'reconciled': True},
                # -1000.0 + 300.0 = -700.0      -3000.0 + 600.0 = -2400.0
                {'amount_residual': -700.0,     'amount_residual_currency': -2400.0,    'reconciled': False},
            ]
        )

        self.assertRecordValues(res['partials'], [{
            'amount': 300.0,
            'amount_currency': 600.0,
            'debit_move_id': debit_line_1.id,
            'credit_move_id': credit_line.id,
            'currency_id': self.currency_data['currency'].id,
            'full_reconcile_id': False,
        }])

        res = (debit_line_2 + credit_line).reconcile2()

        self.assertFullReconcile(res['full_reconcile'], debit_line_1 + debit_line_2 + credit_line)

        exchange_diff_lines = res['full_reconcile'].exchange_move_id.line_ids\
            .filtered('reconciled')\
            .sorted('balance')
        self.assertRecordValues(res['partials'], [
            {
                'amount': 600.0,
                'amount_currency': 2400.0,
                'debit_move_id': debit_line_2.id,
                'credit_move_id': credit_line.id,
                'currency_id': self.currency_data['currency'].id,
            },

            # Partials generated by the exchange difference:
            {
                'amount': 100.0,
                'amount_currency': 0.0,
                'debit_move_id': exchange_diff_lines[0].id,
                'credit_move_id': credit_line.id,
                'currency_id': self.currency_data['currency'].id,
            },
        ])

    def test_reconcile_exchange_difference_fix_amount_residual_debit(self):
        ''' Test the reconciliation process on a journal entry leading to the creation
        of a full reconcile with an exchange difference.

        This test will reconcile some lines having different foreign currencies.
        The amount residual in foreign currency must be fixed by the exchange difference
        journal entry.
        '''

        debit_line = self._get_line(self.move_foreign_currency_1, 3)
        credit_line_1 = self._get_line(self.move_foreign_currency_2, 4)
        credit_line_2 = self._get_line(self.move_foreign_currency_2, 5)
        credit_line_3 = self._get_line(self.move_foreign_currency_2, 6)

        res = (debit_line + credit_line_1).reconcile2()

        self.assertRecordValues(
            debit_line + credit_line_1,
            [
                # 1000.0 - 100.0 = 900.0        3000.0 - (100.0 * 2) = 2800.0
                {'amount_residual': 900.0,      'amount_residual_currency': 2800.0,     'reconciled': False},
                # -100.0 + 100.0 = 0.0          -300.0 + (100.0 * 4) = 100.0
                {'amount_residual': 0.0,        'amount_residual_currency': 100.0,      'reconciled': False},
            ]
        )

        self.assertRecordValues(res['partials'], [{
            'amount': 100.0,
            'amount_currency': 100.0,
            'debit_move_id': debit_line.id,
            'credit_move_id': credit_line_1.id,
            'currency_id': self.company_data['currency'].id,
            'full_reconcile_id': False,
        }])

        res = (debit_line + credit_line_2).reconcile2()

        self.assertRecordValues(
            debit_line + credit_line_2,
            [
                # 900.0 - 300.0 = 600.0         2800.0 - (300.0 * 2) = 2200.0
                {'amount_residual': 600.0,      'amount_residual_currency': 2200.0,     'reconciled': False},
                # -300.0 + 300.0 = 0.0          -600.0 + (300.0 * 4) = 600.0
                {'amount_residual': 0.0,        'amount_residual_currency': 600.0,      'reconciled': False},
            ]
        )

        self.assertRecordValues(res['partials'], [{
            'amount': 300.0,
            'amount_currency': 300.0,
            'debit_move_id': debit_line.id,
            'credit_move_id': credit_line_2.id,
            'currency_id': self.company_data['currency'].id,
            'full_reconcile_id': False,
        }])

        res = (debit_line + credit_line_3).reconcile2()

        self.assertFullReconcile(res['full_reconcile'], debit_line + credit_line_1 + credit_line_2 + credit_line_3)

        exchange_diff_lines = res['full_reconcile'].exchange_move_id.line_ids\
            .filtered('reconciled')\
            .sorted('amount_currency')
        self.assertRecordValues(res['partials'], [
            {
                'amount': 600.0,
                'amount_currency': 600.0,
                'debit_move_id': debit_line.id,
                'credit_move_id': credit_line_3.id,
                'currency_id': self.company_data['currency'].id,
            },

            # Partials generated by the exchange difference:
            {
                'amount': 0.0,
                'amount_currency': 1000.0,
                'debit_move_id': debit_line.id,
                'credit_move_id': exchange_diff_lines[0].id,
                'currency_id': self.currency_data['currency'].id,
            },
            {
                'amount': 0.0,
                'amount_currency': 600.0,
                'debit_move_id': credit_line_3.id,
                'credit_move_id': exchange_diff_lines[1].id,
                'currency_id': self.currency_data_2['currency'].id,
            },
            {
                'amount': 0.0,
                'amount_currency': 100.0,
                'debit_move_id': credit_line_1.id,
                'credit_move_id': exchange_diff_lines[3].id,
                'currency_id': self.currency_data_2['currency'].id,
            },
            {
                'amount': 0.0,
                'amount_currency': 600.0,
                'debit_move_id': credit_line_2.id,
                'credit_move_id': exchange_diff_lines[2].id,
                'currency_id': self.currency_data_2['currency'].id,
            },
        ])

    def test_reconcile_exchange_difference_fix_amount_residual_credit(self):
        ''' Test the reconciliation process on a journal entry leading to the creation
        of a full reconcile with an exchange difference.

        This test will reconcile some lines having different foreign currencies.
        The amount residual in foreign currency must be fixed by the exchange difference
        journal entry.
        '''

        credit_line = self._get_line(self.move_foreign_currency_1, 7)
        debit_line_1 = self._get_line(self.move_foreign_currency_2, 0)
        debit_line_2 = self._get_line(self.move_foreign_currency_2, 1)
        debit_line_3 = self._get_line(self.move_foreign_currency_2, 2)

        res = (debit_line_1 + credit_line).reconcile2()

        self.assertRecordValues(
            credit_line + debit_line_1,
            [
                # -1000.0 + 100.0 = -900.0       -3000.0 + (100.0 * 2) = -2800.0
                {'amount_residual': -900.0,     'amount_residual_currency': -2800.0,    'reconciled': False},
                # 100.0 - 100.0 = 0.0           300.0 - (100.0 * 4) = -100.0
                {'amount_residual': 0.0,        'amount_residual_currency': -100.0,     'reconciled': False},
            ]
        )

        self.assertRecordValues(res['partials'], [{
            'amount': 100.0,
            'amount_currency': 100.0,
            'debit_move_id': debit_line_1.id,
            'credit_move_id': credit_line.id,
            'currency_id': self.company_data['currency'].id,
            'full_reconcile_id': False,
        }])

        res = (debit_line_2 + credit_line).reconcile2()

        self.assertRecordValues(
            credit_line + debit_line_2,
            [
                # -900.0 + 300.0 = -600.0       -2800.0 + (300.0 * 2) = -2200.0
                {'amount_residual': -600.0,     'amount_residual_currency': -2200.0,    'reconciled': False},
                # 300.0 - 300.0 = 0.0           600.0 - (300.0 * 4) = -600.0
                {'amount_residual': 0.0,        'amount_residual_currency': -600.0,     'reconciled': False},
            ]
        )

        self.assertRecordValues(res['partials'], [{
            'amount': 300.0,
            'amount_currency': 300.0,
            'debit_move_id': debit_line_2.id,
            'credit_move_id': credit_line.id,
            'currency_id': self.company_data['currency'].id,
            'full_reconcile_id': False,
        }])

        res = (debit_line_3 + credit_line).reconcile2()

        self.assertFullReconcile(res['full_reconcile'], debit_line_1 + debit_line_2 + debit_line_3 + credit_line)

        exchange_diff_lines = res['full_reconcile'].exchange_move_id.line_ids\
            .filtered('reconciled')\
            .sorted('amount_currency')
        self.assertRecordValues(res['partials'], [
            {
                'amount': 600.0,
                'amount_currency': 600.0,
                'debit_move_id': debit_line_3.id,
                'credit_move_id': credit_line.id,
                'currency_id': self.company_data['currency'].id,
            },

            # Partials generated by the exchange difference:
            {
                'amount': 0.0,
                'amount_currency': 600.0,
                'debit_move_id': exchange_diff_lines[1].id,
                'credit_move_id': debit_line_3.id,
                'currency_id': self.currency_data_2['currency'].id,
            },
            {
                'amount': 0.0,
                'amount_currency': 1000.0,
                'debit_move_id': exchange_diff_lines[3].id,
                'credit_move_id': credit_line.id,
                'currency_id': self.currency_data['currency'].id,
            },
            {
                'amount': 0.0,
                'amount_currency': 100.0,
                'debit_move_id': exchange_diff_lines[0].id,
                'credit_move_id': debit_line_1.id,
                'currency_id': self.currency_data_2['currency'].id,
            },
            {
                'amount': 0.0,
                'amount_currency': 600.0,
                'debit_move_id': exchange_diff_lines[2].id,
                'credit_move_id': debit_line_2.id,
                'currency_id': self.currency_data_2['currency'].id,
            },
        ])
