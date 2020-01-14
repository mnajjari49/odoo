# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import werkzeug
from odoo.addons.website_event_sale.controllers.main import WebsiteEventSaleController
from odoo import http
from odoo.http import request

class WebsiteEventCrmSaleController(WebsiteEventSaleController):
    @http.route()
    def registration_confirm(self, event, **post):
        order = request.website.sale_get_order(force_create=1)
        attendee_ids = set()

        registrations = self._process_registration_details(post)
        for registration in registrations:
            registration['multi'] = True
            ticket = request.env['event.event.ticket'].sudo().browse(int(registration['ticket_id']))
            cart_values = order.with_context(event_ticket_id=ticket.id, fixed_price=True)._cart_update(product_id=ticket.product_id.id, add_qty=1, registration_data=[registration])
            attendee_ids |= set(cart_values.get('attendee_ids', []))

        event_crm = request.env['event.crm'].search([])
        Attendees = request.env['event.registration'].sudo().browse(attendee_ids)
        for r in event_crm:
            r._check_rules(event_id=event, registration_ids=Attendees)

        # free tickets -> order with amount = 0: auto-confirm, no checkout
        if not order.amount_total:
            order.action_confirm()  # tde notsure: email sending ?
            attendees = request.env['event.registration'].browse(list(attendee_ids)).sudo()
            # clean context and session, then redirect to the confirmation page
            request.website.sale_reset()
            urls = event._get_event_resource_urls()
            return request.render("website_event.registration_complete", {
                'attendees': attendees,
                'event': event,
                'google_url': urls.get('google_url'),
                'iCal_url': urls.get('iCal_url')
            })

        return request.redirect("/shop/checkout")
