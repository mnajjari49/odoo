# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime, timedelta
from odoo.exceptions import UserError

from uuid import uuid4
import requests
from dateutil import parser
import json
import logging
import operator
import pytz
from werkzeug import urls

from odoo import api, fields, models, tools, _
from odoo.tools import exception_to_unicode
from addons.google_calendar.utils.google_event import GoogleEvent

_logger = logging.getLogger(__name__)

def requires_auth_token(func):
    def wrapped(self, *args, **kwargs):
        if not self.token:
            raise AttributeError("An authentication token is required")
        return func(self, *args, **kwargs)
    return wrapped

class GoogleCalendarService():

    def __init__(self, google_service, token=None):
        self.google_service = google_service
        self.token = token

    @requires_auth_token
    def get_events(self, sync_token=None):
        url = "/calendar/v3/calendars/primary/events"
        headers = {'Content-type': 'application/json'}
        params = {'access_token': self.token}
        if sync_token:
            params['syncToken'] = sync_token
        status, data, time = self.google_service._do_request(url, params, headers, type='GET')
        # LUL TODO check status
        import pprint
        pprint.pprint(data)
        events = data.get('items', [])
        next_sync_token = data.get('nextSyncToken')
        # LUL TODO support pagination

        return GoogleEvent(events), next_sync_token

    @requires_auth_token
    def insert(self, values):
        print("INSERT")
        url = "/calendar/v3/calendars/primary/events"
        headers = {'Content-type': 'application/json', 'Authorization': 'Bearer %s' % self.token}
        if not values.get('id'):
            values['id'] = uuid4().hex
        import pprint
        pprint.pprint(values)
        self.google_service._do_request(url, json.dumps(values), headers, type='POST')
        return values['id']

    @requires_auth_token
    def patch(self, event_id, values):
        print("PATCH")
        url = "/calendar/v3/calendars/primary/events/%s" % event_id
        headers = {'Content-type': 'application/json', 'Authorization': 'Bearer %s' % self.token}
        self.google_service._do_request(url, json.dumps(values), headers, type='PUT')

    @requires_auth_token
    def delete(self, event_id):
        print("DELETE")
        url = "/calendar/v3/calendars/primary/events/%s" % event_id
        headers = {'Content-type': 'application/json'}
        params = {'access_token': self.token}
        try:
            self.google_service._do_request(url, params, headers=headers, type='DELETE')
        except requests.HTTPError as e:
            # For some unknown reason Google can also return a 403 response when the event is already cancelled.
            if e.response.status_code not in (410, 403):
                raise e
            _logger.info("Google event %s was already deleted" % event_id)

    def remove_references(self):
        # LUL TODO check this
        current_user = self.env.user
        reset_data = {
            'google_calendar_rtoken': False,
            'google_calendar_token': False,
            'google_calendar_token_validity': False,
            'google_calendar_last_sync_date': False,
            'google_calendar_cal_id': False,
        }

        all_my_attendees = self.env['calendar.attendee'].search([('partner_id', '=', current_user.partner_id.id)])
        return current_user.write(reset_data)

    @api.model
    def synchronize_events_cron(self):
        """ Call by the cron. """
        users = self.env['res.users'].search([('google_calendar_last_sync_date', '!=', False)])
        _logger.info("Calendar Synchro - Started by cron")

        for user_to_sync in users.ids:
            _logger.info("Calendar Synchro - Starting synchronization for a new user [%s]", user_to_sync)
            try:
                resp = self.with_user(user_to_sync).synchronize_events(lastSync=True)
                if resp.get("status") == "need_reset":
                    _logger.info("[%s] Calendar Synchro - Failed - NEED RESET  !", user_to_sync)
                else:
                    _logger.info("[%s] Calendar Synchro - Done with status : %s  !", user_to_sync, resp.get("status"))
            except Exception as e:
                _logger.info("[%s] Calendar Synchro - Exception : %s !", user_to_sync, exception_to_unicode(e))
        _logger.info("Calendar Synchro - Ended by cron")

    def synchronize_events(self, lastSync=True):
        """ This method should be called as the user to sync. """
        user = self.env.user

        status, current_google, ask_time = self.get_calendar_primary_id()
        if user.google_calendar_cal_id:
            if current_google != user.google_calendar_cal_id:
                return {
                    "status": "need_reset",
                    "info": {
                        "old_name": user.google_calendar_cal_id,
                        "new_name": current_google
                    },
                    "url": ''
                }

            if lastSync and self.get_last_sync_date() and not self.get_disable_since_synchro():
                lastSync = self.get_last_sync_date()
            else:
                lastSync = False
        else:
            user.write({'google_calendar_cal_id': current_google})
            lastSync = False

        res = self.update_events(lastSync)

        user.write({'google_calendar_last_sync_date': ask_time})
        return {
            "status": res and "need_refresh" or "no_new_event_from_google",
            "url": ''
        }

    #################################
    ##  MANAGE CONNEXION TO GMAIL  ##
    #################################


    def is_authorized(self, user):
        return user.google_calendar_rtoken is not False

    def _get_calendar_scope(self, RO=False):
        readonly = '.readonly' if RO else ''
        return 'https://www.googleapis.com/auth/calendar%s' % (readonly)

    def _google_authentication_url(self, from_url='http://www.odoo.com'):
        return self.google_service._get_authorize_uri(from_url, service='calendar', scope=self._get_calendar_scope())

    def _can_authorize_google(self, user):
        return user.has_group('base.group_erp_manager')
