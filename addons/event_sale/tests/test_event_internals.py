# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import date
from unittest.mock import patch

from odoo.addons.event_sale.tests.common import TestEventSaleCommon
from odoo.fields import Date as FieldsDate
from odoo.tests.common import users


class TestEventTicketData(TestEventSaleCommon):

    def setUp(self):
        super(TestEventTicketData, self).setUp()
        self.ticket_date_patcher = patch('odoo.addons.event.models.event_ticket.fields.Date', wraps=FieldsDate)
        self.ticket_date_patcher_mock = self.ticket_date_patcher.start()
        self.ticket_date_patcher_mock.context_today.return_value = date(2020, 1, 31)

    def tearDown(self):
        super(TestEventTicketData, self).tearDown()
        self.ticket_date_patcher.stop()

    @users('user_eventmanager')
    def test_event_ticket_fields(self):
        """ Test event ticket fields synchronization """
        self.event_type_complex.write({
            'use_ticket': True,
            'event_type_ticket_ids': [
                (5, 0),
                (0, 0, {
                    'name': 'First Ticket',
                    'product_id': self.event_product.id,
                    'seats_max': 30,
                }), (0, 0, {  # limited in time, available (01/10 (start) < 01/31 (today) < 02/10 (end))
                    'name': 'Second Ticket',
                    'product_id': self.event_product.id,
                    'start_sale_date': date(2020, 1, 10),
                    'end_sale_date': date(2020, 2, 10),
                })
            ],
        })
        first_ticket = self.event_type_complex.event_type_ticket_ids.filtered(lambda t: t.name == 'First Ticket')
        first_ticket._onchange_product_id()
        second_ticket = self.event_type_complex.event_type_ticket_ids.filtered(lambda t: t.name == 'Second Ticket')
        second_ticket._onchange_product_id()
        # force second ticket price, after calling the onchange
        second_ticket.write({'price': 8.0})

        # price coming from product
        self.assertEqual(first_ticket.price, self.event_product.list_price)
        self.assertEqual(second_ticket.price, 8.0)

        # default availability
        self.assertEqual(first_ticket.seats_availability, 'limited')
        self.assertTrue(first_ticket.sale_available)
        self.assertFalse(first_ticket.is_expired)
        self.assertEqual(second_ticket.seats_availability, 'unlimited')
        self.assertTrue(second_ticket.sale_available)
        self.assertFalse(second_ticket.is_expired)

        # product archived
        self.event_product.action_archive()
        self.assertFalse(first_ticket.sale_available)
        self.assertFalse(second_ticket.sale_available)

        # sale is ended
        self.event_product.action_unarchive()
        second_ticket.write({'end_sale_date': date(2020, 1, 20)})
        self.assertFalse(second_ticket.sale_available)
        self.assertTrue(second_ticket.is_expired)
        # sale has not started
        second_ticket.write({
            'start_sale_date': date(2020, 2, 10),
            'end_sale_date': date(2020, 2, 20),
        })
        self.assertFalse(second_ticket.sale_available)
        self.assertFalse(second_ticket.is_expired)
