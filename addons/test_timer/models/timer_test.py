# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models

class TimerTest(models.Model):
    """ A very simple model only inheriting from timer.mixin to test
    timer features """
    _description = 'Timer Model'
    _name = 'timer.test'
    _inherit = ['timer.mixin']

class OverrideInterruptionTimerTest(models.Model):
    """ A very simple model inheriting from timer.mixin and
    overriding interruption() """
    _description = 'Interruption Timer Model'
    _name = 'interruption.timer.test'
    _inherit = ['timer.mixin']

    def interruption(self):
        self.action_timer_stop()