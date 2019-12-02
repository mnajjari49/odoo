# -*- encoding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Indonesia E-faktur',
    'version': '1.0',
    'description': """
        E-Faktur Menu(Indonesia)
        Format : 010.000-16.00000001
        * 2 (dua) digit pertama adalah Kode Transaksi
        * 1 (satu) digit berikutnya adalah Kode Status
        * 3 (tiga) digit berikutnya adalah Kode Cabang
        * 2 (dua) digit pertama adalah Tahun Penerbitan
        * 8 (delapan) digit berikutnya adalah Nomor Urut
    """,
    'category': 'Accounting',
    'depends': ['l10n_id'],
    'data': [
            'security/ir.model.access.csv',
            'views/account_move_views.xml',
            'views/efaktur_views.xml',
            'views/res_config_settings_views.xml',
            'views/res_partner_views.xml',
            'wizard/reexport_taxnumber_views.xml',
            'wizard/upload_efaktur_views.xml',
    ],
    'demo': [],
    'installable': True,
    'auto_install': True,
    'license': 'OEEL-1',
}
