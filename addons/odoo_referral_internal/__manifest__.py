# -*- coding: utf-8 -*-
{
    'name': "Odoo referral internal",

    'summary': """
        Internal module for the odoo referral program""",
    'description': """
        Manage queries made to display the status of the odoo referral program on all the clients' DBs""",
    'category': 'Hidden',
    'version': '0.1',
    'depends': ['website', 'website_sale_referral'],
    'data': [
        'views/referral_template.xml',
    ],
    'auto_install': True,
}
