import { TemplateFn, CHANGE_TYPE, css } from '../../src/wclib';
import { ThemedComponent } from './themed-component.js';
import { render } from 'lit-html';

export const ThemedComponentCSS = new TemplateFn<ThemedComponent>(function (html, _, theme) {
	return html`<style>
		${css(this).$["horizontal-centerer"]} {
			display: flex;
			flex-direction: row;
			justify-content: center;
		}

		${css(this).$["vertical-centerer"]} {
			display: flex;
			flex-direction: column;
			justify-content: center;
		}

		${css(this).$.background} {
			width: 90vw;
			height: 90vw;
			background-color: ${theme.background};
		}

		${css(this).$.primary} {
			color: ${theme.primary};
		}

		${css(this).$.secondary} {
			color: ${theme.secondary};
		}

		${css(this).$.regular} {
			color: ${theme.regular}
		}

		${css(this).class["theme-option"]} {
			font-weight: normal;
		}

		${css(this).class["theme-option"].toggle.active} {
			font-weight: bold;
		}
	</style>`
}, CHANGE_TYPE.THEME, render);
