# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import pytz
from typing import Iterator, Mapping
from collections import abc
from dateutil.parser import parse
from dateutil.relativedelta import relativedelta


from odoo import _


class GoogleEvent(abc.Set):

    def __init__(self, iterable=[]):
        self._events = {}
        for item in iterable:
            if isinstance(item, self.__class__):
                self._events[item.id] = item._events[item.id]
            elif isinstance(item, Mapping):
                self._events[item.get('id')] = item
            else:
                raise ValueError("Only %s or iterable of dict are supported" % self.__class__.__name__)

    def __iter__(self) ->  Iterator['GoogleEvent']:
        return iter(GoogleEvent([vals]) for vals in self._events.values())

    def __contains__(self, google_event):
        return google_event.id in self._events

    def __len__(self):
        return len(self._events)

    def __bool__(self):
        return bool(self._events)

    def __getattr__(self, name):
        self.ensure_one()
        event_id = list(self._events.keys())[0]
        return self._events[event_id].get(name)

    def __repr__(self):
        return '%s%s' % (self.__class__.__name__, self.ids)

    @property
    def ids(self):
        return tuple(e.id for e in self)

    @property
    def rrule(self):
        if self.recurrence and 'RRULE:' in self.recurrence[0]:  # LUL TODO what if there are something else in the list?
            return self.recurrence[0][6:]  # skip "RRULE:" in the rrule string

    def odoo_id(self, env):
        properties = self.extendedProperties and self.extendedProperties.get('shared', {}) or {}
        odoo_id = properties.get('%s_odoo_id' % env.cr.dbname)
        if odoo_id:
            return int(odoo_id)
        elif self.exists(env):
            return self._get_model(env)._from_google_ids(self.ids).id

    def odoo_ids(self, env):
        self._get_model(env)  # Check model consitencies
        o_ids = self.map(lambda e: e.odoo_id(env))
        return tuple(odoo_id for odoo_id in o_ids if odoo_id)

    # LUL TODO rename this.
    # This adds noise when grepping "def ensure_one", expecting to find the one from models.py
    def ensure_one(self):
        try:
            event, = self._events.keys()
            return self
        except ValueError:
            raise ValueError("Expected singleton: %s" % self)

    def map(self, func):
        return tuple(func(e) for e in self)

    def filter(self, func) -> 'GoogleEvent':
        return GoogleEvent(e for e in self if func(e))

    def is_recurrence(self):
        return bool(self.recurrence)

    def is_recurrent(self):
        return bool(self.recurringEventId or self.is_recurrence())

    def is_cancelled(self):
        self.ensure_one()
        return bool(self.cancelled())

    def is_recurrence_outlier(self):
        return bool(self.originalStartTime)

    def cancelled(self):
        return self.filter(lambda e: e.status == 'cancelled')

    def exists(self, env) -> 'GoogleEvent':
        recurrences = self.filter(GoogleEvent.is_recurrence)
        events = self - recurrences
        existing_ids = env['calendar.event']._from_google_ids(tuple(e.id for e in events)).mapped('google_id')
        existing_ids += env['calendar.recurrence.rule']._from_google_ids(tuple(e.id for e in recurrences)).mapped('google_id')
        return self.filter(lambda e: e.id in existing_ids)

    def _get_model(self, env):
        if all(self.map(GoogleEvent.is_recurrence)):
            return env['calendar.recurrence.rule']
        elif all(self.map(lambda e: not e.is_recurrence())):
            return env['calendar.event']
        raise TypeError("Mixing Google events and Google recurrences")