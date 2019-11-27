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
    first_date = fields.Date(help="Date (inclusive) from which the numbers are resequenced.")
    end_date = fields.Date(compute="_compute_end_date", readonly=False, store=True, help="Date (inclusive) to which the numbers are resequenced. If not set, all Journal Entries up to the end of the period are resequenced.")
    first_name = fields.Char(compute="_compute_first_name", readonly=False, store=True, string="First New Sequence")
    ordering = fields.Selection([('keep', 'Keep current order'), ('date', 'Reorder by accounting date')], required=True, default='keep')
    move_ids = fields.Many2many('account.move', compute="_compute_move_ids")
    new_values = fields.Text(compute='_compute_new_values')
    preview_moves = fields.Text(compute='_compute_preview_moves')

    @api.depends('journal_id', 'first_date')
    def _compute_end_date(self):
        for record in self:
            if record.first_date:
                if record.journal_id.sequence_number_reset == 'year':
                    record.end_date = get_fiscal_year(record.first_date)[1]
                elif record.journal_id.sequence_number_reset == 'month':
                    record.end_date = get_month(record.first_date)[1]
            if not record.end_date:
                record.end_date = False

    @api.depends('move_ids')
    def _compute_first_name(self):
        self.first_name = ""
        for record in self:
            if record.move_ids:
                record.first_name = min(record.move_ids._origin.mapped('name'))

    @api.depends('journal_id', 'first_date', 'end_date')
    def _compute_move_ids(self):
        for record in self:
            domain = [('journal_id', '=', record.journal_id.id)]
            domain += [('date', '>=', record.first_date)]
            domain += [('posted_before', '=', 'True')]
            if record.end_date:
                domain += [('date', '<=', record.end_date)]
            record.move_ids = self.env['account.move'].search(domain)

    @api.depends('new_values', 'ordering')
    def _compute_preview_moves(self):
        for record in self:
            new_values = sorted(json.loads(record.new_values).values(), key=lambda x: x['server-date'], reverse=True)
            changeLines = []
            in_elipsis = 0
            previous_line = None
            for i, line in enumerate(new_values):
                if i < 3 or i == len(new_values) - 1 or line['new_by_name'] != line['new_by_date'] \
                 or (self.journal_id.sequence_number_reset == 'year' and line['server-date'][0:4] != previous_line['server-date'][0:4])\
                 or (self.journal_id.sequence_number_reset == 'month' and line['server-date'][0:7] != previous_line['server-date'][0:7]):
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
        if self.journal_id.sequence_number_reset == 'year':
            return move_id.date.year
        elif self.journal_id.sequence_number_reset == 'month':
            return (move_id.date.year, move_id.date.month)
        return 'default'

    @api.depends('first_name', 'move_ids')
    def _compute_new_values(self):
        self.new_values = "{}"
        for record in self.filtered('first_name'):
            sorted = defaultdict(lambda: record.env['account.move'])
            for move in record.move_ids._origin:
                sorted[record._get_move_key(move)] += move

            try:
                if record.journal_id.sequence_number_reset == 'year':
                    sequence = re.match(r'(?P<prefix1>.*?)(?P<year>\d{4})(?P<prefix2>.*?)(?P<seq>\d+)$', record.first_name)
                    format = '{prefix1}%(year)04d{prefix2}%(seq)0{len}d'.format(
                        prefix1=sequence.group('prefix1'),
                        prefix2=sequence.group('prefix2'),
                        len=len(sequence.group('seq')),
                    )
                elif record.journal_id.sequence_number_reset == 'month':
                    sequence = re.match(r'(?P<prefix1>.*?)(?P<year>\d{4})(?P<prefix2>.*?)(?P<month>\d{2})(?P<prefix3>.*?)(?P<seq>\d+)$', record.first_name)
                    format = '{prefix1}%(year)04d{prefix2}%(month)02d{prefix3}%(seq)0{len}d'.format(
                        prefix1=sequence.group('prefix1'),
                        prefix2=sequence.group('prefix2'),
                        prefix3=sequence.group('prefix3'),
                        len=len(sequence.group('seq')),
                    )
                else:
                    sequence = re.match(r'(?P<prefix>.*?)(?P<seq>\d*)$', record.first_name)
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
                    'seq': i + (int(sequence.group('seq')) if j == (len(sorted)-1) else 1),
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
