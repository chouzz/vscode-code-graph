import * as vscode from 'vscode';
import {
    gotoItemsCommandType,
    initItemsCommandType,
    onHoverCommandType,
    IpcMessage,
    State,
} from './protocol';

import { WebviewViewBase } from './webviewBase';

export class CodeGraphWebview extends WebviewViewBase<State> {
    constructor() {
        super('codeGraph.view', 'index.html', 'Code Graph');
    }

    protected onMessageReceived(e: IpcMessage): void {
        switch (e.method) {
            case gotoItemsCommandType.method:
                this.onGotoItem(e.params);
                break;
            case initItemsCommandType.method:
                this.onInitItem(e.params);
                break;

            case onHoverCommandType.method:
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
    const webview = new CodeGraphWebview();
    context.subscriptions.push(webview);
}
