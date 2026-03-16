// ═══════════════════════════════════════════════════════════════
// NIGHTFALL — Chat Module (Multi-Channel)
// Channels: public, killer, detective
// ═══════════════════════════════════════════════════════════════

class Chat {
  constructor() {
    this.channels = {
      public: [],
      killer: [],
      detective: [],
    };
    this.activeChannel = 'public';
    this.onSend = null; // callback to send via network
    this.teamRole = null; // 'killer' | 'detective' | null
  }

  setTeamRole(role) {
    this.teamRole = (role === 'killer' || role === 'detective') ? role : null;
    this._renderTabs();
  }

  switchChannel(ch) {
    if (!this.channels[ch]) return;
    this.activeChannel = ch;
    this._renderTabs();
    this.renderMessages();
  }

  addMessage(name, text, type = 'normal', channel = 'public') {
    // type: 'normal' | 'ghost' | 'system' | 'last-words' | 'team-killer' | 'team-detective'
    if (!this.channels[channel]) channel = 'public';
    this.channels[channel].push({ name, text, type, time: Date.now() });
    if (channel === this.activeChannel) this.renderMessages();
  }

  renderMessages() {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    const msgs = this.channels[this.activeChannel] || [];
    const recent = msgs.slice(-100);
    container.innerHTML = recent.map(m => {
      if (m.type === 'system') {
        return `<div class="chat-msg system">${this._esc(m.text)}</div>`;
      }
      let cls = 'chat-msg';
      if (m.type === 'ghost') cls = 'chat-msg ghost';
      else if (m.type === 'last-words') cls = 'chat-msg last-words';
      else if (m.type === 'team-killer') cls = 'chat-msg team-killer';
      else if (m.type === 'team-detective') cls = 'chat-msg team-detective';
      return `<div class="${cls}"><span class="chat-name">${this._esc(m.name)}:</span><span class="chat-text">${this._esc(m.text)}</span></div>`;
    }).join('');
    container.scrollTop = container.scrollHeight;
  }

  _renderTabs() {
    const tabBar = document.getElementById('chatTabs');
    if (!tabBar) return;
    let html = `<button class="chat-tab${this.activeChannel === 'public' ? ' chat-tab-active' : ''}" data-ch="public">💬 Public</button>`;
    if (this.teamRole === 'killer') {
      html += `<button class="chat-tab chat-tab-killer${this.activeChannel === 'killer' ? ' chat-tab-active' : ''}" data-ch="killer">🗡 Team</button>`;
    } else if (this.teamRole === 'detective') {
      html += `<button class="chat-tab chat-tab-det${this.activeChannel === 'detective' ? ' chat-tab-active' : ''}" data-ch="detective">🔍 Team</button>`;
    }
    tabBar.innerHTML = html;
    tabBar.querySelectorAll('.chat-tab').forEach(btn => {
      btn.onclick = () => this.switchChannel(btn.dataset.ch);
    });
  }

  clear() {
    this.channels = { public: [], killer: [], detective: [] };
    this.activeChannel = 'public';
    this.teamRole = null;
    const container = document.getElementById('chatMessages');
    if (container) container.innerHTML = '';
    this._renderTabs();
  }

  setEnabled(enabled) {
    const input = document.getElementById('chatInput');
    const btn = document.getElementById('btnChat');
    if (input) { input.disabled = !enabled; input.placeholder = enabled ? 'Type a message...' : 'Chat disabled'; }
    if (btn) btn.disabled = !enabled;
  }

  getActiveChannel() { return this.activeChannel; }

  _esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

const chat = new Chat();
export default chat;
