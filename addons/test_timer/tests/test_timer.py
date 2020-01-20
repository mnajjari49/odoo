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
        self.assertEqual(len(self.test_timer._get_record_timer()), 1, '1 !')

        self.test_timer.action_timer_stop()
        self.assertEqual(len(self.test_timer._get_record_timer()), 0, '2 !')

        # Start the first timer then the second one
        self.test_timer.action_timer_start()
        self.test_timer_bis.action_timer_start()
        
        self.assertEqual(len(self.env['timer.timer'].search([])), 2, '3 !')
        self.assertFalse(self.test_timer.is_timer_running, '4 !')
        self.assertTrue(self.test_timer_bis.is_timer_running, '5 !')

        # Resume the first one
        self.test_timer.action_timer_resume()

        self.assertTrue(self.test_timer.is_timer_running, '6 !')
        self.assertFalse(self.test_timer_bis.is_timer_running, '7 !')

        # Start a new test timer with interruption override
        override_test_timer = self.env['interruption.timer.test'].create({})
        override_test_timer.action_timer_start()

        self.assertEqual(len(self.env['timer.timer'].search([])), 3, '8 !')
        self.assertFalse(self.test_timer.is_timer_running, '9 !')
        self.assertFalse(self.test_timer_bis.is_timer_running, '10 !')
        self.assertTrue(override_test_timer.is_timer_running, '11 !')

        # Resume another timer to interrupt the new one
        self.test_timer_bis.action_timer_resume()

        self.assertEqual(len(self.env['timer.timer'].search([])), 2, '12 !')
        self.assertEqual(len(override_test_timer._get_record_timer()), 0, '13 !')

    def test_timer_with_many_users(self):
        
        # 2 users, 1 record = 2 timers
        self.test_timer.with_user(self.usr1).action_timer_start()
        self.test_timer.with_user(self.usr2).action_timer_start()

        self.assertEqual(len(self.env['timer.timer'].search([])), 2, '14 !')
        self.assertEqual(len(self.test_timer.with_user(self.usr1)._get_record_timer()), 1, '15 !')
        self.assertEqual(len(self.test_timer.with_user(self.usr2)._get_record_timer()), 1, '16 !')

        # Stop one of them
        self.test_timer.with_user(self.usr2).action_timer_stop()
        
        self.assertEqual(len(self.env['timer.timer'].search([])), 1, '14 !')
        self.assertEqual(len(self.test_timer.with_user(self.usr1)._get_record_timer()), 1, '15 !')
        self.assertEqual(len(self.test_timer.with_user(self.usr2)._get_record_timer()), 0, '16 !')
