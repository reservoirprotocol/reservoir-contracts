import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { formatEther, parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import * as Sdk from "@reservoir0x/sdk/src";
import { expect } from "chai";
import { ethers } from "hardhat";

import { NFTXOffer, setupNFTXOffers } from "../helpers/nftx";
import { ExecutionInfo } from "../helpers/router";
import {
  bn,
  getChainId,
  getRandomBoolean,
  getRandomFloat,
  getRandomInteger,
  reset,
  setupNFTs,
} from "../../utils";

describe("[ReservoirV6_0_1] NFTX offers", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let david: SignerWithAddress;
  let emilio: SignerWithAddress;

  let erc721: Contract;
  let router: Contract;
  let nftxModule: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol, david, emilio] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));

    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());
    nftxModule = await ethers
      .getContractFactory("NFTXModule", deployer)
      .then((factory) =>
        factory.deploy(deployer.address, router.address, Sdk.Nftx.Addresses.MarketplaceZap[chainId])
      );
  });

  const getBalances = async (token: string) => {
    if (token === Sdk.Common.Addresses.Native[chainId]) {
      return {
        alice: await ethers.provider.getBalance(alice.address),
        bob: await ethers.provider.getBalance(bob.address),
        carol: await ethers.provider.getBalance(carol.address),
        david: await ethers.provider.getBalance(david.address),
        emilio: await ethers.provider.getBalance(emilio.address),
        router: await ethers.provider.getBalance(router.address),
        nftxModule: await ethers.provider.getBalance(nftxModule.address),
      };
    } else {
      const contract = new Sdk.Common.Helpers.Erc20(ethers.provider, token);
      return {
        alice: await contract.getBalance(alice.address),
        bob: await contract.getBalance(bob.address),
        carol: await contract.getBalance(carol.address),
        david: await contract.getBalance(david.address),
        emilio: await contract.getBalance(emilio.address),
        router: await contract.getBalance(router.address),
        nftxModule: await contract.getBalance(nftxModule.address),
      };
    }
  };

  afterEach(reset);

  const testAcceptOffers = async (
    // Whether to charge fees on the received amount
    chargeFees: boolean,
    // Whether to revert or not in case of any failures
    revertIfIncomplete: boolean,
    // Whether to cancel some orders in order to trigger partial filling
    partial: boolean,
    // Number of offers to fill
    offersCount: number
  ) => {
    // Setup

    // Makers: Alice and Bob
    // Taker: Carol

    const offers: NFTXOffer[] = [];
    const fees: BigNumber[][] = [];
    for (let i = 0; i < offersCount; i++) {
      offers.push({
        buyer: getRandomBoolean() ? alice : bob,
        nft: {
          contract: erc721,
          id: getRandomInteger(1, 100000),
        },
        price: parseEther(getRandomFloat(0.6, 5).toFixed(6)),
        isCancelled: partial && getRandomBoolean(),
      });
      if (chargeFees) {
        fees.push([parseEther(getRandomFloat(0.0001, 0.1).toFixed(6))]);
      } else {
        fees.push([]);
      }
    }
    await setupNFTXOffers(offers);

    // Send the NFTs to the module (in real-world this will be done atomically)
    for (const offer of offers) {
      await offer.nft.contract.connect(carol).mint(offer.nft.id);
      await offer.nft.contract
        .connect(carol)
        .transferFrom(carol.address, nftxModule.address, offer.nft.id);
    }

    // Prepare executions

    const executions: ExecutionInfo[] = [
      // 1. Fill offers with the received NFTs
      ...offers
        .filter((_) => _.order)
        .map((offer, i) => ({
          module: nftxModule.address,
          data: nftxModule.interface.encodeFunctionData("sell", [
            [offer.order?.params],
            {
              fillTo: carol.address,
              refundTo: carol.address,
              revertIfIncomplete,
            },
            [
              ...fees[i].map((amount) => ({
                recipient: emilio.address,
                amount,
              })),
            ],
          ]),
          value: 0,
        })),
    ];

    // Checks

    // If the `revertIfIncomplete` option is enabled and we have any
    // orders that are not fillable, the whole transaction should be
    // reverted
    if (partial && revertIfIncomplete && offers.some(({ isCancelled }) => isCancelled)) {
      await expect(
        router.connect(carol).execute(executions, {
          value: executions.map(({ value }) => value).reduce((a, b) => bn(a).add(b), bn(0)),
        })
      ).to.be.revertedWith("reverted with custom error 'UnsuccessfulExecution()'");

      return;
    }

    // Fetch pre-state
    const balancesBefore = await getBalances(Sdk.Common.Addresses.WNative[chainId]);

    // Execute

    await router.connect(carol).execute(executions, {
      value: executions.map(({ value }) => value).reduce((a, b) => bn(a).add(b), bn(0)),
    });

    // Fetch post-state
    const balancesAfter = await getBalances(Sdk.Common.Addresses.WNative[chainId]);

    // Checks

    // Carol got the payment
    const orderFee = offers
      .map((_, i) => (offers[i].isCancelled ? [] : fees[i]))
      .map((executionFees) => executionFees.reduce((a, b) => bn(a).add(b), bn(0)))
      .reduce((a, b) => bn(a).add(b), bn(0));

    const carolAfter = balancesAfter.carol.sub(balancesBefore.carol);
    const totalAmount = carolAfter.add(orderFee);

    const orderSum = offers
      .map((offer) => (offer.isCancelled ? bn(0) : bn(offer.price)))
      .reduce((a, b) => bn(a).add(b), bn(0));

    if (orderSum.gt(bn(0))) {
      const diffPercent =
        (parseFloat(formatEther(orderSum.sub(totalAmount))) /
          parseFloat(formatEther(totalAmount))) *
        100;

      // Check Carol balance
      const defaultSlippage = 5;
      expect(diffPercent).to.lte(defaultSlippage);
      expect(carolAfter).to.gte(bn(0));
    }

    // Emilio got the fee payments
    if (chargeFees) {
      expect(balancesAfter.emilio.sub(balancesBefore.emilio)).to.eq(orderFee);
    }

    // Alice and Bob got the NFTs of the filled orders
    for (const { nft, isCancelled, vault } of offers) {
      if (!isCancelled) {
        expect(await nft.contract.ownerOf(nft.id)).to.eq(vault);
      } else {
        expect(await nft.contract.ownerOf(nft.id)).to.eq(carol.address);
      }
    }

    // Router is stateless
    expect(balancesAfter.router).to.eq(0);
    expect(balancesAfter.nftxModule).to.eq(0);
  };

  // Test various combinations for filling offers

  for (const multiple of [false, true]) {
    for (const partial of [false, true]) {
      for (const chargeFees of [false, true]) {
        for (const revertIfIncomplete of [false, true]) {
          const testCaseName =
            `${multiple ? "[multiple-orders]" : "[single-order]"}` +
            `${partial ? "[partial]" : "[full]"}` +
            `${chargeFees ? "[fees]" : "[no-fees]"}` +
            `${revertIfIncomplete ? "[reverts]" : "[skip-reverts]"}`;

          it(testCaseName, async () =>
            testAcceptOffers(
              chargeFees,
              revertIfIncomplete,
              partial,
              multiple ? getRandomInteger(2, 4) : 1
            )
          );
        }
      }
    }
  }
});
