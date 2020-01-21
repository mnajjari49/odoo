# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo.exceptions import UserError
from odoo.tools.date_utils import get_month, get_fiscal_year
from odoo.tools.misc import format_date

import re
from collections import defaultdict
import json


class ReSequenceWizard(models.TransientModel):
    _name = 'account.resequence.wizard'
    _description = 'Remake the sequence of Journal Entries.'

    journal_id = fields.Many2one('account.journal', readonly=True, required=True)
    sequence_number_reset = fields.Char(compute='_compute_sequence_number_reset')
    first_date = fields.Date(help="Date (inclusive) from which the numbers are resequenced.")
    end_date = fields.Date(help="Date (inclusive) to which the numbers are resequenced. If not set, all Journal Entries up to the end of the period are resequenced.")
    first_name = fields.Char(compute="_compute_first_name", readonly=False, store=True, required=True, string="First New Sequence")
    ordering = fields.Selection([('keep', 'Keep current order'), ('date', 'Reorder by accounting date')], required=True, default='keep')
    move_ids = fields.Many2many('account.move', compute="_compute_move_ids", store=True)
    new_values = fields.Text(compute='_compute_new_values')
    preview_moves = fields.Text(compute='_compute_preview_moves')
    has_active_ids = fields.Boolean()

    @api.model
    def default_get(self, fields_list):
        values = super(ReSequenceWizard, self).default_get(fields_list)
        if 'active_ids' in self.env.context and self.env.context['active_model'] == 'account.move' and self.env.context['active_ids']:
            values['has_active_ids'] = True
            active_move_ids = self.env['account.move'].browse(self.env.context['active_ids'])
            if len(active_move_ids.journal_id) != 1:
                raise UserError(_('You can only resequence items from the same journal'))
            values['journal_id'] = active_move_ids.journal_id.id
            values['move_ids'] = [(6, 0, active_move_ids.ids)]
        return values

    @api.depends('first_name')
    def _compute_sequence_number_reset(self):
        for record in self:
            record.sequence_number_reset = self.env['account.move']._deduce_sequence_number_reset(record.first_name)

    @api.depends('move_ids')
    def _compute_first_name(self):
        self.first_name = ""
        for record in self:
            if record.move_ids:
                record.first_name = min(record.move_ids._origin.mapped('name'))

    @api.depends('journal_id', 'first_date', 'end_date', 'has_active_ids')
    def _compute_move_ids(self):
        for record in self.filtered(lambda r: not r.has_active_ids):
            domain = [('journal_id', '=', record.journal_id.id)]
            domain += [('date', '>=', record.first_date)]
            domain += [('posted_before', '=', 'True')]
            if record.end_date:
                domain += [('date', '<=', record.end_date)]
            record.move_ids = self.env['account.move'].search(domain)

    @api.depends('new_values', 'ordering')
    def _compute_preview_moves(self):
        """Reduce the computed new_values to a smaller set to display in the preview."""
        for record in self:
            new_values = sorted(json.loads(record.new_values).values(), key=lambda x: x['server-date'], reverse=True)
            changeLines = []
            in_elipsis = 0
            previous_line = None
            for i, line in enumerate(new_values):
                if i < 3 or i == len(new_values) - 1 or line['new_by_name'] != line['new_by_date'] \
                 or (self.sequence_number_reset == 'year' and line['server-date'][0:4] != previous_line['server-date'][0:4])\
                 or (self.sequence_number_reset == 'month' and line['server-date'][0:7] != previous_line['server-date'][0:7]):
                    if in_elipsis:
                        changeLines.append({'current_name': '... (%s other)' % str(in_elipsis), 'new_by_name': '...', 'new_by_date': '...', 'date': '...'})
                        in_elipsis = 0
                    changeLines.append(line)
                else:
                    in_elipsis += 1
                previous_line = line

            record.preview_moves = json.dumps({
                'ordering': record.ordering,
                'changeLines': changeLines,
            })

    def _get_move_key(self, move_id):
        if self.sequence_number_reset == 'year':
            return move_id.date.year
        elif self.sequence_number_reset == 'month':
            return (move_id.date.year, move_id.date.month)
        return 'default'

    @api.depends('first_name', 'move_ids', 'sequence_number_reset')
    def _compute_new_values(self):
        """Compute the proposed new values.

        Sets a json string on new_values representing a dictionary thats maps account.move
        ids to a disctionay containing the name if we execute the action, and information
        relative to the preview widget.
        """
        def _get_move_key(move_id):
            if self.sequence_number_reset == 'year':
                return move_id.date.year
            elif self.sequence_number_reset == 'month':
                return (move_id.date.year, move_id.date.month)
            return 'default'

        self.new_values = "{}"
        for record in self.filtered('first_name'):
            sorted = defaultdict(lambda: record.env['account.move'])
            for move in record.move_ids._origin:
                sorted[_get_move_key(move)] += move

            try:
                if record.sequence_number_reset == 'year':
                    sequence = re.match(self.env['account.move']._sequence_yearly_regex, record.first_name)
                    format = '{prefix1}%(year)04d{prefix2}%(seq)0{len}d'.format(
                        prefix1=sequence.group('prefix1'),
                        prefix2=sequence.group('prefix2'),
                        len=len(sequence.group('seq')),
                    )
                elif record.sequence_number_reset == 'month':
                    sequence = re.match(self.env['account.move']._sequence_monthly_regex, record.first_name)
                    format = '{prefix1}%(year)04d{prefix2}%(month)02d{prefix3}%(seq)0{len}d'.format(
                        prefix1=sequence.group('prefix1'),
                        prefix2=sequence.group('prefix2'),
                        prefix3=sequence.group('prefix3'),
                        len=len(sequence.group('seq')),
                    )
                else:
                    sequence = re.match(self.env['account.move']._sequence_fixed_regex, record.first_name)
                    format = '{prefix}%(seq)0{len}d'.format(
                        prefix=sequence.group('prefix'),
                        len=len(sequence.group('seq')),
                    )
            except AttributeError:
                continue

            new_values = {}
            for j, grouped_list in enumerate(sorted.values()):
                for move in grouped_list:
                    new_values[move.id] = {
                        'current_name': move.name,
                        'state': move.state,
                        'date': format_date(self.env, move.date),
                        'server-date': str(move.date),
                    }

                new_name_list = [format % {
                    'year': grouped_list[0].date.year,
                    'month': grouped_list[0].date.month,
                    'seq': i + (int(sequence.group('seq') or '1') if j == (len(sorted)-1) else 1),
                } for i in range(len(grouped_list))]

                for move, new_name in zip(grouped_list.sorted(lambda m: m.name), new_name_list):
                    new_values[move.id]['new_by_name'] = new_name
                for move, new_name in zip(grouped_list.sorted(lambda m: (m.date, m.name)), new_name_list):
                    new_values[move.id]['new_by_date'] = new_name

            record.new_values = json.dumps(new_values)

    def resequence(self):
        new_values = json.loads(self.new_values)
        self.move_ids.state = 'draft'
        for move_id in self.move_ids:
            if str(move_id.id) in new_values:
                if self.ordering == 'keep':
                    move_id.name = new_values[str(move_id.id)]['new_by_name']
                else:
                    move_id.name = new_values[str(move_id.id)]['new_by_date']
                move_id.state = new_values[str(move_id.id)]['state']
