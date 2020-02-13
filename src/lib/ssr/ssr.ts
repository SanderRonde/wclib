import {
    parse as parseCSS,
    Stylesheet,
    stringify as stringifyCSS,
    Rule,
} from 'css';
import { Parser as HTMLParser, DomHandler } from 'htmlparser2';
import { DataNode, Element } from 'domhandler';

import {
    WebComponentBaseTypeInstance,
    InferInstance,
    WebComponentTypeInstance,
    WebComponentBaseTypeStatic,
    WebComponentTypeStatic,
} from '../../classes/types';
import { CHANGE_TYPE, TemplateFnLike } from '../template-fn';
import { Props } from '../props';

/**
 * The serverside rendering namespace that is used internally to do the whole
 * operation. The entire thing and its contents are exported but only the
 * "useful" exports are not prefixed with an underscore. This means you can
 * always access anything but can still distinguish between code that
 * should or should not be imported.
 */
export namespace SSR {
    export namespace Errors {
        export class RenderError extends Error {
            constructor(message: string, public source: Error) {
                super(message);

                this.name = 'RenderError';
                this.message = `Error while rendering component on the server: ${source.name}, ${source.message}`;
                this.stack = source.stack;
            }
        }

        export class CSSParseError extends Error {
            constructor(
                message: string,
                public source: Error,
                public file: string
            ) {
                super(message);

                this.name = 'CSSParseError';
                this.message = `Error while parsing rendered CSS: ${source.name}, ${source.message}\n${source.stack}\nIn CSS file: ${file}`;
                this.stack = source.stack;
            }
        }

        export function _renderError(e: Error): never {
            throw new RenderError(e.message, e);
        }

        export function _cssParseError(e: Error, file: string): never {
            throw new CSSParseError(e.message, e, file);
        }
    }

    export class DocumentSession {
        _cssIdentifierMap: WeakMap<BaseTypes.BaseClass, number> = new WeakMap();
        _sheetSet: WeakSet<BaseTypes.BaseClass> = new WeakSet();

        _unnamedElements: number = 1;

        _elementMap: BaseTypes.DepdendencyMap = {};
    }

    export namespace BaseTypes {
        export interface BaseClassInstance
            extends WebComponentBaseTypeInstance,
                WebComponentTypeInstance {
            getTheme?(): Theme;
        }

        export type BaseClass = WebComponentBaseTypeStatic &
            WebComponentTypeStatic & {
                new (): BaseClassInstance;

                dependencies?: any[] | null;
                is?: string | null;
                html?: TemplateFnLike<number> | null;
                css?: TemplateFnLike<number> | TemplateFnLike<number>[] | null;
            };

        export interface BaseClassInstanceExtended extends BaseClassInstance {
            _attributes: {
                [key: string]: string;
            };
            isSSR: boolean;
        }

        export interface BaseClassExtended extends BaseClass {
            new (): BaseClassInstanceExtended;
        }

        export type DepdendencyMap = Object & {
            [key: string]: BaseTypes.BaseClass;
        };

        export type StringMap<V> = {
            [key: string]: V;
        };

        export type Theme = StringMap<any>;

        export type Attributes = Object & StringMap<any>;

        export type TextAttributes = Object & StringMap<any>;

        export function _createBase<
            C extends {
                new (...args: any[]): any;
            }
        >(
            klass: C,
            tagName: string,
            props: BaseTypes.Attributes,
            theme: any
        ): BaseClassExtended {
            return (class Base extends klass {
                _attributes: Attributes = {};
                isSSR = true;

                tagName = tagName;

                constructor(...args: any[]) {
                    super(...args);
                    Props.onConnect(this);
                }
                getAttribute(name: string): string {
                    return props[name];
                }
                hasAttribute(name: string): boolean {
                    return props.hasOwnProperty(name);
                }
                setAttribute(name: string, value: string) {
                    this._attributes[name] = value;
                }
                removeAttribute(name: string) {
                    delete this._attributes[name];
                }
                getTheme() {
                    return theme;
                }
            } as unknown) as BaseClassExtended;
        }
    }

    export namespace _Attributes {
        export type Primitive =
            | null
            | undefined
            | boolean
            | number
            | string
            | Symbol
            | bigint;

        export function _isPrimitive(value: unknown): value is Primitive {
            return (
                value === null ||
                !(typeof value === 'object' || typeof value === 'function')
            );
        }

        export function _isIterable(
            value: unknown
        ): value is Iterable<unknown> {
            return (
                Array.isArray(value) ||
                !!(value && (value as any)[Symbol.iterator])
            );
        }

        export function _toString(value: any): string {
            let text: string = '';
            if (_isPrimitive(value) || !_isIterable(value)) {
                return typeof value === 'string' ? value : String(value);
            } else {
                for (const t of value) {
                    text += typeof t === 'string' ? t : String(t);
                }
            }
            return text;
        }

        export function stringify(attributes: BaseTypes.Attributes) {
            if (Object.keys(attributes).length === 0) {
                return '';
            }

            const parts = [];
            for (const key in attributes) {
                parts.push(
                    `${key}="${_toString(attributes[key]).replace(
                        /"/g,
                        '&quot;'
                    )}"`
                );
            }
            return ` ${parts.join(' ')}`;
        }
    }

    export namespace _Properties {
        export function splitAttributes<A extends BaseTypes.Attributes>(
            element: BaseTypes.BaseClassInstance,
            attributes: A
        ): {
            attributes: BaseTypes.Attributes;
            publicProps: BaseTypes.Attributes;
            privateProps: BaseTypes.Attributes;
        } {
            if (!element.props || !(element.props as Props).__config)
                return {
                    attributes,
                    privateProps: {},
                    publicProps: {},
                };

            const config = (element.props as Props).__config;
            if (!config.reflect && !config.priv)
                return {
                    attributes,
                    privateProps: {},
                    publicProps: {},
                };
            const { reflect = {}, priv = {} } = config;

            const attribs: Partial<A> & Object = {};
            const privateProps: Partial<A> & Object = {};
            const publicProps: Partial<A> & Object = {};

            for (const key in attributes) {
                if (key in reflect) {
                    publicProps[key] = attributes[key];
                } else if (key in priv) {
                    privateProps[key] = attributes[key];
                } else {
                    attribs[key] = attribs[key];
                }
            }

            return {
                attributes: attribs,
                privateProps,
                publicProps,
            };
        }
    }

    export namespace _Rendering {
        export namespace Dependencies {
            export function buildMap(
                element: BaseTypes.BaseClass,
                map: BaseTypes.DepdendencyMap = {}
            ) {
                if (element.is) {
                    map[element.is] = element;
                }

                for (const dependency of element.dependencies || []) {
                    buildMap(dependency, map);
                }

                return map;
            }
        }

        export namespace _TextToTags {
            export class Tag {
                public tagName: string;
                public attributes: Object & BaseTypes.TextAttributes;
                public isSelfClosing: boolean;
                private _children: (Tag | TextTag)[];

                public readonly type = 'TAG';

                constructor({
                    tagName,
                    attributes,
                    isSelfClosing,
                    children,
                }: {
                    tagName: string;
                    attributes: BaseTypes.TextAttributes;
                    isSelfClosing: boolean;
                    children: (Tag | TextTag)[];
                }) {
                    this.tagName = tagName;
                    this.attributes = attributes;
                    this.isSelfClosing = isSelfClosing;
                    this._children = children;
                }

                get children() {
                    return this._children;
                }

                copy() {
                    return new Tag({
                        attributes: this.attributes,
                        children: this.children,
                        isSelfClosing: this.isSelfClosing,
                        tagName: this.tagName,
                    });
                }

                static from(tag: Tag) {
                    return tag.copy();
                }

                setChildren(children: (Tag | TextTag)[]) {
                    this._children = children;
                    return this;
                }

                walk(
                    handler: (
                        tag: ParsedTag
                    ) => {
                        newTag: ParsedTag;
                        stop: boolean;
                    } | void
                ): ParsedTag {
                    const result = handler(this);
                    const { stop, newTag } = result || {
                        stop: true,
                        newTag: this,
                    };
                    if (newTag instanceof TextTag || stop) {
                        return newTag;
                    }

                    return newTag
                        .copy()
                        .setChildren(
                            newTag.children.map((c) => c.walk(handler))
                        );
                }

                toText(): string {
                    if (this.isSelfClosing && this.children.length === 0) {
                        return `<${this.tagName}${_Attributes.stringify(
                            this.attributes
                        )}/>`;
                    }
                    return `<${this.tagName}${_Attributes.stringify(
                        this.attributes
                    )}>${this._children.map((c) => c.toText()).join('')}</${
                        this.tagName
                    }>`;
                }
            }

            export class TextTag {
                public content: string;

                public readonly type = 'TEXT';

                constructor({ content }: { content: string }) {
                    this.content = content;
                }

                walk() {
                    return this;
                }

                toText() {
                    return this.content;
                }
            }

            export type ParsedTag = Tag | TextTag;

            export namespace _Parser {
                export const _VOID_TAGS = [
                    'area',
                    'base',
                    'br',
                    'col',
                    'embed',
                    'hr',
                    'img',
                    'input',
                    'keygen',
                    'link',
                    'menuitem',
                    'meta',
                    'param',
                    'source',
                    'track',
                    'wbr',
                ];

                export function _getDOM(text: string) {
                    const handler = new DomHandler();
                    const parser = new HTMLParser(handler);

                    parser.write(text);
                    parser.end();

                    return handler.dom;
                }

                export interface _TagConfig {
                    textBase?: typeof TextTag;
                    tagBase?: typeof Tag;
                }

                export function _domToTags<
                    T extends Tag = Tag,
                    TT extends TextTag = TextTag
                >(
                    dom: (DataNode | Element)[],
                    { tagBase = Tag, textBase = TextTag }: _TagConfig = {}
                ): (T | TT)[] {
                    return dom.map((node) => {
                        if (node.type === 'text') {
                            const dataNode = node as DataNode;
                            return new textBase({
                                content: dataNode.nodeValue,
                            }) as TT;
                        } else {
                            const tagNode = node as Element;
                            return new tagBase({
                                attributes: tagNode.attribs,
                                children: _domToTags(
                                    tagNode.children as (DataNode | Element)[],
                                    { tagBase, textBase }
                                ),
                                isSelfClosing: _VOID_TAGS.includes(
                                    tagNode.tagName.toLowerCase()
                                ),
                                tagName: tagNode.tagName,
                            }) as T;
                        }
                    });
                }

                export function parse<
                    T extends Tag = Tag,
                    TT extends TextTag = TextTag
                >(text: string, tagConfig?: _TagConfig): (T | TT)[] {
                    const dom = _getDOM(text);
                    return _domToTags<T, TT>(
                        dom as (DataNode | Element)[],
                        tagConfig
                    );
                }
            }

            export namespace _Replacement {
                export namespace _Slots {
                    export interface SlotReceivers {
                        named: BaseTypes.StringMap<Tag>;
                        unnamed: Tag | null;
                    }

                    export interface Slottables {
                        named: BaseTypes.StringMap<Tag>;
                        unnamed: ParsedTag[];
                    }

                    export function _findSlotReceivers(
                        root: ParsedTag[]
                    ): SlotReceivers {
                        const slots: SlotReceivers = {
                            named: {},
                            unnamed: null,
                        };
                        root.forEach((t) =>
                            t.walk((tag) => {
                                if (
                                    tag instanceof Tag &&
                                    tag.tagName === 'slot'
                                ) {
                                    if (tag.attributes.hasOwnProperty('name')) {
                                        const {
                                            name: slotName,
                                        } = tag.attributes;
                                        slots.named[slotName] =
                                            slots.named[slotName] || tag;
                                    } else {
                                        slots.unnamed = slots.unnamed || tag;
                                    }

                                    return {
                                        newTag: tag,
                                        stop: true,
                                    };
                                }
                                return;
                            })
                        );
                        return slots;
                    }

                    export function _findSlottables(
                        root: ParsedTag[]
                    ): Slottables {
                        const slottables: Slottables = {
                            named: {},
                            unnamed: [],
                        };

                        root.forEach((t) =>
                            t.walk((tag) => {
                                if (tag instanceof Tag) {
                                    if (tag.attributes.hasOwnProperty('slot')) {
                                        const slotName = tag.attributes.slot;
                                        slottables.named[slotName] =
                                            slottables.named[slotName] || tag;
                                    } else {
                                        slottables.unnamed.push(tag);
                                    }
                                    return {
                                        newTag: tag,
                                        stop: true,
                                    };
                                }
                                return;
                            })
                        );
                        return slottables;
                    }

                    export function _replaceSlots(
                        receivers: SlotReceivers,
                        slottables: Slottables
                    ) {
                        const unslotted: ParsedTag[] = [...slottables.unnamed];
                        for (const slotName in slottables.named) {
                            const slottable = slottables.named[slotName];
                            if (receivers.named[slotName]) {
                                receivers.named[slotName].setChildren([
                                    slottable,
                                ]);
                            } else {
                                unslotted.push(slottable);
                            }
                        }

                        if (receivers.unnamed) {
                            receivers.unnamed.setChildren(unslotted);
                        }
                    }

                    export function applySlots(element: Tag, lightDOM: Tag) {
                        const receivers = _findSlotReceivers(element.children);
                        const slottables = _findSlottables(lightDOM.children);
                        _replaceSlots(receivers, slottables);
                    }
                }

                export function _mapTag(
                    tag: ParsedTag,
                    theme: BaseTypes.Theme,
                    session: DocumentSession
                ): {
                    newTag: ParsedTag;
                    stop: boolean;
                } | void {
                    if (tag instanceof TextTag) return;
                    if (
                        !tag.tagName.includes('-') ||
                        !session._elementMap.hasOwnProperty(tag.tagName)
                    )
                        return;

                    const element = session._elementMap[tag.tagName];
                    const newTag = elementToTag(
                        element,
                        tag.attributes,
                        theme,
                        session
                    );
                    _Slots.applySlots(newTag, tag);
                    return {
                        newTag,
                        stop: true,
                    };
                }

                export function replace(
                    tags: ParsedTag[],
                    theme: BaseTypes.Theme,
                    session: DocumentSession
                ) {
                    return tags.map((t) =>
                        t.walk((tag) => {
                            return _mapTag(tag, theme, session);
                        })
                    );
                }
            }

            export namespace _CSS {
                export class CSSTag extends _TextToTags.Tag {
                    public _changeOn!: CHANGE_TYPE;
                    private _cssChildren: (CSSText | CSSTag)[];

                    constructor({
                        tagName,
                        attributes,
                        isSelfClosing,
                        children,
                    }: {
                        tagName: string;
                        attributes: BaseTypes.TextAttributes;
                        isSelfClosing: boolean;
                        children: (Tag | TextTag | CSSText | CSSTag)[];
                    }) {
                        super({ tagName, attributes, isSelfClosing, children });
                        this._cssChildren = children as (CSSText | CSSTag)[];
                    }

                    get children() {
                        return this._cssChildren;
                    }

                    get elementGlobal() {
                        return (
                            this._changeOn === CHANGE_TYPE.THEME ||
                            !!(this._changeOn & CHANGE_TYPE.NEVER)
                        );
                    }

                    setChangeOn(changeOn: CHANGE_TYPE) {
                        this.children.forEach((c) => c.setChangeOn(changeOn));
                        this._changeOn = changeOn;
                    }
                }

                export interface ParsedCSS {
                    elementGlobal: boolean;
                    css: Stylesheet;
                }

                export class CSSText extends _TextToTags.TextTag {
                    public _changeOn!: CHANGE_TYPE;
                    private _stylesheet: null | Stylesheet = null;

                    constructor({ content }: { content: string }) {
                        super({ content });
                        this.content = content;
                    }

                    setChangeOn(changeOn: CHANGE_TYPE) {
                        this._changeOn = changeOn;
                    }

                    parse() {
                        try {
                            return parseCSS(this.content);
                        } catch (e) {
                            Errors._cssParseError(e, this.content);
                        }
                    }

                    get elementGlobal() {
                        return (
                            this._changeOn === CHANGE_TYPE.THEME ||
                            !!(this._changeOn & CHANGE_TYPE.NEVER)
                        );
                    }

                    get cssParsed() {
                        if (this._stylesheet) return this._stylesheet;
                        return (this._stylesheet = this.parse());
                    }

                    get stylesheet() {
                        return this.cssParsed.stylesheet;
                    }

                    addPrefix(prefix: string) {
                        if (!this.stylesheet) return;
                        this.stylesheet.rules = this.stylesheet.rules.map(
                            (line) => {
                                if (!('selectors' in line)) return line;
                                const rule = line as Rule;
                                if (!rule.selectors) return line;
                                rule.selectors = rule.selectors.map(
                                    (selector) => {
                                        return `${prefix}-${selector}`;
                                    }
                                );
                                return rule;
                            }
                        );
                    }

                    stringify() {
                        this.content = stringifyCSS(this.cssParsed);
                    }
                }

                export function _parseElementCSS(
                    element: BaseTypes.BaseClass,
                    instance: BaseTypes.BaseClassInstance
                ): CSSTag[][] {
                    if (!element.css) return [];
                    const templates = Array.isArray(element.css)
                        ? element.css
                        : [element.css];

                    return templates.map((template) => {
                        const text = _tryRender(instance, template);
                        const cssTags = _TextToTags._Parser.parse<
                            CSSTag,
                            CSSText
                        >(text, {
                            tagBase: CSSTag,
                            textBase: CSSText,
                        });
                        const styleTags = cssTags.filter((t): t is CSSTag => {
                            return t.type === 'TAG';
                        });
                        styleTags.forEach((t) =>
                            t.setChangeOn(template.changeOn)
                        );
                        return styleTags;
                    });
                }

                export function _generateUniqueID(
                    element: BaseTypes.BaseClass,
                    tagName: string,
                    session: DocumentSession
                ) {
                    if (!session._cssIdentifierMap.has(element)) {
                        session._cssIdentifierMap.set(element, 0);
                    }

                    const num = session._cssIdentifierMap.get(element)!;
                    session._cssIdentifierMap.set(element, num + 1);

                    return `css-${tagName}-${num}`;
                }

                export function _generateComponentID(tagName: string) {
                    return `css-${tagName}`;
                }

                export function _walkCSSSheets(
                    tags: (CSSTag | CSSText)[],
                    handler: (tag: CSSText) => void
                ): (CSSTag | CSSText)[] {
                    return tags.map((tag) => {
                        if (tag instanceof CSSTag) {
                            _walkCSSSheets(tag.children, handler);
                        } else {
                            handler(tag);
                        }
                        return tag;
                    });
                }

                export function _addCSSPrefixes(
                    templates: CSSTag[][],
                    uniqueID: string,
                    componentID: string
                ) {
                    return templates.map((template) => {
                        return template.map((sheet) => {
                            const prefix = sheet.elementGlobal
                                ? componentID
                                : uniqueID;

                            _walkCSSSheets(sheet.children, (tag) => {
                                tag.addPrefix(prefix);
                                tag.stringify();
                            });
                            return sheet;
                        });
                    });
                }

                export function _addHTMLPrefixes(
                    tags: ParsedTag[],
                    uniqueID: string,
                    componentID: string
                ) {
                    return tags.map((tagClass) => {
                        return tagClass.walk((tag) => {
                            if (tag instanceof TextTag) return;

                            const classNames = (() => {
                                if (!tag.attributes.hasOwnProperty('class'))
                                    return [];
                                const classNames = tag.attributes.class;
                                if (typeof classNames !== 'string') return [];
                                return classNames.split(' ');
                            })();
                            classNames.push(uniqueID, componentID);
                            tag.attributes.class = classNames.join(' ');

                            return {
                                newTag: tag,
                                stop: tag.tagName.includes('-'),
                            };
                        });
                    });
                }

                export function _flatten<V>(values: (V | V[])[]): V[] {
                    const result: V[] = [];
                    for (const arr of values) {
                        if (Array.isArray(arr)) {
                            result.push(...arr);
                        } else {
                            result.push(arr);
                        }
                    }
                    return result;
                }

                export function getCSSApplied(
                    element: BaseTypes.BaseClass,
                    instance: BaseTypes.BaseClassInstance,
                    tagName: string,
                    children: ParsedTag[],
                    session: DocumentSession
                ) {
                    const uniqueID = _generateUniqueID(
                        element,
                        tagName,
                        session
                    );
                    const componentID = _generateComponentID(tagName);

                    const parsed = _parseElementCSS(element, instance);
                    const prefixedCSS = _flatten(
                        _addCSSPrefixes(parsed, uniqueID, componentID)
                    );

                    const htmlPrefixed = _addHTMLPrefixes(
                        children,
                        uniqueID,
                        componentID
                    );

                    // debugger;
                    const isFirstElementRender = !session._sheetSet.has(
                        element
                    );
                    session._sheetSet.add(element);

                    return [
                        ...(isFirstElementRender
                            ? _flatten(
                                  prefixedCSS.filter((s) => s.elementGlobal)
                              )
                            : []),
                        ..._flatten(
                            prefixedCSS.filter((s) => !s.elementGlobal)
                        ),
                        ...htmlPrefixed,
                    ];
                }
            }

            export function _tryRender(
                instance: BaseTypes.BaseClassInstance,
                template: TemplateFnLike<number> | null
            ) {
                try {
                    return (
                        template?.renderAsText(CHANGE_TYPE.ALWAYS, instance) ||
                        ''
                    );
                } catch (e) {
                    Errors._renderError(e);
                }
            }

            export function elementToTag(
                element: BaseTypes.BaseClass,
                attribs: BaseTypes.Attributes,
                theme: BaseTypes.Theme,
                session: DocumentSession
            ): Tag {
                const tagName =
                    element.is || `wclib-element${session._unnamedElements++}`;
                const wrappedClass = BaseTypes._createBase(
                    element,
                    tagName,
                    attribs,
                    theme
                );
                const instance = new wrappedClass();

                const text = _tryRender(instance, element.html);
                const tags = _Parser.parse(text);
                const { attributes, publicProps } = _Properties.splitAttributes(
                    instance,
                    attribs
                );
                const children = _Replacement.replace(tags, theme, session);
                const cssApplied = _CSS.getCSSApplied(
                    element,
                    instance,
                    tagName,
                    children,
                    session
                );
                return new Tag({
                    tagName,
                    attributes: {
                        ...attributes,
                        ...publicProps,
                        ...instance._attributes,
                    },
                    isSelfClosing: false,
                    children: cssApplied,
                });
            }
        }

        export function render<C extends BaseTypes.BaseClass>(
            element: C,
            attributes: BaseTypes.Attributes,
            theme: BaseTypes.Theme,
            session: DocumentSession
        ): string {
            const dom = _TextToTags.elementToTag(
                element,
                attributes,
                theme,
                session
            );
            return dom.toText();
        }
    }

    export function renderElement<
        C extends BaseTypes.BaseClass,
        I extends InferInstance<C>
    >(
        element: C,
        props: Partial<I['props']> = {},
        attributes: SSR.BaseTypes.Attributes = {},
        theme: SSR.BaseTypes.Theme = {},
        session: DocumentSession = new DocumentSession()
    ): string {
        session._elementMap = {
            ...session._elementMap,
            ..._Rendering.Dependencies.buildMap(element),
        };
        return _Rendering.render(
            element,
            { ...props, ...attributes },
            theme,
            session
        );
    }
}

/**
 * The base class that can be rendered using server side rendering
 */
export interface SSRBaseClass extends SSR.BaseTypes.BaseClass {}

/**
 * Render a single element to a string that can be written to a server's client. If no
 *  document session is passed, treats the element as if it's the only element in the
 *  document. If you want to render multiple elements for the same document,
 *  use `createSSRSession`.
 *
 * @param {SSR.BaseTypes.BaseClass} element - The element to render
 * @param { { [key: string]: any } } [props] - Props to pass to the element
 * @param { { [key: string]: any } } [attributes] - HTML attributes to apply to the element
 * @param { { [key: string]: any } } [theme] - A theme to apply to teh element
 * @param {SSR.DocumentSession} [documentSession] - The document session to use
 *
 * @returns {string} The rendered element
 */
export function ssr<
    C extends SSR.BaseTypes.BaseClass,
    I extends InferInstance<C>
>(
    element: C,
    props?: Partial<I['props']>,
    attributes?: SSR.BaseTypes.Attributes,
    theme?: SSR.BaseTypes.Theme,
    documentSession?: SSR.DocumentSession
): string {
    return SSR.renderElement(
        element,
        props,
        attributes,
        theme,
        documentSession
    );
}

/**
 * Create a document rendering session. Pass the returned document to `ssr` to
 *  preserve the state of the document, avoiding conflicts
 *
 * @returns {SSR.DocumentSession} A document rendering session's variables
 */
export function createSSRSession(): SSR.DocumentSession {
    return new SSR.DocumentSession();
}