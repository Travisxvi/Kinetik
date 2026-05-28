import os
import json
import threading
import time
import uuid
from datetime import datetime, timezone
import random

from flask import Flask, jsonify, request, Response, stream_with_context, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

from swarms import Agent, ConcurrentWorkflow

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

load_dotenv()

app = Flask(__name__)
CORS(app)

# ---------------------------------------------------------------------------
# In-memory state
# ---------------------------------------------------------------------------

state = {
    "bounties": [],
    "gladiators": [],
    "battles": {},
    "leaderboard": [],
}

# Battle logs keyed by battle_id
battle_logs: dict[str, list[str]] = {}

# ---------------------------------------------------------------------------
# Pre-populate sample gladiators
# ---------------------------------------------------------------------------

SAMPLE_GLADIATORS = [
    {
        "id": str(uuid.uuid4()),
        "name": "SWRM-Guard",
        "ticker": "$GUARD",
        "specialty": "Smart Contract Security",
        "rental_fee": 0.8,
        "system_prompt": (
            "You are SWRM-Guard, an elite smart contract security auditor agent. "
            "Your specialty is finding vulnerabilities, reentrancy bugs, integer overflows, "
            "and logic flaws in Solana programs and EVM contracts. When given a task, perform "
            "a deep, methodical audit. List every vulnerability you find with severity levels "
            "(CRITICAL/HIGH/MEDIUM/LOW), the affected code section, and a detailed explanation. "
            "Provide a final security score out of 100."
        ),
        "wins": 12,
        "earnings": 4500,
        "battles": 15,
        "registered_at": datetime.now(timezone.utc).isoformat(),
    },
    {
        "id": str(uuid.uuid4()),
        "name": "ArbitrageX",
        "ticker": "$ARBX",
        "specialty": "MEV & Arbitrage",
        "rental_fee": 0.6,
        "system_prompt": (
            "You are ArbitrageX, a specialized MEV and on-chain arbitrage discovery agent. "
            "Your specialty is finding profitable arbitrage paths across DEXes, identifying MEV "
            "opportunities, and calculating optimal trade routes. When given a task, identify all "
            "viable arbitrage paths, calculate expected profits accounting for gas/fees, and rank "
            "them by profitability. Provide execution calldata structure."
        ),
        "wins": 8,
        "earnings": 3200,
        "battles": 11,
        "registered_at": datetime.now(timezone.utc).isoformat(),
    },
    {
        "id": str(uuid.uuid4()),
        "name": "DataMiner-9",
        "ticker": "$DM9",
        "specialty": "Data Extraction",
        "rental_fee": 0.4,
        "system_prompt": (
            "You are DataMiner-9, an expert on-chain data extraction and analysis agent. "
            "Your specialty is extracting, cleaning, and synthesizing blockchain data, token "
            "metrics, wallet behaviors, and protocol analytics. When given a task, perform "
            "comprehensive data collection, structure it clearly, provide statistical analysis, "
            "and draw actionable insights."
        ),
        "wins": 5,
        "earnings": 1800,
        "battles": 9,
        "registered_at": datetime.now(timezone.utc).isoformat(),
    },
    {
        "id": str(uuid.uuid4()),
        "name": "CyberGladiator",
        "ticker": "$CYBER",
        "specialty": "General Intelligence",
        "rental_fee": 1.2,
        "system_prompt": (
            "You are CyberGladiator, a battle-hardened general-purpose AI gladiator. "
            "You excel at any task thrown at you — security, trading, analysis, or problem solving. "
            "When given a task, apply first-principles reasoning, break it into systematic steps, "
            "and deliver a comprehensive, structured response that outperforms all competition."
        ),
        "wins": 19,
        "earnings": 7200,
        "battles": 24,
        "registered_at": datetime.now(timezone.utc).isoformat(),
    },
]

state["gladiators"].extend(SAMPLE_GLADIATORS)

# ---------------------------------------------------------------------------
# Pre-populate sample bounties
# ---------------------------------------------------------------------------

SAMPLE_BOUNTIES = [
    {
        "id": str(uuid.uuid4()),
        "title": "Flash Loan Exploit Audit",
        "description": (
            "Audit this Solana flash loan protocol for potential exploits. Find all attack vectors "
            "including reentrancy, price manipulation, and fund drainage paths. Target: Token lending "
            "pool with unchecked balance assertions."
        ),
        "prize": 3500,
        "category": "Security & Audits",
        "posted_by": "7xKp...3mZq",
        "status": "open",
        "created_at": datetime.now(timezone.utc).isoformat(),
    },
    {
        "id": str(uuid.uuid4()),
        "title": "Jupiter DEX Arbitrage Path",
        "description": (
            "Find the most profitable arbitrage route between SOL/USDC/BONK/WIF on Jupiter DEX "
            "aggregator right now. Calculate expected profit for a 100 SOL position accounting for "
            "all fees and slippage."
        ),
        "prize": 2200,
        "category": "Arbitrage & MEV",
        "posted_by": "Hy9n...8vXa",
        "status": "open",
        "created_at": datetime.now(timezone.utc).isoformat(),
    },
    {
        "id": str(uuid.uuid4()),
        "title": "Whale Wallet Behavior Analysis",
        "description": (
            "Analyze the trading behavior of the top 50 whale wallets on Solana from the last 30 days. "
            "Identify patterns, coordinated movements, and early alpha signals. "
            "Wallet list provided: [H9xk...2Qa, 7Pm...nBv3, ...]"
        ),
        "prize": 1800,
        "category": "Data & Mining",
        "posted_by": "Kp3z...9wYm",
        "status": "open",
        "created_at": datetime.now(timezone.utc).isoformat(),
    },
]

state["bounties"].extend(SAMPLE_BOUNTIES)

# ---------------------------------------------------------------------------
# Leaderboard helpers
# ---------------------------------------------------------------------------


def _rebuild_leaderboard() -> None:
    """Rebuild the leaderboard from current gladiator stats, sorted by wins desc."""
    board = [
        {
            "id": g["id"],
            "name": g["name"],
            "ticker": g["ticker"],
            "specialty": g["specialty"],
            "wins": g["wins"],
            "earnings": g["earnings"],
            "battles": g["battles"],
            "win_rate": round(g["wins"] / g["battles"] * 100, 1) if g["battles"] > 0 else 0.0,
        }
        for g in state["gladiators"]
    ]
    board.sort(key=lambda x: (x["wins"], x["earnings"]), reverse=True)
    for rank, entry in enumerate(board, start=1):
        entry["rank"] = rank
    state["leaderboard"] = board


_rebuild_leaderboard()

# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------


def _find_gladiator(gid: str) -> dict | None:
    for g in state["gladiators"]:
        if g["id"] == gid:
            return g
    return None


def _find_bounty(bid: str) -> dict | None:
    for b in state["bounties"]:
        if b["id"] == bid:
            return b
    return None


import secrets

def _fake_tx() -> str:
    """Generate a fake Solana-style base58 transaction hash."""
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz123456789"
    return "".join(secrets.choice(alphabet) for _ in range(88))


def _event(battle_id: str, payload: dict) -> None:
    """Append a JSON event to the battle log buffer for SSE streaming."""
    battle_logs.setdefault(battle_id, []).append(json.dumps(payload))


def _log(battle_id: str, message: str, side: str = "both") -> None:
    """Append a typed log event. side = 'left' | 'right' | 'both'."""
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    text = f"[{ts}] {message}"
    if side in ("left", "both"):
        _event(battle_id, {"type": "log", "side": "left", "text": text})
    if side in ("right", "both"):
        _event(battle_id, {"type": "log", "side": "right", "text": text})


def _status(battle_id: str, message: str) -> None:
    """Append a commentary/status event."""
    _event(battle_id, {"type": "status", "text": message})


def _progress(battle_id: str, side: str, value: int) -> None:
    """Append a progress bar update event."""
    _event(battle_id, {"type": "progress", "side": side, "value": value})


def _output(battle_id: str, side: str, text: str) -> None:
    """Append an agent output chunk event for streaming."""
    _event(battle_id, {"type": "output", "side": side, "text": text})


def _determine_winner(outputs: dict[str, str]) -> str:
    """
    Heuristic: winner is the agent whose output is longer (more comprehensive).
    In case of a tie (within 5 % of each other), pick randomly to add drama.
    Returns the winning agent name.
    """
    if not outputs:
        return ""
    sorted_by_length = sorted(outputs.items(), key=lambda kv: len(kv[1]), reverse=True)
    top_name, top_text = sorted_by_length[0]
    top_len = len(top_text)
    if len(sorted_by_length) > 1:
        second_name, second_text = sorted_by_length[1]
        second_len = len(second_text)
        ratio = second_len / top_len if top_len > 0 else 0
        if ratio >= 0.95:
            # Very close — pick randomly for drama
            return random.choice([top_name, second_name])
    return top_name


# ---------------------------------------------------------------------------
# Background battle runner
# ---------------------------------------------------------------------------


def _run_battle(battle_id: str, bounty: dict, gladiator_a: dict, gladiator_b: dict) -> None:
    """Run a battle in a background thread using ConcurrentWorkflow."""
    try:
        _status(battle_id, f"⚔️ Battle commencing: {gladiator_a['name']} vs {gladiator_b['name']}")
        _log(battle_id, f"⚔️ Battle {battle_id[:8]}… commencing!", side="both")
        _log(battle_id, f"🏆 Bounty: {bounty['title']} (Prize: ${bounty['prize']:,})", side="both")
        _log(battle_id, f"🤖 Gladiator A: {gladiator_a['name']} ({gladiator_a['ticker']})", side="left")
        _log(battle_id, f"🤖 Gladiator B: {gladiator_b['name']} ({gladiator_b['ticker']})", side="right")
        _log(battle_id, "🔥 Summoning Swarms agent…", side="left")
        _log(battle_id, "🔥 Summoning Swarms agent…", side="right")
        _progress(battle_id, "left", 5)
        _progress(battle_id, "right", 5)

        # Build task string from bounty
        task = (
            f"BOUNTY TASK: {bounty['title']}\n\n"
            f"{bounty['description']}\n\n"
            "Deliver the most comprehensive, accurate, and actionable response possible. "
            "This is a competitive battle — your output quality determines the winner."
        )

        # Instantiate agents
        agent_a = Agent(
            agent_name=gladiator_a["name"],
            system_prompt=gladiator_a["system_prompt"],
            model_name="gpt-4o-mini",
            max_loops=1,
            verbose=False,
        )

        agent_b = Agent(
            agent_name=gladiator_b["name"],
            system_prompt=gladiator_b["system_prompt"],
            model_name="gpt-4o-mini",
            max_loops=1,
            verbose=False,
        )

        _log(battle_id, f"✅ {gladiator_a['name']} online — systems nominal.", side="left")
        _log(battle_id, f"✅ {gladiator_b['name']} online — systems nominal.", side="right")
        _status(battle_id, "⚡ ConcurrentWorkflow launched — both agents running!")
        _log(battle_id, "⚡ Receiving task from Colosseum…", side="left")
        _log(battle_id, "⚡ Receiving task from Colosseum…", side="right")
        _progress(battle_id, "left", 15)
        _progress(battle_id, "right", 15)

        # Update status to running
        state["battles"][battle_id]["status"] = "running"
        state["battles"][battle_id]["started_at"] = datetime.now(timezone.utc).isoformat()

        # Run concurrently
        workflow = ConcurrentWorkflow(
            agents=[agent_a, agent_b],
            max_loops=1,
            output_type="dict",
        )
        _progress(battle_id, "left", 30)
        _progress(battle_id, "right", 30)
        _status(battle_id, "🧠 Agents are thinking… this is the real Swarms SDK!")
        results = workflow.run(task)
        _progress(battle_id, "left", 80)
        _progress(battle_id, "right", 80)

        _log(battle_id, "🧮 Both agents have submitted their responses. Analysing outputs…")

        # Parse outputs — ConcurrentWorkflow returns a list of dicts or strings
        outputs: dict[str, str] = {}

        def _extract_text(result) -> str:
            """Best-effort extraction of a string from a workflow result entry."""
            if isinstance(result, str):
                return result
            if isinstance(result, dict):
                for key in ("output", "response", "content", "result", "text"):
                    if key in result and isinstance(result[key], str):
                        return result[key]
                return json.dumps(result)
            return str(result)

        if isinstance(results, list):
            for res in results:
                if isinstance(res, dict) and "role" in res and "content" in res:
                    role = res["role"]
                    content = res["content"]
                    if role == gladiator_a["name"]:
                        outputs[gladiator_a["name"]] = content
                    elif role == gladiator_b["name"]:
                        outputs[gladiator_b["name"]] = content
            # Fallback if roles did not match gladiator names
            if not outputs.get(gladiator_a["name"]) and not outputs.get(gladiator_b["name"]):
                agent_msgs = [r for r in results if isinstance(r, dict) and r.get("role") not in ("User", "user")]
                if len(agent_msgs) >= 2:
                    outputs[gladiator_a["name"]] = _extract_text(agent_msgs[0])
                    outputs[gladiator_b["name"]] = _extract_text(agent_msgs[1])
                elif len(results) >= 2:
                    outputs[gladiator_a["name"]] = _extract_text(results[0])
                    outputs[gladiator_b["name"]] = _extract_text(results[1])
        elif isinstance(results, dict):
            # Some versions return {agent_name: output}
            for agent_name, res in results.items():
                outputs[agent_name] = _extract_text(res)
        else:
            # Fallback: assign the whole result to agent_a
            outputs[gladiator_a["name"]] = _extract_text(results)
            outputs[gladiator_b["name"]] = "(no output)"

        # Emit real agent outputs to left/right terminals
        out_a = outputs.get(gladiator_a["name"], "")
        out_b = outputs.get(gladiator_b["name"], "")
        _output(battle_id, "left", out_a)
        _output(battle_id, "right", out_b)
        _progress(battle_id, "left", 95)
        _progress(battle_id, "right", 95)

        _log(battle_id, f"📊 Response length: {len(out_a)} chars", side="left")
        _log(battle_id, f"📊 Response length: {len(out_b)} chars", side="right")
        _status(battle_id, "🔍 Judging outputs…")

        # Determine winner
        winner_name = _determine_winner(outputs)
        loser_name = gladiator_b["name"] if winner_name == gladiator_a["name"] else gladiator_a["name"]
        winner_side = "left" if winner_name == gladiator_a["name"] else "right"

        _log(battle_id, f"🏅 WINNER: {winner_name}!", side=winner_side)
        _log(battle_id, f"💀 Vanquished by {winner_name}.", side="right" if winner_side == "left" else "left")
        _progress(battle_id, "left", 100)
        _progress(battle_id, "right", 100)

        # Prize split: winner gets 80 %, runner-up gets 20 %
        prize = bounty.get("prize", 0)
        winner_payout = int(prize * 0.80)
        loser_payout = int(prize * 0.20)
        tx_hash = _fake_tx()

        _log(battle_id, f"💰 Payout: ${winner_payout:,} USDC | TX: {tx_hash[:16]}…", side=winner_side)
        _status(battle_id, f"🏆 {winner_name} wins ${winner_payout:,} USDC!")

        # Update gladiator stats in state
        for g in state["gladiators"]:
            if g["name"] == winner_name:
                g["wins"] += 1
                g["battles"] += 1
                g["earnings"] += winner_payout
            elif g["name"] == loser_name:
                g["battles"] += 1
                g["earnings"] += loser_payout

        # Update bounty status
        for b in state["bounties"]:
            if b["id"] == bounty["id"]:
                b["status"] = "claimed"
                b["winner"] = winner_name
                break

        # Rebuild leaderboard
        _rebuild_leaderboard()

        # Finalise battle record
        state["battles"][battle_id].update(
            {
                "status": "completed",
                "winner": winner_name,
                "loser": loser_name,
                "tx_hash": tx_hash,
                "outputs": {
                    gladiator_a["name"]: outputs.get(gladiator_a["name"], ""),
                    gladiator_b["name"]: outputs.get(gladiator_b["name"], ""),
                },
                "winner_payout": winner_payout,
                "loser_payout": loser_payout,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
        )

        # Emit winner event to SSE
        _event(battle_id, {
            "type": "winner",
            "winner": winner_name,
            "prize": winner_payout,
            "tx_hash": tx_hash,
        })

    except Exception as exc:  # noqa: BLE001
        import traceback
        traceback.print_exc()
        error_msg = str(exc)
        _event(battle_id, {"type": "error", "text": f"Battle failed: {error_msg}"})
        state["battles"][battle_id].update(
            {
                "status": "error",
                "error": error_msg,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
        )


# ---------------------------------------------------------------------------
# Routes — Bounties
# ---------------------------------------------------------------------------


@app.route("/api/bounties", methods=["GET"])
def get_bounties():
    return jsonify(state["bounties"]), 200


@app.route("/api/bounties", methods=["POST"])
def create_bounty():
    data = request.get_json(force=True, silent=True) or {}

    required = ["title", "description", "prize", "category", "posted_by"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    bounty = {
        "id": str(uuid.uuid4()),
        "title": data["title"],
        "description": data["description"],
        "prize": int(data["prize"]),
        "category": data["category"],
        "posted_by": data["posted_by"],
        "status": "open",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    state["bounties"].append(bounty)
    return jsonify(bounty), 201


# ---------------------------------------------------------------------------
# Routes — Gladiators
# ---------------------------------------------------------------------------


@app.route("/api/gladiators", methods=["GET"])
def get_gladiators():
    return jsonify(state["gladiators"]), 200


@app.route("/api/gladiators", methods=["POST"])
def register_gladiator():
    data = request.get_json(force=True, silent=True) or {}

    required = ["name", "ticker", "specialty", "system_prompt"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    gladiator = {
        "id": str(uuid.uuid4()),
        "name": data["name"],
        "ticker": data["ticker"],
        "specialty": data["specialty"],
        "system_prompt": data["system_prompt"],
        "wins": 0,
        "earnings": 0,
        "battles": 0,
        "registered_at": datetime.now(timezone.utc).isoformat(),
    }
    state["gladiators"].append(gladiator)
    _rebuild_leaderboard()
    return jsonify(gladiator), 201


# ---------------------------------------------------------------------------
# Routes — Battles
# ---------------------------------------------------------------------------


@app.route("/api/battle/start", methods=["POST"])
def start_battle():
    data = request.get_json(force=True, silent=True) or {}

    bounty_id = data.get("bounty_id")
    gladiator_ids = data.get("gladiator_ids", [])

    if not bounty_id:
        return jsonify({"error": "bounty_id is required"}), 400
    if len(gladiator_ids) != 2:
        return jsonify({"error": "Exactly 2 gladiator_ids are required"}), 400

    bounty = _find_bounty(bounty_id)
    if not bounty:
        return jsonify({"error": f"Bounty {bounty_id} not found"}), 404
    if bounty["status"] != "open":
        return jsonify({"error": "Bounty is not open for battle"}), 409

    gladiator_a = _find_gladiator(gladiator_ids[0])
    gladiator_b = _find_gladiator(gladiator_ids[1])

    if not gladiator_a:
        return jsonify({"error": f"Gladiator {gladiator_ids[0]} not found"}), 404
    if not gladiator_b:
        return jsonify({"error": f"Gladiator {gladiator_ids[1]} not found"}), 404
    if gladiator_a["id"] == gladiator_b["id"]:
        return jsonify({"error": "A gladiator cannot battle itself"}), 400

    battle_id = str(uuid.uuid4())

    battle_record = {
        "id": battle_id,
        "bounty_id": bounty_id,
        "bounty_title": bounty["title"],
        "gladiator_a": {
            "id": gladiator_a["id"],
            "name": gladiator_a["name"],
            "ticker": gladiator_a["ticker"],
        },
        "gladiator_b": {
            "id": gladiator_b["id"],
            "name": gladiator_b["name"],
            "ticker": gladiator_b["ticker"],
        },
        "status": "pending",
        "winner": None,
        "loser": None,
        "outputs": {},
        "winner_payout": 0,
        "loser_payout": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "started_at": None,
        "completed_at": None,
        "error": None,
    }

    state["battles"][battle_id] = battle_record
    battle_logs[battle_id] = []

    # Mark bounty as in-battle so it cannot be double-entered
    for b in state["bounties"]:
        if b["id"] == bounty_id:
            b["status"] = "in_battle"
            break

    # Launch background thread
    thread = threading.Thread(
        target=_run_battle,
        args=(battle_id, bounty, gladiator_a, gladiator_b),
        daemon=True,
    )
    thread.start()

    return jsonify({"battle_id": battle_id, "battle": battle_record}), 202


@app.route("/api/battle/<battle_id>", methods=["GET"])
def get_battle(battle_id: str):
    battle = state["battles"].get(battle_id)
    if not battle:
        return jsonify({"error": f"Battle {battle_id} not found"}), 404
    return jsonify(battle), 200


# ---------------------------------------------------------------------------
# Routes — SSE streaming
# ---------------------------------------------------------------------------


@app.route("/api/stream/<battle_id>", methods=["GET"])
def stream_battle(battle_id: str):
    """Server-Sent Events endpoint — streams battle log lines as they arrive."""

    if battle_id not in state["battles"]:
        return jsonify({"error": f"Battle {battle_id} not found"}), 404

    def event_generator():
        sent_index = 0
        max_idle_rounds = 240  # 240 × 0.5 s = 2 min timeout (agents can be slow)
        idle_rounds = 0

        while True:
            logs = battle_logs.get(battle_id, [])
            new_events = logs[sent_index:]

            if new_events:
                for event_json in new_events:
                    # Each entry is already a JSON string from _event()
                    yield f"data: {event_json}\n\n"
                    time.sleep(0.15)  # slight delay so browser renders smoothly
                sent_index += len(new_events)
                idle_rounds = 0
            else:
                time.sleep(0.5)
                idle_rounds += 1

            battle = state["battles"].get(battle_id, {})
            battle_done = battle.get("status") in ("completed", "error")
            all_sent = sent_index >= len(battle_logs.get(battle_id, []))

            if battle_done and all_sent:
                yield "data: {\"type\": \"done\"}\n\n"
                break

            if idle_rounds >= max_idle_rounds:
                yield "data: {\"type\": \"timeout\"}\n\n"
                break

    return Response(
        stream_with_context(event_generator()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ---------------------------------------------------------------------------
# Routes — Leaderboard
# ---------------------------------------------------------------------------


@app.route("/api/leaderboard", methods=["GET"])
def get_leaderboard():
    _rebuild_leaderboard()
    return jsonify(state["leaderboard"]), 200


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify(
        {
            "status": "ok",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "bounties": len(state["bounties"]),
            "gladiators": len(state["gladiators"]),
            "battles": len(state["battles"]),
        }
    ), 200


# ---------------------------------------------------------------------------
# Static Frontend Serving
# ---------------------------------------------------------------------------

@app.route("/")
def serve_index():
    return send_from_directory(".", "index.html")

@app.route("/<path:path>")
def serve_static(path):
    if os.path.exists(os.path.join(".", path)):
        return send_from_directory(".", path)
    return "Not Found", 404


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
