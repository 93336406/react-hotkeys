import PropTypes from 'prop-types';
import React, { Component } from 'react';
import FocusTrap from './FocusTrap';

import KeyEventManager from './lib/KeyEventManager';
import ignoreEventsCondition from './lib/ignoreEventsCondition';
import Logger from './lib/Logger';

/**
 * A string or list of strings, that represent a sequence of one or more keys
 * @typedef {String | Array.<String>} MouseTrapKeySequence
 * @see {@link https://craig.is/killing/mice} for support key sequences
 */

/**
 * Name of a key event
 * @typedef {'keyup'|'keydown'|'keypress'} KeyEventName
 */

/**
 * Options for the mapping of a key sequence and event
 * @typedef {Object} KeyEventOptions
 * @property {MouseTrapKeySequence} The key sequence required to satisfy a KeyEventMatcher
 * @property {KeyEventName} action The keyboard state required to satisfy a KeyEventMatcher
 */

/**
 * A matcher used on keyboard sequences and events to trigger handler functions
 * when matching sequences occur
 * @typedef {MouseTrapKeySequence | KeyMapOptions | Array<MouseTrapKeySequence>} KeyEventMatcher
 */

/**
 * A unique key to associate with KeyEventMatchers that allows associating handler
 * functions at a later stage
 * @typedef {String} ActionName
 */

/**
 * A mapping from ActionNames to KeyEventMatchers
 * @typedef {Object.<String, KeyEventMatcher>} KeySequence
 */

/**
 * Component that wraps it children in a "focus trap" and allows key events to
 * trigger function handlers when its children are in focus
 */
class HotKeys extends Component {
  /**
   * @callback ignoreEventsConditionCallback
   * @param {KeyboardEvent) event Keyboard event
   * @return {Boolean} Whether to ignore the event
   */
  /**
   * Sets the function used to determine whether a keyboard event should be ignored.
   *
   * The function passed as an argument accepts the KeyboardEvent as its only argument.
   * @param {ignoreEventsConditionCallback} func Function to use to decide whether to
   *        ignore keyboard events
   */
  static setIgnoreEventsCondition(func) {
    this.ignoreEventsCondition = func;
  }

  /**
   * Sets the ignoreEventsCondition function back to its original value
   */
  static resetIgnoreEventsCondition(){
    this.ignoreEventsCondition = ignoreEventsCondition;
  }

  /**
   * Whether to ignore a particular keyboard event
   * @param {KeyboardEvent} event Event that must be decided to ignore or not
   * @returns {Boolean} Whether to ignore the keyboard event
   */
  static ignoreEventsCondition(event) {
    return ignoreEventsCondition(event)
  }

  static configuration = {
    logLevel: 'warn'
  };

  /**
   * Configure the behaviour of HotKeys
   * @param {Object} configuration Configuration object
   * @param {Function} configuration.ignoreEventsFilter Filter function used to determine
   *        whether a particular keyboard event should be ignored.
   */
  static configure(configuration = {}) {
    const { ignoreEventsFilter } = configuration;

    if (ignoreEventsFilter) {
      this.setIgnoreEventsCondition(ignoreEventsFilter);
    }

    this.configuration = { ...this.configuration, ...configuration };
  }

  /**
   * Default key event used for calling handlers
   */
  static defaultKeyEvent = 'keypress';

  static propTypes = {
    /**
     * A map from action names to Mousetrap key sequences
     */
    keyMap: PropTypes.object,

    /**
     * A map from action names to event handler functions
     */
    handlers: PropTypes.object,

    /**
     * Whether HotKeys should behave as if it has focus in the browser,
     * whether it does or not - a way to force focus behaviour
     */
    focused: PropTypes.bool,

    /**
     * The DOM element the keyboard listeners should be attached to
     */
    attach: PropTypes.any,

    /**
     * Children to wrap within a focus trap
     */
    children: PropTypes.node,

    /**
     * Function to call when this component gains focus in the browser
     */
    onFocus: PropTypes.func,

    /**
     * Function to call when this component loses focus in the browser
     */
    onBlur: PropTypes.func,
  };

  /**
   * Returns a KeyEventManager singleton
   * @returns {KeyEventManager}
   */
  static getKeyEventManager() {
    return KeyEventManager.getInstance({
      logger: new Logger(this.configuration.logLevel)
    });
  }

  constructor(props, context) {
    super(props, context);

    /**
     * The focus and blur handlers need access to the current component as 'this'
     * so they need to be bound to it when the component is instantiated
     */

    this._handleFocus = this._handleFocus.bind(this);
    this._handleBlur = this._handleBlur.bind(this);

    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleKeyPress = this._handleKeyPress.bind(this);
    this._handleKeyUp = this._handleKeyUp.bind(this);
  }

  /**
   * Renders the component's children wrapped in a FocusTrap with the necessary
   * props to capture keyboard events
   *
   * @returns {FocusTrap} FocusTrap with necessary props to capture keyboard events
   */
  render() {
    const {
      /**
       * Props used by HotKeys that should not be passed down to its focus trap
       * component
       */
      keyMap, handlers, focused, attach,

      children,
      ...props
    } = this.props;

    return (
      <FocusTrap
        { ...props }
        onFocus={ this._handleFocus }
        onBlur={ this._handleBlur }
        onKeyDown={ this._handleKeyDown }
        onKeyPress={ this._handleKeyPress }
        onKeyUp={ this._handleKeyUp }
      >
        { children }
      </FocusTrap>
    );
  }

  _focusTreeIdsPush(componentIndex) {
    if (!this._focusTreeIds) {
      this._focusTreeIds = [];
    }

    this._focusTreeIds.push(componentIndex);
  }

  _focusTreeIdsShift() {
    if (this._focusTreeIds) {
      this._focusTreeIds.shift();
    }
  }

  _getFocusTreeId() {
    if (this._focusTreeIds) {
      return this._focusTreeIds[0];
    }
  }

  componentWillReceiveProps(nextProps) {
    if (this._focused) {
      this.constructor.getKeyEventManager().updateComponent(this._getFocusTreeId(), this._componentIndex, nextProps.keyMap, nextProps.handlers, this._getFocusOptions());
    }
  }

  componentWillUnmount(){
    this._handleBlur();
  }

  /**
   * Handles when the component gains focus by calling onFocus prop, if defined, and
   * registering itself with the KeyEventManager
   * @private
   */
  _handleFocus() {
    if (this.props.onFocus) {
      this.props.onFocus(...arguments);
    }

    const [ focusTreeId, componentIndex ] = this.constructor.getKeyEventManager().handleFocus(this.props.keyMap, this.props.handlers, this._getFocusOptions());

    this._componentIndex = componentIndex;
    this._focusTreeIdsPush(focusTreeId);

    this._focused = true;
  }

  /**
   * Handles when the component loses focus by calling the onBlur prop, if defined
   * and removing itself from the KeyEventManager
   * @private
   */
  _handleBlur() {
    if (this.props.onBlur) {
      this.props.onBlur(...arguments);
    }

    const retainCurrentFocusTreeId = this.constructor.getKeyEventManager().handleBlur(this._getFocusTreeId(), this._componentIndex);

    if (!retainCurrentFocusTreeId) {
      this._focusTreeIdsShift();
    }

    this._focused = false;
  }

  /**
   * Delegates handing the keydown event to the KeyEventManager
   * @param {KeyboardEvent} event Key board event containing key name and state
   * @private
   */
  _handleKeyDown(event) {
    const discardFocusTreeId = this.constructor.getKeyEventManager().handleKeyDown(event, this._getFocusTreeId(), this._componentIndex, this._getEventOptions());

    if (discardFocusTreeId) {
      this._focusTreeIdsShift();
    }
  }

  /**
   * Delegates handing the keypress event to the KeyEventManager
   * @param {KeyboardEvent} event Key board event containing key name and state
   * @private
   */
  _handleKeyPress(event) {
    const discardFocusTreeId = this.constructor.getKeyEventManager().handleKeyPress(event, this._getFocusTreeId(), this._componentIndex, this._getEventOptions());

    if (discardFocusTreeId) {
      this._focusTreeIdsShift();
    }
  }

  /**
   * Delegates handing the keyup event to the KeyEventManager
   * @param {KeyboardEvent} event Key board event containing key name and state
   * @private
   */
  _handleKeyUp(event) {
    const discardFocusTreeId = this.constructor.getKeyEventManager().handleKeyUp(event, this._getFocusTreeId(), this._componentIndex, this._getEventOptions());

    if (discardFocusTreeId) {
      this._focusTreeIdsShift();
    }
  }

  _getFocusOptions() {
    return {
      defaultKeyEvent: this.constructor.defaultKeyEvent
    };
  }

  _getEventOptions() {
    return {
      ignoreEventsCondition: this.constructor.ignoreEventsCondition,
    };
  }

}

export default HotKeys;
