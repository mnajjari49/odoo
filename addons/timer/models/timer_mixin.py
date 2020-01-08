# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, api


class TimerMixin(models.AbstractModel):
    _name = 'timer.mixin'
    _description = 'Timer Mixin'

    timer_id = fields.Many2one('timer.timer', compute='_compute_user_timer')
    timer_ids = fields.One2many('timer.timer', compute='_compute_user_timer')
    timer_start = fields.Datetime(related='timer_id.timer_start')
    timer_pause = fields.Datetime(related='timer_id.timer_pause')
    is_timer_running = fields.Boolean(related='timer_id.is_timer_running')

    def _compute_user_timer(self):
        self.timer_ids = self.env['timer.timer'].search([
            ('user_id', '=', self.env.user.id)
        ])

        for record in self:
            record.timer_id = self.timer_ids.filtered(lambda t: t.res_id == str(record.id))

    def action_timer_start(self):
        """ 
        
        """
        self.ensure_one()
        
        if not self.timer_id:
            self.timer_id = self.env['timer.timer'].create({
                'timer_start' : False,
                'timer_pause' : False,
                'is_timer_running' : False,
                'res_model' : self._name,
                'res_id' : self.id,
                'user_id' : self.env.user.id,
            })
            self.timer_id.action_timer_start()
        else:
            # Check if it is in pause then resume it or start it
            if(self.timer_id.timer_pause):
                self.timer_id.action_timer_resume()
            else:
                self.timer_id.action_timer_start()
        

    def action_timer_stop(self):
        """ 
        
        """
        self.ensure_one()
        minutes_spent = self.timer_id.action_timer_stop()
        self.env['timer.timer'].search([
                    ('id', '=', self.timer_id.id)
                ]).unlink()
        return minutes_spent
        

    def action_timer_pause(self):
        # self.write({'timer_pause': fields.Datetime.now()})
        for timer in list(filter(lambda t: t.is_timer_running, self.timer_ids)):
            timer.action_timer_pause()

    def action_timer_resume(self):
        # new_start = self.timer_start + (fields.Datetime.now() - self.timer_pause)
        # self.write({'timer_start': new_start, 'timer_pause': False})
        for timer in list(filter(lambda t: t.is_timer_running, self.timer_ids)):
            timer.action_timer_resume()

    def stop_timer_in_progress(self):
        # Cancel the timer in progress if there is one
        if any(timer.is_timer_running for timer in self.timer_ids):
            for timer in self.timer_ids.filtered(lambda t: t.is_timer_running):
                result = { 
                    "minutes_spent" : timer.action_timer_stop(),
                    "res_id" : timer.res_id
                }
                self.env['timer.timer'].search([
                    ('id', '=', timer.id)
                ]).unlink()
                import pdb; pdb.set_trace()
                return result
                # Pause or Stop ?