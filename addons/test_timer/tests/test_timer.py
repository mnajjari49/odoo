# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests.common import TransactionCase
from odoo.exceptions import AccessError, UserError

from odoo.addons.timer.tests.test_timer_security import TestTimerSecurity

from datetime import datetime, timedelta

class TestTimer(TestTimerSecurity):

    def setUp(self):
        super(TestTimer, self).setUp()

        # Setup mixin
        self.test_timer = self.env['timer.test'].create({})
        self.test_timer_bis = self.env['timer.test'].create({})

    # OSU TODO : Edit assert messages
    def test_timer_from_self_user(self):

        # Start and stop
        self.test_timer.action_timer_start()
        self.assertEqual(len(self.test_timer._get_record_timer()), 1, 'It should have created one timer')

        self.test_timer.action_timer_stop()
        self.assertEqual(len(self.test_timer._get_record_timer()), 0, 'It should have delete the timer')

        # Start the first timer then the second one
        self.test_timer.action_timer_start()
        self.test_timer_bis.action_timer_start()
        
        self.assertEqual(len(self.env['timer.timer'].search([])), 2, 'It should have created 2 timers for the same user')
        self.assertFalse(self.test_timer.is_timer_running, "The first timer should be in pause because the second one interrupt it")
        self.assertTrue(self.test_timer_bis.is_timer_running, 'The second timer should be running')

        # Resume the first one
        self.test_timer.action_timer_resume()

        self.assertTrue(self.test_timer.is_timer_running, 'The first timer should be running after being resumed')
        self.assertFalse(self.test_timer_bis.is_timer_running, 'The second timer should be in pause when another timer has been started')

        # Start a new test timer with interruption override
        override_test_timer = self.env['interruption.timer.test'].create({})
        override_test_timer.action_timer_start()

        self.assertEqual(len(self.env['timer.timer'].search([])), 3, 'A third timer should be created')
        self.assertFalse(self.test_timer.is_timer_running, 'The first timer has been interrupted and should be in pause')
        self.assertFalse(self.test_timer_bis.is_timer_running, 'The second timer has been interrupted and should be in pause')
        self.assertTrue(override_test_timer.is_timer_running, 'The third timer should be running')

        # Resume another timer to interrupt the new one
        self.test_timer_bis.action_timer_resume()

        self.assertEqual(len(self.env['timer.timer'].search([])), 2, 'It should remains only 2 timers')
        self.assertEqual(len(override_test_timer._get_record_timer()), 0, 'The third timer should be deleted because of his override method')

    def test_timer_with_many_users(self):
        
        # 2 users, 1 record = 2 timers
        self.test_timer.with_user(self.usr1).action_timer_start()
        self.test_timer.with_user(self.usr2).action_timer_start()

        self.assertEqual(len(self.env['timer.timer'].search([])), 2, 'It should have created two timers')
        self.assertEqual(len(self.test_timer.with_user(self.usr1)._get_record_timer()), 1, 'It should exist only one timer for this user, model and record')
        self.assertEqual(len(self.test_timer.with_user(self.usr2)._get_record_timer()), 1, 'It should exist only one timer for this user, model and record')

        # Stop one of them
        self.test_timer.with_user(self.usr2).action_timer_stop()
        
        self.assertEqual(len(self.env['timer.timer'].search([])), 1, 'It should have deleted one timer')
        self.assertEqual(len(self.test_timer.with_user(self.usr1)._get_record_timer()), 1, 'It should exist only one timer for this user, model and record')
        self.assertEqual(len(self.test_timer.with_user(self.usr2)._get_record_timer()), 0, 'It shouldn\'t exit one timer for this user, model and record')

    def test_timer_rounding(self):

        minutes_spent, minimum, rounding = 4.5,10,5
        result = self.test_timer._timer_rounding(minutes_spent, minimum, rounding)
        self.assertEqual(result, 10, 'It should have been round to the minimum amount')

        minutes_spent = 12.4
        result = self.test_timer._timer_rounding(minutes_spent, minimum, rounding)
        self.assertEqual(result, 15, 'It should have been round to the next multiple of 15')

