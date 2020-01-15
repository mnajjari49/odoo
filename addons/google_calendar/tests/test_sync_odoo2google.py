# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime, date
from unittest.mock import MagicMock

from odoo.tests.common import SavepointCase
from odoo.addons.google_calendar.utils.google_calendar import GoogleCalendarService


class TestSyncOdoo2Google(SavepointCase):

    def setUp(self):
        super().setUpClass()
        self.google_service = GoogleCalendarService(self.env['google.service'], token='dummy_token')
        self.google_service.insert = MagicMock(return_value='my-google-id')
        self.google_service.delete = MagicMock()

    def test_event_creation(self):
        partner = self.env['res.partner'].create({'name': 'Jean-Luc', 'email': 'jean-luc@opoo.com'})
        event = self.env['calendar.event'].create({
            'name': "Event",
            'start': datetime(2020, 1, 15, 8, 0),
            'stop': datetime(2020, 1, 15, 18, 0),
            'partner_ids': [(4, partner.id)],
            'privacy': 'private',
        })
        self.env['calendar.event']._sync_odoo2google(self.google_service)
        self.google_service.insert.assert_called_once_with({
            'id': False,
            'start': {'dateTime': '2020-01-15T08:00:00+00:00'},
            'end': {'dateTime': '2020-01-15T18:00:00+00:00'},
            'summary': 'Event',
            'description': '',
            'location': '',
            'visibility': 'private',
            'organizer': {'email': 'odoobot@example.com', 'self': True},
            'attendees': [{'email': 'jean-luc@opoo.com', 'responseStatus': 'needsAction'}],
            'extendedProperties': {'shared': {'%s_odoo_id' % self.env.cr.dbname: event.id}}
        })

    def test_event_allday_creation(self):
        event = self.env['calendar.event'].create({
            'name': "Event",
            'allday': True,
            'start': datetime(2020, 1, 15),
            'stop': datetime(2020, 1, 15),
        })
        self.env['calendar.event']._sync_odoo2google(self.google_service)
        self.google_service.insert.assert_called_once_with({
            'id': False,
            'start': {'date': '2020-01-15'},
            'end': {'date': '2020-01-16'},
            'summary': 'Event',
            'description': '',
            'location': '',
            'visibility': 'public',
            'organizer': {'email': 'odoobot@example.com', 'self': True},
            'attendees': [],
            'extendedProperties': {'shared': {'%s_odoo_id' % self.env.cr.dbname: event.id}}
        })

    def test_inactive_event(self):
        self.env['calendar.event'].create({
            'name': "Event",
            'start': datetime(2020, 1, 15),
            'stop': datetime(2020, 1, 15),
            'active': False
        })
        self.env['calendar.event']._sync_odoo2google(self.google_service)
        self.google_service.insert.assert_not_called()
        self.google_service.delete.assert_not_called()

    def test_synced_inactive_event(self):
        google_id = 'aaaaaaaaa'
        self.env['calendar.event'].create({
            'google_id': google_id,
            'name': "Event",
            'start': datetime(2020, 1, 15),
            'stop': datetime(2020, 1, 15),
            'active': False
        })
        self.env['calendar.event']._sync_odoo2google(self.google_service)
        self.google_service.delete.assert_called_once_with(google_id)
