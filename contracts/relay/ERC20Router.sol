// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {Ownable} from "solady/src/auth/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAllowanceTransfer} from "../lib/permit2/src/interfaces/IAllowanceTransfer.sol";
import {ISignatureTransfer} from "../lib/permit2/src/interfaces/ISignatureTransfer.sol";
import {IPermit2} from "../lib/permit2/src/interfaces/IPermit2.sol";
import {RelayerWitness} from "./types/lib/RelayStructs.sol";
import {IMulticaller} from "./utils/IMulticaller.sol";
import {IMulticallerWithSender} from "./utils/IMulticallerWithSender.sol";

contract ERC20Router is Ownable {
    error ArrayLengthsMismatch();
    error CallFailed();
    error NativeTransferFailed();

    IPermit2 private immutable PERMIT2;
    address private immutable MULTICALLER;

    string public constant _RELAYER_WITNESS_TYPE_STRING =
        "RelayerWitness witness)RelayerWitness(address relayer)TokenPermissions(address token,uint256 amount)";
    bytes32 public constant _EIP_712_RELAYER_WITNESS_TYPE_HASH =
        keccak256("RelayerWitness(address relayer)");

    constructor(address permit2, address multicaller, address owner) {
        // Set the address of the Permit2 contract
        PERMIT2 = IPermit2(permit2);

        // Set the address of the multicaller contract
        MULTICALLER = multicaller;

        // Set the owner that can withdraw funds stuck in the contract
        _initializeOwner(owner);
    }

    receive() external payable {}

    function withdraw() external onlyOwner {
        _send(msg.sender, address(this).balance);
    }

    /// @notice Pull user ERC20 tokens through a signed batch permit
    ///         and perform an arbitrary multicall. Pass in an empty
    ///         permitSignature to only perform the multicall.
    /// @dev msg.value will persist across all calls in the multicall
    /// @param user The address of the user
    /// @param permit The permit details
    /// @param targets The addresses of the contracts to call
    /// @param datas The calldata for each call
    /// @param values The value to send with each call
    /// @param refundTo The address to refund any leftover ETH to
    /// @param permitSignature The signature for the permit
    function permitMulticall(
        address user,
        ISignatureTransfer.PermitBatchTransferFrom memory permit,
        address[] calldata targets,
        bytes[] calldata datas,
        uint256[] calldata values,
        address refundTo,
        bytes memory permitSignature
    ) external payable returns (bytes memory) {
        if (permitSignature.length != 0) {
            // Use permit to transfer tokens from user to router
            _handlePermitBatch(user, permit, permitSignature);
        }

        // Perform the multicall and refund to the user
        bytes memory data = _delegatecallMulticall(
            targets,
            datas,
            values,
            refundTo
        );

        return data;
    }

    /// @notice Perform an arbitrary multicall.
    /// @dev msg.value will persist across all calls in the multicall
    /// @param targets The addresses of the contracts to call
    /// @param datas The calldata for each call
    /// @param values The value to send with each call
    /// @param refundTo The address to refund any leftover ETH to
    function multicall(
        address[] calldata targets,
        bytes[] calldata datas,
        uint256[] calldata values,
        address refundTo
    ) external payable returns (bytes memory) {
        bytes memory data = _delegatecallMulticall(
            targets,
            datas,
            values,
            refundTo
        );

        return data;
    }

    /// @notice Send leftover ERC20 tokens to the refundTo address
    /// @param token The address of the ERC20 token
    /// @param refundTo The address to refund the tokens to
    function cleanupERC20(address token, address refundTo) external {
        // Check the router's balance for the token
        uint256 balance = IERC20(token).balanceOf(address(this));

        // Transfer the token to the refundTo address
        if (balance > 0) {
            IERC20(token).transfer(refundTo, balance);
        }
    }

    function _handlePermitBatch(
        address user,
        ISignatureTransfer.PermitBatchTransferFrom memory permit,
        bytes memory permitSignature
    ) internal {
        // Create the witness that should be signed over
        bytes32 witness = keccak256(
            abi.encode(_EIP_712_RELAYER_WITNESS_TYPE_HASH, msg.sender)
        );

        ISignatureTransfer.SignatureTransferDetails[]
            memory signatureTransferDetails = new ISignatureTransfer.SignatureTransferDetails[](
                permit.permitted.length
            );
        for (uint256 i = 0; i < permit.permitted.length; i++) {
            uint256 amount = permit.permitted[i].amount;

            signatureTransferDetails[i] = ISignatureTransfer
                .SignatureTransferDetails({
                    to: address(this),
                    requestedAmount: amount
                });
        }
        PERMIT2.permitWitnessTransferFrom(
            permit,
            signatureTransferDetails,
            // When using a permit signature, cannot deposit on behalf of someone else other than `user`
            user,
            witness,
            _RELAYER_WITNESS_TYPE_STRING,
            permitSignature
        );
    }

    function _delegatecallMulticall(
        address[] calldata targets,
        bytes[] calldata datas,
        uint256[] calldata values,
        address refundTo
    ) internal returns (bytes memory) {
        // Perform the multicall and refund to the user
        (bool success, bytes memory data) = MULTICALLER.delegatecall(
            abi.encodeWithSignature(
                "aggregate(address[],bytes[],uint256[],address)",
                targets,
                datas,
                values,
                refundTo
            )
        );

        if (!success) {
            revert CallFailed();
        }

        return data;
    }

    function _send(address to, uint256 value) internal {
        bool success;
        assembly {
            // Save gas by avoiding copying the return data to memory.
            // Provide at most 100k gas to the internal call, which is
            // more than enough to cover common use-cases of logic for
            // receiving native tokens (eg. SCW payable fallbacks).
            success := call(100000, to, value, 0, 0, 0, 0)
        }

        if (!success) {
            revert NativeTransferFailed();
        }
    }
}
