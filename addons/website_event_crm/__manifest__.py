# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Website Events CRM',
    'category': 'Website/Website',
    'website': 'https://www.odoo.com/page/events',
    'description': "",
    'depends': ['event_crm', 'website_event'],
    'data': [
        'views/event_crm_views.xml',
    ],
    'installable': True,
    'auto_install': True
}
