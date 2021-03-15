import { render } from '../../node_modules/lit-html/lit-html.js';
import { TemplateFn, CHANGE_TYPE } from '../../build/es/wc-lib.js';
import { JsxInput } from './jsx-input.js';
export const JsxFormHTML = new TemplateFn(function (html) {
    return (html.jsx("div", { id: "form" },
        html.jsx("h1", null, "Login form"),
        html.jsx(JsxInput, { type: "text", name: "username", placeholder: "username" }),
        html.jsx(JsxInput, { type: "password", name: "password", placeholder: "password" }),
        html.jsx("button", { type: "submit" }, "Submit")));
}, CHANGE_TYPE.PROP, render);