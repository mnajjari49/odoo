odoo.define('website_sale.utils', function (require) {
'use strict';

/**
 * Gets the element in the navbar currently displayed.
 * Depending on the scroll position, it could either be the one in the main
 * top bar or the one in the affixed navbar.
 *
 * @private
 * @param {string} selector
 * @returns {jQuery}
 */
function getNavBarButton(selector) {
    var $affixedHeaderButton = $('header.affixed ' + selector);
    if ($affixedHeaderButton.length) {
        return $affixedHeaderButton;
    } else {
        return $('header ' + selector).first();
    }
}

function animateClone($cart, $elem, offsetTop, offsetLeft) {
    $cart.find('.o_animate_blink').addClass('o_red_highlight o_shadow_animation').delay(500).queue(function () {
        $(this).removeClass("o_shadow_animation").dequeue();
    }).delay(2000).queue(function () {
        $(this).removeClass("o_red_highlight").dequeue();
    });
    var $imgtodrag = $elem.find('img').eq(0);
    return new Promise(function (resolve, reject) {
        if ($imgtodrag.length) {
            var $imgclone = $imgtodrag.clone()
                .css('z-index', 1050) // Get over header which is 1030
                .offset({
                    top: $imgtodrag.offset().top,
                    left: $imgtodrag.offset().left
                })
                .addClass('o_website_sale_animate')
                .appendTo(document.body)
                .animate({
                    top: $cart.offset().top + offsetTop,
                    left: $cart.offset().left + offsetLeft,
                    width: 75,
                    height: 75,
                }, 1000, 'easeInOutExpo');

            $imgclone.animate({
                width: 0,
                height: 0,
            }, function () {
                $(this).detach();
                resolve();
            });
        } else {
            resolve();
        }
    });
}

/**
 * @param {Object} data
 */
function updateCartNavBar(data) {
    var $q = $(".my_cart_quantity");
    $q.parents('li:first').removeClass('d-none');
    $q.html(data.cart_quantity).hide().fadeIn(600);
    $(".js_cart_lines").first().before(data['website_sale.cart_lines']).end().remove();
    $(".js_cart_summary").first().before(data['website_sale.short_cart_summary']).end().remove();
}

return {
    animateClone: animateClone,
    getNavBarButton: getNavBarButton,
    updateCartNavBar: updateCartNavBar,
};
});
