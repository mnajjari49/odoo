# -*- encoding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError

fk_head_list = ['FK', 'KD_JENIS_TRANSAKSI', 'FG_PENGGANTI', 'NOMOR_FAKTUR', 'MASA_PAJAK', 'TAHUN_PAJAK', 'TANGGAL_FAKTUR', 'NPWP', 'NAMA', 'ALAMAT_LENGKAP', 'JUMLAH_DPP', 'JUMLAH_PPN', 'JUMLAH_PPNBM', 'ID_KETERANGAN_TAMBAHAN', 'FG_UANG_MUKA', 'UANG_MUKA_DPP', 'UANG_MUKA_PPN', 'UANG_MUKA_PPNBM', 'REFERENSI']

lt_head_list = ['LT', 'NPWP', 'NAMA', 'JALAN', 'BLOK', 'NOMOR', 'RT', 'RW', 'KECAMATAN', 'KELURAHAN', 'KABUPATEN', 'PROPINSI', 'KODE_POS', 'NOMOR_TELEPON']

of_head_list = ['OF', 'KODE_OBJEK', 'NAMA', 'HARGA_SATUAN', 'JUMLAH_BARANG', 'HARGA_TOTAL', 'DISKON', 'DPP', 'PPN', 'TARIF_PPNBM', 'PPNBM']


def _csv_row(data, delimiter=',', quote='"'):
    return quote + (quote + delimiter + quote).join([str(x).replace(quote, '\\' + quote) for x in data]) + quote + '\n'


class AccountMove(models.Model):
    _inherit = "account.move"

    l10n_id_efaktur_id = fields.Many2one('l10n_id_efaktur.efaktur', string="E-faktur", copy=False)
    l10n_id_tax_number = fields.Char(string="Tax Number", inverse='_inverse_tax_number', compute='_compute_tax_number', store=False, copy=False)
    l10n_id_replace_invoice_id = fields.Many2one('account.move', string="Replace Invoice",  domain="['|', '&', '&', ('state', '=', 'posted'), ('partner_id', '=', partner_id), ('reversal_move_id', '!=', False), ('state', '=', 'cancel')]", copy=False)
    l10n_id_upload_user = fields.Many2one('res.users', 'Upload User', readonly=True, copy=False)
    l10n_id_attachment_id = fields.Many2one('ir.attachment', readonly=True, copy=False)
    l10n_id_date_validated = fields.Datetime('Upload Date', readonly=True, copy=False)
    l10n_id_csv_created = fields.Boolean('CSV Created', compute='_compute_csv_created', copy=False)
    l10n_id_kode_transaksi = fields.Selection([
            ('01', '01 Kepada Pihak yang Bukan Pemungut PPN (Customer Biasa)'),
            ('02', '02 Kepada Pemungut Bendaharawan (Dinas Kepemerintahan)'),
            ('03', '03 Kepada Pemungut Selain Bendaharawan (BUMN)'),
            ('04', '04 DPP Nilai Lain (PPN 1%)'),
            ('06', '06 Penyerahan Lainnya (Turis Asing)'),
            ('07', '07 Penyerahan yang PPN-nya Tidak Dipungut (Kawasan Ekonomi Khusus/ Batam)'),
            ('08', '08 Penyerahan yang PPN-nya Dibebaskan (Impor Barang Tertentu)'),
            ('09', '09 Penyerahan Aktiva ( Pasal 16D UU PPN )'),
        ], string='Kode Transaksi', help='Dua digit pertama nomor pajak',
        track_visibility='onchange', readonly=True, states={'draft': [('readonly', False)]}, copy=False)
    l10n_id_need_kode_transaksi = fields.Boolean(compute='_compute_need_kode_transaksi')

    def _inverse_tax_number(self):
        for record in self:
            if record.type == 'in_invoice':
                if record.l10n_id_efaktur_id:
                    record.l10n_id_efaktur_id.name = record.l10n_id_tax_number
                elif record.l10n_id_tax_number:
                    self.env['l10n_id_efaktur.efaktur'].create({
                        'name': record.l10n_id_tax_number,
                        'invoice_id': [(6, 0, record.ids)],
                        'company_id': record.company_id.id,
                    })
            elif record.l10n_id_efaktur_id.name != record.l10n_id_tax_number:
                raise UserError(_("You can't change the number manually for a Customer Invoice"))

    @api.depends('l10n_id_efaktur_id')
    def _compute_tax_number(self):
        for record in self:
            record.l10n_id_tax_number = record.l10n_id_efaktur_id.name

    @api.depends('l10n_id_attachment_id')
    def _compute_csv_created(self):
        for record in self:
            record.l10n_id_csv_created = bool(record.l10n_id_attachment_id)

    @api.depends('partner_id', 'line_ids.tag_ids')
    def _compute_need_kode_transaksi(self):
        ppn_tag = self.env.ref('l10n_id.ppn_tag')
        for move in self:
            move.l10n_id_need_kode_transaksi = (ppn_tag.id in move.line_ids.tag_ids.ids) and move.partner_id.l10n_id_pkp and not move.l10n_id_efaktur_id and move.type == 'out_invoice'

    @api.constrains('l10n_id_kode_transaksi', 'line_ids')
    def _constraint_kode_ppn(self):
        ppn_tag = self.env.ref('l10n_id.ppn_tag')
        for move in self:
            if move.l10n_id_kode_transaksi == '08' and any(ppn_tag.id in line.tag_ids.ids for line in move.line_ids if line.exclude_from_invoice_tab is False):
                raise UserError(_('There shouldn\'t be PPN with this Kode Transaksi'))
            elif move.l10n_id_kode_transaksi != '08' and any(ppn_tag.id not in line.tag_ids.ids for line in move.line_ids if line.exclude_from_invoice_tab is False):
                raise UserError(_('All lines should have PPN with this Kode Transaksi'))

    def post(self):
        """Set E-Faktur number after validation."""
        for move in self:
            if move.l10n_id_need_kode_transaksi:
                if not move.l10n_id_kode_transaksi:
                    raise ValidationError(_('You need to put a Kode Transaksi for this partner.'))
                if move.l10n_id_replace_invoice_id.l10n_id_efaktur_id:
                    if not move.l10n_id_replace_invoice_id.l10n_id_date_validated:
                        raise ValidationError(_('Replacement invoice only for invoices on which e-faktur is validated'))
                    rep_efaktur_str = move.l10n_id_replace_invoice_id.l10n_id_efaktur_id.name
                    new_efaktur_str = '%s1%s' % (move.l10n_id_kode_transaksi, rep_efaktur_str[3:])
                    efaktur = self.env['l10n_id_efaktur.efaktur'].search([('name', '=', new_efaktur_str)]) or self.env['l10n_id_efaktur.efaktur'].create({
                        'name': new_efaktur_str,
                        'invoice_id': [(6, 0, move.ids)],
                        'company_id': move.company_id.id,
                    })
                    efaktur.invoice_id |= move

                else:
                    efaktur = self.env['l10n_id_efaktur.efaktur'].search([('invoice_id', '=', False), ('company_id', '=', move.company_id.id)], limit=1)
                    if not efaktur:
                        raise ValidationError(_('There is no Efaktur number available'))
                    efaktur.write({
                        'name': '%s0%s' % (str(move.l10n_id_kode_transaksi), str(efaktur.name)),
                        'invoice_id': [(6, 0, move.ids)],
                    })
        return super(AccountMove, self).post()

    def action_reverse(self):
        """Cancel or unlink E-Faktur."""
        res = super(AccountMove, self).action_reverse()
        if self.is_purchase_document() and self.l10n_id_efaktur_id:
            self.l10n_id_efaktur_id.sudo().unlink()
        return res

    def reset_efaktur(self):
        """Reset E-Faktur, so it can be use for other invoice."""
        for move in self:
            move.l10n_id_efaktur_id.write({
                'name': move.l10n_id_efaktur_id.name[3:],
                'invoice_id': [(6, 0, [])],
            })
            move.message_post(
                body='e-Faktur Reset: %s ' % (move.l10n_id_efaktur_id.name),
                subject="Reset Efaktur")
        return True

    def download_csv(self):
        action = {
            'type': 'ir.actions.act_url',
            'url': "web/content/?model=ir.attachment&id=" + str(self.l10n_id_attachment_id.id) + "&filename_field=name&field=datas&download=true&name=" + self.l10n_id_attachment_id.name,
            'target': 'self'
        }
        return action

    def download_efaktur(self):
        """Collect the data and execute function _generate_efaktur."""
        for record in self:
            if record.state == 'draft':
                raise ValidationError(_('Could not download E-faktur in draft state'))

            if record.partner_id.l10n_id_pkp and not record.l10n_id_efaktur_id:
                raise ValidationError(_('Connect ' + record.name + ' with E-faktur to download this report'))

        self._generate_efaktur(',')
        return self.download_csv()

    def _generate_efaktur_invoice(self, delimiter):
        """Generate E-Faktur for customer invoice."""
        # Invoice of Customer
        company_id = self.company_id
        dp_product_id = self.env['ir.config_parameter'].sudo().get_param('sale.default_deposit_product_id')

        output_head = '%s%s%s' % (
            _csv_row(fk_head_list, delimiter),
            _csv_row(lt_head_list, delimiter),
            _csv_row(of_head_list, delimiter),
        )

        for move in self.filtered(lambda m: m.state == 'posted'):
            eTax = move._prepare_etax()

            nik = str(move.partner_id.l10n_id_nik) if not move.partner_id.l10n_id_npwp else ''

            if move.l10n_id_replace_invoice_id:
                number_ref = str(move.l10n_id_replace_invoice_id.name) + " replaced by " + str(move.name) + " " + nik
            else:
                number_ref = str(move.name) + " " + nik

            street = ', '.join([x for x in (move.partner_id.street, move.partner_id.street2) if x])

            invoice_npwp = '000000000000000'
            if not move.partner_id.l10n_id_npwp:
                if move.partner_id.l10n_id_npwp and len(move.partner_id.l10n_id_npwp) >= 12:
                    invoice_npwp = move.partner_id.l10n_id_npwp
                elif (not move.partner_id.l10n_id_npwp or len(move.partner_id.l10n_id_npwp) < 12) and move.partner_id.l10n_id_nik:
                    invoice_npwp = move.partner_id.l10n_id_nik
                invoice_npwp = invoice_npwp.replace('.', '').replace('-', '')

            # Here all fields or columns based on eTax Invoice Third Party
            eTax['KD_JENIS_TRANSAKSI'] = move.l10n_id_efaktur_id.name[0:2] if move.l10n_id_efaktur_id else 0
            eTax['FG_PENGGANTI'] = move.l10n_id_efaktur_id.name[2] if move.l10n_id_efaktur_id else 0
            eTax['NOMOR_FAKTUR'] = move.l10n_id_efaktur_id.name[3:] if move.l10n_id_efaktur_id else 0
            eTax['MASA_PAJAK'] = move.invoice_date.month
            eTax['TAHUN_PAJAK'] = move.invoice_date.year
            eTax['TANGGAL_FAKTUR'] = '{0}/{1}/{2}'.format(move.invoice_date.day, move.invoice_date.month, move.invoice_date.year)
            eTax['NPWP'] = invoice_npwp
            eTax['NAMA'] = move.partner_id.name if eTax['NPWP'] == '000000000000000' else move.partner_id.l10n_id_tax_name or move.partner_id.name
            eTax['ALAMAT_LENGKAP'] = move.partner_id.contact_address.replace('\n', '') if eTax['NPWP'] == '000000000000000' else move.partner_id.l10n_id_tax_address or street
            eTax['JUMLAH_DPP'] = int(round(move.amount_untaxed, 0))
            eTax['JUMLAH_PPN'] = int(round(move.amount_tax, 0))
            eTax['ID_KETERANGAN_TAMBAHAN'] = '1' if move.l10n_id_kode_transaksi == '07' else ''
            eTax['REFERENSI'] = number_ref

            lines = move.line_ids.filtered(lambda x: x.product_id.id == int(dp_product_id) and x.price_unit < 0)
            eTax['FG_UANG_MUKA'] = len(lines)
            eTax['UANG_MUKA_DPP'] = abs(sum(lines.mapped('price_subtotal')))
            eTax['UANG_MUKA_PPN'] = abs(sum(lines.mapped(lambda l: l.price_total - l.price_subtotal)))

            company_npwp = company_id.partner_id.l10n_id_npwp or '000000000000000'

            fk_values_list = ['FK'] + [eTax[f] for f in fk_head_list[1:]]
            eTax['JALAN'] = company_id.partner_id.l10n_id_tax_address or company_id.partner_id.street
            eTax['NOMOR_TELEPON'] = company_id.phone

            lt_values_list = ['FAPR', company_npwp, company_id.name] + [eTax[f] for f in lt_head_list[3:]]

            output_head = '%s%s%s' % (
                output_head,
                _csv_row(fk_values_list, delimiter),
                _csv_row(lt_values_list, delimiter),
            )

            # HOW TO ADD 2 line to 1 line for free product
            free, sales, tax_status = [], [], {'included': False, 'excluded': False}

            ppn_tag = self.env.ref('l10n_id.ppn_tag')
            for line in move.line_ids.filtered(lambda l: ppn_tag in l.tag_ids):
                # *invoice_line_unit_price is price unit use for harga_satuan's column
                # *invoice_line_quantity is quantity use for jumlah_barang's column
                # *invoice_line_total_price is bruto price use for harga_total's column
                # *invoice_line_discount_m2m is discount price use for diskon's column
                # *line.price_subtotal is subtotal price use for dpp's column
                # *tax_line or free_tax_line is tax price use for ppn's column
                free_tax_line = tax_line = bruto_total = diff_bruto = diff_disc = total_discount = 0.0

                for tax in line.tax_ids:
                    if tax.amount > 0:
                        if tax.price_include:
                            tax_status.update({'included': True})
                        else:
                            tax_status.update({'excluded': True})

                        tax_line += line.price_subtotal * (tax.amount / 100.0)

                invoice_line_unit_price = line.price_unit

                invoice_line_total_price = invoice_line_unit_price * line.quantity

                line_dict = {
                    'KODE_OBJEK': line.product_id.default_code or '',
                    'NAMA': line.product_id.name or '',
                    'HARGA_SATUAN': invoice_line_unit_price,
                    'JUMLAH_BARANG': line.quantity,
                    'HARGA_TOTAL': invoice_line_total_price,
                    'DPP': line.price_subtotal,
                    'order_id': False, #line.sale_line_ids[0].order_id if line.sale_line_ids else False, TODO depend on sale?
                    'product_id': line.product_id.id,
                }

                if line.price_subtotal < 0:
                    for tax in line.tax_ids:
                        free_tax_line += (line.price_subtotal * (tax.amount / 100.0)) * -1.0

                    line_dict.update({
                        'DISKON': invoice_line_total_price - line.price_subtotal,
                        'PPN': free_tax_line,
                    })
                    free.append(line_dict)
                elif line.price_subtotal != 0.0:
                    if tax_status.get('included'):
                        invoice_line_discount_m2m = invoice_line_total_price - (line.price_subtotal + round(tax_line, 2))
                        if invoice_line_discount_m2m < 0:
                            invoice_line_discount_m2m = 0.0
                    else:
                        invoice_line_discount_m2m = invoice_line_total_price - line.price_subtotal

                    line_dict.update({
                        'DISKON': invoice_line_discount_m2m,
                        'PPN': tax_line,
                    })
                    sales.append(line_dict)

            sub_total_before_adjustment = sub_total_ppn_before_adjustment = 0.0

            # We are finding the product that has affected
            # by free product to adjustment the calculation
            # of discount and subtotal.
            # - the price total of free product will be
            # included as a discount to related of product.
            for sale in sales:
                for f in free:
                    if f['product_id'] == sale['product_id'] and f['order_id'] == sale['order_id']:
                        sale['DISKON'] = sale['DISKON'] - f['DISKON'] + f['PPN']
                        sale['DPP'] = sale['DPP'] + f['DPP']

                        tax_line = 0

                        for tax in line.tax_ids:
                            if tax.amount > 0:
                                tax_line += sale['DPP'] * (tax.amount / 100.0)

                        sale['PPN'] = tax_line

                        free.remove(f)

                sub_total_before_adjustment += sale['DPP']
                sub_total_ppn_before_adjustment += sale['PPN']
                bruto_total += sale['DISKON']
                total_discount += round(sale['DISKON'], 2)

            # We are collecting the list of DPP & PPN which has amount greather than 0.0
            # and will be accessing by pass index directly as @params.
            sales_by_subtotal = [index for (index, sale) in enumerate(sales) if sale["DPP"] > 0.0]
            sales_by_ppn = [index for (index, sale) in enumerate(sales) if sale["PPN"] > 0.0]

            first_ppn = sales[sales_by_ppn[0]]['PPN'] if sales_by_ppn else 0.0
            first_dpp = sales[sales_by_subtotal[0]]['DPP'] if sales_by_subtotal else 0.0

            first_bruto = sales[0]['HARGA_TOTAL']
            first_disc = round(sales[0]['DISKON'], 2)

            diff_dpp = eTax['JUMLAH_DPP'] - sub_total_before_adjustment
            diff_ppn = eTax['JUMLAH_PPN'] - sub_total_ppn_before_adjustment

            if tax_status.get('included') and tax_status.get('excluded'):
                if total_discount > 0.0:
                    warning_mess = {
                        'title': _('Warning Notification!'),
                        'message': _('There are Invoice Line have more tax type include and exclude : %s', (move.name))
                    }
                    return {'warning': warning_mess}
            elif tax_status.get('excluded'):
                if total_discount > 0.0:
                    diff_disc = (bruto_total - (eTax['JUMLAH_DPP'])) - total_discount
                    diff_bruto = eTax['JUMLAH_DPP'] - (bruto_total - total_discount)
                else:
                    diff_bruto = eTax['JUMLAH_DPP'] - bruto_total

                diff_bruto = abs(diff_bruto)
            elif tax_status.get('included'):
                diff_disc = 0.0
                diff_bruto = 0.0  # No Adjustment

            # Adjust Bruto, DPP, PPN and Discount column if there is differential due to Rounding.
            first_bruto += diff_bruto
            first_dpp += diff_dpp
            first_ppn += diff_ppn
            first_disc += diff_disc

            sales[0]['HARGA_TOTAL'] = first_bruto
            sales[0]['DISKON'] = first_disc
            sales[sales_by_subtotal[0] if sales_by_subtotal else 0]['DPP'] = first_dpp
            sales[sales_by_ppn[0] if sales_by_ppn else 0]['PPN'] = first_ppn

            for sale in sales:
                output_head_value_list = ['OF'] + [str(sale[f]) for f in of_head_list[1:-2]] + ['0', '0']
                output_head += _csv_row(output_head_value_list, delimiter)

        return output_head

    def _prepare_etax(self):
        # These values are never set
        return {'JUMLAH_PPNBM': 0, 'UANG_MUKA_PPNBM': 0, 'BLOK': '', 'NOMOR': '', 'RT': '', 'RW': '', 'KECAMATAN': '', 'KELURAHAN': '', 'KABUPATEN': '', 'PROPINSI': '', 'KODE_POS': '', 'JUMLAH_BARANG': 0, 'TARIF_PPNBM': 0, 'PPNBM': 0}

    def _generate_efaktur(self, delimiter):
        output_head = self.filtered(lambda x: x.l10n_id_need_kode_transaksi is True)._generate_efaktur_invoice(delimiter)
        my_utf8 = output_head.encode("utf-8")
        out = base64.b64encode(my_utf8)

        attachment = self.env['ir.attachment'].create({
            'datas': out,
            'name': 'efaktur_%s.csv' % str(self.id) if len(self.ids) == 1 else 'multi',
            'type': 'binary',
        })

        for record in self:
            record.message_post(attachment_ids=[attachment.id])
        self.l10n_id_attachment_id = attachment.id
