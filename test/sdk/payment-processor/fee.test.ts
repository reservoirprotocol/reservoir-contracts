import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import * as Common from "@reservoir0x/sdk/src/common";
import * as PaymentProcessor from "@reservoir0x/sdk/src/payment-processor";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import { constants } from "ethers";

import { getChainId, getCurrentTimestamp, reset, setupNFTs } from "../../utils";
import { Interface } from "@ethersproject/abi";

describe("PaymentProcessor - TradingFee", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let joy: SignerWithAddress;
  let platform: SignerWithAddress;

  let erc721: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, joy, platform] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("Pre-compute 0xSplits and create split later", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;

    const tradingFeePercent = 30;
    const feeBase = 10000;

    const zeroSplit = new Contract(
        Sdk.ZeroSplits.Addresses.SplitMain[chainId],
        new Interface(
            [
                `function predictImmutableSplitAddress(address[] calldata accounts, uint32[] calldata percentAllocations, uint32 distributorFee) external view returns (address split)`,
                `function createSplit(address[] calldata accounts, uint32[] calldata percentAllocations, uint32 distributorFee, address controller) external returns (address split)`,
                `function distributeETH(address split, address[] calldata accounts, uint32[] calldata percentAllocations, uint32 distributorFee, address distributorAddress) external`,
                `function distributeERC20(address split, address token, address[] calldata accounts, uint32[] calldata percentAllocations, uint32 distributorFee, address distributorAddress) external`,
                `function getETHBalance(address account) external view returns (uint256)`,
                `function getERC20Balance(address account, address token) external view returns (uint256)`
            ]
        ), 
        ethers.provider
    );

    const totalFee = 500;
    const originalFeeAddress = joy.address;

    const feeAddress = await zeroSplit.predictImmutableSplitAddress(
        [
            originalFeeAddress,
            platform.address,
        ],
        [
            (100 - tradingFeePercent) * feeBase,
            tradingFeePercent * feeBase
        ],
        0
    );
    
    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessor.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessor.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const takerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessor.Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: 0,
      sellerAcceptedOffer: false,
      marketplace: feeAddress,
      marketplaceFeeNumerator: totalFee,
      maxRoyaltyFeeNumerator: "0",
      privateTaker: constants.AddressZero,
      trader: seller.address,
      tokenAddress: erc721.address,
      tokenId: soldTokenId,
      amount: "1",
      price: price,
      expiration: (blockTime + 60 * 60).toString(),
      nonce: "0",
      coin: constants.AddressZero,
      masterNonce: sellerMasterNonce,
    };

    // Build sell order
    const sellOrder = builder.build(orderParameters);
    await sellOrder.sign(seller);

    const buyOrder = sellOrder.buildMatching({
      taker: buyer.address,
      takerMasterNonce: takerMasterNonce,
    });
    await buyOrder.sign(buyer);

    buyOrder.checkSignature();
    sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
    const feeBalanceBefore = await ethers.provider.getBalance(feeAddress);

    await exchange.fillOrder(buyer, sellOrder, buyOrder);

    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const feeBalanceAfter = await ethers.provider.getBalance(feeAddress);
    const feeReceivedAmount = feeBalanceAfter.sub(feeBalanceBefore);

    // Claim fee
    await zeroSplit.connect(deployer).createSplit(
        [
            originalFeeAddress,
            platform.address,
        ],
        [
            (100 - tradingFeePercent) * feeBase,
            tradingFeePercent * feeBase
        ],
        0,
        constants.AddressZero
    );

    await zeroSplit.connect(deployer).distributeETH(
        feeAddress,
        [
            originalFeeAddress,
            platform.address,
        ],
        [
            (100 - tradingFeePercent) * feeBase,
            tradingFeePercent * feeBase
        ],
        0,
        constants.AddressZero
    );

    const platformFeeBalance = await zeroSplit.getETHBalance(platform.address);
    const originalFeeBalance = await zeroSplit.getETHBalance(originalFeeAddress);

    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);
    const totalFeeAmount = price.mul(500).div(10000);

    const platformFeeBalanceBps = platformFeeBalance.mul(100).div(feeReceivedAmount);
    const originalFeeBalanceBps = originalFeeBalance.mul(100).div(feeReceivedAmount);

    expect(platformFeeBalanceBps).to.gte(tradingFeePercent);
    expect(originalFeeBalanceBps).to.gte(100 - tradingFeePercent);

    expect(feeReceivedAmount).to.gte(totalFeeAmount);
    expect(receiveAmount.add(totalFeeAmount)).to.gte(price);
    expect(ownerAfter).to.eq(buyer.address);
  });
});
