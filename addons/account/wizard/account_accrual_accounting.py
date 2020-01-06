# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo.exceptions import UserError
from odoo.tools.misc import formatLang, format_date

import json
import itertools
from copy import deepcopy
from collections import defaultdict

class AccrualAccountingWizard(models.TransientModel):
    _name = 'account.accrual.accounting.wizard'
    _description = 'Create accrual entry.'

    date = fields.Date(required=True)
    company_id = fields.Many2one('res.company', required=True)
    account_type = fields.Selection([('income', 'Revenue'), ('expense', 'Expense')])
    active_move_line_ids = fields.Many2many('account.move.line')
    journal_id = fields.Many2one('account.journal', required=True, readonly=False,
        domain="[('company_id', '=', company_id), ('type', '=', 'general')]",
        related="company_id.accrual_default_journal_id")
    expense_accrual_account = fields.Many2one('account.account', readonly=False,
        domain="[('company_id', '=', company_id), ('internal_type', 'not in', ('receivable', 'payable')), ('internal_group', '=', 'liability'), ('reconcile', '=', True)]",
        related="company_id.expense_accrual_account_id")
    revenue_accrual_account = fields.Many2one('account.account', readonly=False,
        domain="[('company_id', '=', company_id), ('internal_type', 'not in', ('receivable', 'payable')), ('internal_group', '=', 'asset'), ('reconcile', '=', True)]",
        related="company_id.revenue_accrual_account_id")
    percentage = fields.Float("Percentage", default=100.0)
    total_amount = fields.Monetary(compute="_compute_total_amount", currency_field='company_currency_id')
    company_currency_id = fields.Many2one('res.currency', related='company_id.currency_id')
    data = fields.Text(compute="_compute_data")
    preview_data = fields.Text(compute="_compute_preview_data")

    @api.constrains('percentage')
    def _constraint_percentage(self):
        for record in self:
            if not (0.0 < record.percentage <= 100.0):
                raise UserError(_("Percentage must be between 0 and 100"))

    @api.depends('percentage', 'active_move_line_ids')
    def _compute_total_amount(self):
        for record in self:
            record.total_amount = sum(record.active_move_line_ids.mapped(lambda l: record.percentage * (l.debit + l.credit) / 100))

    @api.model
    def default_get(self, fields):
        if self.env.context.get('active_model') != 'account.move.line' or not self.env.context.get('active_ids'):
            raise UserError(_('This can only be used on journal items'))
        rec = super(AccrualAccountingWizard, self).default_get(fields)
        active_move_line_ids = self.env['account.move.line'].browse(self.env.context['active_ids'])
        rec['active_move_line_ids'] = active_move_line_ids.ids

        if any(move.state != 'posted' for move in active_move_line_ids.mapped('move_id')):
            raise UserError(_('You can only change the period for posted journal items.'))
        if any(move_line.reconciled for move_line in active_move_line_ids):
            raise UserError(_('You can only change the period for items that are not yet reconciled.'))
        if any(line.account_id.user_type_id != active_move_line_ids[0].account_id.user_type_id for line in active_move_line_ids):
            raise UserError(_('All accounts on the lines must be from the same type.'))
        if any(line.company_id != active_move_line_ids[0].company_id for line in active_move_line_ids):
            raise UserError(_('All lines must be from the same company.'))
        rec['company_id'] = active_move_line_ids[0].company_id.id
        account_types_allowed = self.env.ref('account.data_account_type_expenses') + self.env.ref('account.data_account_type_revenue') + self.env.ref('account.data_account_type_other_income')
        if active_move_line_ids[0].account_id.user_type_id not in account_types_allowed:
            raise UserError(_('You can only change the period for items in these types of accounts: ') + ", ".join(account_types_allowed.mapped('name')))
        rec['account_type'] = active_move_line_ids[0].account_id.user_type_id.internal_group
        return rec

    @api.depends('active_move_line_ids', 'journal_id', 'revenue_accrual_account', 'expense_accrual_account', 'percentage', 'date', 'account_type')
    def _compute_data(self):
        for record in self:
            # set the accrual account on the selected journal items
            accrual_account = record.revenue_accrual_account if record.account_type == 'income' else record.expense_accrual_account

            move_data = {}
            for move in record.active_move_line_ids.move_id:
                ref1 = _('Accrual Adjusting Entry (%s%% recognized) for invoice: %s') % (record.percentage, move.name)
                ref2 = _('Accrual Adjusting Entry (%s%% recognized) for invoice: %s') % (100 - record.percentage, move.name)
                move_data[move] = {
                    'move_vals': {
                        'new_date': {
                            'date': fields.Date.to_string(record.date),
                            'ref': ref1,
                            'journal_id': record.journal_id.id,
                            'line_ids': [],
                        },
                        'original_date': {
                            'date': fields.Date.to_string(move.date),
                            'ref': ref2,
                            'journal_id': record.journal_id.id,
                            'line_ids': [],
                        }
                    },
                    'log_messages': {
                        'new_date': (_('Accrual Adjusting Entry ({percent}% recognized) for invoice:') + ' <a href=# data-oe-model=account.move data-oe-id={id}>{name}</a>').format(
                            percent=record.percentage,
                            id=move.id,
                            name=move.name,
                        ),
                        'original_date': (_('Accrual Adjusting Entry ({percent}% recognized) for invoice:') + ' <a href=# data-oe-model=account.move data-oe-id={id}>{name}</a>').format(
                            percent=100 - record.percentage,
                            id=move.id,
                            name=move.name,
                        )
                    }
                }

            for aml in record.active_move_line_ids:
                reported_debit = aml.company_id.currency_id.round((record.percentage / 100) * aml.debit)
                reported_credit = aml.company_id.currency_id.round((record.percentage / 100) * aml.credit)
                if aml.currency_id:
                    reported_amount_currency = aml.currency_id.round((record.percentage / 100) * aml.amount_currency)
                else:
                    reported_amount_currency = 0.0

                move_data[aml.move_id]['move_vals']['new_date']['line_ids'] += [
                    (0, 0, {
                        'name': aml.name,
                        'debit': reported_debit,
                        'credit': reported_credit,
                        'amount_currency': reported_amount_currency,
                        'currency_id': aml.currency_id.id,
                        'account_id': aml.account_id.id,
                        'partner_id': aml.partner_id.id,
                    }),
                    (0, 0, {
                        'name': move_data[aml.move_id]['move_vals']['new_date']['ref'],
                        'debit': reported_credit,
                        'credit': reported_debit,
                        'amount_currency': -reported_amount_currency,
                        'currency_id': aml.currency_id.id,
                        'account_id': accrual_account.id,
                        'partner_id': aml.partner_id.id,
                    }),
                ]
                move_data[aml.move_id]['move_vals']['original_date']['line_ids'] += [
                    (0, 0, {
                        'name': aml.name,
                        'debit': aml.debit - reported_debit,
                        'credit': aml.credit - reported_credit,
                        'amount_currency': aml.amount_currency - reported_amount_currency,
                        'currency_id': aml.currency_id.id,
                        'account_id': aml.account_id.id,
                        'partner_id': aml.partner_id.id,
                    }),
                    (0, 0, {
                        'name': move_data[aml.move_id]['move_vals']['original_date']['ref'],
                        'debit': aml.credit - reported_credit,
                        'credit': aml.debit - reported_debit,
                        'amount_currency': reported_amount_currency - aml.amount_currency,
                        'currency_id': aml.currency_id.id,
                        'account_id': accrual_account.id,
                        'partner_id': aml.partner_id.id,
                    }),
                ]

            move_vals = [m for o in move_data.values() for m in o['move_vals'].values()]
            log_messages = [m for o in move_data.values() for m in o['log_messages'].values()]

            record.data = json.dumps({
                'move_vals': move_vals,
                'log_messages': log_messages,
            })

    @api.depends('data')
    def _compute_preview_data(self):
        for record in self:
            data = json.loads(record.data)
            move_vals, log_messages = (data['move_vals'], data['log_messages'])

            preview_vals = []
            for move in move_vals[:4]:
                preview_val = {
                    'group_name': "%s, %s" % (format_date(self.env, move['date']) or _('[Not set]'), move['ref']),
                    'items_vals': move['line_ids'],
                }
                for line in preview_val['items_vals']:
                    line[2]['account_id'] = self.env['account.account'].browse(line[2]['account_id']).display_name or _('[Not set]')
                    line[2]['debit'] = formatLang(self.env, line[2]['debit'], currency_obj=record.company_id.currency_id)
                    line[2]['credit'] = formatLang(self.env, line[2]['credit'], currency_obj=record.company_id.currency_id)
                preview_vals += [preview_val]

            preview_discarded = max(0, len(move_vals) - len(preview_vals))
            preview_columns = [
                {'field': 'account_id', 'label': _('Account')},
                {'field': 'name', 'label': _('Label')},
                {'field': 'debit', 'label': _('Debit'), 'class': 'text-right'},
                {'field': 'credit', 'label': _('Credit'), 'class': 'text-right'},
            ]

            record.preview_data = json.dumps({
                'preview_vals': preview_vals,
                'preview_options': {
                    'discarded_number': (_("%d moves") % preview_discarded) if preview_discarded else False,
                    'columns': preview_columns,
                },
            })

    def amend_entries(self):
        accrual_account = self.revenue_accrual_account if self.account_type == 'income' else self.expense_accrual_account
        data = json.loads(self.data)
        move_vals, log_messages = (data['move_vals'], data['log_messages'])

        # Update the account of selected journal items.
        self.active_move_line_ids.write({'account_id': accrual_account.id})

        created_moves = self.env['account.move'].create(move_vals)
        created_moves.post()

        # Reconcile.
        index = 0
        for move in self.active_move_line_ids.mapped('move_id'):
            if self.percentage < 100:
                accrual_moves = created_moves[index:index + 2]
                index += 2
            else:
                accrual_moves = created_moves[index:index + 1]
                index += 1

            to_reconcile = self.active_move_line_ids.filtered(lambda line: line.move_id == move)
            to_reconcile += accrual_moves.mapped('line_ids').filtered(lambda line: line.account_id == accrual_account and not line.reconciled)
            to_reconcile.reconcile()

        # Log messages.
        for created_move, log_message in zip(created_moves, log_messages):
            created_move.message_post(body=log_message)

        # open the generated entries
        action = {
            'name': _('Generated Entries'),
            'domain': [('id', 'in', created_moves.ids)],
            'res_model': 'account.move',
            'view_mode': 'tree,form',
            'type': 'ir.actions.act_window',
            'views': [(self.env.ref('account.view_move_tree').id, 'tree'), (False, 'form')],
        }
        if len(created_moves) == 1:
            action.update({'view_mode': 'form', 'res_id': created_moves.id})
        return action
