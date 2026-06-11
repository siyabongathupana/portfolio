// messaging.js – Guaranteed working version (manual modal construction)
(function() {
    let currentMessages = [];

    function getUser() {
        return window.SessionManager?.getCurrentUser();
    }

    function getUserDataPath(username, filename) {
        const { dataPath } = window.REPO_CONFIG;
        const encUser = encodeURIComponent(username);
        return `${dataPath}/users/${encUser}/${filename}`;
    }

    async function getEncryptionKey() {
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(window.APP_CONFIG.dogsname),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: new TextEncoder().encode('messages-salt'),
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function decryptMessages(encryptedObj) {
        const key = await getEncryptionKey();
        const iv = new Uint8Array(encryptedObj.iv);
        const data = new Uint8Array(encryptedObj.data);
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
        return JSON.parse(new TextDecoder().decode(decrypted));
    }

    async function loadMessages() {
        const user = getUser();
        if (!user) return [];
        const { owner, repo, branch } = window.REPO_CONFIG;
        const path = getUserDataPath(user.username, 'messages.enc');
        try {
            const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
                headers: { Authorization: `token ${user.pat}` }
            });
            if (resp.ok) {
                const file = await resp.json();
                const encrypted = JSON.parse(atob(file.content));
                currentMessages = await decryptMessages(encrypted);
            } else if (resp.status === 404) {
                currentMessages = [];
            } else {
                throw new Error(`HTTP ${resp.status}`);
            }
        } catch(e) {
            console.error('Load error:', e);
            currentMessages = [];
        }
        return currentMessages;
    }

    async function markAsRead(messageId) {
        const msg = currentMessages.find(m => m.id == messageId);
        if (msg && !msg.read) {
            msg.read = true;
            await saveMessages(currentMessages);
            updateBadge();
            refreshModalContent(); // Refresh if modal is open
        }
    }

    async function deleteMessage(messageId) {
        if (confirm('Delete this message?')) {
            currentMessages = currentMessages.filter(m => m.id != messageId);
            await saveMessages(currentMessages);
            updateBadge();
            refreshModalContent();
        }
    }

    async function saveMessages(messages) {
        const user = getUser();
        if (!user) throw new Error('Not logged in');
        const { owner, repo, branch } = window.REPO_CONFIG;
        const path = getUserDataPath(user.username, 'messages.enc');
        const encrypted = await encryptMessages(messages);
        const content = btoa(JSON.stringify(encrypted));
        let sha = null;
        try {
            const getResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
                headers: { Authorization: `token ${user.pat}` }
            });
            if (getResp.ok) {
                const data = await getResp.json();
                sha = data.sha;
            }
        } catch(e) {}
        await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
            method: 'PUT',
            headers: {
                Authorization: `token ${user.pat}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Update messages',
                content: content,
                branch: branch,
                sha: sha
            })
        });
        currentMessages = messages;
    }

    async function encryptMessages(messages) {
        const key = await getEncryptionKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(JSON.stringify(messages));
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
        return { iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) };
    }

    function getUnreadCount() {
        return currentMessages.filter(m => !m.read).length;
    }

    function updateBadge() {
        const badge = document.getElementById('msgBadge');
        if (!badge) return;
        const count = getUnreadCount();
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }

    function formatDate(isoString) {
        const d = new Date(isoString);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m] || m);
    }

    // Global variable to store modal instance
    let currentModal = null;

    function refreshModalContent() {
        if (!currentModal) return;
        const container = document.getElementById('msgListContainer');
        if (!container) return;
        if (currentMessages.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-4"><i class="fa fa-envelope-o"></i> No messages</div>';
            return;
        }
        const sorted = [...currentMessages].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
        let html = '<div class="p-2 border-bottom"><button class="btn btn-sm btn-outline-secondary" id="markAllReadBtn"><i class="fa fa-check-circle"></i> Mark all as read</button></div>';
        sorted.forEach(msg => {
            const isUnread = !msg.read;
            html += `
                <div class="list-group-item list-group-item-action ${isUnread ? 'list-group-item-primary' : ''}" style="cursor:pointer;" data-msg-id="${msg.id}">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="flex-grow-1">
                            <strong>${escapeHtml(msg.subject)}</strong>
                            <div class="text-muted small">From: ${escapeHtml(msg.from)} · ${formatDate(msg.timestamp)}</div>
                            <div class="mt-1 msg-body-${msg.id}" style="display:none;">${escapeHtml(msg.body).replace(/\n/g, '<br>')}</div>
                            <div class="mt-1 msg-preview-${msg.id}">${escapeHtml(msg.body.substring(0, 100))}${msg.body.length > 100 ? '…' : ''}</div>
                        </div>
                        <div>
                            ${!msg.read ? `<button class="btn btn-sm btn-outline-primary mark-read-btn" data-id="${msg.id}">✓</button>` : ''}
                            <button class="btn btn-sm btn-outline-danger delete-msg-btn" data-id="${msg.id}">🗑</button>
                        </div>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;

        // Attach events
        document.querySelectorAll('.mark-read-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                await markAsRead(id);
            });
        });
        document.querySelectorAll('.delete-msg-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                await deleteMessage(id);
            });
        });
        document.querySelectorAll('.list-group-item-action').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.mark-read-btn') || e.target.closest('.delete-msg-btn')) return;
                const msgId = el.dataset.msgId;
                const preview = el.querySelector(`.msg-preview-${msgId}`);
                const body = el.querySelector(`.msg-body-${msgId}`);
                if (preview.style.display !== 'none') {
                    preview.style.display = 'none';
                    body.style.display = 'block';
                    const msg = currentMessages.find(m => m.id == msgId);
                    if (msg && !msg.read) markAsRead(msgId);
                } else {
                    preview.style.display = 'block';
                    body.style.display = 'none';
                }
            });
        });
        const markAllBtn = document.getElementById('markAllReadBtn');
        if (markAllBtn) markAllBtn.addEventListener('click', async () => {
            let changed = false;
            for (let m of currentMessages) if (!m.read) { m.read = true; changed = true; }
            if (changed) {
                await saveMessages(currentMessages);
                updateBadge();
                refreshModalContent();
            }
        });
    }

    async function openInbox() {
        // If modal already exists, just refresh and show
        if (currentModal) {
            await loadMessages();
            refreshModalContent();
            $(currentModal).modal('show');
            return;
        }

        // Create modal element
        currentModal = document.createElement('div');
        currentModal.className = 'modal fade';
        currentModal.id = 'inboxModal';
        currentModal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5><i class="fa fa-inbox"></i> My Inbox</h5>
                        <button type="button" class="close" data-dismiss="modal">&times;</button>
                    </div>
                    <div class="modal-body p-0">
                        <div class="list-group list-group-flush" id="msgListContainer" style="max-height: 60vh; overflow-y: auto;"></div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" id="refreshInboxBtn"><i class="fa fa-refresh"></i> Refresh</button>
                        <button type="button" class="btn btn-primary" data-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(currentModal);

        // Refresh button handler
        const refreshBtn = document.getElementById('refreshInboxBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                await loadMessages();
                refreshModalContent();
                updateBadge();
            });
        }

        // Load messages, render, then show modal
        await loadMessages();
        refreshModalContent();
        updateBadge();
        $(currentModal).modal('show');
    }

    function addNotificationIcon() {
        const user = getUser();
        if (!user) return;
        const navUl = document.querySelector('.navbar-nav.ml-auto');
        if (!navUl) return;
        if (document.getElementById('msgNotificationIcon')) return;
        const li = document.createElement('li');
        li.className = 'nav-item';
        li.id = 'msgNotificationIcon';
        li.innerHTML = `
            <a class="nav-link" href="#" id="msgBellBtn" style="position: relative;">
                <i class="fa fa-bell-o"></i>
                <span id="msgBadge" class="badge badge-danger" style="position: absolute; top: -5px; right: -10px; display: none; border-radius: 50%; padding: 2px 5px; font-size: 10px;"></span>
            </a>
        `;
        navUl.appendChild(li);
        document.getElementById('msgBellBtn').addEventListener('click', (e) => {
            e.preventDefault();
            openInbox();
        });
        loadMessages().then(() => updateBadge());
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addNotificationIcon);
    } else {
        addNotificationIcon();
    }
})();
