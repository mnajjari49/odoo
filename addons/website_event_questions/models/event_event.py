# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class EventType(models.Model):
    _inherit = 'event.type'

    use_questions = fields.Boolean('Questions to Attendees')
    question_ids = fields.One2many(
        'event.question', 'event_type_id',
        string='Questions', copy=True)


class EventEvent(models.Model):
    """ Override Event model to add optional questions when buying tickets. """
    _inherit = 'event.event'

    question_ids = fields.One2many('event.question', 'event_id', 'Questions', copy=True, compute='_compute_from_event_type', store=True, readonly=False)
    general_question_ids = fields.One2many('event.question', 'event_id', 'General Questions',
                                           domain=[('is_individual', '=', False)])
    specific_question_ids = fields.One2many('event.question', 'event_id', 'Specific Questions',
                                            domain=[('is_individual', '=', True)])

    @api.depends('event_type_id')
    def _compute_from_event_type(self):
        super(EventEvent, self)._compute_from_event_type()
        for record in self:
            if record.event_type_id.use_questions and record.event_type_id.question_ids:
                record.question_ids = [(5, 0, 0)] + [
                    (0, 0, {
                        'title': question.title,
                        'sequence': question.sequence,
                        'is_individual': question.is_individual,
                    })
                    for question in record.event_type_id.question_ids
                ]
