odoo.define('pos_cash_rounding.cash_rounding', function (require) {
    "use strict";

var models = require('point_of_sale.models');
var rpc = require('web.rpc');
var screens = require('point_of_sale.screens');
var utils = require('web.utils');

var round_pr = utils.round_precision;


models.load_models([{
    model: 'account.cash.rounding',
    fields: ['name', 'rounding', 'rounding_method'],
    domain: function(self){return [['id', '=', self.config.rounding_method[0]]]; },
    loaded: function(self, cash_rounding) {
        self.cash_rounding = cash_rounding;
    }
},
]);

var _super_order = models.Order.prototype;
models.Order = models.Order.extend({
    export_for_printing: function() {
      var result = _super_order.export_for_printing.apply(this,arguments);
      result.total_rounded = this.get_total_with_tax() + this.get_rounding_applied();
      result.rounding_applied = this.get_rounding_applied();
      return result;
    },
    get_due: function(paymentline) {
      var due  = _super_order.get_due.apply(this, arguments);
      due += this.get_rounding_applied();
      return round_pr(due, this.pos.currency.rounding);
    },
    get_change: function(paymentline) {
      var change  = _super_order.get_change.apply(this, arguments);
      if (change !== 0) {
          change -= this.get_rounding_applied();
      }
      return round_pr(change, this.pos.currency.rounding);
    },
    get_rounding_applied: function() {
        if(this.pos.config.cash_rounding) {
            var total = round_pr(this.get_total_with_tax(), this.pos.cash_rounding[0].rounding);

            var rounding_applied = total - (this.pos.config['iface_tax_included'] === "total"? this.get_subtotal(): this.get_total_with_tax());
            // because floor and ceil doesn't include decimals in calculation, we reuse the value of the half-up and adapt it.
            if(this.pos.cash_rounding[0].rounding_method === "UP" && rounding_applied < 0) {
                rounding_applied += this.pos.cash_rounding[0].rounding;
            }
            else if(this.pos.cash_rounding[0].rounding_method === "DOWN" && rounding_applied > 0){
                rounding_applied -= this.pos.cash_rounding[0].rounding;
            }
            return rounding_applied;
        }
        return 0;
    },
    has_not_valid_rounding: function() {
        if(!this.pos.config.cash_rounding)
            return false;

        var lines = this.paymentlines.models;

        for(var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if(!utils.float_is_zero(line.amount - round_pr(line.amount, this.pos.cash_rounding[0].rounding), 6))
                return line;
        }
        return false;
    },
});

var PaymentScreenWidget = screens.PaymentScreenWidget;
PaymentScreenWidget.include({
    order_is_valid: function(force_validation) {
        var order = this.pos.get_order();
        var res = this._super(force_validation);
        if (res) {
            if(order.has_not_valid_rounding()) {
                var line = order.has_not_valid_rounding();
                this.gui.show_popup('error',{
                        title: _t('Incorrect rounding'),
                        body:  _t('You have to round your payments lines.' + line.amount + ' is not rounded.'),
                    });
                return false;
            }
        }
        return res
    },

});





});
