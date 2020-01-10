# -*- coding: utf-8 -*-
{
    'name': "qr_code_sepa", #TODO OCO ou base_qr_code_sepa (il y a bien base_iban)

    'description': """
        TODO OCO SEPA qr codes
    """,

    # Categories can be used to filter modules in modules listing
    # Check https://github.com/odoo/odoo/blob/13.0/odoo/addons/base/data/ir_module_category_data.xml
    # for the full list
    'category': 'Uncategorized', #TODO OCO
    'version': '0.1',

    # any module necessary for this one to work correctly
    'depends': ['base'],

    # always loaded
    'data': [ #TODO OCO
        'views/views.xml',
        'views/templates.xml',
    ],

    'auto_install': True,
}
