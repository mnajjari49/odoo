# -*- coding: utf-8 -*-
from odoo import models, fields, api
from odoo.tools.translate import _
from odoo.exceptions import UserError


class AccountDebitNote(models.TransientModel):
    """
    Add Debit Note wizard: when you want to correct an invoice with a tiny amount of something
    """
    _name = 'account.debit.note'
    _description = 'Add Debit Note wizard'

    move_ids = fields.Many2many('account.move', 'account_move_debit_move', 'debit_id', 'move_id',
                                domain=[('state', '=', 'posted')])
    date = fields.Date(string='Debit Note Date', default=fields.Date.context_today, required=True)
    reason = fields.Char(string='Reason')
    journal_id = fields.Many2one('account.journal', string='Use Specific Journal', help='If empty, uses the journal of the journal entry to be reversed.')
    copy_lines = fields.Boolean("Copy Lines", help="In case you need to do corrections for every line, it can be in handy to copy them")

    # computed fields
    residual = fields.Monetary(compute="_compute_from_moves")
    currency_id = fields.Many2one('res.currency', compute="_compute_from_moves")
    move_type = fields.Char(compute="_compute_from_moves")

    @api.model
    def default_get(self, fields):
        res = super(AccountDebitNote, self).default_get(fields)
        move_ids = self.env['account.move'].browse(self.env.context['active_ids']) if self.env.context.get('active_model') == 'account.move' else self.env['account.move']
        if any(move.state != "posted" for move in move_ids):
            raise UserError(_('You can only debit posted moves.'))
        res['move_ids'] = [(6, 0, move_ids.ids)]
        res['residual'] = len(move_ids) == 1 and move_ids.amount_residual or 0
        res['currency_id'] = len(move_ids.currency_id) == 1 and move_ids.currency_id.id or False
        res['move_type'] = len(move_ids) == 1 and move_ids.type or False
        return res

    @api.depends('move_ids')
    def _compute_from_moves(self):
        for record in self:
            move_ids = record.move_ids
            record.residual = len(move_ids) == 1 and move_ids.amount_residual or 0
            record.currency_id = len(move_ids.currency_id) == 1 and move_ids.currency_id or False
            record.move_type = move_ids.type if len(move_ids) == 1 else (any(move.type in ('in_invoice', 'out_invoice') for move in move_ids) and 'some_invoice' or False)

    def _prepare_default_values(self, move):
        return {
                'ref': '%s, %s' % (move.name, self.reason) if self.reason else move.name,
                'date': self.date or move.date,
                'invoice_date': move.is_invoice(include_receipts=True) and (self.date or move.date) or False,
                'journal_id': self.journal_id and self.journal_id.id or move.journal_id.id,
                'invoice_payment_term_id': None,
                'debit_origin_id': move.id,
            }

    def create_debit(self):
        self.ensure_one()
        new_moves = self.env['account.move']
        for move in self.move_ids:
            # Create default values.
            default_values = self._prepare_default_values(move)
            if not self.copy_lines:
                default_values['invoice_line_ids'] = []
            new_moves |= move.copy(default=default_values)

        # Create action.
        action = {
            'name': _('Debit Notes'),
            'type': 'ir.actions.act_window',
            'res_model': 'account.move',
            }
        if len(new_moves) == 1:
            action.update({
                'view_mode': 'form',
                'res_id': new_moves.id,
            })
        else:
            action.update({
                'view_mode': 'tree,form',
                'domain': [('id', 'in', new_moves.ids)],
            })
        return action
