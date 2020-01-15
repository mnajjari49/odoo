# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.exceptions import UserError
import re
import pytz
from dateutil.parser import parse
from dateutil.relativedelta import relativedelta

from odoo import api, fields, models, _
from odoo.tools import ormcache
from odoo.osv import expression
from addons.google_calendar.utils.google_event import GoogleEvent
from addons.google_calendar.utils.google_calendar import GoogleCalendarService


class Meeting(models.Model):
    _inherit = "calendar.event"

    google_id = fields.Char('Google Calendar Event Id', compute='_compute_google_id', store=True, readonly=False, copy=False)

    @api.depends('recurrence_id.google_id')
    def _compute_google_id(self):
        # google ids of recurring events are built from the recurrence id and the
        # original starting time in the recurrence.
        # The `start` field does not appear in the dependencies on purpose!
        # Event if the event is moved, the google_id remains the same.
        for event in self:
            if event.recurrence_id:
                event.google_id = False
            # google_ids of recurrence instances are formatted as:
            # {recurrence google_id}_{UTC startint time in compacted ISO8601}
            if event.recurrence_id.google_id:
                if event.allday:
                    time_id = event.start_date.isoformat().replace('-', '')
                else:
                    # '-' and ':' are optional in ISO8601
                    start_compacted_iso8601 = event.start.isoformat().replace('-', '').replace(':', '')
                    # Z at the end for UTC
                    time_id = '%sZ' % start_compacted_iso8601
                event.google_id = '%s_%s' % (event.recurrence_id.google_id, time_id)

    @api.model
    def get_fields_need_update_google(self):
        recurrent_fields = self._get_recurrent_fields()
        return recurrent_fields | {'name', 'description', 'allday', 'start', 'date_end', 'stop',
                                   'attendee_ids', 'alarm_ids', 'location', 'privacy', 'active',
                                   'start_date', 'stop_date'}

    def _write(self, *args, **kwargs):
        print(self, 'WRIIIIITTTEEEEE', *args, **kwargs)
        return super()._write(*args, **kwargs)

    def write(self, values):
        not_recurrent = self.filtered(lambda e: not e.recurrence_id)
        if any(not_recurrent.mapped('google_id')) and values.get('google_id') and not_recurrent.mapped('google_id') != [values['google_id']]:
            # Overwritting the google id of a recurring event is allowed as its google id is based on the recurrence google id
            raise ValueError("Please don't desynchronize odoo ids and google ids")
        if 'google_id' in values:
            self._from_google_ids.clear_cache(self)
        return super(Meeting, self).write(values)

    @api.model_create_multi
    def create(self, vals_list):
        if any(vals.get('google_id') for vals in vals_list):
            self._from_google_ids.clear_cache(self)
        return super().create(vals_list)

    def unlink(self):
        """
        We can't delete an event that is also in Google Calendar. Otherwise we would
        have no clue that the event must must deleted from Google Calendar at the next sync.
        """
        if self.filtered('google_id'):
            raise UserError(_("You cannot delete an event synchronized with Google Calendar, archive it instead."))
        return super().unlink()

    @api.model
    def _sync_odoo2google(self, google_service: GoogleCalendarService, last_sync=None, exclude=None):
        domain = [('partner_id.user_ids', 'in', self.env.user.id)]
        print("LASt sync")
        print(last_sync)
        if last_sync:
            domain = expression.AND([domain, ['|', ('write_date', '>', last_sync), ('create_date', '>', last_sync)]])
        if exclude:
            domain = expression.AND([domain, [('id', 'not in', exclude.ids)]])
        events_to_sync = self.with_context(active_test=False).search(domain)
        print(events_to_sync.mapped('write_date'))
        if not events_to_sync:
            return

        cancelled_events = events_to_sync - events_to_sync.filtered('active')
        events_to_sync -= cancelled_events

        updated_events = events_to_sync.filtered('google_id')
        new_events = events_to_sync - updated_events

        for event in cancelled_events.filtered('google_id'):
            google_service.delete(event.google_id)
            event.google_id = False
        for event in new_events:
            # Make sure the google id of the inserted event is registered.
            # Otherwise the event might be created twice in Google.
            # LUL FIXME what about concurrent access?
            with self.pool.cursor() as cr:
                env = self.env(cr=cr)
                event.with_env(env).google_id = google_service.insert(event._google_values())
        for event in updated_events:
            google_service.patch(event.google_id, event._google_values())

    @api.model
    def _sync_google2odoo(self, google_events: GoogleEvent):
        print(google_events)
        existing = google_events.exists(self.env)
        new = google_events - existing - google_events.cancelled()

        odoo_values = new.map(lambda e: self._odoo_values(e))
        new_odoo_events = self.create(odoo_values)

        cancelled = existing.cancelled()
        cancelled_odoo_events = self.browse(cancelled.odoo_ids(self.env))
        cancelled_odoo_events.google_id = False
        cancelled_odoo_events.unlink()

        synced_events = new_odoo_events + cancelled_odoo_events
        for gevent in existing - cancelled :
            # Last updated wins.
            # This could be dangerous if google server time and odoo server time are different
            updated = parse(gevent.updated)
            odoo_event = self.browse(gevent.odoo_id(self.env))
            if updated >= pytz.utc.localize(odoo_event.write_date):
                odoo_event.write(self._odoo_values(gevent))
                synced_events |= odoo_event

        print("SYNCED", synced_events)
        return synced_events

    @api.model
    def _odoo_values(self, google_event):
        if google_event.is_cancelled():
            return {'active': False}
        # LUL TODO attachments
        # LUL TODO reminders
        if google_event.organizer and  google_event.organizer.get('self'):
            organizer = self.env.user
        elif google_event.organizer and  google_event.organizer.get('email'):
            # In Google: 1 email = 1 user; but in Odoo several users might have the same email :/
            organizer = self.env['res.users'].search([('email', '=', google_event.organizer.get('email'))], limit=1)
        else:
            organizer = self.env['res.users']

        values = {
            'name': google_event.summary or _("(No title)"),
            'description': google_event.description,
            'location': google_event.location,
            'user_id': organizer.id,
            'privacy': google_event.visibility,
            'attendee_ids': self._odoo_attendee_commands(google_event),
            'recurrency': google_event.is_recurrent()
        }

        if not google_event.is_recurrence():
            values['google_id'] = google_event.id
        # LUL TODO no timezone
        if google_event.start.get('dateTime'):
            # starting from python3.7, use the new [datetime, date].fromisoformat method
            start = parse(google_event.start.get('dateTime')).astimezone(pytz.utc).replace(tzinfo=None)
            stop = parse(google_event.end.get('dateTime')).astimezone(pytz.utc).replace(tzinfo=None)
            values['allday'] = False
        else:
            start = parse(google_event.start.get('date'))
            stop = parse(google_event.end.get('date')) - relativedelta(days=1)
            values['allday'] = True
        values['start'] = start
        values['stop'] = stop
        return values

    @api.model
    def _odoo_attendee_commands(self, google_event):
        commands = []
        if not google_event.attendees:
            return commands
        emails = [a.get('email') for a in google_event.attendees]
        existing_attendees = self.env['calendar.attendee']
        if google_event.exists(self.env):
            existing_attendees = self.env['calendar.attendee'].search([('event_id', '=', google_event.odoo_id(self.env)), ('email', 'in', emails)])
        attendees_by_emails = {a.email: a for a in existing_attendees}
        for attendee in google_event.attendees:
            email = attendee.get('email')

            if email in attendees_by_emails:
                # Update existing attendees
                commands += [(1, attendees_by_emails[email].id, {'state': attendee.get('responseStatus')})]
            else:
                # Create new attendees
                partner_id = self.env['res.partner'].find_or_create(attendee.get('email'))
                commands += [(0, 0, {'state': attendee.get('responseStatus'), 'partner_id': partner_id})]
                partner = self.env['res.partner'].browse(partner_id)
                if attendee.get('displayName') and not partner.name:
                    partner.name = attendee.get('displayName')
        for odoo_attendee in attendees_by_emails.values():
            # Remove old attendees
            if odoo_attendee.email not in emails:
                commands += [(2, odoo_attendee.id)]
        return commands


    @api.model
    @ormcache('google_ids')
    def _from_google_ids(self, google_ids):
        if not google_ids:
            return self.browse()
        return self.with_context(active_test=False).search([('google_id', 'in', google_ids)])

    def _google_values(self):
        # LUL TODO attachments
        # LUL TODO reminders

        if self.allday:
            start = {'date': self.start_date.isoformat()}
            end = {'date': (self.stop_date + relativedelta(days=1)).isoformat()}
        else:
            start = {'dateTime': pytz.utc.localize(self.start).isoformat()}
            end = {'dateTime': pytz.utc.localize(self.stop).isoformat()}

        values = {
            'id': self.google_id,
            'start': start,
            'end': end,
            'summary': self.name,
            'description': self.description or '',
            'location': self.location or '',
            'organizer': {'email': self.user_id.email, 'self': self.user_id == self.env.user},
            'attendees': [{'email': attendee.email, 'responseStatus': attendee.state} for attendee in self.attendee_ids],
            'extendedProperties': {
                'shared': {
                    '%s_odoo_id' % self.env.cr.dbname: self.id,
                },
            },
        }
        if self.privacy:
            values['visibility'] = self.privacy

        if not self.active:
            values['status'] = 'cancelled'
        return values

class Attendee(models.Model):
    _inherit = 'calendar.attendee'

    google_internal_event_id = fields.Char('Google Calendar Event Id')
    oe_synchro_date = fields.Datetime('Odoo Synchro Date')

    _sql_constraints = [
        ('google_id_uniq', 'unique(google_internal_event_id,partner_id,event_id)', 'Google ID should be unique!')
    ]
