# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
from unittest.mock import patch

from odoo.addons.event.tests.common import TestEventCommon
from odoo.exceptions import AccessError
from odoo.fields import Datetime as FieldsDatetime
from odoo.tests.common import users


class TestEventData(TestEventCommon):

    @users('user_eventmanager')
    def test_event_date_computation(self):
        self.patcher = patch('odoo.addons.event.models.event.fields.Datetime', wraps=FieldsDatetime)
        self.mock_datetime = self.patcher.start()
        self.mock_datetime.now.return_value = datetime(2020, 1, 31, 8, 0, 0)

        event = self.event_0.with_user(self.env.user)
        event.write({
            'registration_ids': [(0, 0, {'partner_id': self.customer.id})],
            'date_begin': datetime(2020, 1, 31, 15, 0, 0),
            'date_end': datetime(2020, 4, 5, 18, 0, 0),
        })
        registration = event.registration_ids[0]
        self.assertEqual(registration.get_date_range_str(), u'today')

        event.date_begin = datetime(2020, 2, 1, 15, 0, 0)
        self.assertEqual(registration.get_date_range_str(), u'tomorrow')

        event.date_begin = datetime(2020, 2, 2, 6, 0, 0)
        self.assertEqual(registration.get_date_range_str(), u'in 2 days')

        event.date_begin = datetime(2020, 2, 20, 17, 0, 0)
        self.assertEqual(registration.get_date_range_str(), u'next month')

        event.date_begin = datetime(2020, 3, 1, 10, 0, 0)
        self.assertEqual(registration.get_date_range_str(), u'on Mar 1, 2020, 11:00:00 AM')

        event.write({
            'date_begin': '2019-11-09 14:30:00',
            'date_end': '2019-11-10 02:00:00',
            'date_tz': 'Mexico/General'
        })
        self.assertTrue(event.is_one_day)

        self.patcher.stop()

    @users('user_eventmanager')
    def test_event_type(self):
        self.assertEqual(self.env.user.tz, 'Europe/Brussels')

        event_type = self.env['event.type'].create({
            'name': 'Update Type',
            'use_timezone': True,
            'default_timezone': 'Europe/Paris',
            'use_mail_schedule': False,
            'has_seats_limitation': True,
            'default_registration_min': 10,
            'default_registration_max': 30,
            'auto_confirm': True,
            'use_hashtag': True,
            'default_hashtag': 'amazing',
            'is_online': False,
        })
        # self.assertEqual(event_type.event_type_mail_ids, self.env['event.type.mail'])  # TDE FIXME: currently crashing

        event = self.env['event.event'].create({
            'name': 'Event Update Type',
            'event_type_id': False,
            'date_begin': FieldsDatetime.to_string(datetime.today() + timedelta(days=1)),
            'date_end': FieldsDatetime.to_string(datetime.today() + timedelta(days=15)),
            'auto_confirm': False,
            'twitter_hashtag': 'somuchwow',
            'is_online': True,
        })
        self.assertEqual(event.date_tz, self.env.user.tz)
        self.assertEqual(event.seats_availability, 'unlimited')
        self.assertFalse(event.auto_confirm)
        self.assertEqual(event.twitter_hashtag, 'somuchwow')
        self.assertTrue(event.is_online)
        self.assertEqual(event.event_mail_ids, self.env['event.mail'])

        event.write({'event_type_id': event_type.id})
        self.assertEqual(event.date_tz, 'Europe/Paris')
        self.assertEqual(event.seats_availability, 'limited')
        self.assertEqual(event.seats_min, event_type.default_registration_min)
        self.assertEqual(event.seats_max, event_type.default_registration_max)
        self.assertTrue(event.auto_confirm)
        self.assertEqual(event.twitter_hashtag, event_type.default_hashtag)
        self.assertFalse(event.is_online)
        # self.assertEqual(event.event_mail_ids, self.env['event.mail'])  # TDE FIXME: currently crashing

        event_type.write({
            'use_mail_schedule': True,
            'event_type_mail_ids': [(5, 0), (0, 0, {
                'interval_nbr': 1, 'interval_unit': 'days', 'interval_type': 'before_event',
                'template_id': self.env['ir.model.data'].xmlid_to_res_id('event.event_reminder')})]
        })
        # self.assertEqual(event.event_mail_ids.interval_nbr, 1)
        # self.assertEqual(event.event_mail_ids.interval_unit, 'days')
        # self.assertEqual(event.event_mail_ids.interval_type, 'before_event')
        # self.assertEqual(event.event_mail_ids.template_id, self.env.ref('event.event_reminder'))


class TestEventSecurity(TestEventCommon):

    @users('user_employee')
    def test_event_access_employee(self):
        # employee can read events (sure ?)
        event = self.event_0.with_user(self.env.user)
        event.read(['name'])
        # event.stage_id.read(['name', 'description'])
        # event.event_type_id.read(['name', 'has_seats_limitation'])

        with self.assertRaises(AccessError):
            self.env['event.event'].create({
                'name': 'TestEvent',
                'date_begin': datetime.now() + relativedelta(days=-1),
                'date_end': datetime.now() + relativedelta(days=1),
                'seats_max': 10,
            })

        with self.assertRaises(AccessError):
            event.write({
                'name': 'TestEvent Modified',
            })

    @users('user_eventuser')
    def test_event_access_event_user(self):
        event = self.event_0.with_user(self.env.user)
        event.read(['name', 'user_id', 'kanban_state_label'])

        with self.assertRaises(AccessError):
            self.env['event.event'].create({
                'name': 'TestEvent',
                'date_begin': datetime.now() + relativedelta(days=-1),
                'date_end': datetime.now() + relativedelta(days=1),
                'seats_max': 10,
            })

        with self.assertRaises(AccessError):
            event.write({
                'name': 'TestEvent Modified',
            })

    @users('user_eventmanager')
    def test_event_access_event_manager(self):
        # Settings access rights required to enable some features
        self.user_eventmanager.write({'groups_id': [
            (3, self.env.ref('base.group_system').id),
            (4, self.env.ref('base.group_erp_manager').id)
        ]})
        with self.assertRaises(AccessError):
            event_config = self.env['res.config.settings'].with_user(self.user_eventmanager).create({
            })
            event_config.execute()
