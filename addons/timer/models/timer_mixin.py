# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, api


class TimerMixin(models.AbstractModel):
    _name = 'timer.mixin'
    _description = 'Timer Mixin'

    # timer_id = fields.Many2one('timer.timer', compute='_compute_user_timer')
    # timer_ids = fields.One2many('timer.timer', compute='_compute_user_timer')
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
        self.ensure_one()
        return self.env['timer.timer'].search([
            ('user_id', '=', self.env.user.id),
            ('res_id', '=', self.id)
        ], limit=1)

    def _is_timer_user_running(self):
        return self._get_record_timer().is_timer_running

    @api.model
    def _get_user_timers(self):
        return self.env['timer.timer'].search([('user_id', '=', self.env.user.id)])

    def action_timer_start(self):
        self.ensure_one()
        
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
        """ 
        
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
        timer = self._get_record_timer()
        timer.action_timer_resume()

    def stop_timer_in_progress(self):
        # Cancel the timer in progress if there is one
        
        for timer in self._get_user_timers().filtered(lambda t: t.is_timer_running):
            result = { 
                "minutes_spent" : timer.action_timer_stop(),
                "res_id" : timer.res_id
            }
            self.env['timer.timer'].search([
                ('id', '=', timer.id)
            ]).unlink()
            return result
            # TODO : Pause or Stop ?