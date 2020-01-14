odoo.define('web.controlPanelParameters', function (require) {
    "use strict";

    const { _lt } = require('web.core');

    // Filter menu parameters
    const DEFAULT_PERIOD = 'this_month';
    const PERIOD_OPTIONS = [
        { description: _lt('Last 7 Days'), optionId: 'last_7_days', groupNumber: 1 },
        { description: _lt('Last 30 Days'), optionId: 'last_30_days', groupNumber: 1 },
        { description: _lt('Last 365 Days'), optionId: 'last_365_days', groupNumber: 1 },
        { description: _lt('Last 5 Years'), optionId: 'last_5_years', groupNumber: 1 },
        { description: _lt('Today'), optionId: 'today', groupNumber: 2 },
        { description: _lt('This Week'), optionId: 'this_week', groupNumber: 2 },
        { description: _lt('This Month'), optionId: 'this_month', groupNumber: 2 },
        { description: _lt('This Quarter'), optionId: 'this_quarter', groupNumber: 2 },
        { description: _lt('This Year'), optionId: 'this_year', groupNumber: 2 },
        { description: _lt('Yesterday'), optionId: 'yesterday', groupNumber: 3 },
        { description: _lt('Last Week'), optionId: 'last_week', groupNumber: 3 },
        { description: _lt('Last Month'), optionId: 'last_month', groupNumber: 3 },
        { description: _lt('Last Quarter'), optionId: 'last_quarter', groupNumber: 3 },
        { description: _lt('Last Year'), optionId: 'last_year', groupNumber: 3 },
    ];
    const FIELD_OPERATORS = {
        boolean: [
            { symbol: "=", text: _lt("is true"), value: true },
            { symbol: "!=", text: _lt("is false"), value: true },
        ],
        char: [
            { symbol: "ilike", text:_lt("contains") },
            { symbol: "not ilike", text: _lt("doesn't contain") },
            { symbol: "=", text: _lt("is equal to") },
            { symbol: "!=", text: _lt("is not equal to") },
            { symbol: "!=", text: _lt("is set"), value: false },
            { symbol: "=", text: _lt("is not set"), value: false },
        ],
        date: [
            { symbol: "=", text: _lt("is equal to") },
            { symbol: "!=", text: _lt("is not equal to") },
            { symbol: ">", text: _lt("is after") },
            { symbol: "<", text: _lt("is before") },
            { symbol: ">=", text: _lt("is after or equal to") },
            { symbol: "<=", text: _lt("is before or equal to") },
            { symbol: "between", text: _lt("is between") },
            { symbol: "!=", text: _lt("is set"), value: false },
            { symbol: "=", text: _lt("is not set"), value: false },
        ],
        datetime: [
            { symbol: "between", text: _lt("is between") },
            { symbol: "=", text: _lt("is equal to") },
            { symbol: "!=", text: _lt("is not equal to") },
            { symbol: ">", text: _lt("is after") },
            { symbol: "<", text: _lt("is before") },
            { symbol: ">=", text: _lt("is after or equal to") },
            { symbol: "<=", text: _lt("is before or equal to") },
            { symbol: "!=", text: _lt("is set"), value: false },
            { symbol: "=", text: _lt("is not set"), value: false },
        ],
        id: [
            { symbol: "=", text:_lt("is")},
        ],
        number: [
            { symbol: "=", text: _lt("is equal to") },
            { symbol: "!=", text: _lt("is not equal to") },
            { symbol: ">", text: _lt("greater than") },
            { symbol: "<", text: _lt("less than") },
            { symbol: ">=", text: _lt("greater than or equal to") },
            { symbol: "<=", text: _lt("less than or equal to") },
            { symbol: "!=", text: _lt("is set"), value: false },
            { symbol: "=", text: _lt("is not set"), value: false },
        ],
        selection: [
            { symbol: "=", text:_lt("is")},
            { symbol: "!=", text: _lt("is not") },
            { symbol: "!=", text: _lt("is set"), value: false },
            { symbol: "=", text: _lt("is not set"), value: false },
        ],
    };
    const FIELD_TYPES = {
        boolean: 'boolean',
        char: 'char',
        date: 'date',
        datetime: 'datetime',
        float: 'number',
        id: 'id',
        integer: 'number',
        many2many: 'char',
        many2one: 'char',
        monetary: 'number',
        one2many: 'char',
        text: 'char',
        selection: 'selection',
    };
    const MONTH_OPTIONS = {
        this_month: { optionId: 'this_month', groupNumber: 1, format: 'MMMM', addParam: {}, setParam: {}, granularity: 'month' },
        last_month: { optionId: 'last_month', groupNumber: 1, format: 'MMMM', addParam: { months: -1 }, setParam: {}, granularity: 'month' },
        antepenultimate_month: { optionId: 'antepenultimate_month', groupNumber: 1, format: 'MMMM', addParam: { months: -2 }, setParam: {}, granularity: 'month' },
    };
    const QUARTER_OPTIONS = {
        fourth_quarter: { optionId: 'fourth_quarter', groupNumber: 1, description: "Q4", addParam: {}, setParam: { quarter: 4 }, granularity: 'quarter' },
        third_quarter: { optionId: 'third_quarter', groupNumber: 1, description: "Q3", addParam: {}, setParam: { quarter: 3 }, granularity: 'quarter' },
        second_quarter: { optionId: 'second_quarter', groupNumber: 1, description: "Q2", addParam: {}, setParam: { quarter: 2 }, granularity: 'quarter' },
        first_quarter: { optionId: 'first_quarter', groupNumber: 1, description: "Q1", addParam: {}, setParam: { quarter: 1 }, granularity: 'quarter' },
    };
    const YEAR_OPTIONS = {
        this_year: { optionId: 'this_year', groupNumber: 2, format: 'YYYY', addParam: {}, setParam: {}, granularity: 'year' },
        last_year: { optionId: 'last_year', groupNumber: 2, format: 'YYYY', addParam: { years: -1 }, setParam: {}, granularity: 'year' },
        antepenultimate_year: { optionId: 'antepenultimate_year', groupNumber: 2, format: 'YYYY', addParam: { years: -2 }, setParam: {}, granularity: 'year' },
    };
    const OPTION_GENERATORS = Object.assign({}, MONTH_OPTIONS, QUARTER_OPTIONS, YEAR_OPTIONS);
    const DEFAULT_YEAR = 'this_year';

    // GroupBy menu parameters
    const GROUPABLE_TYPES = ['many2one', 'char', 'boolean', 'selection', 'date', 'datetime', 'integer'];
    const DEFAULT_INTERVAL = 'month';
    const INTERVAL_OPTIONS = [
        { description: _lt('Year'), optionId: 'year', groupNumber: 1 },
        { description: _lt('Quarter'), optionId: 'quarter', groupNumber: 1 },
        { description: _lt('Month'), optionId: 'month', groupNumber: 1 },
        { description: _lt('Week'), optionId: 'week', groupNumber: 1 },
        { description: _lt('Day'), optionId: 'day', groupNumber: 1 },
    ];

    // TimeRange menu parameters
    const DEFAULT_TIMERANGE = DEFAULT_PERIOD;
    const TIME_RANGE_OPTIONS = {
        last_7_days: { description: 'Last 7 Days', id: 'last_7_days', groupNumber: 1 },
        last_30_days: { description: 'Last 30 Days', id: 'last_30_days', groupNumber: 1 },
        last_365_days: { description: 'Last 365 Days', id: 'last_365_days', groupNumber: 1 },
        last_5_years: { description: 'Last 5 Years', id: 'last_5_years', groupNumber: 1 },
        today: { description: 'Today', id: 'today', groupNumber: 2 },
        this_week: { description: 'This Week', id: 'this_week', groupNumber: 2 },
        this_month: { description: 'This Month', id: 'this_month', groupNumber: 2 },
        this_quarter: { description: 'This Quarter', id: 'this_quarter', groupNumber: 2 },
        this_year: { description: 'This Year', id: 'this_year', groupNumber: 2 },
        yesterday: { description: 'Yesterday', id: 'yesterday', groupNumber: 3 },
        last_week: { description: 'Last Week', id: 'last_week', groupNumber: 3 },
        last_month: { description: 'Last Month', id: 'last_month', groupNumber: 3 },
        last_quarter: { description: 'Last Quarter', id: 'last_quarter', groupNumber: 3 },
        last_year: { description: 'Last Year', id: 'last_year', groupNumber: 3 },
    };
    const DEFAULT_COMPARISON_TIME_RANGE = 'previous_period';
    const COMPARISON_TIME_RANGE_OPTIONS = {
        previous_period: { description: 'Previous Period', id: 'previous_period' },
        previous_year: { description: 'Previous Year', id: 'previous_year' },
    };

    return {
        COMPARISON_TIME_RANGE_OPTIONS,
        DEFAULT_INTERVAL,
        DEFAULT_PERIOD,
        DEFAULT_TIMERANGE,
        DEFAULT_COMPARISON_TIME_RANGE,
        DEFAULT_YEAR,
        FIELD_OPERATORS,
        FIELD_TYPES,
        GROUPABLE_TYPES,
        INTERVAL_OPTIONS,
        OPTION_GENERATORS,
        PERIOD_OPTIONS,
        TIME_RANGE_OPTIONS,
        YEAR_OPTIONS,
    };
});
