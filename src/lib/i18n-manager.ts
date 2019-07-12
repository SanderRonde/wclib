import { WebComponentHierarchyManagerMixinInstance } from './hierarchy-manager.js';
import { Constructor, InferInstance, InferReturn } from '../classes/types.js';
import { CHANGE_TYPE, WebComponentBaseMixinInstance } from './base.js';

class I18NClass {
	public static urlFormat: string = '/i18n/';
	public static getMessage: (langFile: any, key: string, values: any[]) => string|Promise<string> = 
		(file: {
			[key: string]: string;
		}, key: string) => {
			return file[key];
		}
	public static langFiles: {
		[key: string]: {
			[key: string]: string;
		}
	} = {};
	private static __langPromises: {
		[key: string]: Promise<{
			[key: string]: string;
		}>;
	} = {};
	private static __loadingLang: string|null = null;
	public static currentLang: string|null = null;
	public static defaultLang: string|null = null;
	public static returner: (promise: Promise<string>, content: string) => any =
		(_, c) => c
	private _elementLang: string|null = null;
	private static _listeners: ((newLang: string) => void)[] = [];

	constructor(private _self: WebComponentI18NManagerMixinInstance) { }

	public setInitialLang() {
		this.setLang(I18NClass.__loadingLang!, true);
	}

	public async notifyNewLang(lang: string) {
		for (const listener of I18NClass._listeners) {
			listener(lang);
		}
	}

	public async setLang(lang: string, delayRender: boolean = false) {
		if (I18NClass.__loadingLang !== lang) {
			I18NClass.__loadingLang = lang;
			await I18NClass.__loadLang(lang);
			if (I18NClass.__loadingLang === lang) {
				I18NClass.currentLang = lang;
			}
		}
		if (this._elementLang !== lang) {
			this._elementLang = lang;
			if (delayRender) {
				setTimeout(() => {
					this._self.renderToDOM(CHANGE_TYPE.LANG);
				}, 0);
			} else {
				this._self.renderToDOM(CHANGE_TYPE.LANG);
			}
		}
	}

	public static notifyOnLangChange(listener: (newLang: string) => void) {
		this._listeners.push(listener);
		if (I18NClass.currentLang) {
			listener(I18NClass.currentLang!);
		}
	}

	private static async __fetch(url: string) {
		/* istanbul ignore next */
		if ('fetch' in window && typeof window.fetch !== undefined) {
			return window.fetch(url).then(r => r.text());
		}

		return new Promise<string>((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open('GET', url);
			xhr.onreadystatechange = () => {
				if (xhr.readyState === XMLHttpRequest.DONE) {
					if (xhr.status >= 200 && xhr.status < 300) {
						resolve(xhr.responseText);
					} else {
						reject(new Error(`Failed xhr: ${xhr.status}`));
					}
				}
			}
			xhr.send();
		});
	}

	private static async __loadLang(lang: string) {
		if (lang in this.__langPromises) return;
		const prom = new Promise<{
			[key: string]: string;
		}>(async (resolve) => {
			const text = await this.__fetch(this.urlFormat.replace(/\$LANG\$/g, lang));
			resolve(JSON.parse(text));
		});
		this.__langPromises[lang] = prom;
		this.langFiles[lang] = await prom;
	}

	public static get lang() {
		return this.currentLang || 
			this.__loadingLang ||
			this.defaultLang!;
	}

	static async loadCurrentLang(): Promise<any> {
		let loadingLang = this.lang;
		if (loadingLang in this.langFiles) return;
		if (loadingLang in this.__langPromises) {
			await this.__langPromises[loadingLang];

			// Language has changed in the meantime
			if (this.lang !== loadingLang) return this.loadCurrentLang();
			return;
		}
		this.__loadLang(loadingLang);
		await this.__langPromises[loadingLang];

		// Language has changed in the meantime
		if (this.lang !== loadingLang) return this.loadCurrentLang();
	}

	public static get isReady() {
		return this.lang in this.langFiles;
	}

	public static async waitForKey(key: string, values: any[]) {
		await this.loadCurrentLang();
		return this.getMessage(
			this.langFiles[this.lang], key, values);
	}
}

export type WebComponentI18NManagerMixinInstance = InferInstance<WebComponentI18NManagerMixinClass> & {
	self: WebComponentI18NManagerMixinClass;
};
export type WebComponentI18NManagerMixinClass = InferReturn<typeof WebComponentI18NManagerMixin>;

export type WebComponentI18NManagerMixinSuper = Constructor<
	Partial<Pick<WebComponentHierarchyManagerMixinInstance, 'globalProps'|'listenGP'>> & 
	Pick<WebComponentBaseMixinInstance, 'renderToDOM'>>;

/**
 * A mixin that, when applied, adds i18n support in the
 * form of adding a `__` method
 */
export const WebComponentI18NManagerMixin = <P extends WebComponentI18NManagerMixinSuper>(superFn: P) => {
	const privateMap: WeakMap<WebComponentI18NManagerClass, I18NClass> = new WeakMap();
	function i18nClass(self: WebComponentI18NManagerClass): I18NClass {
		if (privateMap.has(self)) return privateMap.get(self)!;
		return privateMap.set(self, new I18NClass(self as any)).get(self)!;
	}

	/**
	 * The class that manages all i18n (internationalization) functions
	 */
	class WebComponentI18NManagerClass extends superFn {
		constructor(...args: any[]) {
			super(...args);

			if (this.listenGP) {
				this.listenGP<{
					lang: string;
				}, 'lang'>('globalPropChange', (prop, value) => {
					if (prop === 'lang') {
						i18nClass(this).setLang(value!);
					}
				});
			} else {
				I18NClass.notifyOnLangChange((lang: string) => {
					i18nClass(this).setLang(lang);
				});
			}
			i18nClass(this).setInitialLang();
		}

		/**
		 * Sets the current language
		 * 
		 * @param {string} lang - The language to set it to, a regular string
		 */
		public async setLang<L extends string>(lang: L): Promise<void> {
			if (this.globalProps) {
				this.globalProps<{
					lang: string;
				}>().set('lang', lang);
			} else {
				await i18nClass(this).setLang(lang);
				await i18nClass(this).notifyNewLang(lang);
			}
		}

		/**
		 * Gets the currently active language
		 */
		public getLang(): string {
			return I18NClass.lang!;
		}
		
		/**
		 * Initializes i18n with a few important settings
		 */
		public static initI18N({
			urlFormat,
			defaultLang,
			getMessage,
			returner
		}: {
			/**
			 * The format of the language URLs where $LANG$ is replaced with the language.
			 * For example if the language is `en` and the `urlFormat` is 
			 * "/_locales/$LANG$.json" it would fetch it from "/_locales/en.json"
			 */
			urlFormat: string;
			/**
			 * The default language to use. This is a simple string
			 */
			defaultLang: string;
			/**
			 * An optional override of the default `getMessage` function. This function
			 * gets the message from the language file given the file, a key and some 
			 * replacement values and returns a message string or a promise resolving to one. 
			 * The default function returns `file[key]`
			 */
			getMessage?: (langFile: any, key: string, values: any[]) => string|Promise<string>;
			/**
			 * A final step called before the `this.__` function returns. This is called with
			 * a promise that resolves to a message as the first argument and a placeholder
			 * as the second argument. The placeholder is of the form "{{key}}".
			 * This can be used as a way to return lit-html directives or similar
			 * constructs to your templates instead of simple promises
			 */
			returner?: (messagePromise: Promise<string>, placeHolder: string) => any;
		}) {
			I18NClass.urlFormat = urlFormat;
			if (getMessage) {
				I18NClass.getMessage = getMessage;
			}
			if (returner) {
				I18NClass.returner = returner;
			}
			I18NClass.defaultLang = defaultLang;
		}

		/**
		 * Returns a promise that resolves to the message. You will generally
		 * want to use this inside the class itself since it resolves to a simple promise.
		 * 
		 * **Note:** Does not call the `options.returner` function before returning.
		 * 
		 * @param {string} key - The key to search for in the messages file
		 * @param {any[]} [values] - Optional values passed to the `getMessage` function
		 * 		that can be used as placeholders or something similar
		 * 
		 * @returns {Promise<string>} A promise that resolves to the found message
		 */
		public __prom(key: string, ...values: any[]): Promise<string> {
			return WebComponentI18NManagerClass.__prom(key, ...values);
		}

		/**
		 * Returns either a string or whatever the `options.returner` function
		 * returns. If you have not set the `options.returner` function, this will
		 * return either a string or a promise that resolves to a string. Since
		 * this function calls `options.returner` with the promise if the i18n file
		 * is not loaded yet.
		 * 
		 * You will generally want to use this function inside your templates since it
		 * allows for the `options.returner` function to return a template-friendly
		 * value that can display a placeholder or something of the sort
		 * 
		 * @template R - The return value of your returner function
		 * @param {string} key - The key to search for in the messages file
		 * @param {any[]} [values] - Optional values passed to the `getMessage` function
		 * 		that can be used as placeholders or something similar
		 * 
		 * @returns {string|R} A promise that resolves to the found message
		 */
		public __<R>(key: string, ...values: any[]): string|R {
			return WebComponentI18NManagerClass.__(key, ...values);
		}

		/**
		 * Returns a promise that resolves to the message. You will generally
		 * want to use this inside the class itself since it resolves to a simple promise.
		 * 
		 * **Note:** Does not call the `options.returner` function before returning.
		 * 
		 * @param {string} key - The key to search for in the messages file
		 * @param {any[]} [values] - Optional values passed to the `getMessage` function
		 * 		that can be used as placeholders or something similar
		 * 
		 * @returns {Promise<string>} A promise that resolves to the found message
		 */
		public static async __prom(key: string, ...values: any[]): Promise<string> {
			if (I18NClass.isReady) {
				return I18NClass.getMessage(
					I18NClass.langFiles[I18NClass.lang], key,
						values);
			}
			return I18NClass.waitForKey(key, values);
		}

		/**
		 * Returns either a string or whatever the `options.returner` function
		 * returns. If you have not set the `options.returner` function, this will
		 * return either a string or a promise that resolves to a string. Since
		 * this function calls `options.returner` with the promise if the i18n file
		 * is not loaded yet.
		 * 
		 * You will generally want to use this function inside your templates since it
		 * allows for the `options.returner` function to return a template-friendly
		 * value that can display a placeholder or something of the sort
		 * 
		 * @template R - The return value of your returner function
		 * @param {string} key - The key to search for in the messages file
		 * @param {any[]} [values] - Optional values passed to the `getMessage` function
		 * 		that can be used as placeholders or something similar
		 * 
		 * @returns {string|R} A promise that resolves to the found message
		 */
		public static __<R>(key: string, ...values: any[]): string|R {
			const value = this.__prom(key, ...values);

			return I18NClass.returner(value, `{{${key}}}`);
		}

		/**
		 * A promise that resolves when the current language is loaded
		 * 
		 * @readonly
		 */
		public static get langReady() {
			return I18NClass.loadCurrentLang();
		}
	}
	return WebComponentI18NManagerClass;
}