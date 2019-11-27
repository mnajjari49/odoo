# -*- coding: utf-8 -*-

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError
import re


class SequenceMixin(models.AbstractModel):
    """Mechanism used to have an editable sequence number.

    Be careful of how you use this regarding the prefixes. More info in the
    docstring of _get_previous_sequence.
    """

    _name = 'sequence.mixin'
    _description = "Automatic sequence"

    def _get_previous_sequence_domain(self, relaxed=False):
        """Get the sql domain to retreive the previous sequence number.

        This function should be overriden by models heriting from this mixin.

        :param relaxed: see _get_previous_sequence.

        :return where_string: the entire SQL WHERE clause as a string.
        :return param: the dictionary containing the parameters to substitute
            at the execution of the query.
        """
        self.ensure_one()
        return "", {}

    def _get_starting_sequence(self):
        """Get a default sequence number.

        This function should be overriden by models heriting from this mixin
        This number will be incremented so you probably want to start the sequence at 0.

        :return: the default sequence
        """
        self.ensure_one()
        return "00000000"

    def _get_previous_sequence(self, field_name, relaxed=False):
        """Retrieve the previous sequence.

        This is done by taking the number with the greatest alphabetical value within
        the domain of _get_previous_sequence_domain. This means that the prefix has a
        huge importance.
        For instance, if you have INV/2019/0001 and INV/2019/0002, when you rename the
        last one to FACT/2019/0001, one might expect the next number to be
        FACT/2019/0002 be it will be INV/2019/0002 (again) because INV > FACT.
        Therefore, you will never be able to rename it in that journal, except when the
        domain makes a new number start (start of a new year fo instance). In that case,
        the system will only see that new number for the next number of the same domain.

        :param field_name: the field that contains the sequence.
        :param relaxed: this should be set to True when a previous request didn't find
            something without. This allows to find a pattern from a previous period, and
            try to adapt it for the new period.

        :return: the string of the previous sequence or None if there wasn't any.
        """
        self.ensure_one()
        if field_name not in self._fields or not self._fields[field_name].store:
            raise ValidationError(_('%s is not a stored field') % field_name)
        where_string, param = self._get_previous_sequence_domain(relaxed)
        if self.id or self.id.origin:
            where_string += " AND id != %(id)s "
            param['id'] = self.id or self.id.origin
        query = "SELECT {field} FROM {table} {where_string} ORDER BY {field} DESC LIMIT 1 FOR UPDATE".format(table=self._table, where_string=where_string, field=field_name)
        self.flush([field_name])
        self.env.cr.execute(query, param)
        return (self.env.cr.fetchone() or [None])[0]

    def _set_next_sequence(self, field_name):
        """Set the next sequence.

        This method ensures that the field is set both in the ORM and in the database.
        This is necessary because we use a database query to get the previous sequence,
        and we need that query to always be executed on the latest data.

        :param field_name: the field that contains the sequence.
        """
        self.ensure_one()
        last_sequence = self._get_previous_sequence(field_name) or self._get_starting_sequence()

        sequence = re.match(r'(?P<prefix>.*?)(?P<seq>\d*)$', last_sequence)
        value = ("{prefix}{seq:0%sd}" % len(sequence.group('seq'))).format(
            prefix=sequence.group('prefix'),
            seq=int(sequence.group('seq') or 0) + 1,
        )
        self[field_name] = value
        self.flush([field_name])
