odoo.define('web.SearchBar', function (require) {
    "use strict";

    const AutoComplete = require('web.AutoComplete');
    const searchBarAutocompleteRegistry = require('web.search_bar_autocomplete_sources_registry');
    const SearchFacet = require('web.SearchFacet');

    const { Component, hooks } = owl;
    const { useRef, useStore } = hooks;

    class SearchBar extends Component {
        /**
         * @override
         * @param {Object} [props]
         * @param {Object} [props.context]
         * @param {Object[]} [props.facets]
         * @param {Object} [props.fields]
         * @param {Object[]} [props.filterFields]
         * @param {Object[]} [props.filters]
         * @param {Object[]} [props.groupBys]
         */
        constructor() {
            super(...arguments);

            this.autoCompleteSources = [];
            this.searchFacets = [];
            this._isInputComposing = false;

            this.inputRef = useRef('input');

            this.filters = useStore(state => state.filters, { store: this.env.controlPanelStore });
            this.groups = useStore(state => state.groups, { store: this.env.controlPanelStore });
            this.query = useStore(state => state.query, { store: this.env.controlPanelStore });
        }

        async willStart() {
            // this._setupAutoCompletionWidgets();
            this.autoComplete = new AutoComplete(this, {
                $input: $(this.inputRef.el),
                source: () => this._getAutoCompleteSources(),
                select: () => this._onAutoCompleteSelected(),
                get_search_string() {
                    return this.inputRef.el.value.trim();
                },
            });
            return this.autoComplete.appendTo(this.el);
        }

        mounted() {
            this.inputRef.el.focus();
        }

        //--------------------------------------------------------------------------
        // Properties
        //--------------------------------------------------------------------------

        /**
         * @private
         * @returns {number}
         */
        get focusedIndex() {
            const facets = this.el.querySelectorAll('.o_searchview_facet');
            return (facets.length && [...facets].indexOf(document.activeElement)) || null;
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        /**
         * Focus the searchbar.
         */
        focus() {
            this.inputRef.el.focus();
        }

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * @private
         */
        _focusFollowing() {
            const facets = this.el.querySelector('.o_searchview_facet');
            let toFocus;
            if (this.focusedIndex === this.searchFacets.length - 1) {
                toFocus = this.inputRef.el;
            } else {
                toFocus = this.searchFacets.length && facets[this.focusedIndex + 1];
            }

            if (toFocus) {
                toFocus.focus();
            }
        }

        /**
         * @private
         */
        _focusPreceding() {
            const facets = this.el.querySelector('.o_searchview_facet');
            let toFocus;
            if (this.focusedIndex === -1) {
                toFocus = this.searchFacets.length && facets[facets.length - 1];
            } else if (this.focusedIndex === 0) {
                toFocus = this.inputRef.el;
            } else {
                toFocus = this.searchFacets.length && facets[this.focusedIndex - 1];
            }

            if (toFocus) {
                toFocus.focus();
            }
        }

        /**
         * Provide auto-completion result for req.term.
         *
         * @private
         * @param {Object} req request to complete
         * @param {String} req.term searched term to complete
         * @param {Function} callback
         */
        _getAutoCompleteSources(req, callback) {
            const defs = this.autoCompleteSources.map(function (source) {
                return source.getAutocompletionValues(req.term);
            });
            Promise.all(defs).then(function (result) {
                const resultCleaned = _(result).chain()
                    .compact()
                    .flatten(true)
                    .value();
                callback(resultCleaned);
            });
        }

        /**
         * @private
         */
        _setupAutoCompletionWidgets() {
            const registry = searchBarAutocompleteRegistry;
            this.props.filterFields.forEach(filter => {
                const field = this.props.fields[filter.attrs.name];
                const constructor = registry.getAny([filter.attrs.widget, field.type]);
                if (constructor) {
                    this.autoCompleteSources.push(new constructor(this, filter, field, this.props.context));
                }
            });
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * @private
         * @param {Event} e
         * @param {Object} ui
         * @param {Object} ui.item selected completion item
         */
        _onAutoCompleteSelected(e, ui) {
            e.preventDefault();
            const facet = ui.item.facet;
            if (!facet) {
                // this happens when selecting "(no result)" item
                this.trigger_up('reset');
                return;
            }
            const filter = facet.filter;
            if (filter.type === 'field') {
                const values = filter.autoCompleteValues;
                values.push(facet.values[0]);
                this.trigger_up('autocompletion_filter', {
                    filterId: filter.id,
                    autoCompleteValues: values,
                });
            } else {
                this.trigger_up('autocompletion_filter', {
                    filterId: filter.id,
                });
            }
        }

        /**
         * @rivate
         * @param {CompositionEvent} ev
         */
        _onCompositionendInput() {
            this._isInputComposing = false;
        }

        /**
         * @rivate
         * @param {CompositionEvent} ev
         */
        _onCompositionstartInput() {
            this._isInputComposing = true;
        }

        /**
         * @private
         * @param {KeyboardEvent} ev
         */
        _onKeydown(ev) {
            if (this._isInputComposing) {
                return;
            }
            switch (ev.key) {
                case 'ArrowLeft':
                    this._focusPreceding();
                    ev.preventDefault();
                    break;
                case 'ArrowRight':
                    this._focusFollowing();
                    ev.preventDefault();
                    break;
                case 'ArrowDown':
                    // if the searchbar dropdown is closed, try to focus the renderer
                    const dropdown = this.el.querySelector('.o_searchview_autocomplete');
                    if (!dropdown) {
                        this.trigger('navigation_move', { direction: 'down' });
                        ev.preventDefault();
                    }
                    break;
                case 'Space':
                    if (this.inputRef.el.value === '') {
                        this.trigger_up('facet_removed');
                    }
                    break;
                case 'Enter':
                    if (this.inputRef.el.value === '') {
                        this.trigger_up('reload');
                    }
                    break;
            }
        }
    }
    SearchBar.template = 'SearchBar';

    return SearchBar;
});
