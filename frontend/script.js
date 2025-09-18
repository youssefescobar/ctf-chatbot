document.addEventListener('DOMContentLoaded', () => {
    // Main chat elements
    const chatInput = document.querySelector('.chat-input');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const chatBox = document.getElementById('chat-box');
    const categorySelect = document.getElementById('category-select');
    const imagePreviewContainer = document.getElementById('image-previews');

    // Modal elements
    const codeModal = document.getElementById('code-modal');
    const pasteCodeButton = document.getElementById('paste-code-button');
    const addCodeButton = document.getElementById('add-code-button');
    const cancelCodeButton = document.getElementById('cancel-code-button');
    const codeInput = document.getElementById('code-input');

    // Focus mode elements
    const pageOverlay = document.getElementById('page-overlay');

    let placeholderMap = {};
    let codeCounter = 1;
    let imgCounter = 1;
    let lastCursorPosition = 0;
    let isFocusMode = false;

    // --- Event Listeners ---
    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('focusout', () => lastCursorPosition = messageInput.selectionStart);
    messageInput.addEventListener('paste', handlePaste);

    pasteCodeButton.addEventListener('click', () => codeModal.style.display = 'flex');
    cancelCodeButton.addEventListener('click', () => codeModal.style.display = 'none');
    addCodeButton.addEventListener('click', addCodeFromModal);

    // Focus Mode Listeners
    messageInput.addEventListener('click', enterFocusMode);
    pageOverlay.addEventListener('click', exitFocusMode);

    // --- Focus Mode Functions ---
    function enterFocusMode() {
        if (isFocusMode) return;
        isFocusMode = true;
        pageOverlay.classList.add('visible');
        chatInput.classList.add('input-focus');
    }

    function exitFocusMode() {
        if (!isFocusMode) return;
        isFocusMode = false;
        pageOverlay.classList.remove('visible');
        chatInput.classList.remove('input-focus');
    }

    // --- Core Functions ---
    async function sendMessage() {
        const messageText = messageInput.value.trim();
        if (messageText === '') return;

        if (isFocusMode) exitFocusMode(); // Exit focus mode on send

        appendMessage(messageText, 'user');
        messageInput.value = '';

        const thinkingMessage = appendMessage('Thinking...', 'bot');

        const requestBody = {
            prompt: messageText,
            mappings: placeholderMap,
            category: categorySelect.value
        };

        try {
            const response = await fetch('http://localhost:8000/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            chatBox.removeChild(thinkingMessage);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'An unknown error occurred.');
            }

            const data = await response.json();
            const botMessage = appendMessage(data.generated_text, 'bot');
            addDownloadButton(botMessage, data.generated_text);

        } catch (error) {
            chatBox.removeChild(thinkingMessage);
            appendMessage(`Error: ${error.message}`, 'bot');
            console.error('Error calling backend:', error);
        }

        // Reset for next message
        placeholderMap = {};
        codeCounter = 1;
        imgCounter = 1;
        imagePreviewContainer.innerHTML = '';
    }

    function addCodeFromModal() {
        const codeText = codeInput.value;
        if (codeText.trim() === '') return;

        const placeholder = `[[code${codeCounter++}]]`;
        placeholderMap[placeholder] = codeText;

        insertPlaceholder(placeholder, lastCursorPosition);

        codeInput.value = '';
        codeModal.style.display = 'none';
    }

    function handlePaste(e) {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                const blob = items[i].getAsFile();
                const placeholder = `[[img${imgCounter++}]]`;
                const tempUrl = URL.createObjectURL(blob);
                placeholderMap[placeholder] = tempUrl;

                insertPlaceholder(placeholder, messageInput.selectionStart);
                addImagePreview(tempUrl, placeholder);
            }
        }
    }

    // --- Helper Functions ---
    function insertPlaceholder(placeholder, position) {
        const text = messageInput.value;
        messageInput.value = text.substring(0, position) + placeholder + text.substring(position);
        messageInput.focus();
        const newCursorPos = position + placeholder.length;
        messageInput.setSelectionRange(newCursorPos, newCursorPos);
        lastCursorPosition = newCursorPos;
    }

    function addImagePreview(url, placeholder) {
        const previewWrapper = document.createElement('div');
        previewWrapper.className = 'image-preview';
        const img = document.createElement('img');
        img.src = url;
        const p = document.createElement('p');
        p.innerText = placeholder;
        previewWrapper.appendChild(img);
        previewWrapper.appendChild(p);
        imagePreviewContainer.appendChild(previewWrapper);
    }

    function appendMessage(text, sender) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', `${sender}-message`);
        const messageContent = document.createElement('div');
        messageContent.classList.add('message-content');
        messageContent.innerText = text;
        messageElement.appendChild(messageContent);
        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
        return messageElement;
    }

    function addDownloadButton(messageElement, content) {
        const downloadBtn = document.createElement('button');
        downloadBtn.innerText = 'Download .md';
        downloadBtn.className = 'download-btn';
        downloadBtn.onclick = () => downloadMarkdown(content);
        const messageContent = messageElement.querySelector('.message-content');
        if (messageContent) {
            messageContent.appendChild(document.createElement('br'));
            messageContent.appendChild(document.createElement('br'));
            messageContent.appendChild(downloadBtn);
        }
    }

    function downloadMarkdown(content) {
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'writeup.md';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
});
