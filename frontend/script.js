document.addEventListener('DOMContentLoaded', () => {
    // Main chat elements
    const chatInput = document.querySelector('.chat-input');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const chatBox = document.getElementById('chat-box');
    const categorySelect = document.getElementById('category-select');
    const imagePreviewContainer = document.getElementById('image-previews');
    const codePreviewContainer = document.getElementById('code-previews');

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
    let currentSessionId = null;

    const chatInputForm = document.querySelector('.chat-input-form');

    // --- Event Listeners ---
    // Prevent form submit from reloading the page
    chatInputForm.addEventListener('submit', function(e) {
        e.preventDefault();
        e.stopPropagation();
        sendMessage();
        return false;
    });

    // Prevent send button click from reloading the page
    sendButton.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        sendMessage();
        return false;
    });

    // Add Enter key handler for textarea
    messageInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            sendMessage();
            return false;
        }
    });

    messageInput.addEventListener('focusout', () => lastCursorPosition = messageInput.selectionStart);
    messageInput.addEventListener('paste', handlePaste);

    pasteCodeButton.addEventListener('click', (e) => {
        e.preventDefault();
        codeModal.style.display = 'flex';
    });
    
    cancelCodeButton.addEventListener('click', (e) => {
        e.preventDefault();
        codeModal.style.display = 'none';
    });
    
    addCodeButton.addEventListener('click', (e) => {
        e.preventDefault();
        addCodeFromModal();
    });

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
        // Prevent multiple simultaneous sends
        if (sendButton.disabled) return;
        
        sendButton.disabled = true;
        const messageText = messageInput.value.trim();
        
        if (messageText === '') {
            sendButton.disabled = false;
            return;
        }

        if (isFocusMode) exitFocusMode();

        appendMessage(messageText, 'user');
        messageInput.value = '';
        
        const loadingAnimation = showLoadingAnimation();

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

            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch (e) {
                    errorData = {};
                }
                throw new Error(errorData.detail || 'An unknown error occurred.');
            }

            const data = await response.json();
            currentSessionId = data.session_id;
            
            hideLoadingAnimation(loadingAnimation);
            const botMessage = appendMessage('Done!', 'bot');
            addDownloadButtons(botMessage, data.generated_text);

        } catch (error) {
            hideLoadingAnimation(loadingAnimation);
            appendMessage(`Error: ${error.message}`, 'bot');
            console.error('Error calling backend:', error);
        } finally {
            sendButton.disabled = false;
        }

        // Reset for next message
        placeholderMap = {};
        codeCounter = 1;
        imgCounter = 1;
        imagePreviewContainer.innerHTML = '';
        codePreviewContainer.innerHTML = '';
    }

    function addCodeFromModal() {
        const codeText = codeInput.value;
        if (codeText.trim() === '') return;

        const placeholder = `[[code${codeCounter++}]]`;
        placeholderMap[placeholder] = codeText;

        insertPlaceholder(placeholder, lastCursorPosition);
        addCodePreview(codeText, placeholder);

        codeInput.value = '';
        codeModal.style.display = 'none';
    }

    function handlePaste(e) {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                const blob = items[i].getAsFile();
                const reader = new FileReader();
                reader.onload = function(event) {
                    const base64Url = event.target.result;
                    const placeholder = `[[img${imgCounter++}]]`;
                    placeholderMap[placeholder] = base64Url;

                    insertPlaceholder(placeholder, messageInput.selectionStart);
                    addImagePreview(base64Url, placeholder);
                };
                reader.readAsDataURL(blob);
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

    function addCodePreview(code, placeholder) {
        const previewWrapper = document.createElement('div');
        previewWrapper.className = 'code-preview';
        const pre = document.createElement('pre');
        pre.innerText = code;
        const p = document.createElement('p');
        p.innerText = placeholder;
        previewWrapper.appendChild(pre);
        previewWrapper.appendChild(p);
        codePreviewContainer.appendChild(previewWrapper);
    }

    function appendMessage(text, sender) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', `${sender}-message`);
        messageElement.textContent = text;
        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
        return messageElement;
    }

    function addDownloadButtons(messageElement, content) {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'download-buttons';
        buttonContainer.style.display = 'block'; // Make the container visible

        const downloadZipBtn = document.createElement('button');
        downloadZipBtn.innerText = 'Download Package (.zip)';
        downloadZipBtn.className = 'download-btn';
        downloadZipBtn.onclick = (e) => {
            e.preventDefault();
            downloadPackage(content);
        };

        const downloadDocxBtn = document.createElement('button');
        downloadDocxBtn.innerText = 'Download as Word (.docx)';
        downloadDocxBtn.className = 'download-btn';
        downloadDocxBtn.onclick = (e) => {
            e.preventDefault();
            downloadDocx(content);
        };

        buttonContainer.appendChild(downloadZipBtn);
        buttonContainer.appendChild(downloadDocxBtn);

        messageElement.appendChild(document.createElement('br'));
        messageElement.appendChild(buttonContainer);
    }

    function showLoadingAnimation() {
        const loadingAnimation = document.createElement('div');
        loadingAnimation.className = 'loading-animation';
        loadingAnimation.style.display = 'block';
        chatBox.appendChild(loadingAnimation);
        chatBox.scrollTop = chatBox.scrollHeight;
        return loadingAnimation;
    }

    function hideLoadingAnimation(loadingAnimation) {
        if (loadingAnimation && loadingAnimation.parentNode) {
            loadingAnimation.parentNode.removeChild(loadingAnimation);
        }
    }

    async function downloadPackage(content) {
        if (!currentSessionId) {
            alert("No session ID found. Please generate a writeup first.");
            return;
        }

        try {
            const response = await fetch('http://localhost:8000/download-package', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: currentSessionId, markdown_content: content }),
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'writeup_package.zip';
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
            } else {
                alert("Failed to download package.");
            }
        } catch (error) {
            console.error('Download error:', error);
            alert("Failed to download package.");
        }
    }

    async function downloadDocx(content) {
        if (!currentSessionId) {
            alert("No session ID found. Please generate a writeup first.");
            return;
        }

        try {
            const response = await fetch('http://localhost:8000/download-docx', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: currentSessionId, markdown_content: content }),
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'writeup.docx';
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
            } else {
                alert("Failed to download .docx file.");
            }
        } catch (error) {
            console.error('Download error:', error);
            alert("Failed to download .docx file.");
        }
    }
});