odoo.define('mail.hooks.useStoreCompareKeysTests', function (require) {
'use strict';

const { proxyComparator, proxyComparatorDeep, useStoreCompareKeys } = require('mail.hooks.useStoreCompareKeys');

const { Component, QWeb, Store } = owl;
const { xml } = owl.tags;

const {
    beforeEach: utilsBeforeEach,
    afterEach: utilsAfterEach,
    afterNextRender,
    nextAnimationFrame,
} = require('mail.messagingTestUtils');

QUnit.module('mail.messaging', {}, function () {
QUnit.module('hooks', {}, function () {
QUnit.module('useStoreCompareKeysTests', {
    beforeEach() {
        utilsBeforeEach(this);
        const qweb = new QWeb();
        this.env = { qweb };
        this.start = () => {
            this.store = new Store({
                env: this.env,
                state: {
                    obj: {
                        a: 1,
                        b: 2,
                        c: 3,
                    },
                },
            });
            this.env.store = this.store;
            this.hashFn = this.store.observer.revNumber.bind(this.store.observer);
            this.isEqual = (a, b) => a === b;
        };
    },
    afterEach() {
        utilsAfterEach(this);
        this.env = undefined;
        this.store = undefined;
        this.hashFn = undefined;
        this.isEqual = undefined;
    }
});

QUnit.test("proxyComparator when strict equal", async function (assert) {
    assert.expect(6);
    this.start();
    const comparator = proxyComparator(this.hashFn, this.isEqual);
    assert.ok(comparator(1, 1));
    assert.ok(comparator('a', 'a'));
    assert.notOk(comparator('a', 'b'));
    assert.notOk(comparator('1', 1));
    const a = {};
    assert.ok(comparator(a, a));
    assert.notOk(comparator(a, {}));
});

QUnit.test("proxyComparator on store proxy: temporal comparison", async function (assert) {
    assert.expect(7);
    this.start();
    const comparator = proxyComparator(this.hashFn, this.isEqual);
    const obj = this.store.state.obj;
    assert.notOk(comparator(obj, obj), 'initial state of proxy, always different');
    assert.ok(comparator(obj, obj), 'unchanged proxy');
    obj.a = 2;
    assert.notOk(comparator(obj, obj), 'updated proxy after primitive set');
    assert.ok(comparator(obj, obj), 'unchanged proxy after primitive set');
    obj.array = [];
    assert.notOk(comparator(obj, obj), 'updated proxy after add key');
    obj.array.push(1);
    assert.notOk(comparator(obj, obj), 'updated proxy after array push');
    assert.ok(comparator(obj, obj), 'unchanged proxy after array push');
});

QUnit.test("proxyComparatorDeep when strict equal, depth 0", async function (assert) {
    assert.expect(5);
    this.start();
    const comparator = proxyComparatorDeep(this.hashFn, this.isEqual, 0);
    assert.ok(comparator({}, {}));
    assert.ok(comparator({ a: 1 }, { a: 1 }));
    assert.ok(comparator({ a: 'a' }, { a: 'a' }));
    assert.notOk(comparator({ a: 'a' }, { a: 'b' }));
    assert.notOk(comparator({ a: '1' }, { a: 1 }));
});

QUnit.test("proxyComparatorDeep when strict equal, depth 1", async function (assert) {
    assert.expect(2);
    this.start();
    const comparator = proxyComparatorDeep(this.hashFn, this.isEqual, 1);
    assert.ok(comparator({ a: { b: 1 } }, { a: { b: 1 } }));
    assert.notOk(comparator({ a: { b: 1 } }, { a: { c: 1 } }));
});

QUnit.test("proxyComparatorDeep on store proxy: temporal comparison, depth 0", async function (assert) {
    assert.expect(7);
    this.start();
    const comparator = proxyComparatorDeep(this.hashFn, this.isEqual, 0);
    const obj = this.store.state.obj;
    assert.notOk(comparator(obj, obj), 'initial state of proxy, always different');
    assert.ok(comparator(obj, obj), 'unchanged proxy');
    obj.a = 2;
    assert.notOk(comparator(obj, obj), 'updated proxy after primitive set');
    assert.ok(comparator(obj, obj), 'unchanged proxy after primitive set');
    obj.array = [];
    assert.notOk(comparator(obj, obj), 'updated proxy after add key');
    obj.array.push(1);
    assert.notOk(comparator(obj, obj), 'updated proxy after array push');
    assert.ok(comparator(obj, obj), 'unchanged proxy after array push');
});

QUnit.test("proxyComparatorDeep on store proxy: temporal comparison, depth 1", async function (assert) {
    // this is exactly the same as depth 0 because the proxy is managing the depth
    assert.expect(7);
    this.start();
    const comparator = proxyComparatorDeep(this.hashFn, this.isEqual, 1);
    const obj = this.store.state.obj;
    assert.notOk(comparator(obj, obj), 'initial state of proxy, always different');
    assert.ok(comparator(obj, obj), 'unchanged proxy');
    obj.a = 2;
    assert.notOk(comparator(obj, obj), 'updated proxy after primitive set');
    assert.ok(comparator(obj, obj), 'unchanged proxy after primitive set');
    obj.c = [];
    assert.notOk(comparator(obj, obj), 'updated proxy after add key');
    obj.c.push(1);
    assert.notOk(comparator(obj, obj), 'updated proxy after array push');
    assert.ok(comparator(obj, obj), 'unchanged proxy after array push');
});

QUnit.test("proxyComparatorDeep combined: real use case", async function (assert) {
    assert.expect(12);
    this.start();
    const comparator = proxyComparatorDeep(this.hashFn, this.isEqual, {
        array: 1,
    });
    const obj = this.store.state.obj;
    assert.notOk(comparator({ a: obj }, { a: obj }), 'initial state of proxy, always different');
    assert.ok(comparator({ a: obj }, { a: obj }), 'unchanged proxy');
    obj.a = 2;
    assert.notOk(comparator(obj, obj), 'updated proxy after primitive set');
    assert.ok(comparator(obj, obj), 'unchanged proxy after primitive set');

    obj.subObj1 = {};
    obj.subObj2 = {};
    assert.notOk(comparator({ array: [obj] }, { array: [obj] }), 'depth 1, initial state of proxy, always different');
    assert.ok(comparator({ array: [obj] }, { array: [obj] }), 'depth 1, unchanged proxy');
    assert.notOk(comparator({ array: [obj.subObj1] }, { array: [obj.subObj2] }), 'depth 1, changed array content');
    assert.notOk(comparator({ array: [obj.subObj1] }, { array: [obj.subObj2] }), 'depth 1, still different objects');
    assert.notOk(comparator({ array: [obj.subObj1] }, { array: [obj.subObj2, obj.subObj1] }), 'depth 1, changed length');
    assert.notOk(comparator({ array: [obj.subObj1, obj.subObj2] }, { array: [obj.subObj2, obj.subObj1] }), 'depth 1, wrong order');

    const comparator2 = proxyComparatorDeep(this.hashFn, this.isEqual, {
        array: 2,
    });
    assert.ok(comparator2({ array: [obj.subObj1] }, { array: [obj.subObj2] }), 'depth 2, comparing objects keys');
    assert.ok(comparator2({ array: [obj.subObj2] }, { array: [obj.subObj1] }), 'depth 2, changed order, same result');
});

QUnit.test("useStoreCompareKeys combined: real use case", async function (assert) {
    assert.expect(8);
    this.start();
    let count = 0;
    Object.assign(this.store.state.obj, {
        subObj1: { a: 'a' },
        subObj2: { a: 'b' },
        use1: true,
    });
    class MyComponent extends Component {
        constructor() {
            super(...arguments);
            this.storeProps = useStoreCompareKeys((state, props) => {
                return {
                    array: [state.obj.use1 ? state.obj.subObj1 : state.obj.subObj2],
                };
            }, {
                compareDepth: {
                    array: 1,
                },
                onUpdate: () => {
                    count++;
                },
            });
        }
    }
    MyComponent.env = this.env;
    MyComponent.template = xml`<div t-esc="storeProps.array[0].a"/>`;

    const fixture = document.querySelector('#qunit-fixture');

    const myComponent = new MyComponent();
    await myComponent.mount(fixture);
    assert.strictEqual(count, 1, 'updated once, initial state');
    assert.strictEqual(fixture.textContent, 'a', 'content of subObj1');

    this.store.state.obj.use1 = false;
    await afterNextRender();
    assert.strictEqual(count, 2, 'updated once after change');
    assert.strictEqual(fixture.textContent, 'b', 'content of subObj2');

    this.store.state.obj.subObj1.a = 'c';
    // there must be no render here
    await nextAnimationFrame();
    assert.strictEqual(count, 2, 'unrelated change, no update');
    assert.strictEqual(fixture.textContent, 'b', 'still content of subObj2');

    this.store.state.obj.subObj2.a = 'd';
    await afterNextRender();
    assert.strictEqual(count, 3, 'related change, update');
    assert.strictEqual(fixture.textContent, 'd', 'updated content of subObj2');

    myComponent.destroy();
});

});
});
});
