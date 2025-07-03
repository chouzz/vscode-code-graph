import * as vscode from 'vscode';
import { SymbolHierarchyViewProvider } from './webviewViewProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "symbol-hierarchy-viewer" is now active!');

    const provider = new SymbolHierarchyViewProvider(context.extensionUri, context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SymbolHierarchyViewProvider.viewType, provider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('symbol-hierarchy-viewer.showCallHierarchy', async () => {
            // Ensure the view is visible
            await vscode.commands.executeCommand('symbolHierarchyView.focus');

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showInformationMessage('No active editor found.');
                return;
            }
            const position = editor.selection.active;
            const uri = editor.document.uri;

            try {
                const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
                    'vscode.prepareCallHierarchy',
                    uri,
                    position
                );

                let callHierarchyRootItems: vscode.CallHierarchyItem[] = [];
                if (items) {
                    callHierarchyRootItems = Array.isArray(items) ? items : [items];
                }

                if (provider.view) {
                    provider.view.show?.(true);
                    provider.view.webview.postMessage({
                        type: 'showCallHierarchy',
                        data: callHierarchyRootItems,
                        hierarchyType: 'root' // To indicate these are the initial root items
                    });
                } else {
                    // This case should ideally not be hit if 'symbolHierarchyView.focus' resolves the view.
                    // If it does, the view might not have been registered or an error occurred during its initialization.
                    vscode.window.showErrorMessage('Symbol Hierarchy View is not available. Please try reopening it or check the developer console.');
                }
            } catch (error) {
                console.error('Error preparing call hierarchy:', error);
                vscode.window.showErrorMessage('Error preparing call hierarchy. See console for details.');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('symbol-hierarchy-viewer.findReferences', async () => {
            await vscode.commands.executeCommand('symbolHierarchyView.focus');

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showInformationMessage('No active editor found.');
                return;
            }
            const position = editor.selection.active;
            const uri = editor.document.uri;

            try {
                const locations = await vscode.commands.executeCommand<vscode.Location[]>(
                    'vscode.executeReferenceProvider',
                    uri,
                    position
                );

                if (provider.view) {
                    provider.view.show?.(true);
                    provider.view.webview.postMessage({ type: 'findReferences', data: locations });
                } else {
                    vscode.window.showInformationMessage('Symbol Hierarchy View not available.');
                }
            } catch (error) {
                console.error('Error finding references:', error);
                vscode.window.showErrorMessage('Error finding references. See console for details.');
            }
        })
    );
}

export function deactivate() {}
