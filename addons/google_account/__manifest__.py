# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Google Users',
    'category': 'Tools',
    'description': """
The module adds google user in res user.
========================================
""",
    'depends': ['base_setup'],
    'data': [
        'security/ir.model.access.csv',
        'data/google_account_data.xml',
    ],
}
