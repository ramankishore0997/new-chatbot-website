# 🚀 GrowthPilot — Agency Landing Page & 2-Way Telegram Live Chat SaaS

A modern, high-converting digital marketing agency landing page featuring a **real-time 2-way Website-to-Telegram Live Chatbot** and direct **WhatsApp integration**.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-green.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)

---

## ✨ Features

- ⚡ **2-Way Telegram Live Chat Relay**: Visitors chat on the website; messages instantly arrive in your Telegram (or team group). Reply directly in Telegram, and your response appears live on the visitor's screen.
- 📱 **WhatsApp Quick-Connect**: "Drop a message on WhatsApp to attach a chatbot on your website" CTA button for instant client acquisition.
- 🎨 **Modern SaaS Landing Page**: Built with Tailwind CSS, Plus Jakarta Sans font, smooth animations, pricing tables, ROAS dashboard metrics, and testimonials.
- 🔌 **Plug-and-Play Embed Widget (`widget.js`)**: Easily attach this live chatbot to ANY client website (WordPress, Shopify, Wix, Webflow, React, HTML) with just 1 line of script.
- 🔔 **Web Audio Chimes**: Synthesized notification chimes for sent and received messages.
- 🛡️ **Zero External Dependencies**: Server runs natively on Node.js without heavy npm packages.

---

## 🚀 Quick Start

### 1. Clone & Run Locally
```bash
git clone https://github.com/ramankishore0997/new-chatbot-website.git
cd new-chatbot-website
node server.js
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🤖 Connecting Your Telegram Bot

1. Open Telegram and search for **[@BotFather](https://t.me/BotFather)**.
2. Send `/newbot` and follow prompts to get your **Bot API Token**.
3. Open `http://localhost:3000` and click **"⚙️ Configure Telegram Bot"** at the top.
4. Paste your token and click **Save & Connect**.
5. Open your bot in Telegram and send `/start`.

---

## 🔌 How to Embed on Client Websites

Add this single line of code right before the closing `</body>` tag on any client website:

```html
<!-- GrowthPilot Telegram Live Chat Widget -->
<script src="https://YOUR-SERVER-DOMAIN.com/widget.js" data-server="https://YOUR-SERVER-DOMAIN.com"></script>
```

---

## 🛠️ Deploying Backend 24/7 (Free)

Deploy on **[Render.com](https://render.com)** or **[Railway.app](https://railway.app)**:
- **Build Command**: `npm install`
- **Start Command**: `node server.js`
- Set port to `3000` or use default environment variable.

---

## 📄 License
MIT License © 2026 GrowthPilot
