import json
import os
import time
from web3 import Web3
from solcx import compile_source, install_solc

# Ensure solc 0.8.20 is installed silently
try:
    install_solc('0.8.20')
except Exception as e:
    pass

# Arc Testnet Configuration
RPC_URL = "https://rpc.testnet.arc.network"
CHAIN_ID = 5042002

print("=== KINETIK 1-CLICK AUTO-DEPLOYER ===")
w3 = Web3(Web3.HTTPProvider(RPC_URL))
if not w3.is_connected():
    print("Error: Could not connect to Arc Testnet. Check your internet connection.")
    exit(1)

# Wallet Generation Logic
ENV_FILE = ".env"
private_key = None

if os.path.exists(ENV_FILE):
    with open(ENV_FILE, "r") as f:
        for line in f:
            if line.startswith("DEPLOYER_PRIVATE_KEY="):
                private_key = line.strip().split("=")[1]

if not private_key:
    print("Generating a fresh, secure deployment wallet...")
    account = w3.eth.account.create()
    private_key = account.key.hex()
    with open(ENV_FILE, "w") as f:
        f.write(f"DEPLOYER_PRIVATE_KEY={private_key}\n")
    print(f"-> Saved new Private Key to {ENV_FILE} (DO NOT push to GitHub!)")
else:
    account = w3.eth.account.from_key(private_key)

print(f"\nDeployer Address: {account.address}")

# Faucet Funding Check
balance = w3.eth.get_balance(account.address)
eth_balance = w3.from_wei(balance, 'ether')
print(f"Current Gas Balance: {eth_balance} ARC")

if balance == 0:
    print("\n[!] INSUFFICIENT FUNDS [!]")
    print(f"Please go to the Arc Faucet: https://faucet.circle.com")
    print(f"And request funds for this exact address: {account.address}")
    print("\nAfter funding, I will run this script again.")
    exit(0)

print("Wallet funded! Proceeding to deployment...")

print("\nCompiling KinetikRouter.sol...")
with open("contracts/KinetikRouter.sol", "r") as file:
    source_code = file.read()

compiled_sol = compile_source(
    source_code,
    output_values=["abi", "bin"],
    solc_version="0.8.20"
)

contract_id, contract_interface = compiled_sol.popitem()
bytecode = contract_interface['bin']
abi = contract_interface['abi']

print("Compiled successfully! Deploying to Arc Testnet...")
KinetikRouter = w3.eth.contract(abi=abi, bytecode=bytecode)

try:
    transaction = KinetikRouter.constructor().build_transaction({
        "chainId": CHAIN_ID,
        "gasPrice": w3.eth.gas_price,
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address),
    })

    signed_txn = w3.eth.account.sign_transaction(transaction, private_key=private_key)
    print("Transaction signed. Broadcasting to network...")
    tx_hash = w3.eth.send_raw_transaction(signed_txn.raw_transaction)
    print(f"Transaction Hash: {tx_hash.hex()}")
    
    print("Waiting for block confirmation (this takes 1-2 seconds)...")
    tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    contract_address = tx_receipt.contractAddress
    print(f"\nSUCCESS! Contract Deployed at: {contract_address}")
    
    # Auto-update script.js
    script_path = "script.js"
    with open(script_path, "r") as f:
        content = f.read()
        
    content = content.replace(
        'const KINETIK_CONTRACT_ADDRESS = "0xYourContractAddressHere";', 
        f'const KINETIK_CONTRACT_ADDRESS = "{contract_address}";'
    )
    
    with open(script_path, "w") as f:
        f.write(content)
        
    print(f"\nSuccessfully auto-injected {contract_address} into script.js!")
    print("You can now test the 'Live Mode' Tip functionality in your frontend!")

except Exception as e:
    print(f"\nDeployment Failed: {e}")
