# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import werkzeug
from odoo.addons.website_event.controllers.main import WebsiteEventController
from odoo import http
from odoo.http import request

class WebsiteEventCrmController(WebsiteEventController):
    @http.route()
    def registration_confirm(self, event, **post):
        if not event.can_access_from_current_website():
            raise werkzeug.exceptions.NotFound()

        Attendees = request.env['event.registration']
        registrations = self._process_registration_details(post)

        for registration in registrations:
            registration['event_id'] = event
            registration['multi'] = True
            Attendees += Attendees.sudo().create(
                Attendees._prepare_attendee_values(registration))

        event_crm = request.env['event.crm'].search([])
        for r in event_crm:
            r._check_rules(event_id=event, registration_ids=Attendees)

        urls = event._get_event_resource_urls()
        return request.render("website_event.registration_complete", {
            'attendees': Attendees.sudo(),
            'event': event,
            'google_url': urls.get('google_url'),
            'iCal_url': urls.get('iCal_url')
        })
