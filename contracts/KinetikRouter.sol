// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.
sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title KinetikRouter
 * @dev The smart contract routing engine for the Kinetik Super-App on Arc.
 * Because Arc uses USDC for gas and has sub-second finality, 
 * this contract processes micro-payments, bill splits, and streaming seamlessly.
 */
contract KinetikRouter is Ownable {
    
    IERC20 public usdcToken;
    
    // Mapping to track active streams
    struct Stream {
        address sender;
        address receiver;
        uint256 ratePerSecond;
        uint256 startTime;
        uint256 deposit;
        bool active;
    }
    
    mapping(bytes32 => Stream) public activeStreams;
    
    event TipSent(address indexed from, address indexed to, uint256 amount);
    event BillSplit(address indexed from, address[] friends, uint256 amountPerFriend);
    event StreamOpened(bytes32 indexed streamId, address indexed from, address indexed to, uint256 rate);
    event StreamClosed(bytes32 indexed streamId, uint256 finalCost);

    constructor(address _usdcTokenAddress) Ownable(msg.sender) {
        usdcToken = IERC20(_usdcTokenAddress);
    }

    /**
     * @dev One-click micro-tip feature. Instant finality.
     */
    function sendTip(address creator, uint256 amount) external {
        require(usdcToken.transferFrom(msg.sender, creator, amount), "Transfer failed");
        emit TipSent(msg.sender, creator, amount);
    }

    /**
     * @dev Splits a bill instantly among multiple friends.
     * The sender pays their friends their portion to settle IOUs immediately.
     */
    function settleSplit(address[] calldata friends, uint256 amountPerFriend) external {
        uint256 totalAmount = friends.length * amountPerFriend;
        require(usdcToken.balanceOf(msg.sender) >= totalAmount, "Insufficient balance");
        
        for(uint i = 0; i < friends.length; i++) {
            require(usdcToken.transferFrom(msg.sender, friends[i], amountPerFriend), "Transfer failed");
        }
        
        emit BillSplit(msg.sender, friends, amountPerFriend);
    }

    /**
     * @dev Opens a Pay-per-second stream (ArcStream).
     * Sender locks a deposit.
     */
    function openStream(address receiver, uint256 ratePerSecond, uint256 deposit) external returns (bytes32) {
        require(usdcToken.transferFrom(msg.sender, address(this), deposit), "Deposit failed");
        
        bytes32 streamId = keccak256(abi.encodePacked(msg.sender, receiver, block.timestamp));
        
        activeStreams[streamId] = Stream({
            sender: msg.sender,
            receiver: receiver,
            ratePerSecond: ratePerSecond,
            startTime: block.timestamp,
            deposit: deposit,
            active: true
        });
        
        emit StreamOpened(streamId, msg.sender, receiver, ratePerSecond);
        return streamId;
    }

    /**
     * @dev Closes the stream and settles the exact amount based on seconds watched.
     * Refunds the remainder of the deposit.
     */
    function closeStream(bytes32 streamId) external {
        Stream storage stream = activeStreams[streamId];
        require(stream.active, "Stream not active");
        require(msg.sender == stream.sender || msg.sender == stream.receiver, "Unauthorized");
        
        uint256 secondsPassed = block.timestamp - stream.startTime;
        uint256 cost = secondsPassed * stream.ratePerSecond;
        
        if (cost > stream.deposit) {
            cost = stream.deposit; // Cap at deposit
        }
        
        uint256 refund = stream.deposit - cost;
        stream.active = false;
        
        // Settle payment
        if (cost > 0) {
            require(usdcToken.transfer(stream.receiver, cost), "Payment failed");
        }
        // Refund remainder
        if (refund > 0) {
            require(usdcToken.transfer(stream.sender, refund), "Refund failed");
        }
        
        emit StreamClosed(streamId, cost);
    }
}
