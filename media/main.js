// @ts-check

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();
    // const oldState = vscode.getState(); // Removed as it's not used for rehydration in this version
    // /** @type {Array<any>} */
    // let results = oldState?.results || []; // Removed

    const resultsContainer = /** @type {HTMLElement} */ (document.getElementById('results-container'));

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', event => {
        const message = event.data; // The json data that the extension sent
        switch (message.type) {
            case 'showCallHierarchy':
            case 'findReferences':
                resultsContainer.innerHTML = ''; // Clear previous results
                renderResults(message.data, message.type, message.hierarchyType);
                break;
            case 'callHierarchyResults':
                appendCallHierarchyResults(message.parentItemId, message.direction, message.data);
                break;
        }
    });

    function renderResults(data, type, hierarchyType) {
        if (!data || data.length === 0) {
            resultsContainer.innerHTML = '<p>No results found.</p>';
            return;
        }

        const ul = document.createElement('ul');
        ul.className = 'results-list';

        if (type === 'showCallHierarchy') {
            data.forEach(item => ul.appendChild(createCallHierarchyLi(item, hierarchyType, 0)));
        } else if (type === 'findReferences') {
            data.forEach(location => ul.appendChild(createReferenceLi(location)));
        }
        resultsContainer.appendChild(ul);
    }

    /**
     * @param {any} item The CallHierarchyItem or CallHierarchyIncomingCall/CallHierarchyOutgoingCall
     * @param {'root' | 'incoming' | 'outgoing'} hierarchyType
     * @param {number} level
     */
    function createCallHierarchyLi(itemData, hierarchyType, level) {
        const li = document.createElement('li');
        li.className = `result-item call-hierarchy-item level-${level}`;

        const item = hierarchyType === 'incoming' ? itemData.from : (hierarchyType === 'outgoing' ? itemData.to : itemData);
        const itemId = item.uri.toString() + '_' + item.selectionRange.start.line + '_' + item.selectionRange.start.character;
        li.dataset.itemId = itemId;

        const expandButton = document.createElement('span');
        expandButton.className = 'codicon codicon-add expand-button';
        expandButton.title = 'Expand';
        expandButton.addEventListener('click', (e) => {
            e.stopPropagation();
            // For root items or items that are 'to' (outgoing), we want to see who they call (outgoing)
            // and who calls them (incoming).
            // For items that are 'from' (incoming), we only want to see who calls them (incoming).

            // Default is to show both incoming and outgoing for root or 'to' items.
            // For 'from' items, we'd typically only show further incoming.
            // This logic might need refinement based on desired UX.

            // For simplicity now, always ask for both if it's a CallHierarchyItem
            // If it's an IncomingCall, ask for more incoming from `itemData.from`
            // If it's an OutgoingCall, ask for more outgoing from `itemData.to`

            if (item.uri && item.selectionRange) { // Ensure it's a CallHierarchyItem like structure
                vscode.postMessage({ type: 'expandCallHierarchy', item: item, direction: 'incoming' });
                vscode.postMessage({ type: 'expandCallHierarchy', item: item, direction: 'outgoing' });
            }
        });

        const icon = document.createElement('span');
        icon.className = `codicon ${getSymbolKindIcon(item.kind)}`;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'item-name';
        nameSpan.textContent = item.name;

        const detailSpan = document.createElement('span');
        detailSpan.className = 'item-detail';
        detailSpan.textContent = item.detail || '';

        const fileSpan = document.createElement('span');
        fileSpan.className = 'item-file';
        const filePath = item.uri.path.substring(item.uri.path.lastIndexOf('/') + 1);
        fileSpan.textContent = `${filePath}:${item.selectionRange.start.line + 1}`;
        fileSpan.title = item.uri.path;

        fileSpan.addEventListener('click', () => {
            vscode.postMessage({
                type: 'navigateToLocation',
                location: {
                    uri: item.uri,
                    range: item.selectionRange
                }
            });
        });

        li.appendChild(expandButton);
        li.appendChild(icon);
        li.appendChild(nameSpan);
        if (item.detail) li.appendChild(detailSpan);
        li.appendChild(fileSpan);

        // Add sub-list container
        const subList = document.createElement('ul');
        subList.className = 'results-list nested';
        subList.id = `children-of-${itemId}`;
        li.appendChild(subList);

        return li;
    }

    /**
     * @param {string} parentItemId
     * @param {'incoming' | 'outgoing'} direction
     * @param {any[]} resultsData
     */
    function appendCallHierarchyResults(parentItemId, direction, resultsData) {
        const parentLi = /** @type {HTMLElement} */ (document.querySelector(`li[data-item-id="${parentItemId}"]`));
        if (!parentLi) return;

        let subList = /** @type {HTMLElement} */ (parentLi.querySelector(`ul#children-of-${parentItemId}`));
        if (!subList) { // Should not happen if createCallHierarchyLi created it
            subList = document.createElement('ul');
            subList.className = 'results-list nested';
            subList.id = `children-of-${parentItemId}`;
            parentLi.appendChild(subList);
        }

        // Add a header for the direction if not already present or if list is empty
        if (!subList.querySelector(`.hierarchy-direction-header.${direction}`)) {
            const header = document.createElement('li');
            header.className = `hierarchy-direction-header ${direction}`;
            header.textContent = direction === 'incoming' ? 'Calls to:' : 'Calls from:';
            subList.appendChild(header);
        }


        resultsData.forEach(result => {
            const currentLevel = parseInt(parentLi.className.match(/level-(\d+)/)?.[1] || '0', 10);
            // Determine item and type for createCallHierarchyLi
            // 'itemData' is the CallHierarchyIncomingCall or CallHierarchyOutgoingCall
            // 'hierarchyType' is 'incoming' or 'outgoing' to guide createCallHierarchyLi
            subList.appendChild(createCallHierarchyLi(result, direction, currentLevel + 1));
        });
    }


    function createReferenceLi(location) {
        const li = document.createElement('li');
        li.className = 'result-item reference-item';

        const fileSpan = document.createElement('span');
        fileSpan.className = 'item-file';
        const filePath = location.uri.path.substring(location.uri.path.lastIndexOf('/') + 1);
        fileSpan.textContent = `${filePath}:${location.range.start.line + 1}`;
        fileSpan.title = location.uri.path;

        // TODO: Add snippet of the line if possible (requires reading file content, might be complex for webview)

        li.appendChild(fileSpan);
        li.addEventListener('click', () => {
            vscode.postMessage({
                type: 'navigateToLocation',
                location: location
            });
        });
        return li;
    }

    function getSymbolKindIcon(kind) {
        // Mapping from vscode.SymbolKind to codicon names
        // Mapping from vscode.SymbolKind enum values to codicon names
        const KINDS_TO_CODICONS = {
            0: 'symbol-file',          // File
            1: 'symbol-module',        // Module
            2: 'symbol-namespace',     // Namespace
            3: 'symbol-package',       // Package
            4: 'symbol-class',         // Class
            5: 'symbol-method',        // Method
            6: 'symbol-property',      // Property
            7: 'symbol-field',         // Field
            8: 'symbol-constructor',   // Constructor
            9: 'symbol-enum',          // Enum
            10: 'symbol-interface',    // Interface
            11: 'symbol-function',     // Function
            12: 'symbol-variable',     // Variable
            13: 'symbol-constant',     // Constant
            14: 'symbol-string',       // String
            15: 'symbol-number',       // Number
            16: 'symbol-boolean',      // Boolean
            17: 'symbol-array',        // Array
            18: 'symbol-object',       // Object (using 'symbol-key' as a proxy, or 'symbol-misc')
            19: 'symbol-key',          // Key
            20: 'symbol-null',         // Null (using 'symbol-misc')
            21: 'symbol-enum-member',  // EnumMember
            22: 'symbol-struct',       // Struct
            23: 'symbol-event',        // Event
            24: 'symbol-operator',     // Operator
            25: 'symbol-parameter'     // TypeParameter (using 'symbol-parameter' as proxy)
        };
        return KINDS_TO_CODICONS[kind] || 'symbol-misc'; // Default icon for unmapped kinds
    }

    // Signal to extension that webview is ready
    vscode.postMessage({ type: 'webviewReady' });

}());
