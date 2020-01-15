# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime
from optparse import Values
from odoo import http, fields
from odoo.http import request
from addons.google_calendar.utils.google_calendar import GoogleCalendarService


class GoogleCalendarController(http.Controller):

    @http.route('/google_calendar/sync_data', type='json', auth='user')
    def sync_data(self, model, **kw):
        """ This route/function is called when we want to synchronize Odoo calendar with Google Calendar
            Function return a dictionary with the status :  need_config_from_admin, need_auth, need_refresh, success if not calendar_event
            The dictionary may contains an url, to allow Odoo Client to redirect user on this URL for authorization for example
        """
        if model == 'calendar.event':
            GoogleCal = GoogleCalendarService(request.env['google.service'])

            # Checking that admin have already configured Google API for google synchronization !
            client_id = request.env['ir.config_parameter'].sudo().get_param('google_calendar_client_id')

            if not client_id or client_id == '':
                action_id = ''
                if GoogleCal._can_authorize_google(request.env.user):
                    action_id = request.env.ref('base_setup.action_general_configuration').id
                return {
                    "status": "need_config_from_admin",
                    "url": '',
                    "action": action_id
                }

            # Checking that user have already accepted Odoo to access his calendar !
            if not GoogleCal.is_authorized(request.env.user):
                url = GoogleCal._google_authentication_url(from_url=kw.get('fromurl'))
                return {
                    "status": "need_auth",
                    "url": url
                }
            # If App authorized, and user access accepted, We launch the synchronization
            self._sync_me_up_yeah()

        return {"status": "success"}

    def _sync_me_up_yeah(self):
        env = request.env
        user = env.user
        calendar_service = GoogleCalendarService(env['google.service'], token=user._get_google_calendar_token())
        events, next_sync_token = calendar_service.get_events(user.google_calendar_sync_token)
        user.google_calendar_sync_token = next_sync_token

        # Google -> Odoo
        recurrences = events.filter(lambda e: e.is_recurrence())
        synced_recurrences = env['calendar.recurrence.rule']._sync_google2odoo(recurrences)
        synced_events = env['calendar.event']._sync_google2odoo(events - recurrences)

        # Odoo -> Google
        last_sync = user.google_calendar_last_sync
        synced_events |= env['calendar.recurrence.rule']._sync_odoo2google(calendar_service, last_sync=last_sync, exclude=synced_recurrences)
        env['calendar.event']._sync_odoo2google(calendar_service, last_sync=last_sync, exclude=synced_events)

        # Force to flush now to ensure the `write_date` is before `google_calendar_last_sync`
        env['calendar.event'].flush()
        env['calendar.recurrence.rule'].flush()
        # use datetime.now() instead of fields.Datetime.now() because the latter truncates microseconds
        user.google_calendar_last_sync = datetime.now()

    @http.route('/google_calendar/remove_references', type='json', auth='user')
    def remove_references(self, model, **kw):
        """ This route/function is called when we want to remove all the references between one calendar Odoo and one Google Calendar """
        status = "NOP"
        if model == 'calendar.event':
            GoogleCal = request.env['google.calendar']
            # Checking that user have already accepted Odoo to access his calendar !
            context = kw.get('local_context', {})
            if GoogleCal.with_context(context).remove_references():
                status = "OK"
            else:
                status = "KO"
        return {"status": status}
