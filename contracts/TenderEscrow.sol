// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
}

/// @notice Minimal protected-commerce escrow for Tender orders.
/// A buyer deposits a TIP-20 amount, and the merchant can capture after fulfillment.
contract TenderEscrow {
    struct Order {
        address buyer;
        address merchant;
        address token;
        uint256 amount;
        uint64 deadline;
        bool released;
        bool refunded;
    }

    mapping(bytes32 => Order) public orders;

    event Deposited(bytes32 indexed orderId, address indexed buyer, address indexed merchant, address token, uint256 amount, uint64 deadline);
    event Captured(bytes32 indexed orderId);
    event Refunded(bytes32 indexed orderId);

    function deposit(address token, uint256 amount, bytes32 orderId, uint64 deadline, address merchant) external {
        require(orders[orderId].buyer == address(0), "order exists");
        require(amount > 0, "amount is zero");
        require(deadline > block.timestamp, "deadline passed");
        require(merchant != address(0), "merchant is zero");
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "transfer failed");
        orders[orderId] = Order(msg.sender, merchant, token, amount, deadline, false, false);
        emit Deposited(orderId, msg.sender, merchant, token, amount, deadline);
    }

    function capture(bytes32 orderId, address merchant) external {
        Order storage order = orders[orderId];
        require(order.buyer != address(0), "unknown order");
        require(!order.released && !order.refunded, "order closed");
        require(merchant == order.merchant, "wrong merchant");
        require(msg.sender == order.buyer || msg.sender == order.merchant, "not authorized");
        order.released = true;
        require(IERC20(order.token).transfer(merchant, order.amount), "transfer failed");
        emit Captured(orderId);
    }

    function refund(bytes32 orderId) external {
        Order storage order = orders[orderId];
        require(order.buyer != address(0), "unknown order");
        require(!order.released && !order.refunded, "order closed");
        require(msg.sender == order.buyer || block.timestamp >= order.deadline, "not authorized");
        order.refunded = true;
        require(IERC20(order.token).transfer(order.buyer, order.amount), "transfer failed");
        emit Refunded(orderId);
    }
}
