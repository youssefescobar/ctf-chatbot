document.addEventListener('DOMContentLoaded', () => {
    const get = id => document.getElementById(id);

    const promptEl = get('prompt');
    const categoryEl = get('category');
    const mappingsContainer = get('mappings-container');
    const addImageBtn = get('add-image-btn');
    const addCodeBtn = get('add-code-btn');
    const generateBtn = get('generate-btn');
    const outputEl = get('output');
    const downloadZipBtn = get('download-zip-btn');
    const downloadDocxBtn = get('download-docx-btn');

    let imageCounter = 1;
    let codeCounter = 1;
    let currentSessionId = null;

    function reindexPlaceholders(type) {
        const prefix = `[[${type}`;
        let counter = 1;
        mappingsContainer.querySelectorAll(`.mapping-item`).forEach(item => {
            const input = item.querySelector(`[data-placeholder^="${prefix}"]`);
            if (input) {
                const newPlaceholder = `[[${type}${counter++}]]`;
                item.querySelector('label').textContent = newPlaceholder;
                input.dataset.placeholder = newPlaceholder;
            }
        });
        if (type === 'img') {
            imageCounter = counter;
        } else if (type === 'code') {
            codeCounter = counter;
        }
    }

    const API_URL = 'http://127.0.0.1:8000';

    promptEl.addEventListener('focus', () => {
        promptEl.classList.add('expanded');
    });

    promptEl.addEventListener('blur', () => {
        promptEl.classList.remove('expanded');
    });

    addImageBtn.addEventListener('click', () => {
        const placeholder = `[[img${imageCounter++}]]`;
        const div = document.createElement('div');
        div.className = 'mapping-item';

        const label = document.createElement('label');
        label.textContent = placeholder;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => {
            div.remove();
            reindexPlaceholders('img');
        });

        const header = document.createElement('div');
        header.className = 'mapping-header';
        header.appendChild(label);
        header.appendChild(deleteBtn);

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.dataset.placeholder = placeholder;

        div.appendChild(header);
        div.appendChild(input);
        mappingsContainer.appendChild(div);

        input.addEventListener('change', () => {
            let preview = div.querySelector('.image-preview');
            if (!preview) {
                preview = document.createElement('img');
                preview.className = 'image-preview';
                div.appendChild(preview);
            }
            if (input.files[0]) {
                preview.src = URL.createObjectURL(input.files[0]);
            } else {
                preview.src = '';
            }
        });
    });

    addCodeBtn.addEventListener('click', () => {
        const placeholder = `[[code${codeCounter++}]]`;
        const div = document.createElement('div');
        div.className = 'mapping-item';

        const label = document.createElement('label');
        label.textContent = placeholder;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => {
            div.remove();
            reindexPlaceholders('code');
        });

        const header = document.createElement('div');
        header.className = 'mapping-header';
        header.appendChild(label);
        header.appendChild(deleteBtn);

        const textarea = document.createElement('textarea');
        textarea.dataset.placeholder = placeholder;
        textarea.rows = 3;

        const preview = document.createElement('pre');
        preview.className = 'code-preview';

        textarea.addEventListener('input', () => {
            preview.textContent = textarea.value;
        });

        div.appendChild(header);
        div.appendChild(textarea);
        div.appendChild(preview);
        mappingsContainer.appendChild(div);
    });

    generateBtn.addEventListener('click', async () => {
        generateBtn.disabled = true;
        outputEl.textContent = 'Generating...';

        const prompt = promptEl.value;
        const category = categoryEl.value;
        const mappings = {};

        const mappingPromises = [];

        mappingsContainer.querySelectorAll('input[type="file"]').forEach(input => {
            if (input.files[0]) {
                const promise = new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve({ placeholder: input.dataset.placeholder, content: reader.result });
                    reader.onerror = reject;
                    reader.readAsDataURL(input.files[0]);
                });
                mappingPromises.push(promise);
            }
        });

        mappingsContainer.querySelectorAll('textarea').forEach(textarea => {
            mappings[textarea.dataset.placeholder] = textarea.value;
        });

        try {
            const fileMappings = await Promise.all(mappingPromises);
            fileMappings.forEach(m => { mappings[m.placeholder] = m.content; });

            const response = await fetch(`${API_URL}/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, mappings, category })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to generate writeup.');
            }

            const result = await response.json();
            outputEl.textContent = result.generated_text;
            currentSessionId = result.session_id;

            downloadZipBtn.disabled = false;
            downloadDocxBtn.disabled = false;

        } catch (error) {
            outputEl.textContent = `Error: ${error.message}`;
        } finally {
            generateBtn.disabled = false;
        }
    });

    async function handleDownload(url, fileName) {
        if (!currentSessionId) return;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    session_id: currentSessionId, 
                    markdown_content: outputEl.textContent
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Download failed');
            }

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(downloadUrl);

        } catch (error) {
            alert(`Error: ${error.message}`);
        }
    }

    downloadZipBtn.addEventListener('click', () => {
        handleDownload(`${API_URL}/download-package`, 'writeup_package.zip');
    });

    downloadDocxBtn.addEventListener('click', () => {
        handleDownload(`${API_URL}/download-docx`, 'writeup.docx');
    });
});