
import * as vscode from 'vscode';
import * as callHierarchyPanel from './webview/callHierarchyWebview';

export let extensionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext) {
	extensionContext = context;
	callHierarchyPanel.activate(context);
}

export function deactivate() {}
