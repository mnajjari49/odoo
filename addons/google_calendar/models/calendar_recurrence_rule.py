# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import re

from datetime import datetime, date, time
from dateutil import rrule
from dateutil.relativedelta import relativedelta, MO

from odoo import api, fields, models, _
from odoo.exceptions import UserError
from odoo.osv import expression

from odoo.addons.base.models.res_partner import _tz_get
from addons.google_calendar.utils.google_calendar import GoogleCalendarService
from addons.google_calendar.utils.google_event import GoogleEvent



class RecurrenceRule(models.Model):
    _inherit = 'calendar.recurrence.rule'

    google_id = fields.Char()

    def _write_events(self, values, dtstart=None):
        values.pop('google_id', False)
        return super()._write_events(values, dtstart=dtstart)

    @api.model
    def _detach_events(self, events):
        events.google_id = False
        return super()._detach_events(events)

    @api.model
    def _from_google_ids(self, google_ids):
        if not google_ids:
            return self.browse()
        return self.with_context(active_test=False).search([('google_id', 'in', google_ids)])

    @api.model
    def _sync_google2odoo(self, google_recurrences: GoogleEvent):
        """Synchronize Google recurrences in Odoo. Creates new recurrences, updates
        existing ones.

        :param google_recurrences: Google recurrences to synchronize in Odoo
        :return: synchronized odoo recurrences
        """
        existing_google_recurrence = google_recurrences.exists(self.env)
        new_google_recurrences = google_recurrences - existing_google_recurrence
        # rrule exdate is not implemented by Google
        # => create recurrence as if there are no exception, then consider outliers as updates
        new_odoo_recurrences = self.create([{
            'rrule': recurrence.rrule,
            'google_id': recurrence.id,
            'base_calendar_event_id': self.env['calendar.event'].create(self.env['calendar.event']._odoo_values(recurrence)).id
        } for recurrence in new_google_recurrences])

        odoo_ids = existing_google_recurrence.odoo_ids(self.env)
        odoo_recurrences = self.browse(odoo_ids)
        for recurrence in existing_google_recurrence:
            odoo_id = recurrence.odoo_id(self.env)
            odoo_recurrence = self.browse(odoo_id)
            odoo_recurrence.rrule = recurrence.rrule
        recurrences = odoo_recurrences | new_odoo_recurrences
        detached_events = recurrences._apply_recurrence()
        detached_events.unlink()
        return recurrences

    @api.model
    def _sync_odoo2google(self, google_service: GoogleCalendarService, last_sync=None, exclude=None):
        """
        :return: events synced to Google
        """
        domain = [('calendar_event_ids.partner_id.user_ids', 'in', self.env.user.id)]
        if last_sync:
            domain = expression.AND([domain, ['|', ('write_date', '>=', last_sync), ('create_date', '>=', last_sync)]])
        if exclude:
            domain = expression.AND([domain, [('id', 'not in', exclude.ids)]])
        recurrences_to_sync = self.search(domain)

        updated = recurrences_to_sync.filtered('google_id')
        new = recurrences_to_sync - updated
        for recurrence in new:
            # Make sure the google id of the inserted event is registered.
            # Otherwise the event might be created twice in Google.
            with self.pool.cursor() as cr:
                env = self.env(cr=cr)
                recurrence.with_env(env).google_id = google_service.insert(recurrence._google_values())  # crash crash crash
        for recurrence in updated:
            google_service.patch(recurrence.google_id, recurrence._google_values())

        return recurrences_to_sync.calendar_event_ids - recurrences_to_sync._get_outliers()
        # The 720 http request problem...

    def _google_values(self):
        event = self._get_first_event()
        values = event._google_values()
        values['id'] = self.google_id or event.google_id
        # DTSTART is not allowed by Google Calendar API.
        # Event start and end times are specified in the start and end fields.
        rrule = re.sub('DTSTART:[0-9]{8}T[0-9]{1,8}\\n', '', self.rrule)
        values['recurrence'] = ['RRULE:%s' % rrule]
        values['extendedProperties'] = {
            'shared': {
                '%s_odoo_id' % self.env.cr.dbname: self.id,
            },
        }
        return values