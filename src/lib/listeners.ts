import { WebComponent } from './component.js';

let _supportsPassive: boolean | null = null;
/**
 * Returns true if this browser supports
 * passive event listeners
 * 
 * @returns {boolean} Whether this browser
 * 	supports passive event listeners
 */
function supportsPassive(): boolean {
	if (_supportsPassive !== null) {
		return _supportsPassive;
	}
	_supportsPassive = false;
	try {
		var opts = Object.defineProperty({}, 'passive', {
			get: function () {
				_supportsPassive = true;
			}
		});
		/* istanbul ignore next */
		const tempFn = () => { };
		window.addEventListener("testPassive", tempFn, opts);
		window.removeEventListener("testPassive", tempFn, opts);
	}
	catch (e) { }
	return _supportsPassive;
}

export namespace Listeners {
	type IDMap = Map<string, ((this: any, ev: HTMLElementEventMap[keyof HTMLElementEventMap]) => any)>;
	type IDMapArr = Map<string, ((this: any, ev: HTMLElementEventMap[keyof HTMLElementEventMap]) => any)[]>;
	const listenedToElements: WeakMap<WebComponent, {
		self: IDMapArr;
		selfUnique: IDMap;
		identifiers: Map<string, {
			element: HTMLElement;
			map: IDMap;
		}>;
		elements: Map<string, {
			element: HTMLElement;
			map: IDMap;
		}>;
	}> = new WeakMap();
	function doListen<I extends {
		IDS: {
			[key: string]: HTMLElement|SVGElement;
		};
		CLASSES: {
			[key: string]: HTMLElement|SVGElement;
		}
	}, T extends WebComponent<I>, K extends keyof HTMLElementEventMap>(base: T, type: 'element' | 'identifier', 
		element: HTMLElement, id: string, event: K, listener: (this: T, ev: HTMLElementEventMap[K]) => any, 
		options?: boolean | AddEventListenerOptions) {
			const boundListener = listener.bind(base);
			if (!listenedToElements.has(base as any)) {
				listenedToElements.set(base as any, {
					identifiers: new Map(),
					elements: new Map(),
					selfUnique: new Map(),
					self: new Map()
				});
			}
			const { elements: elementIDMap, identifiers: identifiersMap } = listenedToElements.get(base as any)!;
			const usedMap = type === 'element' ?
				elementIDMap : identifiersMap;
			if (!usedMap.has(id)) {
				usedMap.set(id, {
					element,
					map: new Map()
				});
			}
			const { map: eventIDMap, element: listenedToElement } = usedMap.get(id)!;
			if (!eventIDMap.has(event)) {
				eventIDMap.set(event, boundListener);
			} else {
				listenedToElement.removeEventListener(event, eventIDMap.get(event)!);
			}
			if (listenedToElement !== element) {
				//A new element was listened to instead, remove all listeners
				for (const listenedToEvent of eventIDMap.keys()) {
					listenedToElement.removeEventListener(listenedToEvent, 
						eventIDMap.get(listenedToEvent)!);
					eventIDMap.delete(listenedToEvent);
				}
				//Update element
				usedMap.get(id)!.element = element;
			}

			if (options !== undefined && options !== null && supportsPassive()) {
				element.addEventListener(event, boundListener, options);
			} else {
				element.addEventListener(event, boundListener);
			}

			return () => {
				/* istanbul ignore next */
				if (eventIDMap.has(event) && eventIDMap.get(event)! === boundListener) {
					listenedToElement.removeEventListener(event, boundListener);
					eventIDMap.delete(event);
				}
			}
		}

	/**
	 * Listens for `event` on `base.$.id` and
	 * triggers `listener` when the event is fired.
	 * Call this function whenever the component is rendered
	 * to make sure it always refers to the current
	 * instance of the element as it will clear its listener
	 * from the old element. Only allows a single listener
	 * per event-base-id combination
	 * 
	 * @template I - An object that maps an event name
	 * 	to the event listener's arguments
	 * 	and return type
	 * @template T - The base component
	 * @template K - The event's name
	 * 
	 * @param {T} base - The base component
	 * @param {keyof T['$']} id - The id of the element
	 * 	to listen to
	 * @param {K} event - The event to listen for
	 * @param {(this: T, ev: HTMLElementEventMap[K]) => any} listener - The
	 * 	listener that gets called when the event is fired
	 * @param {boolean | AddEventListenerOptions} [options] Optional
	 * 	options that are passed to addEventListener
	 * 
	 * @returns {() => void} A function that, when called, removes
	 * 	this listener
	 */
	export function listen<I extends {
		IDS: {
			[key: string]: HTMLElement|SVGElement;
		};
		CLASSES: {
			[key: string]: HTMLElement|SVGElement;
		}
	}, T extends WebComponent<I>, K extends keyof HTMLElementEventMap>(base: T, 
		id: keyof T['$'], event: K, listener: (this: T, ev: HTMLElementEventMap[K]) => any, 
		options?: boolean | AddEventListenerOptions): () => void {
			const element: HTMLElement = (base.$ as any)[id];
			return doListen(base as any, 'element', element, id as string, event, listener, options);
		}

	/**
	 * Listens for `event` on `element` and
	 * triggers `listener` when the event is fired.
	 * Call this function whenever the component is rendered
	 * to make sure it always refers to the current
	 * instance of the element as it will remove the
	 * old listener when a new one is registered. 
	 * Uses `identifier` to 
	 * identify this event-identifier-listener combination
	 * and to make sure the event
	 * is not listened to twice. Only allows a single listener
	 * per event-base-identifier combination
	 * 
	 * @template I - An object that maps an event name
	 * 	to the event listener's arguments
	 * 	and return type
	 * @template T - The base component
	 * @template K - The event's name
	 * 
	 * @param {T} base - The base component
	 * @param {HTMLElement} element - The element to listen to
	 * @param {string} identifier - A unique identifier for
	 * 	this base component that is mapped to this 
	 * 	listener call
	 * @param {K} event - The event to listen for
	 * @param {(this: T, ev: HTMLElementEventMap[K]) => any} listener - The
	 * 	listener that gets called when the event is fired
	 * @param {boolean | AddEventListenerOptions} [options] Optional
	 * 	options that are passed to addEventListener
	 * 
	 * @returns {() => void} A function that, when called, removes
	 * 	this listener
	 */
	export function listenWithIdentifier<I extends {
		IDS: {
			[key: string]: HTMLElement|SVGElement;
		};
		CLASSES: {
			[key: string]: HTMLElement|SVGElement;
		}
	}, T extends WebComponent<I>, K extends keyof HTMLElementEventMap>(base: T, 
		element: HTMLElement, identifier: string, event: K, 
		listener: (this: T, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): () => void {
			return doListen(base as any, 'identifier', element, identifier, event, listener, options);
		}
	const defaultContext = {};
	const usedElements: WeakMap<any, WeakSet<HTMLElement>> = new WeakMap();

	/**
	 * Checks whether this element is new, meaning it's the first time
	 * it's seen on the page by this function
	 * 
	 * @param {HTMLElement} element - The element to check
	 * @param {Object} [context] - A context in which to store
	 * 	this element. For example if you want to check if the
	 * 	element is new on the page use the default context. If
	 * 	you want to check whether the element is new on this
	 * 	component pass the component. The context has to be
	 * 	an object-like value that can be the key of a WeakSet/WeakMap
	 * 
	 * @returns {boolean} Whether this element is new in the
	 * 	given context
	 */
	export function isNewElement(element: HTMLElement, context: Object = defaultContext): boolean {
		if (!element)
			return false;
		if (!usedElements.has(context)) {
			usedElements.set(context, new WeakSet());
		}
		const currentContext = usedElements.get(context)!;
		const has = currentContext.has(element);
		if (!has) {
			currentContext.add(element);
		}
		return !has;
	}

	const newMap: WeakMap<any, any> = new WeakMap();

	/**
	 * Listens for `event` on `base.$.id` if `base.$.id` is a "new"
	 * element (see `isNewElement`) and
	 * triggers `listener` when the event is fired.
	 * Call this function whenever the component is rendered
	 * to make sure it always refers to the current
	 * instance of the element as it will not listen
	 * to the element twice
	 * 
	 * @template I - An object that maps an event name
	 * 	to the event listener's arguments
	 * 	and return type
	 * @template T - The base component
	 * @template K - The event's name
	 * 
	 * @param {T} base - The base component
	 * @param {keyof T['$']} id - The id of the element
	 * 	to listen to
	 * @param {K} event - The event to listen for
	 * @param {(this: T, ev: HTMLElementEventMap[K]) => any} listener - The
	 * 	listener that gets called when the event is fired
	 * @param {boolean} [isNew] - A boolean that says whether
	 * 	this element is new. If nothing is passed (or a non-boolean
	 * 	type is passed), `isNewelement` is called
	 * @param {boolean | AddEventListenerOptions} [options] Optional
	 * 	options that are passed to addEventListener
	 * 
	 * @returns {() => void} A function that, when called, removes
	 * 	this listener
	 */
	export function listenIfNew<I extends {
		IDS: {
			[key: string]: HTMLElement|SVGElement;
		};
		CLASSES: {
			[key: string]: HTMLElement|SVGElement;
		}
	}, T extends WebComponent<I>, K extends keyof HTMLElementEventMap>(base: T, 
		id: keyof T['$'], event: K, listener: (this: T, ev: HTMLElementEventMap[K]) => any, 
		isNew?: boolean, options?: boolean | AddEventListenerOptions): () => void {
			const element: HTMLElement = (base.$ as any)[id];
			const isElementNew = (() => {
				if (typeof isNew === 'boolean') {
					return isNew;
				}
				if (!newMap.has(base)) {
					// Create a link to some object to make sure
					// the context is not the base itself 
					// (as the user may want to use that)
					// but is instead an object that is still
					// linked to that base
					newMap.set(base, {});
				}
				return isNewElement(element, newMap.get(base)!);
			})();
			if (!isElementNew) {
				return () => {};
			}
			return listen(base as any, id as string, event, listener, options);
		}

	/**
	 * Listens for `event` on `base` and
	 * calls `listener` when it's fired.
	 * Will only allow one listener for 
	 * every event, removing the old
	 * listener when a new one is registered
	 * 
	 * @template T - The base component
	 * @template K - The event name
	 * 
	 * @param {T} base - The base component
	 * @param {K} event - The event to listen for
	 * @param {(this: T, ev: HTMLElementEventMap[K]) => any} listener - The
	 * 	listener that is fired when the 
	 * 	event is fired
	 * 
	 * @returns {() => void} A function that, when called, removes
	 * 	this listener
	 */
	export function listenToComponentUnique<T extends WebComponent<any>, K extends keyof HTMLElementEventMap>(
		base: T, event: K, listener: (this: T, ev: HTMLElementEventMap[K]) => any): () => void {
			const boundListener = listener.bind(base);
			if (!listenedToElements.has(base)) {
				listenedToElements.set(base, {
					identifiers: new Map(),
					elements: new Map(),
					selfUnique: new Map(),
					self: new Map()
				});
			}
			const { selfUnique: selfEventMap } = listenedToElements.get(base)!;
			if (!selfEventMap.has(event)) {
				selfEventMap.set(event, boundListener);
			}
			else {
				base.removeEventListener(event, selfEventMap.get(event)!);
			}
			base.addEventListener(event, boundListener);

			return () => {
				/* istanbul ignore next */
				if (selfEventMap.has(event) && selfEventMap.get(event)! === boundListener) {
					base.removeEventListener(event, selfEventMap.get(event)!);
					selfEventMap.delete(event);
				}
			}
		}

	/**
	 * Listens for `event` on `base` and
	 * calls `listener` when it's fired
	 * 
	 * @template T - The base component
	 * @template K - The event name
	 * 
	 * @param {T} base - The base component
	 * @param {K} event - The event to listen for
	 * @param {(this: T, ev: HTMLElementEventMap[K]) => any} listener - The
	 * 	listener that is fired when the 
	 * 	event is fired
	 */
	export function listenToComponent<T extends WebComponent<any>, K extends keyof HTMLElementEventMap>(
		base: T, event: K, listener: (this: T, ev: HTMLElementEventMap[K]) => any) {
			const boundListener = listener.bind(base);
			if (!listenedToElements.has(base)) {
				listenedToElements.set(base, {
					identifiers: new Map(),
					elements: new Map(),
					selfUnique: new Map(),
					self: new Map()
				});
			}
			const { self: selfEventMap } = listenedToElements.get(base)!;
			if (!selfEventMap.has(event)) {
				selfEventMap.set(event, [boundListener]);
			} else {
				selfEventMap.get(event)!.push(boundListener);
			}
			base.addEventListener(event, boundListener);

			return () => {
				/* istanbul ignore next */
				if (!selfEventMap.has(event)) return;
				const listeners = selfEventMap.get(event)!;
				/* istanbul ignore next */
				if (listeners.indexOf(boundListener) > -1) {
					base.removeEventListener(event, boundListener);
				}

				listeners.splice(listeners.indexOf(boundListener), 1);
				selfEventMap.set(event, listeners);
			}
		}
	function removeListeners(element: HTMLElement, map: IDMap|IDMapArr) {
		for (const [ event, listeners ] of map.entries()) {
			for (const listener of Array.isArray(listeners) ? listeners : [listeners]) {
				element.removeEventListener(event, listener);
			}
		}
		map.clear();
	}

	/**
	 * Removes all event listeners on the component
	 * 
	 * @param {WebComponent} base - The component
	 * 	from which to remove all listeners
	 */
	export function removeAllElementListeners(base: WebComponent) {
		if (!listenedToElements.has(base)) {
			return;
		}
		const { elements, identifiers, self, selfUnique } = listenedToElements.get(base)!;
		for (const { map, element } of elements.values()) {
			removeListeners(element, map);
		}
		elements.clear();
		for (const { map, element } of identifiers.values()) {
			removeListeners(element, map);
		}
		identifiers.clear();
		removeListeners(base, self);
		removeListeners(base, selfUnique);
	}
}