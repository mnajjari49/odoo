# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import tools
from odoo.addons.account.tests.common import AccountTestCommon
from odoo.tests import Form
from odoo.modules.module import get_resource_path


class TestProductMargin(AccountTestCommon):

    def create_account_invoice(self, invoice_type, partner, product, quantity=0.0, price_unit=0.0):
        """ Create an invoice as in a view by triggering its onchange methods"""

        invoice_form = Form(self.env['account.move'].with_context(default_type=invoice_type))
        invoice_form.partner_id = partner
        with invoice_form.invoice_line_ids.new() as line:
            line.product_id = product
            line.quantity = quantity
            line.price_unit = price_unit

        invoice = invoice_form.save()
        invoice.post()

    def test_product_margin(self):
        ''' In order to test the product_margin module '''

        supplier = self.env['res.partner'].create({'name': 'Supplier'})
        customer = self.env['res.partner'].create({'name': 'Customer'})
        ipad = self.env['product.product'].create({
            'name': 'Ipad',
            'standard_price': 500.0,
            'list_price': 750.0,
        })

        # Create supplier invoice and customer invoice to test product margin.
        # Define supplier invoices
        self.create_account_invoice('in_invoice', supplier, ipad, 10.0, 300.00)
        self.create_account_invoice('in_invoice', supplier, ipad, 4.0, 450.00)
        # Define Customer Invoices
        self.create_account_invoice('out_invoice', customer, ipad, 20.0, 750.00)
        self.create_account_invoice('out_invoice', customer, ipad, 10.0, 550.00)

        result = ipad._compute_product_margin_fields_values()

        # Sale turnover ( Quantity * Price Subtotal / Quantity)
        sale_turnover = ((20.0 * 750.00) + (10.0 * 550.00))
        self.assertEqual(result[ipad.id]['turnover'], sale_turnover, "Wrong Turnover.")

        # Expected sale (Total quantity * Sale price)
        sale_expected = (750.00 * 30.0)
        self.assertEqual(result[ipad.id]['sale_expected'], sale_expected, "Wrong Sale expected.")

        # Purchase total cost (Quantity * Unit price)
        purchase_total_cost = ((10.0 * 300.00) + (4.0 * 450.00))
        self.assertEqual(result[ipad.id]['total_cost'], purchase_total_cost, "Wrong Total Cost.")

        # Purchase normal cost ( Total quantity * Cost price)
        purchase_normal_cost = (14.0 * 500.00)
        self.assertEqual(result[ipad.id]['normal_cost'], purchase_normal_cost, "Wrong Normal Cost.")

        total_margin = sale_turnover - purchase_total_cost
        expected_margin = sale_expected - purchase_normal_cost

        # Check total margin
        self.assertEqual(result[ipad.id]['total_margin'], total_margin, "Wrong Total Margin.")

        # Check expected margin
        self.assertEqual(result[ipad.id]['expected_margin'], expected_margin, "Wrong Expected Margin.")
