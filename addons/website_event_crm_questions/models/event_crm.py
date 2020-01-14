# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, _

class EventCrm(models.Model):
    _inherit = "event.crm"

    def _additional_content_description(self, registration, description):
        if registration.answer_ids:
            description += _("\t\tQuestions:\n")
            for answer in registration.answer_ids:
                description += "\t\t\t%s %s\n" % (answer.question_id.title, answer.name)
        return description
