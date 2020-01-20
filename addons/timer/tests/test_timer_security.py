# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests.common import TransactionCase
from odoo.exceptions import AccessError, UserError

class TestTimerSecurity(TransactionCase):

    def setUp(self):
        super(TestTimerSecurity, self).setUp()

        # Setup users
        self.usr1 = self.env['res.users'].create({
            'name': 'Usr1',
            'login': 'Usr1',
            'email': 'usr1@test.com',
            'groups_id': [(6, 0, [self.ref('base.group_user')])],
        })

        self.usr2 = self.env['res.users'].create({
            'name': 'Usr2',
            'login': 'Usr2',
            'email': 'usr2@test.com',
            'groups_id': [(6, 0, [self.ref('base.group_user')])],
        })
    
    def test_timer_access_security(self):

        # Create usr1's timer1
        timer1 = self.env['timer.timer'].with_user(self.usr1).create({
            'timer_start' : False,
            'timer_pause' : False,
            'is_timer_running' : False,
            'res_model' : 'test.timer.security',
            'res_id' : '1',
            'user_id' : self.usr1.id,
        })

        # Create usr1's timer2
        timer2 = self.env['timer.timer'].with_user(self.usr1).create({
            'timer_start' : False,
            'timer_pause' : False,
            'is_timer_running' : False,
            'res_model' : 'test.timer.security',
            'res_id' : '2',
            'user_id' : self.usr1.id,
        })

        # Start timer2
        timer2.action_timer_start()

        with self.assertRaises(AccessError):

            # Try to create a timer with usr1 for usr2 (Create)
            self.env['timer.timer'].with_user(self.usr1).create({
                'timer_start' : False,
                'timer_pause' : False,
                'is_timer_running' : False,
                'res_model' : 'test.timer.security',
                'res_id' : '0',
                'user_id' : self.usr2.id,
            })
            
            # Try to start the timer1 with another usr2 (Write)
            timer1.with_user(self.usr2).action_timer_start()

            # Try to stop the timer2 with usr2 (Unlink)
            timer2.with_user(self.usr2).action_timer_stop()
