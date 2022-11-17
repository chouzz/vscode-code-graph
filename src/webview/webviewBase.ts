import { TextDecoder } from 'util';
import * as vscode from 'vscode';
import { getNonce } from '../common/node';
import { extensionContext } from '../extension';
import {
    ExecuteCommandType,
    IpcMessage,
    IpcMessageParams,
    IpcNotificationType,
    onIpc,
    WebviewReadyCommandType,
} from './protocol';

const maxSmallIntegerV8 = 2 ** 30; // Max number that can be stored in V8's smis (small integers)

let ipcSequence = 0;
function nextIpcId() {
    if (ipcSequence === maxSmallIntegerV8) {
        ipcSequence = 1;
    } else {
        ipcSequence++;
    }

    return `host:${ipcSequence}`;
}

export type WebviewViewIds = 'commitDetails' | 'home' | 'timeline';

export abstract class WebviewViewBase<State, SerializedState = State>
    implements vscode.WebviewViewProvider, vscode.Disposable
{
    protected readonly disposables: vscode.Disposable[] = [];
    protected isReady: boolean = false;
    private _disposableView: vscode.Disposable | undefined;
    protected _view: vscode.WebviewView | undefined;

    constructor(public readonly id: string, protected readonly fileName: string, title: string) {
        this._title = title;
        this.disposables.push(vscode.window.registerWebviewViewProvider(id, this));
    }

    dispose() {
        this.disposables.forEach((d) => void d.dispose());
        this._disposableView?.dispose();
    }

    get description(): string | undefined {
        return this._view?.description;
    }
    set description(description: string | undefined) {
        if (!this._view) {
            return;
        }

        this._view.description = description;
    }

    private _title: string;
    get title(): string {
        return this._view?.title ?? this._title;
    }
    set title(title: string) {
        this._title = title;
        if (!this._view) {
            return;
        }

        this._view.title = title;
    }

    get visible() {
        return this._view?.visible ?? false;
    }

    async show(options?: { preserveFocus?: boolean }) {
        try {
            void (await vscode.commands.executeCommand(`${this.id}.focus`, options));
        } catch (ex) {
            // Logger.error(ex, scope);
        }
    }

    private readonly _cspNonce = getNonce();
    protected get cspNonce(): string {
        return this._cspNonce;
    }

    protected onInitializing?(): vscode.Disposable[] | undefined;
    protected onReady?(): void;
    protected onMessageReceived?(e: IpcMessage): void;
    protected onFocusChanged?(focused: boolean): void;
    protected onVisibilityChanged?(visible: boolean): void;
    protected onWindowFocusChanged?(focused: boolean): void;

    protected registerCommands?(): vscode.Disposable[];

    protected includeBootstrap?(): SerializedState | Promise<SerializedState>;
    protected includeHead?(): string | Promise<string>;
    protected includeBody?(): string | Promise<string>;
    protected includeEndOfBody?(): string | Promise<string>;

    async resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): Promise<void> {
        this._view = webviewView;

        webviewView.webview.options = {
            enableCommandUris: true,
            enableScripts: true,
        };

        webviewView.title = this._title;

        this._disposableView = vscode.Disposable.from(
            this._view.onDidDispose(this.onViewDisposed, this),
            this._view.onDidChangeVisibility(() => this.onViewVisibilityChanged(this.visible), this),
            this._view.webview.onDidReceiveMessage(this.onMessageReceivedCore, this),
            vscode.window.onDidChangeWindowState(this.onWindowStateChanged, this),
            ...(this.onInitializing?.() ?? []),
            ...(this.registerCommands?.() ?? []),
        );

        await this.refresh();
        this.onVisibilityChanged?.(true);
    }

    protected async refresh(force?: boolean): Promise<void> {
        if (!this._view) {
            return;
        }

        // Mark the webview as not ready, until we know if we are changing the html
        this.isReady = false;
        const html = await this.getHtml(this._view.webview);
        if (force) {
            // Reset the html to get the webview to reload
            this._view.webview.html = '';
        }

        // If we aren't changing the html, mark the webview as ready again
        if (this._view.webview.html === html) {
            this.isReady = true;
            return;
        }

        this._view.webview.html = html;
    }

    private resetContextKeys(): void {
        // void setContext(`${this.contextKeyPrefix}:inputFocus`, false);
        // void setContext(`${this.contextKeyPrefix}:focus`, false);
    }

    private setContextKeys(focus: boolean, inputFocus: boolean): void {
        // void setContext(`${this.contextKeyPrefix}:focus`, focus);
        // void setContext(`${this.contextKeyPrefix}:inputFocus`, inputFocus);
    }

    private onViewDisposed() {
        this.resetContextKeys();

        this.onFocusChanged?.(false);
        this.onVisibilityChanged?.(false);

        this.isReady = false;
        this._disposableView?.dispose();
        this._disposableView = undefined;
        this._view = undefined;
    }

    // protected onViewFocusChanged(e: WebviewFocusChangedParams): void {
    // 	this.setContextKeys(e.focused, e.inputFocused);
    // 	this.onFocusChanged?.(e.focused);
    // }

    private async onViewVisibilityChanged(visible: boolean) {
        if (visible) {
            await this.refresh();
        } else {
            this.resetContextKeys();
            this.onFocusChanged?.(false);
        }
        this.onVisibilityChanged?.(visible);
    }

    private onWindowStateChanged(e: vscode.WindowState) {
        if (!this.visible) {
            return;
        }

        this.onWindowFocusChanged?.(e.focused);
    }

    private onMessageReceivedCore(e: IpcMessage) {
        if (!e) {
            return;
        }

        switch (e.method) {
            case WebviewReadyCommandType.method:
                onIpc(WebviewReadyCommandType, e, () => {
                    this.isReady = true;
                    this.onReady?.();
                });

                break;

            case ExecuteCommandType.method:
                onIpc(ExecuteCommandType, e, (params) => {
                    if (params.args) {
                        vscode.commands.executeCommand(params.command, ...params.args);
                    } else {
                        vscode.commands.executeCommand(params.command);
                    }
                });
                break;

            default:
                this.onMessageReceived?.(e);
                break;
        }
    }

    private async getHtml(webview: vscode.Webview): Promise<string> {
        const webRootUri = vscode.Uri.joinPath(extensionContext.extensionUri, 'dist', 'webviews');
        const uri = vscode.Uri.joinPath(webRootUri, this.fileName);
        const content = new TextDecoder('utf8').decode(await vscode.workspace.fs.readFile(uri));

        const [bootstrap, head, body, endOfBody] = await Promise.all([
            this.includeBootstrap?.(),
            this.includeHead?.(),
            this.includeBody?.(),
            this.includeEndOfBody?.(),
        ]);

        const cspSource = webview.cspSource;

        const root = webview.asWebviewUri(extensionContext.extensionUri).toString();
        const webRoot = webview.asWebviewUri(webRootUri).toString();

        const html = content.replace(
            /#{(head|body|endOfBody|placement|cspSource|cspNonce|root|webroot)}/g,
            (_substring: string, token: string) => {
                switch (token) {
                    case 'head':
                        return head ?? '';
                    case 'body':
                        return body ?? '';
                    case 'endOfBody':
                        return `${
                            bootstrap !== null
                                ? `<script type="text/javascript" nonce="${
                                      this.cspNonce
                                  }">window.bootstrap=${JSON.stringify(bootstrap)};</script>`
                                : ''
                        }${endOfBody ?? ''}`;
                    case 'placement':
                        return 'view';
                    case 'cspSource':
                        return cspSource;
                    case 'cspNonce':
                        return this.cspNonce;
                    case 'root':
                        return root;
                    case 'webroot':
                        return webRoot;
                    default:
                        return '';
                }
            },
        );

        return html;
    }

    protected nextIpcId(): string {
        return nextIpcId();
    }

    protected notify<T extends IpcNotificationType<any>>(
        type: T,
        params: IpcMessageParams<T>,
        completionId?: string,
    ): Promise<boolean> {
        return this.postMessage({
            id: this.nextIpcId(),
            method: type.method,
            params: params,
            completionId: completionId,
        });
    }

    protected postMessage(message: IpcMessage) {
        if (!this._view || !this.isReady) {
            return Promise.resolve(false);
        }

        // It looks like there is a bug where `postMessage` can sometimes just hang infinitely. Not sure why, but ensure we don't hang
        return Promise.race<boolean>([
            this._view.webview.postMessage(message),
            new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
        ]);
    }
}
