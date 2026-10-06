// messaging.js – Supabase edition
// Uses the `messages` table. Bell icon + inbox modal.

(function () {
  'use strict';

  let modal = null;
  let currentMessages = [];

  const getUser = () => window.__currentAuthUser || null;

  function fmtDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const esc = window.escapeHtml;

  async function loadMessages() {
    if (!getUser()) return [];
    try {
      currentMessages = await window.Messages.list();
    } catch (e) {
      console.warn('Load messages failed:', e);
      currentMessages = [];
    }
    return currentMessages;
  }

  function unreadCount() {
    return currentMessages.filter(m => !m.read).length;
  }

  function updateBadge() {
    const badge = document.getElementById('msgBadge');
    if (!badge) return;
    const c = unreadCount();
    badge.textContent = c;
    badge.style.display = c ? 'inline-block' : 'none';
  }

  async function markRead(id) {
    await window.Messages.markRead(id);
    const m = currentMessages.find(x => x.id === id);
    if (m) m.read = true;
    updateBadge();
    renderModalContent();
  }

  async function markAllRead() {
    await window.Messages.markAllRead();
    currentMessages.forEach(m => m.read = true);
    updateBadge();
    renderModalContent();
  }

  async function deleteMessage(id) {
    if (!confirm('Delete this message?')) return;
    await window.Messages.remove(id);
    currentMessages = currentMessages.filter(m => m.id !== id);
    updateBadge();
    renderModalContent();
  }

  function renderModalContent() {
    const container = document.getElementById('msgListContainer');
    if (!container) return;
    if (!currentMessages.length) {
      container.innerHTML = '<div class="text-center text-muted py-4"><i class="fa fa-envelope-o"></i> No messages</div>';
      return;
    }
    const sorted = [...currentMessages].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    let html = `<div class="p-2 border-bottom"><button class="btn btn-sm btn-outline-secondary" id="markAllReadBtn"><i class="fa fa-check-circle"></i> Mark all as read</button></div>`;
    sorted.forEach(msg => {
      const isUnread = !msg.read;
      html += `
        <div class="list-group-item list-group-item-action ${isUnread ? 'list-group-item-primary' : ''}" data-id="${msg.id}" style="cursor:pointer;">
          <div class="d-flex justify-content-between">
            <div style="flex:1;">
              <strong>${esc(msg.subject)}</strong>
              <div class="small text-muted">${fmtDate(msg.created_at)}</div>
              <div class="msg-preview-${msg.id}">${esc((msg.body || '').substring(0, 100))}${(msg.body || '').length > 100 ? '…' : ''}</div>
              <div class="msg-body-${msg.id}" style="display:none;">${esc(msg.body || '').replace(/\n/g, '<br>')}</div>
            </div>
            <div style="margin-left: 10px;">
              ${!msg.read ? `<button class="btn btn-sm btn-outline-primary mark-read" data-id="${msg.id}" style="margin-right:5px;">✓</button>` : ''}
              <button class="btn btn-sm btn-outline-danger delete-msg" data-id="${msg.id}">🗑</button>
            </div>
          </div>
        </div>`;
    });
    container.innerHTML = html;

    container.querySelectorAll('.mark-read').forEach(btn => {
      btn.addEventListener('click', async (e) => { e.stopPropagation(); await markRead(btn.dataset.id); });
    });
    container.querySelectorAll('.delete-msg').forEach(btn => {
      btn.addEventListener('click', async (e) => { e.stopPropagation(); await deleteMessage(btn.dataset.id); });
    });
    container.querySelectorAll('.list-group-item-action').forEach(el => {
      el.addEventListener('click', async (e) => {
        if (e.target.closest('.mark-read') || e.target.closest('.delete-msg')) return;
        const id = el.dataset.id;
        const pv = el.querySelector(`.msg-preview-${id}`);
        const bd = el.querySelector(`.msg-body-${id}`);
        if (pv.style.display !== 'none') {
          pv.style.display = 'none';
          bd.style.display = 'block';
          const m = currentMessages.find(x => x.id === id);
          if (m && !m.read) await markRead(id);
        } else {
          pv.style.display = 'block';
          bd.style.display = 'none';
        }
      });
    });

    const markAllBtn = document.getElementById('markAllReadBtn');
    if (markAllBtn) markAllBtn.addEventListener('click', markAllRead);
  }

  async function openInbox() {
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'modal fade';
      modal.id = 'inboxModal';
      modal.innerHTML = `
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5><i class="fa fa-inbox"></i> My Inbox</h5>
              <button type="button" class="close" data-dismiss="modal">&times;</button>
            </div>
            <div class="modal-body p-0">
              <div class="list-group list-group-flush" id="msgListContainer" style="max-height:60vh; overflow-y:auto;"></div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" id="refreshInboxBtn"><i class="fa fa-refresh"></i> Refresh</button>
              <button class="btn btn-primary" data-dismiss="modal">Close</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(modal);
      document.getElementById('refreshInboxBtn').addEventListener('click', async () => {
        await loadMessages();
        renderModalContent();
        updateBadge();
      });
    }
    await loadMessages();
    renderModalContent();
    updateBadge();
    if (window.jQuery) window.jQuery(modal).modal('show');
  }

  function addNotificationIcon() {
    if (!getUser()) return;
    if (document.getElementById('msgNotificationIcon')) return;
    const navUl = document.querySelector('.navbar-nav.ml-auto');
    if (!navUl) return;

    const li = document.createElement('li');
    li.className = 'nav-item';
    li.id = 'msgNotificationIcon';
    li.innerHTML = `
      <a class="nav-link" href="#" id="msgBellBtn" style="position:relative;">
        <i class="fa fa-bell-o"></i>
        <span id="msgBadge" class="badge badge-danger" style="position:absolute;top:-5px;right:-10px;display:none;border-radius:50%;padding:2px 5px;font-size:10px;"></span>
      </a>`;
    navUl.appendChild(li);
    document.getElementById('msgBellBtn').addEventListener('click', (e) => {
      e.preventDefault();
      openInbox();
    });
    loadMessages().then(updateBadge);
  }

  let interval = null;
  function startAutoRefresh() {
    if (interval) clearInterval(interval);
    interval = setInterval(async () => {
      if (getUser() && document.visibilityState === 'visible') {
        await loadMessages();
        updateBadge();
        if (modal && modal.style.display !== 'none') renderModalContent();
      }
    }, 30000);
  }

  window.addEventListener('authChanged', () => {
    addNotificationIcon();
    loadMessages().then(updateBadge);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { addNotificationIcon(); startAutoRefresh(); });
  } else {
    addNotificationIcon();
    startAutoRefresh();
  }
})();
