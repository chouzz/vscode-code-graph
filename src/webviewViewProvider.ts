import * as vscode from 'vscode';

export class SymbolHierarchyViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'symbolHierarchyView'; // Matches the ID in package.json

    public view?: vscode.WebviewView;
    private _extensionUri: vscode.Uri;
    private _context: vscode.ExtensionContext;

    constructor(extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        this._extensionUri = extensionUri;
        this._context = context;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'media'),
                vscode.Uri.joinPath(this._extensionUri, 'out'),
                vscode.Uri.joinPath(this._extensionUri, 'node_modules') // For @vscode/codicons
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async message => {
            switch (message.type) {
                case 'expandCallHierarchy':
                    if (message.item && message.direction) {
                        try {
                            let results;
                            if (message.direction === 'incoming') {
                                results = await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>(
                                    'vscode.provideCallHierarchyIncomingCalls',
                                    message.item
                                );
                            } else if (message.direction === 'outgoing') {
                                results = await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>(
                                    'vscode.provideCallHierarchyOutgoingCalls',
                                    message.item
                                );
                            }
                            webviewView.webview.postMessage({
                                type: 'callHierarchyResults',
                                parentItemId: message.item.uri.toString() + '_' + message.item.selectionRange.start.line + '_' + message.item.selectionRange.start.character, // Unique ID for parent
                                direction: message.direction,
                                data: results
                            });
                        } catch (error) {
                            console.error(`Error providing ${message.direction} calls:`, error);
                            vscode.window.showErrorMessage(`Error providing ${message.direction} calls.`);
                        }
                    }
                    return;
                case 'navigateToLocation':
                    if (message.location && message.location.uri && message.location.range) {
                        const targetUri = vscode.Uri.from(message.location.uri);
                        const targetRange = new vscode.Range(
                            new vscode.Position(message.location.range.start.line, message.location.range.start.character),
                            new vscode.Position(message.location.range.end.line, message.location.range.end.character)
                        );
                        try {
                            const doc = await vscode.workspace.openTextDocument(targetUri);
                            await vscode.window.showTextDocument(doc, { selection: targetRange });
                        } catch (e) {
                            vscode.window.showErrorMessage(`Could not open file: ${targetUri.fsPath}`);
                            console.error(e);
                        }
                    }
                    return;
                case 'webviewReady':
                    // Webview is ready, potentially send initial data if needed or confirm readiness
                    console.log("Webview is ready.");
                    return;
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
        const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'styles.css'));
        const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'));
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
                <link href="${stylesUri}" rel="stylesheet">
                <link href="${codiconsUri}" rel="stylesheet" />
                <title>Symbol Hierarchy</title>
            </head>
            <body>
                <div id="results-container">
                    <p>Right-click on a symbol in your code and select "Show Call Hierarchy in Panel" or "Find References in Panel".</p>
                </div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
