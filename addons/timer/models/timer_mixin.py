# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, api
from math import ceil

class TimerMixin(models.AbstractModel):
    _name = 'timer.mixin'
    _description = 'Timer Mixin'

    timer_start = fields.Datetime(compute='_compute_is_timer_running')
    timer_pause = fields.Datetime(compute='_compute_is_timer_running')
    is_timer_running = fields.Boolean(compute='_compute_is_timer_running')

    def _compute_is_timer_running(self):
        for record in self:
            record_timer = record._get_record_timer()
            record.is_timer_running = record_timer.is_timer_running
            record.timer_start = record_timer.timer_start
            record.timer_pause = record_timer.timer_pause

    def _get_record_timer(self):
        """ Get the timers according these conditions
            :user_id is is the current user
            :res_id is the current record
            :res_model is the current model
            limit=1 by security but the search should never have more than one record
        """
        self.ensure_one()
        return self.env['timer.timer'].search([
            ('user_id', '=', self.env.user.id),
            ('res_id', '=', self.id),
            ('res_model', '=', self._name)
        ], limit=1)

    def _is_timer_user_running(self):
        return self._get_record_timer().is_timer_running

    @api.model
    def _get_user_timers(self):
        # Get the running timer of a user
        # Return a singleton
        return self.env['timer.timer'].search([('user_id', '=', self.env.user.id)])

    def action_timer_start(self):
        """ Start the timer of the current record
        First, if a timer is running, stop or pause it
        If there isn't a timer for the current record, create one then start it
        Otherwise, resume or start it
        """
        self.ensure_one()
        self.stop_timer_in_progress()
        timer = self._get_record_timer()
        if not timer:
            timer = self.env['timer.timer'].create({
                'timer_start' : False,
                'timer_pause' : False,
                'is_timer_running' : False,
                'res_model' : self._name,
                'res_id' : self.id,
                'user_id' : self.env.user.id,
            })
            timer.action_timer_start()
        else:
            # Check if it is in pause then resume it or start it
            if timer.timer_pause:
                timer.action_timer_resume()
            else:
                timer.action_timer_start()
        

    def action_timer_stop(self):
        """ Stop the timer of the current record
        Unlink the timer, it's useless to keep the stopped timer.
        A new timer can be create if needed
        Return the amount of minutes spent
        """
        self.ensure_one()
        timer = self._get_record_timer()
        minutes_spent = timer.action_timer_stop()
        self.env['timer.timer'].search([
                    ('id', '=', timer.id)
                ]).unlink()
        return minutes_spent
        

    def action_timer_pause(self):
        self.ensure_one()
        timer = self._get_record_timer()
        timer.action_timer_pause()

    def action_timer_resume(self):
        self.ensure_one()
        self.stop_timer_in_progress()
        timer = self._get_record_timer()
        timer.action_timer_resume()
    
    def interruption(self):
        # Interruption is the action called when the timer is stoped by the start of another one
        self.action_timer_pause()

    def stop_timer_in_progress(self):
        """
        Cancel the timer in progress if there is one
        Each model can interrupt the running timer in a specific way
        By setting it in pause or stop by example
        """
        # The loop will be trigered only one time because only one timer
        # can be running at the same time
        for timer in self._get_user_timers().filtered(lambda t: t.is_timer_running):
            model = self.env[timer.res_model].search([
                ('id', '=', timer.res_id)
            ])            
            model.interruption()
    
    @api.model
    def _timer_rounding(self, minutes_spent, minimum, rounding):
        minutes_spent = max(minimum, minutes_spent)
        if rounding and ceil(minutes_spent % rounding) != 0:
            minutes_spent = ceil(minutes_spent / rounding) * rounding
        return minutes_spent
                