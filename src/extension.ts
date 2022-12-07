
import * as vscode from 'vscode';
import * as CodeGraphWebview from './webview/codeGraphWebview';

export let extensionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext) {
	extensionContext = context;
	CodeGraphWebview.activate(context);
}

export function deactivate() {}
