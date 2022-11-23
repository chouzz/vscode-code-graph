import * as vscode from 'vscode';
import {
    callHierarchyGotoItemsCommandType,
    callHierarchyInitItemsCommandType,
    callHierarchyOnHoverCommandType,
    IpcMessage,
    State,
} from './protocol';

import { WebviewViewBase } from './webviewBase';

export class CallHierarchyWebview extends WebviewViewBase<State> {
    constructor() {
        super('codeGraph.callHierarch.view', 'index.html', 'Call Hierarchy');
    }

    protected onMessageReceived(e: IpcMessage): void {
        switch (e.method) {
            case callHierarchyGotoItemsCommandType.method:
                this.onGotoItem(e.params);
                break;
            case callHierarchyInitItemsCommandType.method:
                this.onInitItem(e.params);
                break;

            case callHierarchyOnHoverCommandType.method:
                this.onHoverItem(e.params);
                break;
            default:
                break;
        }
    }

    private onGotoItem(params: any) {}

    private onInitItem(params: any) {}

    private onHoverItem(params: any) {}
}

export function activate(context: vscode.ExtensionContext){
    const webview = new CallHierarchyWebview();
    context.subscriptions.push(webview);
}
