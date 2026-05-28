// ===================================================================
// COLOSSEUM: AI vs AI On-Chain Bounty Arena
// index.js — Real Swarms backend required. No simulation.
// ===================================================================

const API = 'http://localhost:5000/api';

// ===== STATE =====
const state = {
  wallet: { connected: false, address: '7xKp...3mZq', balance: 142.5 },
  currentView: 'arena',
  bounties: [],
  gladiators: [],
  leaderboard: [],
  activeBattleId: null,
  eventSource: null,
};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  initNav();
  initWallet();
  initTicker();
  await checkBackend();
});

// ===== BACKEND HEALTH CHECK =====
async function checkBackend() {
  try {
    const res = await fetch(`${API}/health`);
    if (!res.ok) throw new Error('not ok');
    await loadData();
    renderArena();
    renderBountyBoard();
    renderBarracks();
    renderLeaderboard();
    showView('arena');
    startLiveStatPoll();
  } catch (e) {
    showBackendRequired();
  }
}

function showBackendRequired() {
  document.getElementById('view-arena').innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:1.5rem;text-align:center">
      <div style="font-size:4rem">⚙️</div>
      <div style="font-size:1.5rem;font-weight:800;background:linear-gradient(90deg,var(--neon-cyan),var(--neon-purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">
        Backend Required
      </div>
      <div style="color:var(--text-muted);max-width:480px;line-height:1.7;font-size:0.95rem">
        Colosseum runs real Swarms AI agents. Start the backend to begin:
      </div>
      <div style="background:rgba(0,0,0,0.5);border:1px solid var(--border);border-radius:12px;padding:1.25rem 2rem;font-family:var(--font-mono);font-size:0.85rem;text-align:left;min-width:380px">
        <div style="color:var(--text-muted);margin-bottom:0.5rem"># 1. Add your API key</div>
        <div style="color:var(--neon-cyan)">cp .env.example .env</div>
        <div style="color:var(--text-muted);margin-top:0.75rem;margin-bottom:0.5rem"># 2. Install dependencies</div>
        <div style="color:var(--neon-cyan)">pip install -r requirements.txt</div>
        <div style="color:var(--text-muted);margin-top:0.75rem;margin-bottom:0.5rem"># 3. Start the server</div>
        <div style="color:var(--neon-green)">python app.py</div>
      </div>
      <button class="btn-launch" onclick="checkBackend()" style="margin-top:0.5rem">
        🔄 Retry Connection
      </button>
    </div>
  `;
  showView('arena');
}

// ===== NAVIGATION =====
function initNav() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      showView(view);
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });
}

function showView(view) {
  state.currentView = view;
  document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(`view-${view}`);
  if (el) el.classList.add('active');
}

// ===== WALLET =====
function initWallet() {
  const btn = document.getElementById('wallet-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    state.wallet.connected = !state.wallet.connected;
    const dot = btn.querySelector('.wallet-dot');
    if (state.wallet.connected) {
      dot.classList.remove('disconnected');
      btn.innerHTML = `<span class="wallet-dot"></span>${state.wallet.address} | ${state.wallet.balance} SOL`;
    } else {
      btn.innerHTML = `<span class="wallet-dot disconnected"></span>Connect Wallet`;
    }
  });
}

// ===== TICKER =====
function initTicker() {
  const events = [
    '🏆 CyberGladiator won $3,500 USDC bounty',
    '⚔️ New battle: SWRM-Guard vs ArbitrageX',
    '💰 New bounty posted: $2,800 USDC – MEV Arbitrage',
    '👾 DataMiner-9 joined the arena | Win Rate: 55%',
    '🔥 Flash Loan Exploit Audit CLAIMED by SWRM-Guard',
    '🚀 Frenzy Mode active on Swarms – 2x creator fees live',
    '⚡ CyberGladiator vs DataMiner-9 | Live in Arena',
    '💎 ArbitrageX rented for 48h | 0.5 SOL/hr',
  ];
  const ticker = document.getElementById('ticker-content');
  if (!ticker) return;
  const text = events.join('   ◆   ');
  ticker.textContent = text + '   ◆   ' + text;
}

// ===== DATA =====
async function loadData() {
  const [bRes, gRes, lRes] = await Promise.all([
    fetch(`${API}/bounties`),
    fetch(`${API}/gladiators`),
    fetch(`${API}/leaderboard`),
  ]);
  state.bounties = await bRes.json();
  state.gladiators = await gRes.json();
  state.leaderboard = await lRes.json();
}

async function refreshData() {
  await loadData();
  renderBountyBoard();
  renderBarracks();
  renderLeaderboard();
  renderArenaStats();
}

function startLiveStatPoll() {
  setInterval(refreshData, 15000);
}

// ===== RENDER ARENA =====
function renderArena() {
  const container = document.getElementById('arena-container');
  if (!container) return;
  container.innerHTML = `
    <div class="stats-grid" id="arena-stats-grid"></div>
    <div class="arena-cta">
      <button class="btn-launch" onclick="openBattleModal()">⚔️ Launch Battle</button>
      <p class="arena-sub">Select a bounty — two Swarms agents will compete using real AI</p>
    </div>
    <div id="battle-panel" class="battle-panel hidden"></div>
  `;
  renderArenaStats();
}

function renderArenaStats() {
  const grid = document.getElementById('arena-stats-grid');
  if (!grid) return;
  const totalPrize = state.bounties.reduce((s, b) => b.status === 'open' ? s + b.prize : s, 0);
  const activeBattles = state.bounties.filter(b => b.status === 'in_battle').length;
  const claimed = state.bounties.filter(b => b.status === 'claimed').length;
  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Open Prize Pool</div>
      <div class="stat-value neon-green">$${totalPrize.toLocaleString()}</div>
      <div class="stat-sub">USDC Available</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Active Battles</div>
      <div class="stat-value neon-purple">${activeBattles}</div>
      <div class="stat-sub">Agents fighting now</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Gladiators</div>
      <div class="stat-value neon-cyan">${state.gladiators.length}</div>
      <div class="stat-sub">Registered agents</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Bounties Claimed</div>
      <div class="stat-value neon-yellow">${claimed}</div>
      <div class="stat-sub">All time</div>
    </div>
  `;
}

// ===== BATTLE MODAL =====
function openBattleModal() {
  const modal = document.getElementById('battle-modal');
  if (!modal) return;
  const openBounties = state.bounties.filter(b => b.status === 'open');
  if (openBounties.length === 0) {
    showNotification('⚠️ No open bounties. Post one first!');
    return;
  }
  if (state.gladiators.length < 2) {
    showNotification('⚠️ Need at least 2 gladiators registered!');
    return;
  }
  const bountyOpts = openBounties.map(b =>
    `<option value="${b.id}">${b.title} — $${b.prize.toLocaleString()} USDC</option>`
  ).join('');
  const gladOpts = state.gladiators.map(g =>
    `<option value="${g.id}">${g.name} (${g.ticker})</option>`
  ).join('');
  const gladOpts2 = state.gladiators.map((g, i) =>
    `<option value="${g.id}" ${i === 1 ? 'selected' : ''}>${g.name} (${g.ticker})</option>`
  ).join('');

  modal.innerHTML = `
    <div class="modal-overlay" onclick="closeModal('battle-modal')">
      <div class="modal-box" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h2>⚔️ Configure Battle</h2>
          <button class="modal-close" onclick="closeModal('battle-modal')">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Select Bounty</label>
            <select id="battle-bounty" class="form-select">${bountyOpts}</select>
          </div>
          <div class="gladiator-selects">
            <div class="form-group">
              <label>🔵 Gladiator 1</label>
              <select id="battle-g1" class="form-select">${gladOpts}</select>
            </div>
            <div class="vs-divider">VS</div>
            <div class="form-group">
              <label>🔴 Gladiator 2</label>
              <select id="battle-g2" class="form-select">${gladOpts2}</select>
            </div>
          </div>
          <button class="btn-launch" style="width:100%;margin-top:1.5rem" onclick="startBattle()">
            🚀 Start Battle
          </button>
        </div>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

// ===== START REAL BATTLE =====
async function startBattle() {
  const bountyId = document.getElementById('battle-bounty').value;
  const g1Id = document.getElementById('battle-g1').value;
  const g2Id = document.getElementById('battle-g2').value;
  if (g1Id === g2Id) { showNotification('⚠️ Select two different gladiators!'); return; }

  closeModal('battle-modal');

  const bounty = state.bounties.find(b => b.id === bountyId);
  const g1 = state.gladiators.find(g => g.id === g1Id);
  const g2 = state.gladiators.find(g => g.id === g2Id);

  renderBattlePanel(bounty, g1, g2);
  showView('arena');

  try {
    const res = await fetch(`${API}/battle/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bounty_id: bountyId, gladiator_ids: [g1Id, g2Id] }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    state.activeBattleId = data.battle_id;
    connectSSE(data.battle_id, g1, g2, bounty);
  } catch (e) {
    showNotification(`❌ Battle failed: ${e.message}`);
    console.error(e);
  }
}

// ===== SSE STREAM — REAL AGENT OUTPUT =====
function connectSSE(battleId, g1, g2, bounty) {
  if (state.eventSource) state.eventSource.close();

  const es = new EventSource(`${API}/stream/${battleId}`);
  state.eventSource = es;

  es.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'status') {
      updateCommentary(data.text);
    }
    if (data.type === 'log') {
      appendTerminalLog(data.side, data.text);
    }
    if (data.type === 'progress') {
      updateProgress(data.side, data.value);
    }
    if (data.type === 'output') {
      // Real agent output — stream word by word
      streamOutput(data.side, data.text);
    }
    if (data.type === 'winner') {
      es.close();
      const winner = data.winner === g1.name ? g1 : g2;
      showVictory(winner, bounty.prize, data.tx_hash);
      refreshData();
    }
    if (data.type === 'error') {
      es.close();
      showNotification(`❌ ${data.text}`);
    }
  };

  es.onerror = () => {
    es.close();
    showNotification('⚠️ Lost connection to battle stream. Check if backend is running.');
  };
}

// Stream real agent text word-by-word into terminal
function streamOutput(side, fullText) {
  const terminal = document.getElementById(`terminal-${side}`);
  if (!terminal) return;
  const words = fullText.split(' ');
  let i = 0;
  const interval = setInterval(() => {
    if (i >= words.length) { clearInterval(interval); return; }
    const chunk = words.slice(i, i + 4).join(' ');
    const lastLine = terminal.querySelector('.stream-line');
    if (!lastLine || lastLine.dataset.full === '1') {
      const line = document.createElement('div');
      line.className = 'terminal-line stream-line';
      line.style.color = 'var(--neon-cyan)';
      line.textContent = chunk + ' ';
      terminal.appendChild(line);
    } else {
      lastLine.textContent += chunk + ' ';
    }
    terminal.scrollTop = terminal.scrollHeight;
    i += 4;
    if (i >= words.length && lastLine) lastLine.dataset.full = '1';
  }, 60);
}

// ===== RENDER BATTLE PANEL =====
function renderBattlePanel(bounty, g1, g2) {
  const panel = document.getElementById('battle-panel');
  if (!panel) return;
  panel.classList.remove('hidden');
  panel.innerHTML = `
    <div class="battle-header">
      <div class="battle-title">
        <span class="live-badge">● LIVE</span>
        ${bounty.title}
      </div>
      <div class="battle-prize">$${bounty.prize.toLocaleString()} USDC</div>
    </div>
    <div class="battle-arena">
      <div class="agent-side left-side">
        <div class="agent-header">
          <div class="agent-avatar avatar-cyan">${g1.name[0]}</div>
          <div>
            <div class="agent-name">${g1.name}</div>
            <div class="agent-ticker">${g1.ticker}</div>
          </div>
          <div class="agent-specialty-badge">${g1.specialty}</div>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar left-bar" id="progress-left"></div>
          <span class="progress-pct" id="pct-left">0%</span>
        </div>
        <div class="terminal" id="terminal-left">
          <div class="terminal-line" style="color:var(--text-muted)">Waiting for Swarms agent to start...</div>
          <span class="terminal-cursor">█</span>
        </div>
      </div>
      <div class="vs-center">
        <div class="vs-text">VS</div>
        <div class="lightning">⚡</div>
        <div class="commentator">
          <div class="commentator-label">🎙️ LIVE</div>
          <div id="commentator-text">Initialising Swarms agents...</div>
        </div>
      </div>
      <div class="agent-side right-side">
        <div class="agent-header right-align">
          <div class="agent-specialty-badge">${g2.specialty}</div>
          <div style="text-align:right">
            <div class="agent-name">${g2.name}</div>
            <div class="agent-ticker">${g2.ticker}</div>
          </div>
          <div class="agent-avatar avatar-magenta">${g2.name[0]}</div>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar right-bar" id="progress-right"></div>
          <span class="progress-pct" id="pct-right">0%</span>
        </div>
        <div class="terminal" id="terminal-right">
          <div class="terminal-line" style="color:var(--text-muted)">Waiting for Swarms agent to start...</div>
          <span class="terminal-cursor">█</span>
        </div>
      </div>
    </div>
    <div id="victory-overlay" class="victory-overlay hidden"></div>
  `;
  panel.scrollIntoView({ behavior: 'smooth' });
}

function appendTerminalLog(side, text) {
  const terminal = document.getElementById(`terminal-${side}`);
  if (!terminal) return;
  // Remove placeholder
  const placeholder = terminal.querySelector('.terminal-line');
  if (placeholder && placeholder.textContent.includes('Waiting')) placeholder.remove();
  const line = document.createElement('div');
  line.className = 'terminal-line';
  line.style.color = 'var(--text-muted)';
  line.textContent = text;
  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;
}

function updateProgress(side, value) {
  const bar = document.getElementById(`progress-${side}`);
  const pct = document.getElementById(`pct-${side}`);
  if (bar) bar.style.width = `${value}%`;
  if (pct) pct.textContent = `${value}%`;
}

function updateCommentary(text) {
  const el = document.getElementById('commentator-text');
  if (el) el.textContent = text;
}

function showVictory(winner, prize, txHash) {
  const overlay = document.getElementById('victory-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="victory-box">
      <div class="victory-crown">🏆</div>
      <div class="victory-label">WINNER</div>
      <div class="victory-name">${winner.name}</div>
      <div class="victory-ticker">${winner.ticker}</div>
      <div class="victory-prize">+$${prize.toLocaleString()} USDC</div>
      <div class="victory-tx">TX: <span class="tx-hash">${txHash}</span></div>
      <div class="victory-actions">
        <button class="btn-secondary" onclick="document.getElementById('victory-overlay').classList.add('hidden')">Close</button>
        <button class="btn-rent" onclick="openRentModal('${winner.id}')">👾 Rent on Swarms</button>
      </div>
    </div>
  `;
}

// ===== BOUNTY BOARD =====
function renderBountyBoard() {
  const container = document.getElementById('bounty-container');
  if (!container) return;
  const catColor = {
    'Security & Audits': 'var(--neon-magenta)',
    'Arbitrage & MEV': 'var(--neon-yellow)',
    'Data & Mining': 'var(--neon-cyan)',
  };
  const statusCfg = {
    open:      { label: 'OPEN',       cls: 'status-open' },
    in_battle: { label: '⚔️ IN BATTLE', cls: 'status-battle' },
    claimed:   { label: '✓ CLAIMED',  cls: 'status-claimed' },
  };
  container.innerHTML = state.bounties.map(b => {
    const color = catColor[b.category] || 'var(--neon-cyan)';
    const st = statusCfg[b.status] || statusCfg.open;
    return `
      <div class="bounty-card ${b.status === 'claimed' ? 'claimed' : ''}">
        <div class="bounty-top">
          <span class="category-badge" style="border-color:${color};color:${color}">${b.category}</span>
          <span class="status-badge ${st.cls}">${st.label}</span>
        </div>
        <div class="bounty-title">${b.title}</div>
        <div class="bounty-desc">${b.description.slice(0, 130)}...</div>
        <div class="bounty-footer">
          <div class="bounty-prize">$${b.prize.toLocaleString()} <span>USDC</span></div>
          <div class="bounty-meta">
            <div class="posted-by">${b.posted_by}</div>
            <div class="time-ago">${timeAgo(b.created_at)}</div>
          </div>
        </div>
        ${b.status === 'open' ? `<button class="btn-deploy" onclick="deployToBounty('${b.id}')">⚔️ Deploy Agents</button>` : ''}
      </div>
    `;
  }).join('');
}

function deployToBounty(bountyId) {
  showView('arena');
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.view === 'arena'));
  setTimeout(() => {
    openBattleModal();
    setTimeout(() => {
      const sel = document.getElementById('battle-bounty');
      if (sel) sel.value = bountyId;
    }, 100);
  }, 200);
}

async function submitBounty() {
  const title    = document.getElementById('new-title').value.trim();
  const desc     = document.getElementById('new-desc').value.trim();
  const prize    = parseFloat(document.getElementById('new-prize').value);
  const category = document.getElementById('new-category').value;
  if (!title || !desc || !prize) { showNotification('⚠️ Fill all fields'); return; }
  try {
    const res = await fetch(`${API}/bounties`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description: desc, prize, category,
        posted_by: state.wallet.connected ? state.wallet.address : 'Anonymous' }),
    });
    const data = await res.json();
    state.bounties.unshift(data);
    closeModal('post-bounty-modal');
    renderBountyBoard();
    renderArenaStats();
    showNotification(`✅ Bounty posted: ${title}`);
  } catch (e) {
    showNotification(`❌ ${e.message}`);
  }
}

// ===== BARRACKS =====
function renderBarracks() {
  const container = document.getElementById('barracks-container');
  if (!container) return;
  const maxEarnings = Math.max(...state.gladiators.map(g => g.earnings), 1);
  const colors = ['var(--neon-cyan)', 'var(--neon-purple)', 'var(--neon-magenta)', 'var(--neon-green)'];
  container.innerHTML = state.gladiators.map((g, i) => {
    const winRate = g.battles > 0 ? Math.round((g.wins / g.battles) * 100) : 0;
    const earningPct = Math.round((g.earnings / maxEarnings) * 100);
    const color = colors[i % colors.length];
    return `
      <div class="gladiator-card">
        <div class="gladiator-avatar" style="background:linear-gradient(135deg,${color}22,${color}11);border:1px solid ${color}44;color:${color}">${g.name[0]}</div>
        <div class="gladiator-name">${g.name}</div>
        <div class="gladiator-ticker">${g.ticker}</div>
        <div class="gladiator-specialty">${g.specialty}</div>
        <div class="gladiator-stats">
          <div class="stat-item"><span class="stat-num neon-green">${g.wins}</span><span>Wins</span></div>
          <div class="stat-item"><span class="stat-num neon-cyan">${g.battles}</span><span>Battles</span></div>
          <div class="stat-item"><span class="stat-num neon-yellow">${winRate}%</span><span>Win Rate</span></div>
          <div class="stat-item"><span class="stat-num neon-magenta">$${g.earnings.toLocaleString()}</span><span>Earned</span></div>
        </div>
        <div class="earnings-bar-wrap"><div class="earnings-bar" style="width:${earningPct}%"></div></div>
        <div class="gladiator-actions">
          <button class="btn-deploy" onclick="deployGladiator('${g.id}')">⚔️ Deploy</button>
          <button class="btn-rent" onclick="openRentModal('${g.id}')">👾 Rent</button>
        </div>
      </div>
    `;
  }).join('');
}

function deployGladiator(id) {
  showView('arena');
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.view === 'arena'));
  setTimeout(() => {
    openBattleModal();
    setTimeout(() => {
      const sel = document.getElementById('battle-g1');
      if (sel) sel.value = id;
    }, 100);
  }, 200);
}

async function registerGladiator() {
  const name      = document.getElementById('reg-name').value.trim();
  const ticker    = document.getElementById('reg-ticker').value.trim();
  const specialty = document.getElementById('reg-specialty').value;
  const prompt    = document.getElementById('reg-prompt').value.trim();
  const fee       = parseFloat(document.getElementById('reg-fee').value) || 0.5;
  if (!name || !ticker || !prompt) { showNotification('⚠️ Fill all required fields'); return; }
  try {
    const res = await fetch(`${API}/gladiators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, ticker: ticker.startsWith('$') ? ticker : `$${ticker}`,
        specialty, system_prompt: prompt, rental_fee: fee }),
    });
    const data = await res.json();
    state.gladiators.push(data);
    closeModal('register-modal');
    renderBarracks();
    renderLeaderboard();
    renderArenaStats();
    showNotification(`✅ ${name} entered the Colosseum!`);
  } catch (e) {
    showNotification(`❌ ${e.message}`);
  }
}

// ===== RENT MODAL =====
function openRentModal(idOrName) {
  const g = state.gladiators.find(x => x.id === idOrName || x.name === idOrName);
  if (!g) return;
  const modal = document.getElementById('rent-modal');
  modal.innerHTML = `
    <div class="modal-overlay" onclick="closeModal('rent-modal')">
      <div class="modal-box" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h2>👾 Rent ${g.name}</h2>
          <button class="modal-close" onclick="closeModal('rent-modal')">✕</button>
        </div>
        <div class="modal-body">
          <div class="rent-info">
            <div class="rent-row"><span>Agent</span><span>${g.name} (${g.ticker})</span></div>
            <div class="rent-row"><span>Specialty</span><span>${g.specialty}</span></div>
            <div class="rent-row"><span>Win Rate</span><span>${g.battles ? Math.round((g.wins/g.battles)*100) : 0}%</span></div>
            <div class="rent-row"><span>Career Earnings</span><span>$${g.earnings.toLocaleString()} USDC</span></div>
            <div class="rent-row highlight"><span>Rental Fee</span><span>${g.rental_fee} SOL/hr</span></div>
          </div>
          <div class="form-group" style="margin-top:1rem">
            <label>Duration (hours)</label>
            <input type="number" id="rent-duration" class="form-input" value="24" min="1" max="720"
              oninput="document.getElementById('rent-total').textContent='Total: '+((${g.rental_fee})*parseInt(this.value||1)).toFixed(2)+' SOL'">
          </div>
          <div class="rent-total" id="rent-total">Total: ${(g.rental_fee * 24).toFixed(2)} SOL</div>
          <button class="btn-launch" style="width:100%;margin-top:1rem" onclick="confirmRent('${g.id}')">
            Confirm on Swarms Marketplace
          </button>
        </div>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
}

function confirmRent(id) {
  const g = state.gladiators.find(x => x.id === id);
  const duration = parseInt(document.getElementById('rent-duration').value);
  closeModal('rent-modal');
  showNotification(`✅ ${g.name} rented for ${duration}h on Swarms Marketplace!`);
}

// ===== LEADERBOARD =====
function renderLeaderboard() {
  const container = document.getElementById('leaderboard-container');
  if (!container) return;
  const sorted = [...state.gladiators].sort((a, b) => b.earnings - a.earnings);
  const totalEarnings = sorted.reduce((s, g) => s + g.earnings, 0) || 1;
  const medals = ['🥇', '🥈', '🥉'];
  container.innerHTML = `
    <div class="prize-banner">
      <div class="prize-label">Swarms ACM Hackathon Prize Pool</div>
      <div class="prize-amount">$30,000 USDC</div>
      <div class="prize-sub">Distributed proportionally by career earnings</div>
    </div>
    <table class="leaderboard-table">
      <thead>
        <tr>
          <th>Rank</th><th>Agent</th><th>Ticker</th><th>Specialty</th>
          <th>Wins</th><th>Win Rate</th><th>Career Earnings</th><th>Prize Share</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map((g, i) => {
          const winRate = g.battles > 0 ? Math.round((g.wins / g.battles) * 100) : 0;
          const share = Math.round((g.earnings / totalEarnings) * 30000);
          return `
            <tr class="${i < 3 ? 'top-row' : ''}">
              <td class="rank-cell">${medals[i] || (i + 1)}</td>
              <td class="agent-cell">
                <div class="agent-avatar-sm">${g.name[0]}</div>${g.name}
              </td>
              <td><span class="ticker-badge">${g.ticker}</span></td>
              <td class="text-muted">${g.specialty}</td>
              <td class="neon-green">${g.wins}</td>
              <td class="${winRate >= 70 ? 'neon-cyan' : winRate >= 50 ? 'neon-yellow' : 'neon-magenta'}">${winRate}%</td>
              <td class="neon-yellow">$${g.earnings.toLocaleString()}</td>
              <td class="prize-share neon-green">$${share.toLocaleString()}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

// ===== UTILITIES =====
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function showNotification(msg) {
  const n = document.createElement('div');
  n.className = 'notification';
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => n.classList.add('show'), 10);
  setTimeout(() => { n.classList.remove('show'); setTimeout(() => n.remove(), 500); }, 4000);
}

// Wire up modal buttons
document.addEventListener('click', e => {
  if (e.target.id === 'post-bounty-btn') document.getElementById('post-bounty-modal').classList.remove('hidden');
  if (e.target.id === 'register-btn') document.getElementById('register-modal').classList.remove('hidden');
});
