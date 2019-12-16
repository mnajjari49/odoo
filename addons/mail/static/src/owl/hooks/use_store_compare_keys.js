odoo.define('mail.hooks.useStoreCompareKeys', function (require) {
'use strict';

const { useStore } = owl.hooks;

/**
 * Returns a function comparing whether two values are the same, which is just
 * calling `isEqual` on primitive values and objects, but which also works for
 * Owl Proxy in a temporal way: the current result of hashFn is compared to the
 * previous result of hashFn (from the last time the function was called).
 *
 * It means that when this function is given Proxy the first call will always
 * return false, and consecutive calls will not lead to the same result:
 * it returns true the first time after a change happended inside the Proxy, and
 * then always returns false until a new change is made.
 */
function proxyComparator(hashFn, isEqual) {
    /**
     * It is important to locally save the old `revNumber` of each resulting
     * value because when the "old" and "new" values are the same proxy it is
     * impossible to compare them based on their current value (since it was
     * updated in "both" due to the fact it is a proxy in the first place).
     *
     * And if the values are not proxy, `revNumber` will be 0 and the `isEqual`
     * will be used to compare them.
     */
    let oldRevNumber;

    function compare(a, b) {
        let ok = true;
        const newRevNumber = hashFn(b);
        if (a === b && newRevNumber > 0) {
            ok = oldRevNumber === newRevNumber;
        } else {
            ok = isEqual(a, b);
        }
        oldRevNumber = newRevNumber;
        return ok;
    }

    return compare;
}

/**
 * @see proxyComparator, but instead of comparing the given values, it compares
 * their respective keys, with `compareDepth` level of depth.
 * 0 = compare key, 1 = also compare subkeys, ...
 *
 * This assumes the given values are objects or arrays.
 */
function proxyComparatorDeep(hashFn, isEqual, compareDepth = 0) {
    const comparator = proxyComparator(hashFn, isEqual);
    const comparators = {};

    function compare(a, b) {
        // If a and b are (the same) proxy, it is already managing the depth
        // by itself, and a simple comparator can be used.
        if (a === b && hashFn(b) > 0) {
            return comparator(a, b);
        }
        let ok = true;
        const newKeys = Object.keys(b);
        if (Object.keys(a).length !== newKeys.length) {
            ok = false;
        }
        for (const key of newKeys) {
            // the depth can be given either as a number (for all keys) or as
            // an object (for each key)
            const depth = typeof compareDepth === 'number' ? compareDepth : compareDepth[key];
            if (!(key in comparators)) {
                if (depth > 0) {
                    comparators[key] = proxyComparatorDeep(hashFn, isEqual, depth - 1);
                } else {
                    comparators[key] = proxyComparator(hashFn, isEqual);
                }
            }
            // It is important to not break too early, the comparator has to
            // be called for every key to remember their current states.
            if (!comparators[key](a[key], b[key])) {
                ok = false;
            }
        }
        return ok;
    }

    return compare;
}

/**
 * Similar to useStore but to decide if a new render has to be done it compares
 * the keys on the result, with an optional level of depth for each key, given
 * as options `compareDepth`.
 *
 * It assumes that the result of the selector is always an object (or array).
 */
function useStoreCompareKeys(selector, options = {}) {
    const store = options.store || owl.Component.current.env.store;
    const hashFn = store.observer.revNumber.bind(store.observer);
    const isEqual = options.isEqual || ((a, b) => a === b);
    const compareDepth = options.compareDepth || {};

    return useStore(selector, Object.assign({}, options, {
        isEqual: proxyComparatorDeep(hashFn, isEqual, compareDepth),
    }));
}

return { proxyComparator, proxyComparatorDeep, useStoreCompareKeys };

});
