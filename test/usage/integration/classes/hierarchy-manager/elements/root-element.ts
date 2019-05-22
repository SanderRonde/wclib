import { ConfigurableWebComponent, TemplateFn, CHANGE_TYPE, config, Props, PROP_TYPE } from '../../../../../../src/wclib.js';
import { render, html } from '../../../../../../node_modules/lit-html/lit-html.js';
import { TestElement } from '../../elements/test-element.js';
import { ParentElement } from './parent-element.js';

const RootElementHTML = new TemplateFn<RootElement>(() => {
	return html`
		<test-element></test-element>
		<parent-element></parent-element>
		<parent-element></parent-element>
		<test-element></test-element>
	`;
}, CHANGE_TYPE.NEVER, render);

const RootElementCSS = new TemplateFn<RootElement>(() => {
	return html`<style> * {color: red; } </style>`;
}, CHANGE_TYPE.NEVER, render);

@config({
	is: 'root-element',
	html: RootElementHTML,
	css: RootElementCSS,
	dependencies: [
		ParentElement,
		TestElement
	]
})
export class RootElement extends ConfigurableWebComponent<{
	IDS: {};
	CLASSES: {};
}, {
	test: {
		args: [number, number];
	}
	test2: {
		args: [];
		returnType: number;
	}
}> {
	props = Props.define(this, {
		reflect: {
			x: {
				type: PROP_TYPE.NUMBER,
				value: 1
			}
		}
	});
}