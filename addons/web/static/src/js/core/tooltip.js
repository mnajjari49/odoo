odoo.define('web.Tooltip', function (require) {
    "use strict";

    const { Component, hooks, misc } = owl;
    const { Portal } = misc;
    const { useRef } = hooks;

    class Tooltip extends Component {

        constructor() {
            super(...arguments);

            this.tooltipRef = useRef('tooltip');

            this.isAttached = false;
        }

        mounted() {
            if (!this.isAttached && this.props.target) {
                this._attach();
            }
        }

        patched() {
            if (!this.isAttached && this.props.target) {
                this._attach();
            }
        }

        _attach() {
            const target = this.props.target.getBoundingClientRect();
            const tooltip = this.tooltipRef.el.getBoundingClientRect();
            const position = {};
            switch (this.props.position) {
                case 'left':
                    position.top = target.y + (target.height / 2 - tooltip.height / 2);
                    position.left = target.x + (tooltip.width);
                    break;
                case 'top':
                    position.top = target.y + (tooltip.height);
                    position.left = target.x + (target.width / 2 - tooltip.width / 2);
                    break;
                case 'right':
                    position.top = target.y + (target.height / 2 - tooltip.height / 2);
                    position.left = target.x + (target.width);
                    break;
                case 'bottom':
                default:
                    position.top = target.y + (target.height);
                    position.left = target.x + (target.width / 2 - tooltip.width / 2);
            }
            this.tooltipRef.el.style = this._positionToString(position);
            this.isAttached = true;
        }

        _positionToString(position) {
            const styles = [];
            for (const key in position) {
                styles.push(`${this._camelToKebab(key)}: ${position[key]}px;`);
            }
            return styles.join(' ');
        }

        _camelToKebab(string) {
            const finalString = [];
            for (const char of string) {
                if (char === char.toUpperCase()) {
                    finalString.push('-', char.toLowerCase());
                } else {
                    finalString.push(char);
                }
            }
            return finalString.join('');
        }
    }

    Tooltip.components = { Portal };
    Tooltip.props = {
        position: { validate: p => ['bottom', 'left', 'right', 'top'].includes(p), optional: 1 },
        target: Element,
        title: { type: String, optional: 1 },
        help: { type: String, optional: 1 },
    };
    Tooltip.template = 'Tooltip';

    return Tooltip;
});
