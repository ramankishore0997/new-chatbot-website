/**
 * GrowthPilot — Telegram Live Chat Embeddable Widget
 * Add this script to ANY client website (WordPress, Shopify, Webflow, Custom HTML, etc.)
 * Usage: <script src="https://your-domain.com/widget.js" data-server="https://your-domain.com"></script>
 */
(function () {
  if (window.__GrowthPilotWidgetLoaded) return;
  window.__GrowthPilotWidgetLoaded = true;

  const currentScript = document.currentScript || document.querySelector('script[src*="widget.js"]');
  let SERVER_URL = currentScript ? (currentScript.getAttribute('data-server') || '') : '';
  if (!SERVER_URL && currentScript && currentScript.src) {
    try {
      const url = new URL(currentScript.src);
      SERVER_URL = url.origin;
    } catch (e) {}
  }
  if (!SERVER_URL) SERVER_URL = window.location.origin;

  let visitorId = localStorage.getItem('gp_chat_visitor_id');
  if (!visitorId) {
    visitorId = 'visitor_' + Math.random().toString(36).substring(2, 7);
    localStorage.setItem('gp_chat_visitor_id', visitorId);
  }

  let isOpen = false;
  let isSoundOn = true;
  let lastTimestamp = 0;

  function playChime(type) {
    if (!isSoundOn) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === 'receive') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      }
    } catch (e) {}
  }

  const style = document.createElement('style');
  style.innerHTML = `
    #gp-widget-root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    #gp-launcher {
      position: fixed; bottom: 24px; right: 24px; z-index: 999999;
      width: 60px; height: 60px; border-radius: 50%;
      background: linear-gradient(135deg, #2563eb, #4f46e5);
      color: white; border: none; cursor: pointer;
      box-shadow: 0 10px 25px rgba(37, 99, 235, 0.45);
      display: flex; align-items: center; justify-content: center;
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    #gp-launcher:hover { transform: scale(1.08); }
    #gp-badge {
      position: absolute; top: -2px; right: -2px;
      background: #ef4444; color: white; font-size: 11px; font-weight: bold;
      width: 20px; height: 20px; border-radius: 50%; border: 2px solid white;
      display: flex; align-items: center; justify-content: center;
    }
    #gp-chat-window {
      position: fixed; bottom: 96px; right: 24px; z-index: 999999;
      width: 380px; max-width: calc(100vw - 32px); height: 540px; max-height: calc(100vh - 120px);
      background: #ffffff; border-radius: 20px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1);
      border: 1px solid #e2e8f0; display: flex; flex-direction: column; overflow: hidden;
      opacity: 0; transform: translateY(20px) scale(0.95); pointer-events: none;
      transition: all 0.28s ease;
    }
    #gp-chat-window.gp-open { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
    .gp-header {
      background: linear-gradient(135deg, #1d4ed8, #4338ca); color: white;
      padding: 16px; display: flex; align-items: center; justify-content: space-between;
    }
    .gp-body {
      flex: 1; padding: 14px; overflow-y: auto; background: #f8fafc;
      display: flex; flex-direction: column; gap: 10px; font-size: 13.5px;
    }
    .gp-footer {
      padding: 12px; background: white; border-top: 1px solid #e2e8f0;
    }
    .gp-msg-visitor {
      align-self: flex-end; max-width: 80%;
      background: linear-gradient(135deg, #2563eb, #3b82f6); color: white;
      padding: 10px 14px; border-radius: 16px 16px 2px 16px; line-height: 1.4;
    }
    .gp-msg-agent {
      align-self: flex-start; max-width: 82%;
      background: #ffffff; color: #1e293b; border: 1px solid #e2e8f0;
      padding: 10px 14px; border-radius: 16px 16px 16px 2px; line-height: 1.4;
      box-shadow: 0 2px 4px rgba(0,0,0,0.03);
    }
    .gp-quick-btn {
      background: white; border: 1px solid #cbd5e1; padding: 6px 12px;
      border-radius: 20px; font-size: 12px; font-weight: 600; color: #334155;
      cursor: pointer; transition: all 0.2s; text-decoration: none; display: inline-flex; align-items: center;
    }
    .gp-quick-btn:hover { background: #eff6ff; color: #2563eb; border-color: #93c5fd; }
  `;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'gp-widget-root';
  root.innerHTML = `
    <div id="gp-chat-window">
      <div class="gp-header">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:36px; height:36px; border-radius:50%; background:rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:13px;">GP</div>
          <div>
            <div style="font-weight:bold; font-size:15px;">Support Team</div>
            <div style="font-size:11px; opacity:0.9; display:flex; align-items:center; gap:4px;">
              <span style="width:7px; height:7px; background:#10b981; border-radius:50%; display:inline-block;"></span>
              Online • Live Telegram Relay
            </div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <a href="https://wa.me/918377950798?text=Hi%2C%20I%20want%20to%20attach%20this%20Telegram%20live%20chatbot%20on%20my%20website" target="_blank" style="color:#86efac; text-decoration:none; font-size:12px; font-weight:bold; background:rgba(255,255,255,0.15); padding:3px 8px; border-radius:8px;">WhatsApp</a>
          <button id="gp-close-btn" style="background:none; border:none; color:white; font-size:20px; cursor:pointer; padding:4px;">✕</button>
        </div>
      </div>

      <div class="gp-body" id="gp-messages">
        <div class="gp-msg-agent">
          👋 Hi! How can we help you today? Leave a message and our team will reply directly to your chat.
        </div>
        <div id="gp-quick-box" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:4px;">
          <a href="https://wa.me/918377950798?text=Hi%2C%20I%20want%20to%20attach%20this%20Telegram%20live%20chatbot%20on%20my%20website" target="_blank" class="gp-quick-btn" style="background:#ecfdf5; color:#065f46; border-color:#a7f3d0; font-weight:bold;">📱 WhatsApp (8377950798)</a>
          <button class="gp-quick-btn" onclick="window.__gpSendQuick('I want to talk to an expert')">👨‍💻 Talk to Expert</button>
          <button class="gp-quick-btn" onclick="window.__gpSendQuick('I want to get started')">🚀 Get Started</button>
        </div>
      </div>

      <div class="gp-footer">
        <form id="gp-form" style="display:flex; gap:8px;">
          <input id="gp-input" type="text" placeholder="Type a message..." style="flex:1; padding:9px 14px; border-radius:20px; border:1px solid #cbd5e1; outline:none; font-size:13px;" />
          <button type="submit" style="width:36px; height:36px; border-radius:50%; background:#2563eb; color:white; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; font-weight:bold;">➤</button>
        </form>
        <div style="text-align:center; font-size:10px; color:#94a3b8; margin-top:6px;">⚡ Connected via Telegram & WhatsApp (8377950798)</div>
      </div>
    </div>

    <button id="gp-launcher" aria-label="Open Chat">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
      </svg>
      <span id="gp-badge">1</span>
    </button>
  `;
  document.body.appendChild(root);

  const launcher = document.getElementById('gp-launcher');
  const chatWin = document.getElementById('gp-chat-window');
  const closeBtn = document.getElementById('gp-close-btn');
  const badge = document.getElementById('gp-badge');
  const messagesBox = document.getElementById('gp-messages');
  const form = document.getElementById('gp-form');
  const input = document.getElementById('gp-input');

  function toggle() {
    isOpen = !isOpen;
    if (isOpen) {
      chatWin.classList.add('gp-open');
      if (badge) badge.style.display = 'none';
      input.focus();
    } else {
      chatWin.classList.remove('gp-open');
    }
  }

  launcher.addEventListener('click', toggle);
  closeBtn.addEventListener('click', toggle);

  function appendMsg(text, isVisitor, senderName) {
    const div = document.createElement('div');
    div.className = isVisitor ? 'gp-msg-visitor' : 'gp-msg-agent';
    div.innerHTML = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    messagesBox.appendChild(div);
    messagesBox.scrollTop = messagesBox.scrollHeight;
    playChime(isVisitor ? 'send' : 'receive');
  }

  async function sendMsg(text) {
    appendMsg(text, true);
    try {
      await fetch(SERVER_URL + '/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: visitorId, text: text })
      });
      lastTimestamp = Date.now();
    } catch (e) {
      console.warn('[GP Chat] Failed to deliver message to server', e);
    }
  }

  window.__gpSendQuick = function(txt) {
    const qBox = document.getElementById('gp-quick-box');
    if (qBox) qBox.style.display = 'none';
    sendMsg(txt);
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = input.value.trim();
    if (!val) return;
    input.value = '';
    sendMsg(val);
  });

  async function poll() {
    try {
      const res = await fetch(`${SERVER_URL}/api/chat/poll?sessionId=${visitorId}&after=${lastTimestamp}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.messages)) {
          for (const m of data.messages) {
            if (m.sender === 'agent') {
              appendMsg(m.text, false, m.senderName);
              if (!isOpen && badge) badge.style.display = 'flex';
            }
            if (m.timestamp > lastTimestamp) {
              lastTimestamp = m.timestamp;
            }
          }
        }
      }
    } catch (e) {}
    setTimeout(poll, 1800);
  }

  poll();
})();
