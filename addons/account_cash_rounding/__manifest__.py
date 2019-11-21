# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Account Cash Rounding Profit and loss account',
    'version': '1.0.0',
    'category': 'Sales/Point Of Sale',
    'sequence': 20,
    'summary': 'Allow specific rounding in pos',
    'description': "",
    'depends': ['account'],
    'data': [
        'views/account_cash_rounding_view.xml',
    ],
    'installable': True,
    'auto_install': True,
}
