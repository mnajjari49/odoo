# -*- encoding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime
from odoo import api, models


class UploadEfakturWizard(models.TransientModel):
    _name = "upload.efaktur.wizard"
    _description = "Upload E-faktur Wizard"

    def upload_efaktur(self):
        """Mark as uploaded E-Faktur."""
        active_ids = self.env.context.get('active_ids')
        move_ids = self.env['account.move'].browse(active_ids)
        for move in move_ids:
            if move.l10n_id_efaktur_id and move.l10n_id_attachment_id and not move.l10n_id_date_validated:
                move.write({
                    'l10n_id_date_validated': datetime.now(),
                    'l10n_id_upload_user': self.env.user.id,
                })
