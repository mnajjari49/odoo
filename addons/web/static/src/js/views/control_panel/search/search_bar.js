odoo.define('web.SearchBar', function (require) {
    "use strict";

    const Domain = require('web.Domain');
    const field_utils = require('web.field_utils');
    const SearchFacet = require('web.SearchFacet');
    const { useFocusOnUpdate, useExternalListener } = require('web.custom_hooks');

    const { Component, hooks } = owl;
    const { useGetters, useRef, useState, useStore, useDispatch } = hooks;

    let sourceId = 0;

    /**
     * Search bar
     *
     * @extends Component
     */
    class SearchBar extends Component {
        /**
         * @override
         * @param {Object} [props]
         * @param {Object} [props.fields]
         */
        constructor() {
            super(...arguments);

            this.dispatch = useDispatch(this.env.controlPanelStore);
            this.filters = useStore(state => state.filters, { store: this.env.controlPanelStore });
            this.getters = useGetters(this.env.controlPanelStore);
            this.searchInputRef = useRef('search-input');
            this.query = useStore(state => state.query, { store: this.env.controlPanelStore });
            this.state = useState({
                sources: [],
                focusedItem: 0,
                inputValue: "",
            });
            this.focusOnUpdate = useFocusOnUpdate();
            this.focusOnUpdate();
            useExternalListener(window, 'keydown', this._onWindowKeydown);

            this.allowMouseenter = false;
            this.autoCompleteSources = this.getters.getFiltersOfType('field').map(
                filter => this._createSource(filter)
            );
            this.noResultItem = [null, this.env._t("(no result)")];
        }

        mounted() {
            console.log('mounted');
        }

        patched() {
            console.log('patched');
        }

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * @private
         */
        _closeAutoComplete() {
            this.allowMouseenter = false;
            this.state.sources = [];
            this.state.focusedItem = 0;
            this.focusOnUpdate();
        }

        /**
         * @private
         * @param {Object} filter
         * @returns {Object}
         */
        _createSource(filter) {
            const field = this.props.fields[filter.fieldName];
            const source = {
                active: true,
                description: filter.description,
                field: field,
                filterId: filter.id,
                id: sourceId ++,
                parent: false,
            };
            switch (filter.fieldType) {
                case 'selection':
                    source.active = false;
                    source.selection = field.selection;
                    break;
                case 'boolean':
                    source.active = false;
                    source.selection = [
                        [true, this.env._t("Yes")],
                        [false, this.env._t("No")],
                    ];
                    break;
                case 'many2one':
                    source.expand = true;
                    source.expanded = false;
                    if (filter.domain) {
                        source.domain = filter.domain;
                    }
            }
            return source;
        }

        /**
         * @private
         * @param {Object} source
         * @param {*[]} values
         * @param {boolean} [active=true]
         */
        _createSubSource(source, [value, label], active = true) {
            const subSource = {
                active,
                field: source.field,
                filterId: source.filterId,
                id: sourceId ++,
                label,
                parent: source,
                value,
            };
            return subSource;
        }

        /**
         * @private
         * @param {Object} source
         * @param {boolean} willExpand
         */
        async _expandSource(source, willExpand) {
            source.expanded = willExpand;
            if (willExpand) {
                let args = source.domain;
                if (typeof args === 'string') {
                    try {
                        args = Domain.prototype.stringToArray(args);
                    } catch (err) {
                        args = [];
                    }
                }
                const results = await this.rpc({
                    kwargs: {
                        args,
                        context: source.field.context,
                        limit: 8,
                        name: this.state.inputValue.trim(),
                    },
                    method: 'name_search',
                    model: source.field.relation,
                });
                const options = results.map(result => this._createSubSource(source, result));
                const parentIndex = this.state.sources.indexOf(source);
                if (!options.length) {
                    options.push(this._createSubSource(source, this.noResultItem, false));
                }
                this.state.sources.splice(parentIndex + 1, 0, ...options);
            } else {
                this.state.sources = this.state.sources.filter(src => src.parent !== source);
            }
        }

        /**
         * @private
         * @param {string} query
         */
        _filterSources(query) {
            return this.autoCompleteSources.reduce(
                (sources, source) => {
                    // Field selection or boolean.
                    if (source.selection) {
                        const options = source.selection.reduce(
                            (acc, result) => {
                                if (fuzzy.test(query, result[1].toLowerCase())) {
                                    acc.push(this._createSubSource(source, result));
                                }
                                return acc;
                            },
                            []
                        );
                        if (options.length) {
                            sources.push(source, ...options);
                        }
                    // Any other field.
                    } else if (this._validateSource(query, source)) {
                        sources.push(source);
                    }
                    // Fold any expanded item.
                    if (source.expanded) {
                        source.expanded = false;
                    }
                    return sources;
                },
                []
            );
        }

        /**
         * Focus the search facet at the designated index if any.
         * @private
         */
        _focusFacet(index) {
            const facets = this.el.getElementsByClassName('o_searchview_facet');
            if (facets.length) {
                facets[index].focus();
            }
        }

        /**
         * @private
         * @param {Object} source
         */
        _selectSource(source) {
            // Inactive sources are:
            // - Selection sources
            // - "no result" items
            if (source.active) {
                const label = source.label || this.state.inputValue;
                this.dispatch('addAutoCompletionValues',
                    source.filterId,
                    source.value || label,
                    label,
                    '=' // to change
                );
                this.state.inputValue = "";
                this.searchInputRef.el.value = "";
                this._closeAutoComplete();
            }
        }

        /**
         * Bind a global event to allow mouseenter events on the next mouse move.
         * This is to prevent selecting a result simply by having the cursor hovering
         * on it when the results are first displayed.
         * @private
         */
        _unlockMouseEnterOnMove() {
            window.addEventListener('mousemove', () => {
                this.allowMouseenter = true;
            }, { once: true });
        }

        /**
         * @private
         * @param {string} query
         * @param {Object} source
         * @returns {boolean}
         */
        _validateSource(query, source) {
            const { type } = source.field;
            const parser = field_utils.parse[type];
            try {
                if (type === 'date' || type === 'datetime') {
                    const parsedValue = parser(query, { type }, { timezone: true });
                    const dateFormat = type === 'datetime' ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD';
                    const momentValue = moment(parsedValue, dateFormat);
                    if (!momentValue.isValid()) {
                        return false;
                    }
                } else if (parser instanceof Function) {
                    parser(query);
                }
            } catch (err) {
                return false;
            }
            return true;
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         * @param {number} facetIndex
         * @param {OwlEvent} ev
         */
        _onFacetNavigation(facetIndex, ev) {
            switch (ev.detail.direction) {
                case 'left':
                    if (facetIndex === 0) {
                        this.searchInputRef.el.focus();
                    } else {
                        this._focusFacet(facetIndex - 1);
                    }
                    break;
                case 'right':
                    if (facetIndex === this.facets.length - 1) {
                        this.searchInputRef.el.focus();
                    } else {
                        this._focusFacet(facetIndex + 1);
                    }
                    break;
            }
        }

        /**
         * @private
         * @param {OwlEvent} ev
         */
        _onFacetRemoved(ev) {
            debugger
            const facet = ev.detail;
            this.dispatch('deactivateGroup', facet.group.id);
        }

        /**
         * @private
         * @param {KeyboardEvent} ev
         */
        _onInputKeydown(ev) {
            const currentItem = this.state.sources[this.state.focusedItem] || {};
            switch (ev.key) {
                case 'ArrowDown':
                    ev.preventDefault();
                    let nextIndex = this.state.focusedItem + 1;
                    if (nextIndex >= this.state.sources.length) {
                        nextIndex = 0;
                    }
                    this.state.focusedItem = nextIndex;
                    break;
                case 'ArrowLeft':
                    if (currentItem.expanded) {
                        // Priority 1: fold expanded item.
                        ev.preventDefault();
                        this._expandSource(currentItem, false);
                    } else if (currentItem.parent) {
                        // Priority 2: focus parent item.
                        ev.preventDefault();
                        this.state.focusedItem = this.state.sources.indexOf(currentItem.parent);
                        // Priority 3: Do nothing (navigation inside text).
                    } else if (ev.target.selectionStart === 0) {
                        // Priority 4: navigate to rightmost facet.
                        this._focusFacet(this.query.length - 1);
                    }
                    break;
                case 'ArrowRight':
                    if (ev.target.selectionStart === this.state.inputValue.length) {
                        // Priority 1: Do nothing (navigation inside text).
                        if (currentItem.expand) {
                            // Priority 2: go to first child or expand item.
                            ev.preventDefault();
                            if (currentItem.expanded) {
                                this.state.focusedItem ++;
                            } else {
                                this._expandSource(currentItem, true);
                            }
                        } else if (ev.target.selectionStart === this.state.inputValue.length) {
                            // Priority 3: navigate to leftmost facet.
                            this._focusFacet(0);
                        }
                    }
                    break;
                case 'ArrowUp':
                    ev.preventDefault();
                    let previousIndex = this.state.focusedItem - 1;
                    if (previousIndex < 0) {
                        previousIndex = this.state.sources.length - 1;
                    }
                    this.state.focusedItem = previousIndex;
                    break;
                case 'Backspace':
                    if (!this.state.inputValue.length && this.query.length) {
                        const lastActiveGroupId = this.query.reduce((_, { groupId }) =>  groupId, false);
                        this.dispatch('deactivateGroup', lastActiveGroupId);
                    }
                    break;
                case 'Enter':
                    if (!this.state.inputValue.length) {
                        this.trigger('reload');
                        break;
                    } // No break here: select current result if there is a value.
                case 'Tab':
                    if (this.state.inputValue.length) {
                        this._selectSource(currentItem);
                    }
                    break;
                case 'Escape':
                    if (this.state.sources.length) {
                        this._closeAutoComplete();
                    }
                    break;
            }
        }

        /**
         * @private
         * @param {InputEvent} ev
         */
        _onInputSearch(ev) {
            this.state.inputValue = ev.target.value;
            const wasVisible = this.state.sources.length;
            const query = this.state.inputValue.trim().toLowerCase();
            if (query.length) {
                if (!wasVisible) {
                    this._unlockMouseEnterOnMove();
                }
                this.state.sources = this._filterSources(query);
            } else if (wasVisible) {
                this._closeAutoComplete();
            }
        }

        /**
         * Only handled if the user has moved its cursor at least once after the
         * results are loaded and displayed.
         * @private
         * @param {number} resultIndex
         */
        _onSourceMouseenter(resultIndex) {
            if (this.allowMouseenter) {
                this.state.focusedItem = resultIndex;
            }
        }

        /**
         * @private
         */
        _onWindowKeydown(ev) {
            if (ev.key === 'Escape' && this.state.sources.length) {
                ev.preventDefault();
                ev.stopPropagation();
                this._closeAutoComplete();
            }
        }
    }

    SearchBar.components = { SearchFacet };
    SearchBar.defaultProps = {
        fields: {},
    };
    SearchBar.props = {
        fields: Object,
    };
    SearchBar.template = 'SearchBar';

    return SearchBar;
});
