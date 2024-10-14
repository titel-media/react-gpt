/* eslint-disable react/sort-comp */
import React, {Component} from "react";
import ReactDOM from "react-dom";
import isEqual from "lodash/fp/isEqual";
import hoistStatics from "hoist-non-react-statics";
import Events from "./Events";
import filterPropsSimple from "./utils/filterProps";
import {createManager, pubadsAPI} from "./createManager";
/**
 * An Ad Component using Google Publisher Tags.
 * This component should work standalone w/o context.
 * https://developers.google.com/doubleclick-gpt/
 *
 * @module Bling
 * @class Bling
 * @fires Bling#Events.READY
 * @fires Bling#Events.SLOT_RENDER_ENDED
 * @fires Bling#Events.IMPRESSION_VIEWABLE
 * @fires Bling#Events.SLOT_VISIBILITY_CHANGED
 * @fires Bling#Events.SLOT_LOADED
 */
class Bling extends Component {
    /**
     * An array of prop names which can reflect to the ad by calling `refresh`.
     *
     * @property refreshableProps
     * @static
     */
    static refreshableProps = [
        "targeting",
        "sizeMapping",
        "clickUrl",
        "categoryExclusion",
        "attributes",
        "collapseEmptyDiv",
        "companionAdService",
        "forceSafeFrame",
        "safeFrameConfig"
    ];
    /**
     * An array of prop names which requires to create a new ad slot and render as a new ad.
     *
     * @property reRenderProps
     * @static
     */
    static reRenderProps = ["adUnitPath", "slotSize", "outOfPage", "npa"];
    /**
     * An instance of ad manager.
     *
     * @property _adManager
     * @private
     * @static
     */
    static _adManager = createManager();
    /**
     *
     * @property
     * @private
     * @static
     */
    static _config = {
        /**
         * An optional string for GPT seed file url to override.
         */
        seedFileUrl: "//www.googletagservices.com/tag/js/gpt.js",
        /**
         * An optional flag to indicate whether an ad should only render when it's fully in the viewport area. Default is `true`.
         */
        renderWhenViewable: true,
        /**
         * An optional number to indicate how much percentage of an ad area needs to be in a viewable area before rendering. Default value is 0.5.
         * Acceptable range is between 0 and 1.
         */
        viewableThreshold: 0.5,
        /**
         * An optional function to create an object with filtered current props and next props for a given keys to perform equality check.
         */
        filterProps: filterPropsSimple,
        /**
         * An optional function for the filtered props and the next props to perform equality check.
         */
        propsEqual: isEqual
    };

    static on(eventType, cb) {
        Bling._on("on", eventType, cb);
    }

    static once(eventType, cb) {
        Bling._on("once", eventType, cb);
    }

    static removeListener(...args) {
        Bling._adManager.removeListener(...args);
    }

    static removeAllListeners(...args) {
        Bling._adManager.removeAllListeners(...args);
    }

    static _on(fn, eventType, cb) {
        if (typeof cb !== "function") {
            return;
        }
        if (eventType === Events.READY && Bling._adManager.isReady) {
            cb.call(Bling._adManager, Bling._adManager.googletag);
        } else {
            Bling._adManager[fn](eventType, cb);
        }
    }

    static configure(config = {}) {
        Bling._config = {
            ...Bling._config,
            ...config
        };
    }
    /**
     * Returns the GPT version.
     *
     * @method getGPTVersion
     * @returns {Number|boolean} a version or false if GPT is not yet ready.
     * @static
     */
    static getGPTVersion() {
        return Bling._adManager.getGPTVersion();
    }
    /**
     * Returns the Pubads Service version.
     *
     * @method getPubadsVersion
     * @returns {Number|boolean} a version or false if Pubads Service is not yet ready.
     * @static
     */
    static getPubadsVersion() {
        return Bling._adManager.getPubadsVersion();
    }
    /**
     * Sets a flag to indicate whether the correlator value should always be same across the ads in the page or not.
     *
     * @method syncCorrelator
     * @param {boolean} value
     * @static
     */
    static syncCorrelator(value) {
        Bling._adManager.syncCorrelator(value);
    }
    /**
     * Trigger re-rendering of all the ads.
     *
     * @method render
     * @static
     */
    static render() {
        Bling._adManager.renderAll();
    }
    /**
     * Refreshes all the ads in the page with a new correlator value.
     *
     * @param {Array} slots An array of ad slots.
     * @param {Object} options You can pass `changeCorrelator` flag.
     * @static
     */
    static refresh(slots, options) {
        Bling._adManager.refresh(slots, options);
    }
    /**
     * Clears the ads for the specified ad slots, if no slots are provided, all the ads will be cleared.
     *
     * @method clear
     * @param {Array} slots An optional array of slots to clear.
     * @static
     */
    static clear(slots) {
        Bling._adManager.clear(slots);
    }

    static set testManager(testManager) {
        if (!testManager) {
            throw new Error("Pass in createManagerTest to mock GPT");
        }
        Bling._adManager = testManager;
    }

    _isMounted = false;

    state = {
        scriptLoaded: false,
        inViewport: false
    };

    get adSlot() {
        return this._adSlot;
    }

    get viewableThreshold() {
        return this.props.viewableThreshold >= 0
            ? this.props.viewableThreshold
            : Bling._config.viewableThreshold;
    }

    componentDidMount() {
        this._isMounted = true;

        Bling._adManager.addInstance(this);
        Bling._adManager
            .load(Bling._config.seedFileUrl)
            .then(this.onScriptLoaded.bind(this))
            .catch(this.onScriptError.bind(this));
    }

    // eslint-disable-next-line camelcase
    UNSAFE_componentWillReceiveProps(nextProps) {
        const {propsEqual} = Bling._config;
        const {sizeMapping} = this.props;

        if (
            (nextProps.sizeMapping || sizeMapping) &&
            !propsEqual(nextProps.sizeMapping, sizeMapping)
        ) {
            Bling._adManager.removeMQListener(this, nextProps);
        }
    }

    shouldComponentUpdate(nextProps, nextState) {
        // if adUnitPath changes, need to create a new slot, re-render
        // otherwise, just refresh
        const {scriptLoaded, inViewport} = nextState;
        const notInViewport = this.notInViewport(nextProps, nextState);
        const inViewportChanged = this.state.inViewport !== inViewport;
        const isScriptLoaded = this.state.scriptLoaded !== scriptLoaded;

        // Exit early for visibility change, before executing deep equality check.
        if (notInViewport) {
            return false;
        } else if (inViewportChanged) {
            return true;
        }

        const {filterProps, propsEqual} = Bling._config;
        const refreshableProps = filterProps(
            Bling.refreshableProps,
            this.props,
            nextProps
        );
        const reRenderProps = filterProps(
            Bling.reRenderProps,
            this.props,
            nextProps
        );
        const shouldRender = !propsEqual(
            reRenderProps.props,
            reRenderProps.nextProps
        );
        const shouldRefresh =
            !shouldRender &&
            !propsEqual(refreshableProps.props, refreshableProps.nextProps);

        if (shouldRefresh) {
            this.configureSlot(this._adSlot, nextProps);
        }

        if (Bling._adManager._syncCorrelator) {
            if (shouldRefresh) {
                Bling._adManager.refresh();
            } else if (shouldRender || isScriptLoaded) {
                Bling._adManager.renderAll();
            }
        } else {
            if (shouldRefresh) {
                this.refresh();
                return false;
            }
            if (shouldRender || isScriptLoaded) {
                return true;
            }
        }

        return false;
    }

    componentDidUpdate() {
        if (this.notInViewport(this.props, this.state)) {
            return;
        }
        if (this._divId) {
            // initial render will enable pubads service before any ad renders
            // so taken care of by the manager
            if (Bling._adManager._initialRender) {
                Bling._adManager.render();
            } else {
                this.renderAd();
            }
        }
    }

    componentWillUnmount() {
        this._isMounted = false;

        Bling._adManager.removeInstance(this);
        if (this._adSlot) {
            Bling._adManager.googletag.destroySlots([this._adSlot]);
            this._adSlot = null;
        }
    }

    onScriptLoaded() {
        const {onScriptLoaded} = this.props;

        if (this.el && this.getRenderWhenViewable()) {
            this.foldCheck();
        }

        if (this._isMounted) {
            this.setState({scriptLoaded: true}, onScriptLoaded); // eslint-disable-line react/no-did-mount-set-state
        }
    }

    onScriptError(err) {
        console.warn(
            `Ad: Failed to load gpt for ${Bling._config.seedFileUrl}`,
            err
        );
    }

    getRenderWhenViewable(props = this.props) {
        return props.renderWhenViewable !== undefined
            ? props.renderWhenViewable
            : Bling._config.renderWhenViewable;
    }

    foldCheck() {
        if (this.state.inViewport) {
            return;
        }

        let slotSize = this.getSlotSize();
        if (Array.isArray(slotSize) && Array.isArray(slotSize[0])) {
            slotSize = slotSize[0];
        }
        if (
            slotSize === "fluid" ||
            (Array.isArray(slotSize) && slotSize[0] === "fluid")
        ) {
            slotSize = [0, 0];
        }

        const inViewport = Bling._adManager.isInViewport(
            ReactDOM.findDOMNode(this),
            slotSize,
            this.viewableThreshold
        );

        if (inViewport) {
            this.setState({inViewport: true});
        }
    }

    defineSizeMapping(adSlot, sizeMapping) {
        if (sizeMapping) {
            Bling._adManager.addMQListener(this, this.props);
            const sizeMappingArray = sizeMapping
                .reduce((mapping, size) => {
                    return mapping.addSize(size.viewport, size.slot);
                }, Bling._adManager.googletag.sizeMapping())
                .build();
            adSlot.defineSizeMapping(sizeMappingArray);
        }
    }

    setAttributes(adSlot, attributes) {
        // no clear method, attempting to clear existing attributes before setting new ones.
        const attributeKeys = adSlot.getAttributeKeys();
        attributeKeys.forEach(key => {
            adSlot.set(key, null);
        });
        if (attributes) {
            Object.keys(attributes).forEach(key => {
                adSlot.set(key, attributes[key]);
            });
        }
    }

    setTargeting(adSlot, targeting) {
        adSlot.clearTargeting();
        if (targeting) {
            Object.keys(targeting).forEach(key => {
                adSlot.setTargeting(key, targeting[key]);
            });
        }
    }

    addCompanionAdService(serviceConfig, adSlot) {
        const companionAdsService = Bling._adManager.googletag.companionAds();
        adSlot.addService(companionAdsService);
        if (typeof serviceConfig === "object") {
            if (serviceConfig.hasOwnProperty("enableSyncLoading")) {
                companionAdsService.enableSyncLoading();
            }
            if (serviceConfig.hasOwnProperty("refreshUnfilledSlots")) {
                companionAdsService.setRefreshUnfilledSlots(
                    serviceConfig.refreshUnfilledSlots
                );
            }
        }
    }

    getSlotSize() {
        const {
            slotSize: origSlotSize,
            sizeMapping: origSizeMapping
        } = this.props;
        let slotSize;
        if (origSlotSize) {
            slotSize = origSlotSize;
        } else if (origSizeMapping) {
            const sizeMapping = origSizeMapping;
            slotSize = sizeMapping[0] && sizeMapping[0].slot;
        }

        return slotSize;
    }

    renderAd() {
        this.defineSlot();
        this.display();
    }

    notInViewport(props = this.props, state = this.state) {
        const {inViewport} = state;
        return this.getRenderWhenViewable(props) && !inViewport;
    }

    defineSlot() {
        const {adUnitPath, outOfPage, npa} = this.props;
        const divId = this._divId;
        const slotSize = this.getSlotSize();

        this.handleSetNpaFlag(npa);

        if (!this._adSlot) {
            if (outOfPage) {
                this._adSlot = Bling._adManager.googletag.defineOutOfPageSlot(
                    adUnitPath,
                    divId
                );
            } else {
                this._adSlot = Bling._adManager.googletag.defineSlot(
                    adUnitPath,
                    slotSize || [],
                    divId
                );
            }
        }

        this.configureSlot(this._adSlot);
    }

    configureSlot(adSlot, props = this.props) {
        const {
            sizeMapping,
            attributes,
            targeting,
            companionAdService,
            categoryExclusion,
            collapseEmptyDiv,
            safeFrameConfig,
            clickUrl,
            forceSafeFrame
        } = props;

        this.defineSizeMapping(adSlot, sizeMapping);

        if (collapseEmptyDiv !== undefined) {
            if (Array.isArray(collapseEmptyDiv)) {
                adSlot.setCollapseEmptyDiv.call(adSlot, ...collapseEmptyDiv);
            } else {
                adSlot.setCollapseEmptyDiv(collapseEmptyDiv);
            }
        }

        // Overrides click url
        if (clickUrl) {
            adSlot.setClickUrl(clickUrl);
        }

        // Sets category exclusion
        if (categoryExclusion) {
            let exclusion = categoryExclusion;
            if (typeof exclusion === "string") {
                exclusion = [exclusion];
            }
            adSlot.clearCategoryExclusions();
            exclusion.forEach(item => {
                adSlot.setCategoryExclusion(item);
            });
        }

        // Sets AdSense attributes
        this.setAttributes(adSlot, attributes);

        // Sets custom targeting parameters
        this.setTargeting(adSlot, targeting);

        if (safeFrameConfig) {
            adSlot.setSafeFrameConfig(safeFrameConfig);
        }

        if (forceSafeFrame) {
            adSlot.setForceSafeFrame(forceSafeFrame);
        }

        // Enables companion ad service
        if (companionAdService) {
            this.addCompanionAdService(companionAdService, adSlot);
        }

        // GPT checks if the same service is already added.
        adSlot.addService(Bling._adManager.googletag.pubads());
    }

    display() {
        const divId = this._divId;

        Bling._adManager.googletag.display(divId);
        if (
            Bling._adManager._disableInitialLoad &&
            !Bling._adManager._initialRender
        ) {
            this.refresh();
        }
    }

    clear() {
        const adSlot = this._adSlot;
        if (adSlot && adSlot.hasOwnProperty("getServices")) {
            Bling._adManager.clear([adSlot]);
        }
    }

    refresh(options) {
        const adSlot = this._adSlot;
        if (adSlot) {
            this.clear();
            Bling._adManager.refresh([adSlot], options);
        }
    }

    render() {
        const {scriptLoaded} = this.state;
        const {id, outOfPage, style} = this.props;
        const shouldNotRender = this.notInViewport(this.props, this.state);

        if (!scriptLoaded || shouldNotRender) {
            let slotSize = this.getSlotSize();

            if (!outOfPage) {
                if (!slotSize) {
                    throw new Error(
                        "Either 'slotSize' or 'sizeMapping' prop needs to be set."
                    );
                }
            }

            if (Array.isArray(slotSize) && Array.isArray(slotSize[0])) {
                slotSize = slotSize[0];
            }
            // https://developers.google.com/doubleclick-gpt/reference?hl=en#googletag.NamedSize
            if (
                slotSize === "fluid" ||
                (Array.isArray(slotSize) && slotSize[0] === "fluid")
            ) {
                slotSize = ["auto", "auto"];
            }
            const emptyStyle = slotSize && {
                width: slotSize[0],
                height: slotSize[1]
            };
            // render node element instead of script element so that `inViewport` check works.
            return <div ref={div => (this.el = div)} style={emptyStyle} />;
        }

        // clear the current ad if exists
        this.clear();
        if (this._adSlot) {
            Bling._adManager.googletag.destroySlots([this._adSlot]);
            this._adSlot = null;
        }
        this._divId = id || Bling._adManager.generateDivId();

        return <div id={this._divId} style={style} />;
    }

    /**
     * Call pubads and set the non-personalized Ads flag, if it is not undefined.
     *
     * @param {boolean} npa
     */
    handleSetNpaFlag(npa) {
        if (npa === undefined) {
            return;
        }

        Bling._adManager.pubadsProxy({
            method: "setRequestNonPersonalizedAds",
            args: [npa ? 1 : 0],
            resolve: null,
            reject: null
        });
    }
}

// proxy pubads API through Bling
export default hoistStatics(
    Bling,
    pubadsAPI.reduce((api, method) => {
        api[method] = (...args) => Bling._adManager.pubadsProxy({method, args});
        return api;
    }, {})
);
