import { State } from '../protocol';
import './callHierarchy.scss';
import { AppWithConfig } from './shared/appWithConfigBase';;

export class CallHierarchyApp extends AppWithConfig<State> {
	constructor() {
		super('CallHierarchy');
	}
}

new CallHierarchyApp();