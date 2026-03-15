// ═══════════════════════════════════════════════════════════════
// NIGHTFALL — Chat Module
// ═══════════════════════════════════════════════════════════════

class Chat {
  constructor() {
    this.messages = [];
    this.onSend = null; // callback to send via network
  }

  addMessage(name, text, type = 'normal') {
    // type: 'normal' | 'ghost' | 'system' | 'last-words'
    this.messages.push({ name, text, type, time: Date.now() });
    this.renderMessages();
  }

  renderMessages() {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    // Only keep last 100 messages in view
    const recent = this.messages.slice(-100);
    container.innerHTML = recent.map(m => {
      if (m.type === 'system') {
        return `<div class="chat-msg system">${this._esc(m.text)}</div>`;
      }
      const cls = m.type === 'ghost' ? 'chat-msg ghost' : m.type === 'last-words' ? 'chat-msg last-words' : 'chat-msg';
      return `<div class="${cls}"><span class="chat-name">${this._esc(m.name)}:</span><span class="chat-text">${this._esc(m.text)}</span></div>`;
    }).join('');
    container.scrollTop = container.scrollHeight;
  }

  clear() {
    this.messages = [];
    const container = document.getElementById('chatMessages');
    if (container) container.innerHTML = '';
  }

  setEnabled(enabled) {
    const input = document.getElementById('chatInput');
    const btn = document.getElementById('btnChat');
    if (input) { input.disabled = !enabled; input.placeholder = enabled ? 'Type a message...' : 'Chat disabled'; }
    if (btn) btn.disabled = !enabled;
  }

  _esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

const chat = new Chat();
export default chat;
