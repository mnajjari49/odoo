# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import requests
from datetime import timedelta


from odoo import fields, models, _
from odoo.exceptions import UserError
from odoo.addons.google_account.models.google_service import GOOGLE_TOKEN_ENDPOINT


class User(models.Model):
    _inherit = 'res.users'

    google_calendar_rtoken = fields.Char('Refresh Token', copy=False)
    google_calendar_token = fields.Char('User token', copy=False)
    google_calendar_token_validity = fields.Datetime('Token Validity', copy=False)
    google_calendar_sync_token = fields.Char('Next Sync Token', copy=False)
    google_calendar_cal_id = fields.Char('Calendar ID', copy=False, help='Last Calendar ID who has been synchronized. If it is changed, we remove all links between GoogleID and Odoo Google Internal ID')
    google_calendar_last_sync = fields.Datetime()

    def _set_all_tokens(self, access_token, refresh_token, ttl):
        self.write({
            'google_calendar_rtoken': refresh_token,
            'google_calendar_token': access_token,
            'google_calendar_token_validity': fields.Datetime.now() + timedelta(seconds=ttl),
        })

    def _get_google_calendar_token(self):
        self.ensure_one()
        if self._is_google_calendar_valid():
            self._refresh_google_calendar_token()
        return self.google_calendar_token

    def _is_google_calendar_valid(self):
        return self.google_calendar_token_validity and self.google_calendar_token_validity < (fields.Datetime.now() + timedelta(minutes=1))

    def _refresh_google_calendar_token(self):
        # LUL TODO similar code exists in google_drive. Should be factorized in google_account
        self.ensure_one()
        get_param = self.env['ir.config_parameter'].sudo().get_param
        client_id = get_param('google_calendar_client_id')
        client_secret = get_param('google_calendar_client_secret')

        if not client_id or not client_secret:
            raise UserError(_("The account for the Google Calendar service is not configured."))

        headers = {"content-type": "application/x-www-form-urlencoded"}
        data = {
            'refresh_token': self.google_calendar_rtoken,
            'client_id': client_id,
            'client_secret': client_secret,
            'grant_type': 'refresh_token',
        }

        try:
            dummy, response, dummy = self.env['google.service']._do_request(GOOGLE_TOKEN_ENDPOINT, params=data, headers=headers, type='POST', preuri='')
            ttl = response.get('expires_in')
            self.write({
                'google_calendar_token': response.get('access_token'),
                'google_calendar_token_validity': fields.Datetime.now() + timedelta(seconds=ttl),
            })
        except requests.HTTPError as error:
            if error.response.status_code == 400:  # invalid grant
                # Delete refresh token and make sure it's commited
                with self.pool.cursor() as cr:
                    self.env.user.with_env(self.env(cr=cr)).write({'google_calendar_rtoken': False})
            error_key = error.response.json().get("error", "nc")
            error_msg = _("Something went wrong during your token generation. Maybe your Authorization Code is invalid or already expired [%s]") % error_key
            raise UserError(error_msg)
