# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Debit Note',
    'version': '1.0',
    'category': 'Accounting/Accounting',
    'summary': 'Debit Note',
    'description': """
In a lot of countries, a debit note is used to adjust the amounts of an existing invoice. 
It is like a regular invoice, except that it has a link with the original one. 
    """,
    'depends': ['account'],
    'data': [
        'wizard/account_debit_note_view.xml',
        'views/account_move_view.xml',

    ],
    'installable': True,
    'auto_install': False,
}
