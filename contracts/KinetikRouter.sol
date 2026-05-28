// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract KinetikRouter {
    address public owner;
    
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

    constructor() {
        owner = msg.sender;
    }

    function sendTip(address creator) external payable {
        require(msg.value > 0, "Must send some amount");
        (bool success, ) = creator.call{value: msg.value}("");
        require(success, "Transfer failed");
        emit TipSent(msg.sender, creator, msg.value);
    }

    function settleSplit(address[] calldata friends, uint256 amountPerFriend) external payable {
        uint256 totalAmount = friends.length * amountPerFriend;
        require(msg.value >= totalAmount, "Insufficient funds sent");
        
        for(uint i = 0; i < friends.length; i++) {
            (bool success, ) = friends[i].call{value: amountPerFriend}("");
            require(success, "Transfer failed");
        }
        
        // Refund excess if any
        if (msg.value > totalAmount) {
            (bool refundSuccess, ) = msg.sender.call{value: msg.value - totalAmount}("");
            require(refundSuccess, "Refund failed");
        }
        
        emit BillSplit(msg.sender, friends, amountPerFriend);
    }

    function openStream(address receiver, uint256 ratePerSecond) external payable returns (bytes32) {
        require(msg.value > 0, "Deposit failed");
        bytes32 streamId = keccak256(abi.encodePacked(msg.sender, receiver, block.timestamp));
        activeStreams[streamId] = Stream({
            sender: msg.sender, receiver: receiver, ratePerSecond: ratePerSecond,
            startTime: block.timestamp, deposit: msg.value, active: true
        });
        emit StreamOpened(streamId, msg.sender, receiver, ratePerSecond);
        return streamId;
    }

    function closeStream(bytes32 streamId) external {
        Stream storage stream = activeStreams[streamId];
        require(stream.active, "Not active");
        uint256 cost = (block.timestamp - stream.startTime) * stream.ratePerSecond;
        if (cost > stream.deposit) cost = stream.deposit;
        uint256 refund = stream.deposit - cost;
        stream.active = false;
        
        if (cost > 0) {
            (bool success, ) = stream.receiver.call{value: cost}("");
            require(success, "Pay failed");
        }
        if (refund > 0) {
            (bool success, ) = stream.sender.call{value: refund}("");
            require(success, "Refund failed");
        }
        emit StreamClosed(streamId, cost);
    }
}
