import { TemplateFn, CHANGE_TYPE, config, Props, PROP_TYPE } from '../../../../../../../build/es/wc-lib.js';
import { ComplexTemplatingWebComponent } from '../../../../../../../build/es/classes/partial.js';
import { render, html } from '../../../../../../../node_modules/lit-html/lit-html.js';

const TestElementHTML = new TemplateFn<TestElement>((_, props) => {
	return html`
		<div class="divClass" id="divId">Test</div>
		<h1 id="headerId" class="headerClass">${props.x}</h1>
	`;
}, CHANGE_TYPE.PROP, render);

const TestElementCSS = new TemplateFn<TestElement>(() => {
	return html`<style> * {color: red; } </style>`;
}, CHANGE_TYPE.NEVER, render);

@config({
	is: 'test-element',
	html: TestElementHTML,
	css: TestElementCSS
})
export class TestElement extends ComplexTemplatingWebComponent<{
	selectors: {
		IDS: {
			divId: HTMLDivElement;
			headerId: HTMLHeadingElement;
		};
		CLASSES: {
			divClass: HTMLDivElement;
			headerClass: HTMLHeadingElement;
		};
	};
	events: {
		test: {
			args: [number, number];
		}
		test2: {
			args: [];
			returnType: number;
		}
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

export interface TestWindow extends Window {
	TestElement: typeof TestElement;
	ParentElement: typeof ParentElement;
}
declare const window: TestWindow;
window.TestElement = TestElement;

const ParentElementHTML = new TemplateFn<ParentElement>(() => {
	return html`
		<test-element></test-element>
	`;
}, CHANGE_TYPE.NEVER, render);

const ParentElementCSS = new TemplateFn<ParentElement>(() => {
	return html`<style> * {color: red; } </style>`;
}, CHANGE_TYPE.NEVER, render);

@config({
	is: 'parent-element',
	html: ParentElementHTML,
	css: ParentElementCSS,
	dependencies: [
		TestElement
	]
})
export class ParentElement extends ComplexTemplatingWebComponent<{
	events: {
		test: {
			args: [number, number];
		}
		test2: {
			args: [];
			returnType: number;
		}
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

window.ParentElement = ParentElement;

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
export class RootElement extends ComplexTemplatingWebComponent<{
	events: {
		test: {
			args: [number, number];
		}
		test2: {
			args: [];
			returnType: number;
		}
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

RootElement.define();

export interface TestGlobalProperties {
	a: string;
	c: string;
}