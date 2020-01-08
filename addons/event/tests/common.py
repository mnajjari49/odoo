# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime, timedelta

from odoo import fields
from odoo.tests import common


class TestEventCommon(common.SavepointCase):

    @classmethod
    def setUpClass(cls):
        super(TestEventCommon, cls).setUpClass()

        # User groups
        group_employee_id = cls.env.ref('base.group_user').id
        group_event_user_id = cls.env.ref('event.group_event_user').id
        group_event_manager_id = cls.env.ref('event.group_event_manager').id
        group_system_id = cls.env.ref('base.group_system').id

        # Test users to use through the various tests
        cls.user_employee = cls.env['res.users'].with_context({'no_reset_password': True}).create({
            'name': 'Eglantine Employee',
            'login': 'user_employee',
            'email': 'eglantine.employee@example.com',
            'tz': 'Europe/Brussels',
            'groups_id': [(6, 0, [group_employee_id])]})
        cls.user_eventuser = cls.env['res.users'].with_context({'no_reset_password': True}).create({
            'name': 'Armande EventUser',
            'login': 'user_eventuser',
            'email': 'armande.eventuser@example.com',
            'tz': 'Europe/Brussels',
            'groups_id': [(6, 0, [
                group_employee_id,
                group_event_user_id])]
        })
        cls.user_eventmanager = cls.env['res.users'].with_context({'no_reset_password': True}).create({
            'name': 'Bastien EventManager',
            'login': 'user_eventmanager',
            'email': 'bastien.eventmanager@example.com',
            'tz': 'Europe/Brussels',
            'groups_id': [(6, 0, [
                group_employee_id,
                group_event_manager_id,
                group_system_id])]
        })

        cls.customer = cls.env['res.partner'].create({
            'name': 'Constantin Customer',
            'email': 'constantin@example.com',
            'country_id': cls.env.ref('base.be').id,
            'phone': '0485112233',
        })
        cls.event_type_mail = cls.env['event.type'].create({
            'name': 'Test Type',
            'auto_confirm': True,
            'use_mail_schedule': True,
            'event_type_mail_ids': [
                (0, 0, {  # right at subscription
                    'interval_unit': 'now',
                    'interval_type': 'after_sub',
                    'template_id': cls.env['ir.model.data'].xmlid_to_res_id('event.event_subscription')}),
                (0, 0, {  # 1 days before event
                    'interval_nbr': 1,
                    'interval_unit': 'days',
                    'interval_type': 'before_event',
                    'template_id': cls.env['ir.model.data'].xmlid_to_res_id('event.event_reminder')}),
            ],
        })
        cls.event_0 = cls.env['event.event'].create({
            'name': 'TestEvent',
            'auto_confirm': True,
            'date_begin': fields.Datetime.to_string(datetime.today() + timedelta(days=1)),
            'date_end': fields.Datetime.to_string(datetime.today() + timedelta(days=15)),
            'date_tz': 'Europe/Brussels',
        })

        # set country in order to format belgium numbers
        cls.event_0.company_id.write({'country_id': cls.env.ref('base.be').id})

    @classmethod
    def _create_registrations(cls, event, reg_count):
        # create some registrations
        registrations = cls.env['event.registration'].create([{
            'event_id': event.id,
            'name': 'Test Registration %s' % x,
            'email': '_test_reg_%s@example.com' % x,
            'phone': '04560000%s%s' % (x, x),
        } for x in range(0, reg_count)])
        return registrations
