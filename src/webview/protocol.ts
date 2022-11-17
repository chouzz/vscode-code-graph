
export interface IpcMessage {
	id: string;
	method: string;
	params?: unknown;
	completionId?: string;
}

abstract class IpcMessageType<Params = void> {
	_?: Params; // Required for type inferencing to work properly
	constructor(public readonly method: string, public readonly overwriteable: boolean = false) {}
}
export type IpcMessageParams<T> = T extends IpcMessageType<infer P> ? P : never;

/**
 * Commands are sent from the webview to the extension
 */
export class IpcCommandType<Params = void> extends IpcMessageType<Params> {}
/**
 * Notifications are sent from the extension to the webview
 */
export class IpcNotificationType<Params = void> extends IpcMessageType<Params> {}

export function onIpc<T extends IpcMessageType<any>>(
	type: T,
	msg: IpcMessage,
	fn: (params: IpcMessageParams<T>, type: T) => unknown,
) {
	if (type.method !== msg.method) return;

	fn(msg.params as IpcMessageParams<T>, type);
}

// COMMANDS

export const WebviewReadyCommandType = new IpcCommandType('webview/ready');

export interface WebviewFocusChangedParams {
	focused: boolean;
	inputFocused: boolean;
}
export const WebviewFocusChangedCommandType = new IpcCommandType<WebviewFocusChangedParams>('webview/focus');

export interface ExecuteCommandParams {
	command: string;
	args?: [];
}
export const ExecuteCommandType = new IpcCommandType<ExecuteCommandParams>('command/execute');