# -*- coding: utf-8 -*-
from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.addons.account.tests.common import AccountTestCommon
from odoo.tests import tagged
from odoo.tests.common import Form
from odoo.exceptions import ValidationError, UserError
from odoo import fields


@tagged('post_install', '-at_install')
class TestBankStatement(AccountTestCommon):

    def setUp(self):
        super(TestBankStatement, self).setUp()
        self.bs_model = self.env['account.bank.statement']
        self.bsl_model = self.env['account.bank.statement.line']
        self.partner = self.env['res.partner'].create({'name': 'test'})
        self.journal = self.env['account.journal'].create({
            'name': 'BnkJournal',
            'type': 'bank'
        })
        self.journal2 = self.env['account.journal'].create({
            'name': 'BnkJournal2',
            'type': 'bank'
        })
        self.cashjournal = self.env['account.journal'].create({
            'name': 'CashJournal',
            'type': 'cash'
        })
        self.number = 1

    def create_bank_statement(self, date, line_amount, balance_end_real=False, journal=False):
        vals = {
            'name': 'BNK' + str(self.number),
            'date': date,
            'line_ids': [(0, 0, {
                'payment_ref': '_',
                'amount': line_amount,
            })],
            'journal_id': journal or self.journal.id
        }
        if balance_end_real:
            vals['balance_end_real'] = balance_end_real
        self.number += 1
        return self.bs_model.create(vals)

    def test_compute_balance_end_real_with_lines(self):
        bnk1 = self.create_bank_statement('2019-01-02', 100)
        self.assertEqual(bnk1.balance_start, 0)
        # Balance is automatically computed when creating statement with the lines
        self.assertEqual(bnk1.balance_end_real, 100)
        self.assertEqual(bnk1.balance_end, 100)

    def test_compute_balance_end_real_without_lines(self):
        vals = {
            'name': 'BNK' + str(self.number),
            'date': '2019-01-01',
            'journal_id': self.journal.id
        }
        bnk1 = self.bs_model.create(vals)
        self.assertEqual(bnk1.balance_start, 0)
        self.assertEqual(bnk1.balance_end_real, 0)
        self.assertEqual(bnk1.balance_end, 0)
        # Add a line
        self.bsl_model.create({
            'payment_ref': '_',
            'amount': 10,
            'statement_id': bnk1.id
        })
        self.assertEqual(bnk1.balance_start, 0)
        # balance_end_real should not have changed
        self.assertEqual(bnk1.balance_end_real, 0)
        # Compute balance should have been computed
        self.assertEqual(bnk1.balance_end, 10)

    def test_create_new_statement(self):
        # Create first statement on 1/1/2019
        bnk1 = self.create_bank_statement('2019-01-02', 100)
        self.assertEqual(bnk1.balance_start, 0)
        # Balance is automatically computed when creating statement with the lines
        self.assertEqual(bnk1.balance_end_real, 100)
        self.assertEqual(bnk1.balance_end, 100)
        self.assertEqual(bnk1.previous_statement_id.id, False)

        # Create a new statement after that one
        bnk2 = self.create_bank_statement('2019-01-10', 50)
        self.assertEqual(bnk2.balance_start, 100)
        self.assertEqual(bnk2.balance_end_real, 150)
        self.assertEqual(bnk2.balance_end, 150)
        self.assertEqual(bnk2.previous_statement_id.id, bnk1.id)

        # Create new statement with given ending balance
        bnk3 = self.create_bank_statement('2019-01-15', 25, 200)
        self.assertEqual(bnk3.balance_end_real, 200)
        self.assertEqual(bnk3.balance_start, 150)
        self.assertEqual(bnk3.balance_end, 175)
        self.assertEqual(bnk3.previous_statement_id.id, bnk2.id)

        bnk4 = self.create_bank_statement('2019-01-03', 100)
        self.assertEqual(bnk4.balance_start, 100)
        self.assertEqual(bnk4.balance_end_real, 200)
        self.assertEqual(bnk4.balance_end, 200)
        self.assertEqual(bnk4.previous_statement_id.id, bnk1.id)
        # Bnk2 should have changed its previous statement
        self.assertEqual(bnk2.previous_statement_id.id, bnk4.id)
        # The starting balance and balance_end_real should have been recomputed
        self.assertEqual(bnk2.balance_start, 200)
        self.assertEqual(bnk2.balance_end_real, 250)
        self.assertEqual(bnk2.balance_end, 250)
        # The starting balance and balance_end_real of next entries should also have been recomputed
        # and since we are propagating an update, the balance_end_real should have been recomputed to
        # the correct value
        self.assertEqual(bnk3.balance_start, 250)
        self.assertEqual(bnk3.balance_end_real, 275)
        self.assertEqual(bnk3.balance_end, 275)

        # Change date of bank stmt4 to be the last
        bnk4.date = '2019-01-20'
        self.assertEqual(bnk1.previous_statement_id.id, False)
        self.assertEqual(bnk2.previous_statement_id.id, bnk1.id)
        self.assertEqual(bnk3.previous_statement_id.id, bnk2.id)
        self.assertEqual(bnk4.previous_statement_id.id, bnk3.id)
        self.assertEqual(bnk1.balance_start, 0)
        self.assertEqual(bnk2.balance_start, 100)
        self.assertEqual(bnk3.balance_start, 150)
        self.assertEqual(bnk4.balance_start, 175)
        self.assertEqual(bnk1.balance_end_real, 100)
        self.assertEqual(bnk2.balance_end_real, 150)
        self.assertEqual(bnk3.balance_end_real, 175)
        self.assertEqual(bnk4.balance_end_real, 275)

        # Move bnk3 to first position
        bnk3.date = '2019-01-01'
        self.assertEqual(bnk3.previous_statement_id.id, False)
        self.assertEqual(bnk1.previous_statement_id.id, bnk3.id)
        self.assertEqual(bnk2.previous_statement_id.id, bnk1.id)
        self.assertEqual(bnk4.previous_statement_id.id, bnk2.id)
        self.assertEqual(bnk3.balance_start, 0)
        self.assertEqual(bnk1.balance_start, 25)
        self.assertEqual(bnk2.balance_start, 125)
        self.assertEqual(bnk4.balance_start, 175)
        self.assertEqual(bnk3.balance_end_real, 25)
        self.assertEqual(bnk1.balance_end_real, 125)
        self.assertEqual(bnk2.balance_end_real, 175)
        self.assertEqual(bnk4.balance_end_real, 275)

        # Change bnk1 and bnk2
        bnk1.date = '2019-01-11'
        self.assertEqual(bnk3.previous_statement_id.id, False)
        self.assertEqual(bnk2.previous_statement_id.id, bnk3.id)
        self.assertEqual(bnk1.previous_statement_id.id, bnk2.id)
        self.assertEqual(bnk4.previous_statement_id.id, bnk1.id)
        self.assertEqual(bnk3.balance_start, 0)
        self.assertEqual(bnk2.balance_start, 25)
        self.assertEqual(bnk1.balance_start, 75)
        self.assertEqual(bnk4.balance_start, 175)
        self.assertEqual(bnk3.balance_end_real, 25)
        self.assertEqual(bnk2.balance_end_real, 75)
        self.assertEqual(bnk1.balance_end_real, 175)
        self.assertEqual(bnk4.balance_end_real, 275)

    def test_create_statements_in_different_journal(self):
        # Bank statement create in two different journal should not link with each other
        bnk1 = self.create_bank_statement('2019-01-01', 100, 100)
        bnk2 = self.create_bank_statement('2019-01-10', 50)

        bnk1other = self.create_bank_statement('2019-01-02', 20, 20, self.journal2.id)
        bnk2other = self.create_bank_statement('2019-01-12', 10, False, self.journal2.id)

        self.assertEqual(bnk1.previous_statement_id.id, False)
        self.assertEqual(bnk2.previous_statement_id.id, bnk1.id)
        self.assertEqual(bnk1.balance_start, 0)
        self.assertEqual(bnk2.balance_start, 100)
        self.assertEqual(bnk2.balance_end_real, 150)

        self.assertEqual(bnk1other.previous_statement_id.id, False)
        self.assertEqual(bnk2other.previous_statement_id.id, bnk1other.id)
        self.assertEqual(bnk1other.balance_start, 0)
        self.assertEqual(bnk2other.balance_start, 20)
        self.assertEqual(bnk2other.balance_end_real, 30)

    def test_statement_cash_journal(self):
        # Entry in cash journal should not recompute the balance_end_real
        cash1 = self.create_bank_statement('2019-01-01', 100, 100, self.cashjournal.id)
        cash2 = self.create_bank_statement('2019-01-03', 100, False, self.cashjournal.id)
        self.assertEqual(cash1.balance_start, 0)
        self.assertEqual(cash1.balance_end_real, 100)
        self.assertEqual(cash2.balance_start, 100)
        self.assertEqual(cash2.balance_end_real, 0)
        cash2.balance_end_real = 1000
        self.assertEqual(cash2.balance_end_real, 1000)
        # add cash entry in between, should recompute starting balance of cash2 entry but not ending balance
        cash3 = self.create_bank_statement('2019-01-02', 100, 200, self.cashjournal.id)
        self.assertEqual(cash3.balance_start, 100)
        self.assertEqual(cash3.balance_end_real, 200)
        self.assertEqual(cash2.balance_start, 200)
        self.assertEqual(cash2.balance_end_real, 1000)

    def test_unlink_bank_statement(self):
        bnk1 = self.create_bank_statement('2019-01-02', 100)
        bnk2 = self.create_bank_statement('2019-01-10', 50)
        bnk3 = self.create_bank_statement('2019-01-15', 25)
        bnk4 = self.create_bank_statement('2019-01-21', 100)
        bnk5 = self.create_bank_statement('2019-01-22', 100)
        self.assertEqual(bnk1.previous_statement_id.id, False)
        self.assertEqual(bnk2.previous_statement_id.id, bnk1.id)
        self.assertEqual(bnk3.previous_statement_id.id, bnk2.id)
        self.assertEqual(bnk4.previous_statement_id.id, bnk3.id)
        self.assertEqual(bnk5.previous_statement_id.id, bnk4.id)
        self.assertEqual(bnk3.balance_start, 150)
        self.assertEqual(bnk3.balance_end_real, 175)
        self.assertEqual(bnk4.balance_start, 175)
        self.assertEqual(bnk4.balance_end_real, 275)
        self.assertEqual(bnk5.balance_start, 275)
        self.assertEqual(bnk5.balance_end_real, 375)

        # Delete bnk2 and check that previous_statement_id and balance are correct
        bnk2.unlink()
        self.assertEqual(bnk1.previous_statement_id.id, False)
        self.assertEqual(bnk3.previous_statement_id.id, bnk1.id)
        self.assertEqual(bnk4.previous_statement_id.id, bnk3.id)
        self.assertEqual(bnk5.previous_statement_id.id, bnk4.id)
        self.assertEqual(bnk3.balance_start, 100)
        self.assertEqual(bnk3.balance_end_real, 125)
        self.assertEqual(bnk4.balance_start, 125)
        self.assertEqual(bnk4.balance_end_real, 225)
        self.assertEqual(bnk5.balance_start, 225)
        self.assertEqual(bnk5.balance_end_real, 325)

        # Delete bnk1 bnk3 and bnk4 at the same time and check that balance are correct
        (bnk1 + bnk3 + bnk4).unlink()
        self.assertEqual(bnk5.previous_statement_id.id, False)
        self.assertEqual(bnk5.balance_start, 0)
        self.assertEqual(bnk5.balance_end_real, 100)


@tagged('post_install', '-at_install')
class TestAccountBankStatement(AccountTestInvoicingCommon):

    @classmethod
    def setUpClass(cls):
        super(TestAccountBankStatement, cls).setUpClass()

        # We need a third currency as you could have a company's currency != journal's currency !=
        cls.currency_data_2 = cls.setup_multi_currency_data(default_values={
            'name': 'Dark Chocolate Coin',
            'symbol': '🍫',
            'currency_unit_label': 'Dark Choco',
            'currency_subunit_label': 'Dark Cacao Powder',
        }, rate2016=6.0, rate2017=4.0)
        cls.currency_data_3 = cls.setup_multi_currency_data(default_values={
            'name': 'Black Chocolate Coin',
            'symbol': '🍫',
            'currency_unit_label': 'Black Choco',
            'currency_subunit_label': 'Black Cacao Powder',
        }, rate2016=12.0, rate2017=8.0)

        cls.bank_journal_1 = cls.company_data['default_journal_bank']
        cls.bank_journal_2 = cls.bank_journal_1.copy()
        cls.bank_journal_3 = cls.bank_journal_2.copy()
        cls.bank_journal_2.default_debit_account_id = cls.bank_journal_1.default_debit_account_id.copy()
        cls.bank_journal_2.default_credit_account_id = cls.bank_journal_1.default_credit_account_id.copy()
        cls.bank_journal_3.default_debit_account_id = cls.bank_journal_2.default_debit_account_id.copy()
        cls.bank_journal_3.default_credit_account_id = cls.bank_journal_2.default_credit_account_id.copy()
        cls.currency_1 = cls.company_data['currency']
        cls.currency_2 = cls.currency_data['currency']
        cls.currency_3 = cls.currency_data_2['currency']
        cls.currency_4 = cls.currency_data_3['currency']

        cls.statement = cls.env['account.bank.statement'].create({
            'name': 'test_statement',
            'date': '2019-01-01',
            'journal_id': cls.bank_journal_1.id,
            'line_ids': [
                (0, 0, {
                    'date': '2019-01-01',
                    'payment_ref': 'line_1',
                    'partner_id': cls.partner_a.id,
                    'foreign_currency_id': cls.currency_2.id,
                    'amount': 1250.0,
                    'amount_currency': 2500.0,
                }),
            ],
        })
        cls.statement_line = cls.statement.line_ids

        cls.expected_st_line = {
            'date': fields.Date.from_string('2019-01-01'),
            'journal_id': cls.statement.journal_id.id,
            'payment_ref': 'line_1',
            'partner_id': cls.partner_a.id,
            'currency_id': cls.currency_1.id,
            'foreign_currency_id': cls.currency_2.id,
            'amount': 1250.0,
            'amount_currency': 2500.0,
            'move_state': 'not_reconciled',
        }

        cls.expected_bank_line = {
            'name': cls.statement_line.payment_ref,
            'partner_id': cls.statement_line.partner_id.id,
            'currency_id': cls.currency_2.id,
            'account_id': cls.statement.journal_id.default_debit_account_id.id,
            'debit': 1250.0,
            'credit': 0.0,
            'amount_currency': 2500.0,
        }

        cls.expected_counterpart_line = {
            'name': cls.statement_line.payment_ref,
            'partner_id': cls.statement_line.partner_id.id,
            'currency_id': cls.currency_2.id,
            'account_id': cls.statement.journal_id.suspense_account_id.id,
            'debit': 0.0,
            'credit': 1250.0,
            'amount_currency': -2500.0,
        }

    def assertBankStatementLine(self, statement_line, expected_statement_line_vals, expected_move_line_vals):
        self.assertRecordValues(statement_line, [expected_statement_line_vals])
        self.assertRecordValues(statement_line.line_ids.sorted('balance'), expected_move_line_vals)

    # -------------------------------------------------------------------------
    # TESTS about the statement line model.
    # -------------------------------------------------------------------------

    def _test_statement_line_edition(
            self,
            journal,
            amount, amount_currency,
            journal_currency, foreign_currency,
            expected_liquidity_values, expected_counterpart_values):
        ''' Test the edition of a statement line from itself or from its linked journal entry.
        :param journal:                     The account.journal record that will be set on the statement line.
        :param amount:                      The amount in journal's currency.
        :param amount_currency:             The amount in the foreign currency.
        :param journal_currency:            The journal's currency as a res.currency record.
        :param foreign_currency:            The foreign currency as a res.currency record.
        :param expected_liquidity_values:   The expected account.move.line values for the liquidity line.
        :param expected_counterpart_values: The expected account.move.line values for the counterpart line.
        '''
        if journal_currency:
            journal.currency_id = journal_currency.id

        statement = self.env['account.bank.statement'].create({
            'name': 'test_statement',
            'date': '2019-01-01',
            'journal_id': journal.id,
            'line_ids': [
                (0, 0, {
                    'date': '2019-01-01',
                    'payment_ref': 'line_1',
                    'partner_id': self.partner_a.id,
                    'foreign_currency_id': foreign_currency and foreign_currency.id,
                    'amount': amount,
                    'amount_currency': amount_currency,
                }),
            ],
        })
        statement_line = statement.line_ids

        # ==== Test the statement line amounts are correct ====
        # If there is a bug in the compute/inverse methods, the amount/amount_currency could be
        # incorrect directly after the creation of the statement line.

        self.assertRecordValues(statement_line, [{
            'amount': amount,
            'amount_currency': amount_currency,
        }])

        # ==== Test the edition of statement line amounts ====
        # The statement line must remain consistent with its account.move.
        # To test the compute/inverse methods are correctly managing all currency setup,
        # we check the edition of amounts in both directions statement line <-> journal entry.

        # Check initial state of the statement line.
        liquidity_lines, transfer_lines, other_lines = statement_line._seek_for_lines()
        self.assertRecordValues(liquidity_lines, [expected_liquidity_values])
        self.assertRecordValues(transfer_lines, [expected_counterpart_values])

        # Check the account.move is still correct after editing the account.bank.statement.line.
        statement_line.write({
            'amount': statement_line.amount * 2,
            'amount_currency': statement_line.amount_currency * 2,
        })
        self.assertRecordValues(statement_line, [{
            'amount': amount * 2,
            'amount_currency': amount_currency * 2,
        }])
        self.assertRecordValues(liquidity_lines, [{
            **expected_liquidity_values,
            'debit': expected_liquidity_values.get('debit', 0.0) * 2,
            'credit': expected_liquidity_values.get('credit', 0.0) * 2,
            'amount_currency': expected_liquidity_values.get('amount_currency', 0.0) * 2,
        }])
        self.assertRecordValues(transfer_lines, [{
            'debit': expected_counterpart_values.get('debit', 0.0) * 2,
            'credit': expected_counterpart_values.get('credit', 0.0) * 2,
            'amount_currency': expected_counterpart_values.get('amount_currency', 0.0) * 2,
        }])

        # Check the account.bank.statement.line is still correct after editing the account.move.
        statement_line.move_id.write({'line_ids': [
            (1, liquidity_lines.id, {
                'debit': expected_liquidity_values.get('debit', 0.0),
                'credit': expected_liquidity_values.get('credit', 0.0),
                'amount_currency': expected_liquidity_values.get('amount_currency', 0.0),
            }),
            (1, transfer_lines.id, {
                'debit': expected_counterpart_values.get('debit', 0.0),
                'credit': expected_counterpart_values.get('credit', 0.0),
                'amount_currency': expected_counterpart_values.get('amount_currency', 0.0),
            }),
        ]})
        self.assertRecordValues(statement_line, [{
            'amount': amount,
            'amount_currency': amount_currency,
        }])

    def _test_edition_customer_and_supplier_flows(
            self,
            amount, amount_currency,
            journal_currency, foreign_currency,
            expected_liquidity_values, expected_counterpart_values):
        ''' Test '_test_statement_line_edition' using the customer (positive amounts)
        & the supplier flow (negative amounts).
        :param amount:                      The amount in journal's currency.
        :param amount_currency:             The amount in the foreign currency.
        :param journal_currency:            The journal's currency as a res.currency record.
        :param foreign_currency:            The foreign currency as a res.currency record.
        :param expected_liquidity_values:   The expected account.move.line values for the liquidity line.
        :param expected_counterpart_values: The expected account.move.line values for the counterpart line.
        '''

        # Check the full process with positive amount (customer process).
        self._test_statement_line_edition(
            self.bank_journal_2,
            amount, amount_currency,
            journal_currency, foreign_currency,
            expected_liquidity_values,
            expected_counterpart_values,
        )

        # Check the full process with negative amount (supplier process).
        self._test_statement_line_edition(
            self.bank_journal_3,
            -amount, -amount_currency,
            journal_currency, foreign_currency,
            {
                **expected_liquidity_values,
                'debit': expected_liquidity_values.get('credit', 0.0),
                'credit': expected_liquidity_values.get('debit', 0.0),
                'amount_currency': -expected_liquidity_values.get('amount_currency', 0.0),
            },
            {
                **expected_counterpart_values,
                'debit': expected_counterpart_values.get('credit', 0.0),
                'credit': expected_counterpart_values.get('debit', 0.0),
                'amount_currency': -expected_counterpart_values.get('amount_currency', 0.0),
            },
        )

    def test_edition_journal_curr_2_statement_curr_3(self):
        self._test_edition_customer_and_supplier_flows(
            80.0,               120.0,
            self.currency_2,    self.currency_3,
            {'debit': 40.0,     'credit': 0.0,      'amount_currency': 80.0,        'currency_id': self.currency_2.id},
            {'debit': 0.0,      'credit': 40.0,     'amount_currency': -120.0,      'currency_id': self.currency_3.id},
        )

    def test_edition_journal_curr_2_statement_curr_1(self):
        self._test_edition_customer_and_supplier_flows(
            120.0,              80.0,
            self.currency_2,    self.currency_1,
            {'debit': 80.0,     'credit': 0.0,      'amount_currency': 120.0,       'currency_id': self.currency_2.id},
            {'debit': 0.0,      'credit': 80.0,     'amount_currency': 0.0,         'currency_id': False},
        )

    def test_edition_journal_curr_1_statement_curr_2(self):
        self._test_edition_customer_and_supplier_flows(
            80.0,               120.0,
            self.currency_1,    self.currency_2,
            {'debit': 80.0,     'credit': 0.0,      'amount_currency': 120.0,       'currency_id': self.currency_2.id},
            {'debit': 0.0,      'credit': 80.0,     'amount_currency': -120.0,      'currency_id': self.currency_2.id},
        )

    def test_edition_journal_curr_2_statement_false(self):
        self._test_edition_customer_and_supplier_flows(
            80.0,               0.0,
            self.currency_2,    False,
            {'debit': 40.0,     'credit': 0.0,      'amount_currency': 80.0,        'currency_id': self.currency_2.id},
            {'debit': 0.0,      'credit': 40.0,     'amount_currency': -80.0,       'currency_id': self.currency_2.id},
        )

    def test_edition_journal_curr_1_statement_false(self):
        self._test_edition_customer_and_supplier_flows(
            80.0,               0.0,
            self.currency_1,    False,
            {'debit': 80.0,     'credit': 0.0,      'amount_currency': 0.0,         'currency_id': False},
            {'debit': 0.0,      'credit': 80.0,     'amount_currency': 0.0,         'currency_id': False},
        )

    def test_constraints(self):
        def assertStatementLineConstraint(statement_vals, statement_line_vals):
            with self.assertRaises(ValidationError), self.cr.savepoint():
                self.env['account.bank.statement'].create({
                    **statement_vals,
                    'line_ids': [(0, 0, statement_line_vals)],
                })

        statement_vals = {
            'name': 'test_statement',
            'date': '2019-01-01',
            'journal_id': self.bank_journal_2.id,
        }
        statement_line_vals = {
            'date': '2019-01-01',
            'payment_ref': 'line_1',
            'partner_id': self.partner_a.id,
            'foreign_currency_id': False,
            'amount': 10.0,
            'amount_currency': 0.0,
        }

        # Amount can't be 0.0 on a statement line.
        assertStatementLineConstraint(statement_vals, {
            **statement_line_vals,
            'amount': 0.0,
        })

        # Foreign currency must not be the same as the journal one.
        assertStatementLineConstraint(statement_vals, {
            **statement_line_vals,
            'foreign_currency_id': self.currency_1.id,
        })

        # Can't have amount_currency = 0.0 with a specified foreign currency.
        assertStatementLineConstraint(statement_vals, {
            **statement_line_vals,
            'foreign_currency_id': self.currency_2.id,
            'amount_currency': 0.0,
        })

        # Can't have a stand alone amount in foreign currency without foreign currency set.
        assertStatementLineConstraint(statement_vals, {
            **statement_line_vals,
            'amount_currency': 10.0,
        })

    def test_statement_line_move_onchange_1(self):
        ''' Test the consistency between the account.bank.statement.line and the generated account.move.lines
        using the form view emulator.
        '''

        # Check the initial state of the statement line.
        self.assertBankStatementLine(self.statement_line, self.expected_st_line, [self.expected_counterpart_line, self.expected_bank_line])

        # Inverse the amount + change them.
        with Form(self.statement) as statement_form:
            with statement_form.line_ids.edit(0) as st_line_form:
                st_line_form.amount = -2000.0
                st_line_form.amount_currency = -4000.0
                st_line_form.foreign_currency_id = self.currency_3

        self.assertBankStatementLine(self.statement_line, {
            **self.expected_st_line,
            'amount': -2000.0,
            'amount_currency': -4000.0,
            'foreign_currency_id': self.currency_3.id,
        }, [
            {
                **self.expected_bank_line,
                'debit': 0.0,
                'credit': 2000.0,
                'amount_currency': -4000.0,
                'currency_id': self.currency_3.id,
            },
            {
                **self.expected_counterpart_line,
                'debit': 2000.0,
                'credit': 0.0,
                'amount_currency': 4000.0,
                'currency_id': self.currency_3.id,
            },
        ])

        # Check changing the label and the partner.
        with Form(self.statement) as statement_form:
            with statement_form.line_ids.edit(0) as st_line_form:
                st_line_form.payment_ref = 'line_1 (bis)'
                st_line_form.partner_id = self.partner_b

        self.assertBankStatementLine(self.statement_line, {
            **self.expected_st_line,
            'payment_ref': self.statement_line.payment_ref,
            'partner_id': self.statement_line.partner_id.id,
            'amount': -2000.0,
            'amount_currency': -4000.0,
            'foreign_currency_id': self.currency_3.id,
        }, [
            {
                **self.expected_bank_line,
                'name': self.statement_line.payment_ref,
                'partner_id': self.statement_line.partner_id.id,
                'debit': 0.0,
                'credit': 2000.0,
                'amount_currency': -4000.0,
                'currency_id': self.currency_3.id,
            },
            {
                **self.expected_counterpart_line,
                'name': self.statement_line.payment_ref,
                'partner_id': self.statement_line.partner_id.id,
                'debit': 2000.0,
                'credit': 0.0,
                'amount_currency': 4000.0,
                'currency_id': self.currency_3.id,
            },
        ])

    # -------------------------------------------------------------------------
    # TESTS about reconciliation:
    # - Test '_prepare_counterpart_move_line_vals': one test for each case.
    # - Test 'reconcile': 3 cases:
    #       - Open-balance in debit.
    #       - Open-balance in credit.
    #       - No open-balance.
    # - Test 'button_undo_reconciliation'.
    # -------------------------------------------------------------------------

    def _test_statement_line_reconciliation(
            self,
            journal,
            amount, amount_currency, counterpart_amount,
            journal_currency, foreign_currency, counterpart_currency,
            expected_liquidity_values, expected_counterpart_values):
        ''' Test the reconciliation of a statement line.
        :param journal:                     The account.journal record that will be set on the statement line.
        :param amount:                      The amount in journal's currency.
        :param amount_currency:             The amount in the foreign currency.
        :param counterpart_amount:          The amount of the invoice to reconcile.
        :param journal_currency:            The journal's currency as a res.currency record.
        :param foreign_currency:            The foreign currency as a res.currency record.
        :param counterpart_currency:        The invoice currency as a res.currency record.
        :param expected_liquidity_values:   The expected account.move.line values for the liquidity line.
        :param expected_counterpart_values: The expected account.move.line values for the counterpart line.
        '''
        if journal_currency:
            journal.currency_id = journal_currency.id

        statement = self.env['account.bank.statement'].create({
            'name': 'test_statement',
            'date': '2019-01-01',
            'journal_id': journal.id,
            'line_ids': [
                (0, 0, {
                    'date': '2019-01-01',
                    'payment_ref': 'line_1',
                    'partner_id': self.partner_a.id,
                    'foreign_currency_id': foreign_currency and foreign_currency.id,
                    'amount': amount,
                    'amount_currency': amount_currency,
                }),
            ],
        })
        statement_line = statement.line_ids

        # - There is 3 flows to check:
        #   * The invoice will fully reconcile the statement line.
        #   * The invoice will partially reconcile the statement line and leads to an open balance in debit.
        #   * The invoice will partially reconcile the statement line and leads to an open balance in credit.
        # - The dates are different to be sure the reconciliation will preserve the conversion rate bank side.
        move_type = 'out_invoice' if counterpart_amount < 0.0 else 'in_invoice'

        test_invoices = self.env['account.move'].create([
            {
                'type': move_type,
                'invoice_date': fields.Date.from_string('2016-01-01'),
                'date': fields.Date.from_string('2016-01-01'),
                'partner_id': self.partner_a.id,
                'currency_id': counterpart_currency.id,
                'invoice_line_ids': [
                    (0, None, {
                        'name': 'counterpart line, same amount',
                        'account_id': self.company_data['default_account_revenue'].id,
                        'quantity': 1,
                        'price_unit': abs(counterpart_amount),
                    }),
                ],
            },
            {
                'type': move_type,
                'invoice_date': fields.Date.from_string('2016-01-01'),
                'date': fields.Date.from_string('2016-01-01'),
                'partner_id': self.partner_a.id,
                'currency_id': counterpart_currency.id,
                'invoice_line_ids': [
                    (0, None, {
                        'name': 'counterpart line, lower amount',
                        'account_id': self.company_data['default_account_revenue'].id,
                        'quantity': 1,
                        'price_unit': abs(counterpart_amount / 2),
                    }),
                ],
            },
            {
                'type': move_type,
                'invoice_date': fields.Date.from_string('2016-01-01'),
                'date': fields.Date.from_string('2016-01-01'),
                'partner_id': self.partner_a.id,
                'currency_id': counterpart_currency.id,
                'invoice_line_ids': [
                    (0, None, {
                        'name': 'counterpart line, bigger amount',
                        'account_id': self.company_data['default_account_revenue'].id,
                        'quantity': 1,
                        'price_unit': abs(counterpart_amount * 2),
                    }),
                ],
            },
        ])
        test_invoices.post()
        statement.button_post()
        counterpart_lines = test_invoices.mapped('line_ids').filtered(lambda line: line.account_internal_type in ('receivable', 'payable'))

        # Check the full reconciliation.
        statement_line.reconcile([{'id': counterpart_lines[0].id}])
        liquidity_lines, transfer_lines, other_lines = statement_line._seek_for_lines()
        self.assertRecordValues(liquidity_lines, [expected_liquidity_values])
        self.assertRecordValues(other_lines, [expected_counterpart_values])

        # Check the reconciliation with partial lower amount.
        statement_line.button_undo_reconciliation()
        statement_line.reconcile([{'id': counterpart_lines[1].id}])
        liquidity_lines, transfer_lines, other_lines = statement_line._seek_for_lines()
        self.assertRecordValues(liquidity_lines, [expected_liquidity_values])
        self.assertRecordValues(other_lines, [
            {
                **expected_counterpart_values,
                'debit': expected_counterpart_values.get('debit', 0.0) / 2,
                'credit': expected_counterpart_values.get('credit', 0.0) / 2,
                'amount_currency': expected_counterpart_values.get('amount_currency', 0.0) / 2,
            },
            {
                'debit': expected_counterpart_values.get('debit', 0.0) / 2,
                'credit': expected_counterpart_values.get('credit', 0.0) / 2,
                'amount_currency': expected_counterpart_values.get('amount_currency', 0.0) / 2,
                'currency_id': expected_counterpart_values.get('currency_id'),
            },
        ])

        # Check the reconciliation with partial higher amount.
        statement_line.button_undo_reconciliation()
        statement_line.reconcile([{'id': counterpart_lines[2].id}])
        liquidity_lines, transfer_lines, other_lines = statement_line._seek_for_lines()
        self.assertRecordValues(liquidity_lines, [expected_liquidity_values])
        self.assertRecordValues(other_lines, [
            {
                **expected_counterpart_values,
                'debit': expected_counterpart_values.get('debit', 0.0) * 2,
                'credit': expected_counterpart_values.get('credit', 0.0) * 2,
                'amount_currency': expected_counterpart_values.get('amount_currency', 0.0) * 2,
            },
            {
                'debit': expected_counterpart_values.get('credit', 0.0),
                'credit': expected_counterpart_values.get('debit', 0.0),
                'amount_currency': -expected_counterpart_values.get('amount_currency', 0.0),
                'currency_id': expected_counterpart_values.get('currency_id'),
            },
        ])

        # Make sure the statement line is still correct.
        self.assertRecordValues(statement_line, [{
            'amount': amount,
            'amount_currency': amount_currency,
        }])

    def _test_reconciliation_customer_and_supplier_flows(
            self,
            amount, amount_currency, counterpart_amount,
            journal_currency, foreign_currency, counterpart_currency,
            expected_liquidity_values, expected_counterpart_values):
        ''' Test '_test_statement_line_reconciliation' using the customer (positive amounts)
        & the supplier flow (negative amounts).
        :param amount:                      The amount in journal's currency.
        :param amount_currency:             The amount in the foreign currency.
        :param counterpart_amount:          The amount of the invoice to reconcile.
        :param journal_currency:            The journal's currency as a res.currency record.
        :param foreign_currency:            The foreign currency as a res.currency record.
        :param counterpart_currency:        The invoice currency as a res.currency record.
        :param expected_liquidity_values:   The expected account.move.line values for the liquidity line.
        :param expected_counterpart_values: The expected account.move.line values for the counterpart line.
        '''

        # Check the full process with positive amount (customer process).
        self._test_statement_line_reconciliation(
            self.bank_journal_2,
            amount, amount_currency, counterpart_amount,
            journal_currency, foreign_currency, counterpart_currency,
            expected_liquidity_values,
            expected_counterpart_values,
        )

        # Check the full process with negative amount (supplier process).
        self._test_statement_line_reconciliation(
            self.bank_journal_3,
            -amount, -amount_currency, -counterpart_amount,
            journal_currency, foreign_currency, counterpart_currency,
            {
                **expected_liquidity_values,
                'debit': expected_liquidity_values.get('credit', 0.0),
                'credit': expected_liquidity_values.get('debit', 0.0),
                'amount_currency': -expected_liquidity_values.get('amount_currency', 0.0),
            },
            {
                **expected_counterpart_values,
                'debit': expected_counterpart_values.get('credit', 0.0),
                'credit': expected_counterpart_values.get('debit', 0.0),
                'amount_currency': -expected_counterpart_values.get('amount_currency', 0.0),
            },
        )

    def test_reconciliation_journal_curr_2_statement_curr_3_counterpart_curr_3(self):
        self._test_reconciliation_customer_and_supplier_flows(
            80.0,               120.0,              -120.0,
            self.currency_2,    self.currency_3,    self.currency_3,
            {'debit': 40.0,     'credit': 0.0,      'amount_currency': 80.0,        'currency_id': self.currency_2.id},
            {'debit': 0.0,      'credit': 40.0,     'amount_currency': -120.0,      'currency_id': self.currency_3.id},
        )

    def test_reconciliation_journal_curr_2_statement_curr_1_counterpart_curr_2(self):
        self._test_reconciliation_customer_and_supplier_flows(
            120.0,              80.0,               -120.0,
            self.currency_2,    self.currency_1,    self.currency_2,
            {'debit': 80.0,     'credit': 0.0,      'amount_currency': 120.0,       'currency_id': self.currency_2.id},
            {'debit': 0.0,      'credit': 80.0,     'amount_currency': 0.0,         'currency_id': False},
        )

    def test_reconciliation_journal_curr_2_statement_curr_3_counterpart_curr_2(self):
        self._test_reconciliation_customer_and_supplier_flows(
            80.0,               120.0,              -80.0,
            self.currency_2,    self.currency_3,    self.currency_2,
            {'debit': 40.0,     'credit': 0.0,      'amount_currency': 80.0,        'currency_id': self.currency_2.id},
            {'debit': 0.0,      'credit': 40.0,     'amount_currency': -120.0,      'currency_id': self.currency_3.id},
        )

    def test_reconciliation_journal_curr_2_statement_curr_3_counterpart_curr_4(self):
        self._test_reconciliation_customer_and_supplier_flows(
            80.0,               120.0,              -480.0,
            self.currency_2,    self.currency_3,    self.currency_4,
            {'debit': 40.0,     'credit': 0.0,      'amount_currency': 80.0,        'currency_id': self.currency_2.id},
            {'debit': 0.0,      'credit': 40.0,     'amount_currency': -120.0,      'currency_id': self.currency_3.id},
        )

    def test_reconciliation_journal_curr_1_statement_curr_2_counterpart_curr_2(self):
        self._test_reconciliation_customer_and_supplier_flows(
            80.0,               120.0,              -120.0,
            self.currency_1,    self.currency_2,    self.currency_2,
            {'debit': 80.0,     'credit': 0.0,      'amount_currency': 120.0,       'currency_id': self.currency_2.id},
            {'debit': 0.0,      'credit': 80.0,     'amount_currency': -120.0,      'currency_id': self.currency_2.id},
        )

    def test_reconciliation_journal_curr_1_statement_curr_2_counterpart_curr_3(self):
        self._test_reconciliation_customer_and_supplier_flows(
            80.0,               120.0,              -480.0,
            self.currency_1,    self.currency_2,    self.currency_3,
            {'debit': 80.0,     'credit': 0.0,      'amount_currency': 120.0,       'currency_id': self.currency_2.id},
            {'debit': 0.0,      'credit': 80.0,     'amount_currency': -120.0,      'currency_id': self.currency_2.id},
        )

    def test_reconciliation_journal_curr_2_statement_false_counterpart_curr_2(self):
        self._test_reconciliation_customer_and_supplier_flows(
            80.0,               0.0,                -80.0,
            self.currency_2,    False,              self.currency_2,
            {'debit': 40.0,     'credit': 0.0,      'amount_currency': 80.0,        'currency_id': self.currency_2.id},
            {'debit': 0.0,      'credit': 40.0,     'amount_currency': -80.0,       'currency_id': self.currency_2.id},
        )

    def test_reconciliation_journal_curr_2_statement_false_counterpart_curr_3(self):
        self._test_reconciliation_customer_and_supplier_flows(
            80.0,               0.0,                -240.0,
            self.currency_2,    False,              self.currency_3,
            {'debit': 40.0,     'credit': 0.0,      'amount_currency': 80.0,        'currency_id': self.currency_2.id},
            {'debit': 0.0,      'credit': 40.0,     'amount_currency': -80.0,       'currency_id': self.currency_2.id},
        )

    def test_reconciliation_journal_curr_1_statement_false_counterpart_curr_3(self):
        self._test_reconciliation_customer_and_supplier_flows(
            80.0,               0.0,                -480.0,
            self.currency_1,    False,              self.currency_3,
            {'debit': 80.0,     'credit': 0.0,      'amount_currency': 0.0,         'currency_id': False},
            {'debit': 0.0,      'credit': 80.0,     'amount_currency': 0.0,         'currency_id': False},
        )

    def test_reconciliation_journal_curr_2_statement_curr_1_counterpart_curr_1(self):
        self._test_reconciliation_customer_and_supplier_flows(
            120.0,              80.0,               -80.0,
            self.currency_2,    self.currency_1,    self.currency_1,
            {'debit': 80.0,     'credit': 0.0,      'amount_currency': 120.0,       'currency_id': self.currency_2.id},
            {'debit': 0.0,      'credit': 80.0,     'amount_currency': 0.0,         'currency_id': False},
        )

    def test_reconciliation_journal_curr_2_statement_curr_3_counterpart_curr_1(self):
        self._test_reconciliation_customer_and_supplier_flows(
            80.0,               120.0,              -40.0,
            self.currency_2,    self.currency_3,    self.currency_1,
            {'debit': 40.0,     'credit': 0.0,      'amount_currency': 80.0,        'currency_id': self.currency_2.id},
            {'debit': 0.0,      'credit': 40.0,     'amount_currency': -120.0,      'currency_id': self.currency_3.id},
        )

    def test_reconciliation_journal_curr_1_statement_curr_2_counterpart_curr_1(self):
        self._test_reconciliation_customer_and_supplier_flows(
            80.0,               120.0,              -80.0,
            self.currency_1,    self.currency_2,    self.currency_1,
            {'debit': 80.0,     'credit': 0.0,      'amount_currency': 120.0,       'currency_id': self.currency_2.id},
            {'debit': 0.0,      'credit': 80.0,     'amount_currency': -120.0,      'currency_id': self.currency_2.id},
        )

    def test_reconciliation_journal_curr_2_statement_false_counterpart_curr_1(self):
        self._test_reconciliation_customer_and_supplier_flows(
            80.0,               0.0,                -40.0,
            self.currency_2,    False,              self.currency_1,
            {'debit': 40.0,     'credit': 0.0,      'amount_currency': 80.0,        'currency_id': self.currency_2.id},
            {'debit': 0.0,      'credit': 40.0,     'amount_currency': -80.0,       'currency_id': self.currency_2.id},
        )

    def test_reconciliation_journal_curr_1_statement_false_counterpart_curr_1(self):
        self._test_reconciliation_customer_and_supplier_flows(
            80.0,               0.0,                -80.0,
            self.currency_1,    False,              self.currency_1,
            {'debit': 80.0,     'credit': 0.0,      'amount_currency': 0.0,         'currency_id': False},
            {'debit': 0.0,      'credit': 80.0,     'amount_currency': 0.0,         'currency_id': False},
        )

    def test_reconciliation_statement_line_state(self):
        ''' Test the reconciliation on the bank statement line with a foreign currency on the journal:
        - Ensure the statement line move_state field is well computed.
        - Ensure the reconciliation is working well when dealing with a foreign currency at different dates.
        - Ensure the reconciliation can be undo.
        - Ensure the reconciliation is still possible with to_check.
        '''
        self.statement.button_post()

        receivable_acc_1 = self.company_data['default_account_receivable']
        receivable_acc_2 = self.company_data['default_account_receivable'].copy()
        payment_transfer_acc = self.bank_journal_1.payment_transfer_account_id
        random_acc_1 = self.company_data['default_account_revenue']
        random_acc_2 = self.company_data['default_account_revenue'].copy()
        test_move = self.env['account.move'].create({
            'type': 'entry',
            'date': fields.Date.from_string('2016-01-01'),
            'line_ids': [
                (0, None, {
                    'name': 'counterpart of the whole move',
                    'account_id': random_acc_1.id,
                    'debit': 0.0,
                    'credit': 1030.0,
                }),
                (0, None, {
                    'name': 'test line 1 - receivable account',
                    'account_id': receivable_acc_1.id,
                    'currency_id': self.currency_2.id,
                    'debit': 500.0,
                    'credit': 0.0,
                    'amount_currency': 1500.0,
                }),
                (0, None, {
                    'name': 'test line 2 - another receivable account',
                    'account_id': receivable_acc_2.id,
                    'currency_id': self.currency_2.id,
                    'debit': 500.0,
                    'credit': 0.0,
                    'amount_currency': 1500.0,
                }),
                (0, None, {
                    'name': 'test line 3 - payment transfer account',
                    'account_id': payment_transfer_acc.id,
                    'currency_id': self.currency_2.id,
                    'debit': 30.0,
                    'credit': 0.0,
                    'amount_currency': 90.0,
                }),
            ]
        })
        test_move.post()

        test_line_1 = test_move.line_ids.filtered(lambda line: line.account_id == receivable_acc_1)
        test_line_2 = test_move.line_ids.filtered(lambda line: line.account_id == receivable_acc_2)
        test_line_3 = test_move.line_ids.filtered(lambda line: line.account_id == payment_transfer_acc)
        self.statement_line.reconcile([
            # test line 1
            # Will reconcile 300.0 in balance, 600.0 in amount_currency.
            {'id': test_line_1.id, 'balance': -600.0},
            # test line 2
            # Will reconcile 250.0 in balance, 500.0 in amount_currency.
            {'id': test_line_2.id, 'balance': -500.0},
            # test line 3
            # Will reconcile 30.0 in balance, 90.0 in amount_currency.
            {'id': test_line_3.id},
            # test line 4
            # Will reconcile 50.0 in balance, 100.0 in amount_currency.
            {'name': 'whatever', 'account_id': random_acc_1.id, 'balance': -100.0},
        ])

        self.assertBankStatementLine(self.statement_line, {
                **self.expected_st_line,
                'move_state': 'reconciled',
            }, [
            {
                'name': '%s: Open Balance' % self.statement_line.payment_ref,
                'partner_id': self.statement_line.partner_id.id,
                'currency_id': self.currency_2.id,
                'account_id': receivable_acc_1.id,  # This account is retrieved on the partner.
                'debit': 0.0,
                'credit': 555.0,
                'amount_currency': -1110.0,
                'amount_residual': -555.0,
                'amount_residual_currency': -1110.0,
            },
            {
                'name': test_line_1.name,
                'partner_id': self.statement_line.partner_id.id,
                'currency_id': self.currency_2.id,
                'account_id': test_line_1.account_id.id,
                'debit': 0.0,
                'credit': 300.0,
                'amount_currency': -600.0,
                'amount_residual': 0.0,
                'amount_residual_currency': 0.0,
            },
            {
                'name': test_line_2.name,
                'partner_id': self.statement_line.partner_id.id,
                'currency_id': self.currency_2.id,
                'account_id': test_line_2.account_id.id,
                'debit': 0.0,
                'credit': 250.0,
                'amount_currency': -500.0,
                'amount_residual': 0.0,
                'amount_residual_currency': 0.0,
            },
            {
                'name': 'whatever',
                'partner_id': self.statement_line.partner_id.id,
                'currency_id': self.currency_2.id,
                'account_id': random_acc_1.id,
                'debit': 0.0,
                'credit': 100.0,
                'amount_currency': -200.0,
                'amount_residual': 0.0,
                'amount_residual_currency': 0.0,
            },
            {
                'name': test_line_3.name,
                'partner_id': self.statement_line.partner_id.id,
                'currency_id': self.currency_2.id,
                'account_id': test_line_3.account_id.id,
                'debit': 0.0,
                'credit': 45.0,
                'amount_currency': -90.0,
                'amount_residual': 0.0,
                'amount_residual_currency': 0.0,
            },
            {
                **self.expected_bank_line,
                'amount_residual': 1250.0,
                'amount_residual_currency': 2500.0,
            },
        ])

        # Undo the reconciliation to return to the initial state.
        self.statement_line.button_undo_reconciliation()
        self.assertBankStatementLine(self.statement_line, self.expected_st_line, [self.expected_counterpart_line, self.expected_bank_line])

        # Modify the counterpart line with to_check enabled.
        self.statement_line.reconcile([
            {'name': 'whatever', 'account_id': random_acc_1.id, 'balance': -100.0},
        ], to_check=True)

        self.assertBankStatementLine(self.statement_line, {
                **self.expected_st_line,
                'move_state': 'reconciled',
            }, [
            {
                'name': '%s: Open Balance' % self.statement_line.payment_ref,
                'partner_id': self.statement_line.partner_id.id,
                'currency_id': self.currency_2.id,
                'account_id': receivable_acc_1.id,  # This account is retrieved on the partner.
                'debit': 0.0,
                'credit': 1150.0,
                'amount_currency': -2300.0,
                'amount_residual': -1150.0,
                'amount_residual_currency': -2300.0,
            },
            {
                'name': 'whatever',
                'partner_id': self.statement_line.partner_id.id,
                'currency_id': self.currency_2.id,
                'account_id': random_acc_1.id,
                'debit': 0.0,
                'credit': 100.0,
                'amount_currency': -200.0,
                'amount_residual': 0.0,
                'amount_residual_currency': 0.0,
            },
            {
                **self.expected_bank_line,
                'amount_residual': 1250.0,
                'amount_residual_currency': 2500.0,
            },
        ])

        # Modify the counterpart line. Should be allowed by the to_check enabled.
        self.statement_line.reconcile([
            {'name': 'whatever again', 'account_id': random_acc_2.id, 'balance': -500.0},
        ])

        self.assertBankStatementLine(self.statement_line, {
                **self.expected_st_line,
                'move_state': 'reconciled',
            }, [
            {
                'name': '%s: Open Balance' % self.statement_line.payment_ref,
                'partner_id': self.statement_line.partner_id.id,
                'currency_id': self.currency_2.id,
                'account_id': receivable_acc_1.id,  # This account is retrieved on the partner.
                'debit': 0.0,
                'credit': 750.0,
                'amount_currency': -1500.0,
                'amount_residual': -750.0,
                'amount_residual_currency': -1500.0,
            },
            {
                'name': 'whatever again',
                'partner_id': self.statement_line.partner_id.id,
                'currency_id': self.currency_2.id,
                'account_id': random_acc_2.id,
                'debit': 0.0,
                'credit': 500.0,
                'amount_currency': -1000.0,
                'amount_residual': 0.0,
                'amount_residual_currency': 0.0,
            },
            {
                **self.expected_bank_line,
                'amount_residual': 1250.0,
                'amount_residual_currency': 2500.0,
            },
        ])

        # The statement line is no longer in the 'to_check' mode.
        # Reconciling again should raise an error.
        with self.assertRaises(UserError), self.cr.savepoint():
            self.statement_line.reconcile([
                {'name': 'whatever', 'account_id': random_acc_1.id, 'balance': -100.0},
            ])

    def test_reconciliation_payment_state(self):
        ''' Test the 'in_payment' state on invoices & 'reconciled' state in payments:
        - The invoice could be reconciled with account.payments.
        - The invoice could be reconciled directly with an account.bank.statement.line.
        - The invoice could be reconciled with both.
        '''
        # Two invoices, both having 3000.0 in foreign currency to reconcile.
        test_invoice_1 = self.env['account.move'].create({
            'type': 'out_invoice',
            'invoice_date': fields.Date.from_string('2019-01-01'),
            'partner_id': self.partner_a.id,
            'currency_id': self.currency_2.id,
            'invoice_line_ids': [(0, 0, {
                'quantity': 1,
                'price_unit': 3000.0,
                'account_id': self.company_data['default_account_revenue'].id,
            })]
        })
        test_invoice_2 = test_invoice_1.copy()

        # Two payments, both having 2000.0 in foreign currency to reconcile.
        test_payment_1 = self.env['account.payment'].create({
            'payment_type': 'inbound',
            'partner_type': 'customer',
            'amount': 2000.0,
            'payment_date': fields.Date.from_string('2019-01-01'),
            'currency_id': self.currency_2.id,
            'partner_id': self.partner_a.id,
            'journal_id': self.statement_line.journal_id.id,
            'payment_method_id': self.env.ref('account.account_payment_method_manual_in').id,
        })
        test_payment_2 = test_payment_1.copy()

        # Two statement lines having respectively 2000.0 & 4000.0 in foreign currency to reconcile.
        self.statement.write({
            'balance_end_real': 7250.0,
            'line_ids': [
                (0, 0, {
                    'date': '2019-01-01',
                    'payment_ref': 'line_2',
                    'partner_id': self.partner_a.id,
                    'amount': 2000.0,
                }),
                (0, 0, {
                    'date': '2019-01-01',
                    'payment_ref': 'line_3',
                    'partner_id': self.partner_a.id,
                    'amount': 4000.0,
                }),
            ],
        })
        test_st_line_1 = self.statement.line_ids.filtered(lambda line: line.payment_ref == 'line_2')
        test_st_line_2 = self.statement.line_ids.filtered(lambda line: line.payment_ref == 'line_3')

        # Post everything.
        (test_invoice_1 + test_invoice_2).post()
        (test_payment_1 + test_payment_2).post()
        self.statement.button_post()

        # Initial setup: nothing is reconciled.
        self.assertRecordValues(test_invoice_1 + test_invoice_2, [
            {
                'payment_state': 'not_paid',
                'amount_total': 3000.0,
                'amount_residual': 3000.0,
            },
            {
                'payment_state': 'not_paid',
                'amount_total': 3000.0,
                'amount_residual': 3000.0,
            },
        ])
        self.assertRecordValues(test_payment_1 + test_payment_2, [
            {
                'state': 'posted',
                'amount': 2000.0,
            },
            {
                'state': 'posted',
                'amount': 2000.0,
            },
        ])

        # ===== Reconcile entries together =====

        # Reconciliation between test_invoice_1 & test_payment_1.
        # The payment state shouldn't change.
        (test_invoice_1.line_ids + test_payment_1.move_line_ids)\
            .filtered(lambda line: line.account_id.user_type_id.type == 'receivable')\
            .reconcile()

        self.assertRecordValues(test_invoice_1, [
            {
                'payment_state': 'partial',
                'amount_total': 3000.0,
                'amount_residual': 1000.0,
            },
        ])

        # Reconciliation between test_invoice_1 & test_payment_2.
        # test_invoice_1 must be paid but in the 'in_payment' state.
        (test_invoice_1.line_ids + test_payment_2.move_line_ids)\
            .filtered(lambda line: line.account_id.user_type_id.type == 'receivable')\
            .reconcile()

        self.assertRecordValues(test_invoice_1, [
            {
                'payment_state': 'in_payment',
                'amount_total': 3000.0,
                'amount_residual': 0.0,
            },
        ])

        # Reconciliation between test_st_line_1 & test_payment_1.
        # test_invoice_1 should remain in 'in_payment' state since test_payment_2 is not yet reconciled with a statement
        # line.
        # However, test_payment_1 should now be in 'reconciled' state.
        counterpart_line = test_payment_1.move_line_ids.filtered(lambda line: line.account_id.user_type_id.type != 'receivable')
        test_st_line_1.reconcile([{'id': counterpart_line.id}])

        self.assertRecordValues(test_st_line_1, [{'move_state': 'reconciled'}])
        self.assertRecordValues(test_invoice_1, [
            {
                'payment_state': 'in_payment',
                'amount_total': 3000.0,
                'amount_residual': 0.0,
            },
        ])
        self.assertRecordValues(test_payment_1, [{'state': 'reconciled'}])

        # Reconciliation between test_st_line_2 & test_payment_2.
        # An open balance of 2000.0 will be created.
        # test_invoice_1 should get the 'paid' state.
        # test_payment_2 should be now in 'reconciled' state.
        counterpart_line = test_payment_2.move_line_ids.filtered(lambda line: line.account_id.user_type_id.type != 'receivable')
        test_st_line_2.reconcile([{'id': counterpart_line.id}])

        self.assertRecordValues(test_st_line_2, [{'move_state': 'reconciled'}])
        self.assertRecordValues(test_invoice_1, [
            {
                'payment_state': 'paid',
                'amount_total': 3000.0,
                'amount_residual': 0.0,
            },
        ])
        self.assertRecordValues(test_payment_2, [{'state': 'reconciled'}])

        # Reconciliation between test_invoice_2 & test_payment_2.
        # The payment state shouldn't change since test_payment_2 is already partially reconciled.
        (test_invoice_2.line_ids + test_payment_2.move_line_ids)\
            .filtered(lambda line: line.account_id.user_type_id.type == 'receivable')\
            .reconcile()

        self.assertRecordValues(test_invoice_2, [
            {
                'payment_state': 'partial',
                'amount_total': 3000.0,
                'amount_residual': 2000.0,
            },
        ])

        # Reconciliation of the test_st_line_2's open balance with the test_invoice_2's remaining balance.
        # test_invoice_2 should get the 'paid' state.
        (test_invoice_2.line_ids + test_st_line_2.line_ids)\
            .filtered(lambda line: line.account_id.user_type_id.type == 'receivable')\
            .reconcile()

        self.assertRecordValues(test_invoice_2, [
            {
                'payment_state': 'paid',
                'amount_total': 3000.0,
                'amount_residual': 0.0,
            },
        ])

        # ===== Undo the reconciliation =====

        (test_st_line_1 + test_st_line_2).button_undo_reconciliation()

        self.assertRecordValues(test_st_line_1, [{'move_state': 'not_reconciled'}])
        self.assertRecordValues(test_st_line_2, [{'move_state': 'not_reconciled'}])
        self.assertRecordValues(test_invoice_1, [{'payment_state': 'in_payment'}])
        self.assertRecordValues(test_invoice_2, [{'payment_state': 'partial'}])
        self.assertRecordValues(test_payment_1, [{'state': 'posted'}])
        self.assertRecordValues(test_payment_2, [{'state': 'posted'}])
