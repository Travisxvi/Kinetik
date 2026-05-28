// View Navigation (Landing vs App)
const landingPage = document.getElementById('landing-page');
const appInterface = document.getElementById('app-interface');
const featureCards = document.querySelectorAll('.feature-card');
const backToHome = document.getElementById('back-to-home');

// Web3 Configuration
const ARC_RPC_URL = "https://rpc.testnet.arc.network";
const ARC_CHAIN_ID = 5042002;
const KINETIK_CONTRACT_ADDRESS = "0xYourContractAddressHere"; // User will fill this in after deploying on Remix

const kinetikABI = [
  "function sendTip(address creator, uint256 amount) external",
  "function settleSplit(address[] calldata friends, uint256 amountPerFriend) external",
  "function openStream(address receiver, uint256 ratePerSecond, uint256 deposit) external returns (bytes32)",
  "function closeStream(bytes32 streamId) external"
];

let isLiveMode = false;
let provider;
let signer;
let kinetikContract;

// Tab Navigation
const navItems = document.querySelectorAll('.nav-item');
const tabPanes = document.querySelectorAll('.tab-pane');

function openAppToTab(targetId) {
  // Hide landing, show app
  landingPage.classList.remove('active');
  appInterface.classList.add('active');
  
  // Update Nav
  navItems.forEach(nav => nav.classList.remove('active'));
  const targetNav = document.querySelector(`.nav-item[data-target="${targetId}"]`);
  if (targetNav) targetNav.classList.add('active');
  
  // Update Tab Pane
  tabPanes.forEach(tab => tab.classList.remove('active'));
  document.getElementById(targetId).classList.add('active');
  
  // Manage Background Layers smoothly
  document.querySelectorAll('.feature-bg').forEach(bg => bg.classList.remove('active'));
  const targetBg = document.getElementById('bg-layer-' + targetId.replace('tab-', ''));
  if (targetBg) targetBg.classList.add('active');
  document.querySelector('.feature-bg-overlay').classList.add('active');
  
  // Scroll to top
  window.scrollTo(0,0);
}

featureCards.forEach(card => {
  card.addEventListener('click', () => {
    const targetId = card.getAttribute('data-target');
    openAppToTab(targetId);
  });
});

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const targetId = item.getAttribute('data-target');
    openAppToTab(targetId);
  });
});

backToHome.addEventListener('click', () => {
  appInterface.classList.remove('active');
  landingPage.classList.add('active');
  document.querySelectorAll('.feature-bg').forEach(bg => bg.classList.remove('active'));
  document.querySelector('.feature-bg-overlay').classList.remove('active');
  window.scrollTo(0,0);
});

const explicitHomeBtn = document.getElementById('explicit-home-btn');
if (explicitHomeBtn) {
  explicitHomeBtn.addEventListener('click', () => {
    appInterface.classList.remove('active');
    landingPage.classList.add('active');
    document.querySelectorAll('.feature-bg').forEach(bg => bg.classList.remove('active'));
    document.querySelector('.feature-bg-overlay').classList.remove('active');
    window.scrollTo(0,0);
  });
}

// User Balance Management
let mainBalance = 1402.50;
const balanceEl = document.getElementById('user-balance');
const modalFullBalance = document.getElementById('modal-full-balance');

function updateMainBalance(amount) {
  mainBalance -= amount;
  const formattedStr = mainBalance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 4});
  balanceEl.textContent = formattedStr;
  if(modalFullBalance) modalFullBalance.textContent = formattedStr;
}

// Live Mode Toggle & Wallet Connection Logic
const modeToggle = document.getElementById('live-mode-toggle');
const modeLabel = document.getElementById('mode-label');
const connectWalletBtn = document.getElementById('connect-wallet-btn');

if (modeToggle) {
  modeToggle.addEventListener('change', (e) => {
    isLiveMode = e.target.checked;
    if (isLiveMode) {
      modeLabel.textContent = "Live";
      document.querySelector('.mode-toggle').classList.add('live');
      connectWalletBtn.style.display = 'block';
      balanceEl.textContent = "0.00"; // Reset until connected
    } else {
      modeLabel.textContent = "Demo";
      document.querySelector('.mode-toggle').classList.remove('live');
      connectWalletBtn.style.display = 'none';
      balanceEl.textContent = mainBalance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 4});
    }
  });
}

if (connectWalletBtn) {
  connectWalletBtn.addEventListener('click', async () => {
    if (typeof window.ethereum !== 'undefined' && typeof ethers !== 'undefined') {
      try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        provider = new ethers.BrowserProvider(window.ethereum);
        
        // Switch to Arc Testnet
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: ethers.toBeHex(ARC_CHAIN_ID) }],
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: ethers.toBeHex(ARC_CHAIN_ID),
                chainName: 'Arc Testnet',
                rpcUrls: [ARC_RPC_URL],
                nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }
              }],
            });
          }
        }
        
        signer = await provider.getSigner();
        kinetikContract = new ethers.Contract(KINETIK_CONTRACT_ADDRESS, kinetikABI, signer);
        
        const address = await signer.getAddress();
        connectWalletBtn.textContent = address.substring(0, 6) + "..." + address.substring(38);
        showToast("Wallet Connected to Arc Testnet!");
        
        balanceEl.textContent = "500.00"; // Mock USDC testnet balance
        mainBalance = 500.00;
        
      } catch (error) {
        console.error("Connection failed", error);
        showToast("Connection failed");
      }
    } else {
      showToast("Please install MetaMask!");
    }
  });
}

// Wallet Modal Logic
const walletModal = document.getElementById('wallet-modal');
const balancePill = document.getElementById('balance-pill');
const closeWalletModal = document.getElementById('close-wallet-modal');

if (balancePill) {
  balancePill.addEventListener('click', () => {
    walletModal.classList.add('active');
    modalFullBalance.textContent = mainBalance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 4});
  });
}

if (closeWalletModal) {
  closeWalletModal.addEventListener('click', () => {
    walletModal.classList.remove('active');
  });
}

if (walletModal) {
  walletModal.addEventListener('click', (e) => {
    if(e.target === walletModal) {
      walletModal.classList.remove('active');
    }
  });
}

// Toast Notification
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

// --- TAB 1: SPLIT LOGIC ---
const splitInput = document.getElementById('split-amount');
const friendItems = document.querySelectorAll('.friend-item');
const splitValueEl = document.querySelector('.split-value');
const btnSplit = document.getElementById('btn-split');

function calculateSplit() {
  const amount = parseFloat(splitInput.value) || 0;
  const selectedFriends = document.querySelectorAll('.friend-item.selected').length;
  // +1 for the user
  const splitAmount = amount / (selectedFriends + 1);
  splitValueEl.textContent = '$' + splitAmount.toFixed(2);
}

friendItems.forEach(item => {
  item.addEventListener('click', () => {
    item.classList.toggle('selected');
    calculateSplit();
  });
});

splitInput.addEventListener('input', calculateSplit);

btnSplit.addEventListener('click', () => {
  const amount = parseFloat(splitInput.value) || 0;
  const selectedFriends = document.querySelectorAll('.friend-item.selected').length;
  if(selectedFriends === 0) return;
  
  const myShare = amount / (selectedFriends + 1);
  const totalPaidToFriends = amount - myShare;
  
  if (totalPaidToFriends > 0) {
    updateMainBalance(totalPaidToFriends);
    showToast(`Settled $${totalPaidToFriends.toFixed(2)} instantly via Arc`);
  }
});

// --- TAB 2: STREAM LOGIC ---
const playBtn = document.getElementById('play-pause-btn');
const streamCostEl = document.getElementById('stream-cost');
let isPlaying = false;
let streamCost = 0;
let streamInterval;
const RATE_PER_SECOND = 0.001;

playBtn.addEventListener('click', () => {
  isPlaying = !isPlaying;
  
  if (isPlaying) {
    playBtn.textContent = '⏸';
    playBtn.style.color = '#22d3ee';
    streamInterval = setInterval(() => {
      streamCost += RATE_PER_SECOND;
      streamCostEl.textContent = '$' + streamCost.toFixed(4);
      // Visually drain main balance slightly for demo effect
      mainBalance -= RATE_PER_SECOND;
      balanceEl.textContent = mainBalance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 4});
    }, 1000);
  } else {
    playBtn.textContent = '▶';
    playBtn.style.color = 'white';
    clearInterval(streamInterval);
  }
});

// --- TAB 3: TIP LOGIC ---
// Simple Tip Integration
document.querySelectorAll('.tip-btn').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    const creator = e.target.parentElement.querySelector('h3').innerText;
    
    if (isLiveMode) {
      if (!signer) return showToast("Connect Wallet First!");
      if (KINETIK_CONTRACT_ADDRESS === "0xYourContractAddressHere") return showToast("Deploy Contract First!");
      try {
        showToast(`Confirming tip to ${creator} on Arc...`);
        // Mock recipient address for the demo
        const tx = await kinetikContract.sendTip("0x742d35Cc6634C0532925a3b844Bc454e4438f44e", ethers.parseUnits("5", 18));
        await tx.wait();
        showToast(`Tx Confirmed! Tipped ${creator}`);
        updateMainBalance(5);
      } catch (err) {
        console.error(err);
        showToast("Transaction Failed / Rejected");
      }
    } else {
      updateMainBalance(5);
      showToast(`Sent 5 USDC to ${creator}!`);
    }
    
    // Add simple click animation
    btn.style.transform = 'scale(0.9)';
    btn.style.background = 'rgba(34, 211, 238, 0.2)';
    btn.style.borderColor = '#22d3ee';
    setTimeout(() => {
      btn.style.transform = 'scale(1)';
      btn.style.background = 'rgba(255,255,255,0.05)';
      btn.style.borderColor = 'rgba(255, 255, 255, 0.08)';
    }, 200);
  });
});
