import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Element from "@reservoir0x/sdk/src/element";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import * as Sdk from "@reservoir0x/sdk/src";
import { getChainId, getCurrentTimestamp, reset, setupNFTs, bn } from "../../utils";

import ELementAbi from "@reservoir0x/sdk/dist/element/abis/Exchange.json";
import { Interface } from "@ethersproject/abi";
import { BigNumber } from "ethers";

export const extractOrderSignature = async (
    calldata: string,
): Promise<{
    signatureType: number;
    v: number;
    r: string;
    s: string;
} | undefined> => {
    const iface = new Interface(ELementAbi);
    const parsed = iface.parseTransaction({
        data: calldata
    });
    if (['sellERC721', 'sellERC1155', 'buyERC1155Ex', 'buyERC721Ex'].includes(parsed.name)) {
        const signature = parsed.args.signature;
        return {
            signatureType: signature.signatureType,
            v: signature.v,
            r: signature.r,
            s: signature.s,
        }
    } else if (parsed.name === "fillBatchSignedERC721Order") {
        const parameter = parsed.args.parameter;
        const v = bn(parameter.data1).shr(192).and(0xff).toNumber();
        return {
            signatureType: 0,
            v,
            r: parameter.r,
            s: parameter.s,
        }
    } else {
        throw new Error(`not support ${parsed.name}`)
    }
};

function decodeData(data1: BigNumber) {
    // Define masks for different parts
    const mask8 = bn("0xFF"); // 8 bit mask
    const mask32 = bn("0xFFFFFFFF"); // 32 bit mask
    const mask160 = bn("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"); // 160 bit mask

    // Decode startNonce
    const startNonce = data1.shr(200);

    // Decode v
    const v = data1.shr(192).and(mask8);

    // Decode listingTime
    const listingTime = data1.shr(160).and(mask32);

    // Decode maker
    const maker = data1.and(mask160);

    return { startNonce: startNonce.toString(), v: v.toString(), listingTime: listingTime.toString(), maker: maker.toString() };
}


describe("Element - SingleToken Erc721", () => {
    const chainId = getChainId();

    let deployer: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let carol: SignerWithAddress;
    let ted: SignerWithAddress;

    let erc721: Contract;

    beforeEach(async () => {
        [deployer, alice, bob, carol, ted] = await ethers.getSigners();

        ({ erc721 } = await setupNFTs(deployer));
    });

    afterEach(reset);

    it("Extract signature from calldata", async () => {
        const buyer = alice;
        const seller = bob;
        const price = parseEther("1");
        const boughtTokenId = 0;

        const weth = new Common.Helpers.WNative(ethers.provider, chainId);

        // Mint weth to buyer
        await weth.deposit(buyer, price.add(parseEther("0.15")));

        // Approve the exchange contract for the buyer
        await weth.approve(buyer, Element.Addresses.Exchange[chainId]);

        // Mint erc721 to seller
        await erc721.connect(seller).mint(boughtTokenId);

        const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

        const exchange = new Element.Exchange(chainId);

        const builder = new Element.Builders.SingleToken(chainId);

        // Build buy order
        const buyOrder = builder.build({
            direction: "buy",
            maker: buyer.address,
            contract: erc721.address,
            tokenId: boughtTokenId,
            paymentToken: Common.Addresses.WNative[chainId],
            price,
            hashNonce: 0,
            fees: [
                {
                    recipient: carol.address,
                    amount: parseEther("0.1"),
                },
                {
                    recipient: ted.address,
                    amount: parseEther("0.05"),
                },
            ],
            expiry: (await getCurrentTimestamp(ethers.provider)) + 60,
        });

        // Sign the order
        await buyOrder.sign(buyer);

        // Approve the exchange for escrowing.
        await erc721.connect(seller).setApprovalForAll(Element.Addresses.Exchange[chainId], true);

        // Create matching sell order
        const sellOrder = buyOrder.buildMatching();

        await buyOrder.checkFillability(ethers.provider);

        const buyerBalanceBefore = await weth.getBalance(buyer.address);
        const ownerBefore = await nft.getOwner(boughtTokenId);

        expect(buyerBalanceBefore).to.eq(price.add(parseEther("0.15")));
        expect(ownerBefore).to.eq(seller.address);

        // Match orders
        const tx = await exchange.fillOrderTx(seller.address, buyOrder, sellOrder);
        const signature = await extractOrderSignature(tx.data);
        // console.log(signature, buyOrder.params)
        expect(signature?.v).to.eq(buyOrder.params.v);
        expect(signature?.r).to.eq(buyOrder.params.r);
        expect(signature?.s).to.eq(buyOrder.params.s);
    });

    it("Get signature", async () => {
        const router = new Sdk.RouterV6.Router(chainId, ethers.provider, {
            orderFetcherBaseUrl: "http://localhost:8083"
        });
        const nonPartialTx = await router.fillListingsTx(
            [
                {
                    orderId: "0",
                    kind: "element-partial",
                    contractKind: "erc721",
                    contract: erc721.address,
                    tokenId: '0',
                    order: new Sdk.Element.Order(chainId, {
                        "maker": "0xdb2ab5671bf17ca408fe75e90571fbe675d01c00",
                        "listingTime": 1715526658,
                        "expirationTime": 1718118712,
                        "startNonce": 1,
                        "erc20Token": "0x0000000000000000000000000000000000000000",
                        "platformFeeRecipient": "0x00ca62445b06a9adc1879a44485b4efdcb7b75f3",
                        "basicCollections": [
                            {
                                "nftAddress": "0x0a252663dbcc0b073063d6420a40319e438cfa59",
                                "platformFee": 50,
                                "royaltyFeeRecipient": "0x0000000000000000000000000000000000000000",
                                "royaltyFee": 0,
                                "items": [
                                    {
                                        "erc20TokenAmount": "2500000000000000",
                                        "nftId": "62708"
                                    }
                                ]
                            }
                        ],
                        "collections": [],
                        "hashNonce": "0",
                        "hash": "0x3faecdffbbe4de382e8087fddec9a3227615baa1618fd51293f7503e4a651766",
                        "v": 0,
                        "r": "",
                        "s": "",
                        "nonce": 1,
                        "nft": "0x0a252663dbcc0b073063d6420a40319e438cfa59",
                        "nftId": "62708",
                        "erc20TokenAmount": "2500000000000000",
                        "platformFee": 50,
                        "royaltyFeeRecipient": "0x0000000000000000000000000000000000000000",
                        "royaltyFee": 0,
                        "elementOrderId": "1442690384920285728"
                    }),
                    currency: Sdk.Common.Addresses.Native[chainId],
                    price: "95000000000000000"
                },
            ],
            '0x0000000000000000000000000000000000000001',
            Sdk.Common.Addresses.Native[chainId],
            {
                source: "reservoir.market",
            }
        );



        console.log(nonPartialTx.txs)

        console.log(
            decodeData(bn('227923271356413363720383248216206753813096028913671505843204875552180673536'))

        );

        console.log(
            decodeData(bn('1785204137870620370265271350606216716660245517675585432722432'))
        )

        console.log('case2', decodeData(bn('227923271356413363720389891345235669433582323178281326037610431577351160477')))
    })



});
