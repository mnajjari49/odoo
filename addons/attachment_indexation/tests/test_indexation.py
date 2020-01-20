# -*- coding: utf-8 -*-

from odoo.tests.common import TransactionCase
import os

directory = os.path.dirname(__file__)


class TestCaseIndexation(TransactionCase):

    def test_attachment_pdf_indexation(self):
        with open(os.path.join(directory, 'files', 'testContent.pdf'), 'rb') as file:
            pdf = file.read()
            text = self.env['ir.attachment']._index(pdf, 'application/pdf')
            self.assertEqual(text, 'TestContent!!\x0c', 'the index content should be correct')
