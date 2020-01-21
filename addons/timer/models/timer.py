# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, api

class TimerTimer(models.Model):
    _name = 'timer.timer'
    _description = 'Timer Module'


    timer_start = fields.Datetime("Timer Start")
    timer_pause = fields.Datetime("Timer Last Pause")
    is_timer_running = fields.Boolean(compute="_compute_timer")
    res_model = fields.Char()
    res_id = fields.Char()
    user_id = fields.Many2one('res.users')

    @api.depends('timer_start')
    def _compute_timer(self):
        for record in self:
            record.is_timer_running = bool(record.timer_start) and not bool(record.timer_pause)

    def action_timer_start(self):
        """ Action start the timer.
            Start timer and search if another timer hasn't been launched.
            If yes, then stop the timer before launch this timer.
        """
        self.ensure_one()
        if not self.timer_start:
            self.update({'timer_start': fields.Datetime.now()})

    def action_timer_stop(self):
        """ Stop the timer and return the spent minutes since it started
            :return minutes_spent if the timer is started,
                    otherwise return False
        """
        self.ensure_one()
        if not self.timer_start:
            return False
        minutes_spent = self._get_minutes_spent()
        self.update({'timer_start': False, 'timer_pause': False})
        return minutes_spent

    def _get_minutes_spent(self):
        start_time = self.timer_start
        stop_time = fields.Datetime.now()
        # timer was either running or paused
        if self.timer_pause:
            start_time += (stop_time - self.timer_pause)
        return (stop_time - start_time).total_seconds() / 60

    def action_timer_pause(self):
        self.update({'timer_pause': fields.Datetime.now()})

    def action_timer_resume(self):
        new_start = self.timer_start + (fields.Datetime.now() - self.timer_pause)
        self.update({'timer_start': new_start, 'timer_pause': False})

    @api.model
    def get_server_time(self):
        """ Returns the server time.
            The timer widget needs the server time instead of the client time
            to avoid time desynchronization issues like the timer beginning at 0:00
            and not 23:59 and so on.
        """
        return fields.Datetime.now()