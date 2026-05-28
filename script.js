// View Navigation (Landing vs App)
const landingPage = document.getElementById('landing-page');
const appInterface = document.getElementById('app-interface');
const featureCards = document.querySelectorAll('.feature-card');
const backToHome = document.getElementById('back-to-home');

// Web3 Configuration
const ARC_RPC_URL = "https://rpc.testnet.arc.network";
const ARC_CHAIN_ID = 5042002;
const KINETIK_CONTRACT_ADDRESS = "0xa742D387830e4727ea0E2D149B357e29B8E2f439";

const kinetikABI = [
  "function sendTip(address creator) external payable",
  "function settleSplit(address[] calldata friends, uint256 amountPerFriend) external payable",
  "function openStream(address receiver, uint256 ratePerSecond) external payable returns (bytes32)",
  "function closeStream(bytes32 streamId) external"
];

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

// Live Mode Wallet Connection Logic
const connectWalletBtn = document.getElementById('connect-wallet-btn');

if (connectWalletBtn) {
  connectWalletBtn.addEventListener('click', async () => {
    if (typeof window.ethereum !== 'undefined' && typeof ethers !== 'undefined') {
      try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        
        // Switch to Arc Testnet FIRST
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
        
        // Wait briefly for the wallet's internal state to update to the new chain
        await new Promise(r => setTimeout(r, 500));
        
        // Initialize Ethers with 'any' to handle dynamic network changes gracefully
        provider = new ethers.BrowserProvider(window.ethereum, 'any');
        signer = await provider.getSigner();
        kinetikContract = new ethers.Contract(KINETIK_CONTRACT_ADDRESS, kinetikABI, signer);
        
        // Ensure wallet actually switched successfully before proceeding
        const currentNetwork = await provider.getNetwork();
        if (Number(currentNetwork.chainId) !== ARC_CHAIN_ID) {
           showToast("Warning: Wallet did not switch to Arc Testnet!");
        }
        
        const address = await signer.getAddress();
        connectWalletBtn.textContent = address.substring(0, 6) + "..." + address.substring(38);
        connectWalletBtn.style.background = 'var(--accent)';
        connectWalletBtn.style.color = '#000';
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

btnSplit.addEventListener('click', async () => {
  const amount = parseFloat(splitInput.value) || 0;
  const selectedFriends = document.querySelectorAll('.friend-item.selected').length;
  if(selectedFriends === 0) return;
  
  if (!signer) return showToast("Connect Wallet First!");
  
  const myShare = amount / (selectedFriends + 1);
  const totalPaidToFriends = amount - myShare;
  
  if (totalPaidToFriends > 0) {
    try {
      showToast(`Confirming split on Arc...`);
      // Mock addresses for friends
      const mockFriends = Array(selectedFriends).fill("0x742d35Cc6634C0532925a3b844Bc454e4438f44e");
      const tx = await kinetikContract.settleSplit(
        mockFriends,
        ethers.parseUnits("0.0001", 18),
        { value: ethers.parseUnits("0.0001", 18), gasLimit: 400000 }
      );
      
      showToast(`Transaction sent! Waiting...`);
      await tx.wait();
      
      updateMainBalance(totalPaidToFriends);
      showToast(`Settled $${totalPaidToFriends.toFixed(2)} instantly via Arc`);
    } catch (err) {
      console.error(err);
      showToast("Transaction Failed / Rejected");
    }
  }
});

// --- TAB 2: STREAM LOGIC ---
const playBtn = document.getElementById('play-pause-btn');
const streamCostEl = document.getElementById('stream-cost');
let isPlaying = false;
let streamCost = 0;
let streamInterval;
const RATE_PER_SECOND = 0.001;

playBtn.addEventListener('click', async () => {
  if (!isPlaying) {
    if (!signer) return showToast("Connect Wallet First!");
    
    try {
      showToast(`Opening stream on Arc...`);
      const tx = await kinetikContract.openStream(
        "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
        ethers.parseUnits("0.0001", 18),
        { value: ethers.parseUnits("0.0001", 18), gasLimit: 300000 }
      );
      
      showToast(`Transaction sent! Waiting...`);
      await tx.wait();
      showToast(`Stream Opened!`);
      
      // Start visual tick
      isPlaying = true;
      playBtn.textContent = '⏸';
      playBtn.style.color = '#22d3ee';
      streamInterval = setInterval(() => {
        streamCost += RATE_PER_SECOND;
        streamCostEl.textContent = '$' + streamCost.toFixed(4);
        updateMainBalance(RATE_PER_SECOND);
      }, 1000);
      
    } catch (err) {
      console.error(err);
      showToast("Stream Transaction Rejected");
    }
  } else {
    isPlaying = false;
    playBtn.textContent = '▶';
    playBtn.style.color = 'white';
    clearInterval(streamInterval);
    showToast("Stream Paused/Closed.");
  }
});

// --- TAB 3: TIP LOGIC ---
// Simple Tip Integration
document.querySelectorAll('.tip-btn').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    // Prevent default and stop propagation in case there are other handlers
    e.preventDefault();
    e.stopPropagation();
    
    const card = e.target.closest('.creator-card');
    const creator = card ? card.querySelector('h3').innerText : "Creator";
    const amountVal = e.target.getAttribute('data-amount') || "5.00";
    
    if (!signer) return showToast("Connect Wallet First!");
    
    try {
      showToast(`Confirming $${amountVal} tip to ${creator}...`);
      // Mock recipient address for the demo
      // For the demo, we send a micro-amount of native Arc tokens (0.0001)
      // to avoid 'insufficient balance' issues while pitching, but the UI updates properly!
      const tx = await kinetikContract.sendTip(
        "0x742d35Cc6634C0532925a3b844Bc454e4438f44e", 
        { value: ethers.parseUnits("0.0001", 18), gasLimit: 300000 } 
      );
      
      showToast(`Transaction sent! Waiting for confirmation...`);
      await tx.wait();
      showToast(`Tx Confirmed! Tipped ${creator}`);
      updateMainBalance(parseFloat(amountVal));
    } catch (err) {
      console.error(err);
      showToast("Transaction Failed / Rejected");
    }
    
    // Add simple click animation
  });
});
