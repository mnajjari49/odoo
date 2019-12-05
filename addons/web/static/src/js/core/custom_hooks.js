odoo.define('web.custom_hooks', function (require) {
    "use strict";

    const { Component, hooks } = owl;
    const { onMounted, onWillUnmount } = hooks;

    function useExternalListener(target, eventName, handler) {
        const boundHandler = handler.bind(Component.current);

        onMounted(() => target.addEventListener(eventName, boundHandler));
        onWillUnmount(() => target.removeEventListener(eventName, boundHandler));
    }

    return {
        useExternalListener,
    };
});