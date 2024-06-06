import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { HardhatUserConfig } from "hardhat/types";

import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "hardhat-gas-reporter";
import "hardhat-tracer";

// For zkSync
import "@matterlabs/hardhat-zksync-deploy";
import "@matterlabs/hardhat-zksync-solc";

const getNetworkConfig = (chainId?: number) => {
  if (!chainId) {
    chainId = Number(process.env.CHAIN_ID ?? 1);
  }

  let url = process.env.RPC_URL;
  if (!url) {
    switch (chainId) {
      // Mainnets
      case 1:
        url = "https://rpc.mevblocker.io";
        break;
      case 10:
        url = "https://mainnet.optimism.io/";
        break;
      case 56:
        url = "https://bsc-dataseed1.bnbchain.org";
        break;
      case 137:
        url = "https://rpc-mainnet.matic.quiknode.pro";
        break;
      case 204:
        url = "https://opbnb-mainnet-rpc.bnbchain.org";
        break;
      case 324:
        url = "https://mainnet.era.zksync.io";
        break;
      case 690:
        url = "https://rpc.redstonechain.com";
        break;
      case 1101:
        url = "https://zkevm-rpc.com";
        break;
      case 1329:
        url = "https://evm-rpc.sei-apis.com";
        break;
      case 3776:
        url = "https://rpc.startale.com/astar-zkevm";
        break;
      case 7560:
        url = "https://cyber.alt.technology";
        break;
      case 8453:
        url = "https://developer-access-mainnet.base.org";
        break;
      case 17069:
        url = "https://rpc.garnet.qry.live";
        break;
      case 42161:
        url = "https://arb1.arbitrum.io/rpc";
        break;
      case 42170:
        url = "https://arbitrum-nova.publicnode.com";
        break;
      case 43114:
        url = "https://avalanche-c-chain.publicnode.com";
        break;
      case 59144:
        url = "https://rpc.linea.build";
        break;
      case 70700:
        url = "https://rpc.apex.proofofplay.com";
        break;
      case 81457:
        url = "https://blast.blockpi.network/v1/rpc/public";
        break;
      case 200901:
        url = "https://rpc.bitlayer.org";
        break;
      case 534352:
        url = "https://rpc.scroll.io";
        break;
      case 660279:
        url = "https://xai-chain.net/rpc";
        break;
      case 7777777:
        url = "https://rpc.zora.co";
        break;
      case 666666666:
        url = "https://rpc.degen.tips";
        break;
      case 888888888:
        url = "https://rpc.ancient8.gg/";
        break;
      case 1482601649:
        url = "https://mainnet.skalenodes.com/v1/green-giddy-denebola";
        break;
      // Testnets
      case 5001:
        url = "https://rpc.testnet.mantle.xyz";
        break;
      case 70800:
        url = "https://rpc-pop-testnet-barret-oxaolmcfss.t.conduit.xyz";
        break;
      case 80002:
        url = "https://rpc-amoy.polygon.technology";
        break;
      case 80085:
        url = "https://artio.rpc.berachain.com";
        break;
      case 84532:
        url = "https://sepolia.base.org";
        break;
      case 713715:
        url = "https://evm-rpc-arctic-1.sei-apis.com";
        break;
      case 11155111:
        url = "https://1rpc.io/sepolia";
        break;
      case 28122024:
        url = "https://rpcv2-testnet.ancient8.gg/";
        break;
      case 168587773:
        url = "https://sepolia.blast.io";
        break;
      default:
        throw new Error("Unsupported chain id");
    }
  }

  const config = {
    chainId,
    url,
    accounts: process.env.DEPLOYER_PK ? [process.env.DEPLOYER_PK] : undefined,
  };

  // For zkSync
  if (chainId === 324) {
    return {
      ...config,
      ethNetwork: "mainnet",
      zksync: true,
    };
  }

  return config;
};

const networkConfig = getNetworkConfig();
const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.17",
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    // Devnets
    hardhat: {
      hardfork: "cancun",
      chainId: networkConfig.chainId,
      forking: {
        url: networkConfig.url,
        blockNumber: process.env.BLOCK_NUMBER ? Number(process.env.BLOCK_NUMBER) : undefined,
      },
      accounts: {
        // Custom mnemonic so that the wallets have no initial state
        mnemonic:
          "void forward involve old phone resource sentence fall friend wait strike copper urge reduce chapter",
      },
    },
    localhost: {
      chainId: networkConfig.chainId,
      url: "http://127.0.0.1:8545",
    },
    // Mainnets
    mainnet: getNetworkConfig(1),
    optimism: getNetworkConfig(10),
    bsc: getNetworkConfig(56),
    polygon: getNetworkConfig(137),
    opBnb: getNetworkConfig(204),
    zkSync: getNetworkConfig(324),
    redstone: getNetworkConfig(690),
    polygonZkevm: getNetworkConfig(1101),
    astarZkevm: getNetworkConfig(3776),
    cyber: getNetworkConfig(7560),
    base: getNetworkConfig(8453),
    garnet: getNetworkConfig(17069),
    arbitrum: getNetworkConfig(42161),
    arbitrumNova: getNetworkConfig(42170),
    avalanche: getNetworkConfig(43114),
    linea: getNetworkConfig(59144),
    apex: getNetworkConfig(70700),
    blast: getNetworkConfig(81457),
    bitlayer: getNetworkConfig(200901),
    scroll: getNetworkConfig(534352),
    xai: getNetworkConfig(660279),
    zora: getNetworkConfig(7777777),
    degen: getNetworkConfig(666666666),
    ancient8: getNetworkConfig(888888888),
    nebula: getNetworkConfig(1482601649),
    sei: getNetworkConfig(1329),
    // Testnets
    mantleTestnet: getNetworkConfig(5001),
    apexTestnet: getNetworkConfig(70800),
    amoy: getNetworkConfig(80002),
    berachainTestnet: getNetworkConfig(80085),
    baseSepolia: getNetworkConfig(84532),
    seiTestnet: getNetworkConfig(713715),
    sepolia: getNetworkConfig(11155111),
    ancient8Testnet: getNetworkConfig(28122024),
    blastSepolia: getNetworkConfig(168587773),
  },
  etherscan: {
    apiKey: {
      // Mainnets
      mainnet: process.env.ETHERSCAN_API_KEY_ETHEREUM ?? "",
      optimisticEthereum: process.env.ETHERSCAN_API_KEY_OPTIMISM ?? "",
      bsc: process.env.ETHERSCAN_API_KEY_BSC ?? "",
      polygon: process.env.ETHERSCAN_API_KEY_POLYGON ?? "",
      zkSync: "0x",
      astarZkevm: "0x",
      polygonZkevm: process.env.ETHERSCAN_API_KEY_POLYGON_ZKEVM ?? "",
      base: process.env.ETHERSCAN_API_KEY_BASE ?? "",
      arbitrumOne: process.env.ETHERSCAN_API_KEY_ARBITRUM ?? "",
      arbitrumNova: process.env.ETHERSCAN_API_KEY_ARBITRUM_NOVA ?? "",
      avalanche: "0x",
      linea: process.env.ETHERSCAN_API_KEY_LINEA ?? "",
      scroll: process.env.ETHERSCAN_API_KEY_SCROLL ?? "",
      zora: "0x",
      ancient8: "0x",
      opBnb: "0x",
      apex: "0x",
      blast: process.env.ETHERSCAN_API_KEY_BLAST ?? "",
      bitlayer: "0x",
      degen: "0x",
      garnet: "0x",
      redstone: "0x",
      xai: "0x",
      nebula: "0x",
      cyber: "0x",
      sei: "0x",
      // Testnets
      mantleTestnet: "0x",
      lineaTestnet: process.env.ETHERSCAN_API_KEY_LINEA_TESTNET ?? "",
      sepolia: process.env.ETHERSCAN_API_KEY_SEPOLIA ?? "",
      ancient8Testnet: "0x",
      baseSepolia: process.env.ETHERSCAN_API_KEY_BASE ?? "",
      blastSepolia: process.env.ETHERSCAN_API_KEY_BLAST ?? "",
      apexTestnet: "0x",
      berachainTestnet: "0x",
      amoy: "0x",
      seiTestnet: "0x",
    },
    customChains: [
      // Mainnets
      {
        network: "opBnb",
        chainId: 204,
        urls: {
          apiURL: "https://api-opbnb.bscscan.com/api",
          browserURL: "https://opbnb.bscscan.com/",
        },
      },
      {
        network: "zkSync",
        chainId: 324,
        urls: {
          apiURL: "https://block-explorer-api.mainnet.zksync.io/api",
          browserURL: "https://explorer.zksync.io",
        },
      },
      {
        network: "redstone",
        chainId: 690,
        urls: {
          apiURL: "https://api.explorer.redstonechain.com",
          browserURL: "https://explorer.redstone.xyz",
        },
      },
      {
        network: "polygonZkevm",
        chainId: 1101,
        urls: {
          apiURL: "https://api-zkevm.polygonscan.com/api",
          browserURL: "https://zkevm.polygonscan.com",
        },
      },
      {
        network: "astarZkevm",
        chainId: 3776,
        urls: {
          apiURL: "https://astar-zkevm.explorer.startale.com/api",
          browserURL: "https://astar-zkevm.explorer.startale.com",
        },
      },
      {
        network: "cyber",
        chainId: 7560,
        urls: {
          apiURL: "https://api.socialscan.io/cyber/v1/explorer/command_api/contract",
          browserURL: "https://cyber.socialscan.io",
        },
      },
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
      {
        network: "garnet",
        chainId: 17069,
        urls: {
          apiURL: "https://api.explorer.garnet.qry.live",
          browserURL: "https://explorer.garnet.qry.live/",
        },
      },
      {
        network: "arbitrumNova",
        chainId: 42170,
        urls: {
          apiURL: "https://api-nova.arbiscan.io/api",
          browserURL: "https://nova.arbiscan.io",
        },
      },
      {
        network: "avalanche",
        chainId: 43114,
        urls: {
          apiURL: "https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan",
          browserURL: "https://avalanche.routescan.io",
        },
      },
      {
        network: "linea",
        chainId: 59144,
        urls: {
          apiURL: "https://api.lineascan.build/api",
          browserURL: "https://lineascan.build",
        },
      },
      {
        network: "apex",
        chainId: 70700,
        urls: {
          apiURL: "https://explorer.apex.proofofplay.com/api",
          browserURL: "https://explorer.apex.proofofplay.com/",
        },
      },
      {
        network: "blast",
        chainId: 81457,
        urls: {
          apiURL: "https://api.blastscan.io/api",
          browserURL: "https://blastscan.io/",
        },
      },
      {
        network: "bitlayer",
        chainId: 200901,
        urls: {
          apiURL: "https://api.btrscan.com/scan/api",
          browserURL: "https://btrscan.com/",
        },
      },
      {
        network: "scroll",
        chainId: 534352,
        urls: {
          apiURL: "https://api.scrollscan.com/api",
          browserURL: "https://scrollscan.com",
        },
      },
      {
        network: "xai",
        chainId: 660279,
        urls: {
          apiURL: "https://explorer.xai-chain.net/api",
          browserURL: "https://explorer.xai-chain.net/",
        },
      },
      {
        network: "zora",
        chainId: 7777777,
        urls: {
          apiURL: "https://explorer.zora.energy/api",
          browserURL: "https://explorer.zora.energy",
        },
      },
      {
        network: "degen",
        chainId: 666666666,
        urls: {
          apiURL: "https://explorer.degen.tips/api",
          browserURL: "https://explorer.degen.tips",
        },
      },
      {
        network: "ancient8",
        chainId: 888888888,
        urls: {
          apiURL: "https://scan.ancient8.gg/api",
          browserURL: "https://scan.ancient8.gg",
        },
      },
      {
        network: "nebula",
        chainId: 1482601649,
        urls: {
          apiURL: "https://green-giddy-denebola.explorer.mainnet.skalenodes.com/api",
          browserURL: "https://green-giddy-denebola.explorer.mainnet.skalenodes.com/",
        },
      },
      {
        network: "xai",
        chainId: 660279,
        urls: {
          apiURL: "https://explorer.xai-chain.net/api",
          browserURL: "https://explorer.xai-chain.net/",
        },
      },
      {
        network: "sei",
        chainId: 1329,
        urls: {
          apiURL: "https://seitrace.com/api",
          browserURL: "https://seitrace.com/",
        },
      },
      // Testnets
      {
        network: "mantleTestnet",
        chainId: 5001,
        urls: {
          apiURL: "https://explorer.testnet.mantle.xyz/api",
          browserURL: "https://explorer.testnet.mantle.xyz",
        },
      },
      {
        network: "apexTestnet",
        chainId: 70800,
        urls: {
          apiURL: "https://explorerl2new-pop-testnet-barret-oxaolmcfss.t.conduit.xyz/api",
          browserURL: "https://explorerl2new-pop-testnet-barret-oxaolmcfss.t.conduit.xyz/",
        },
      },
      {
        network: "amoy",
        chainId: 80002,
        urls: {
          apiURL: "https://api-amoy.polygonscan.com/api",
          browserURL: "https://www.oklink.com/amoy",
        },
      },
      {
        network: "berachainTestnet",
        chainId: 80085,
        urls: {
          apiURL: "https://api.routescan.io/v2/network/testnet/evm/80085",
          browserURL: "https://artio.beratrail.io",
        },
      },
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org/",
        },
      },
      {
        network: "seiTestnet",
        chainId: 713715,
        urls: {
          apiURL: "https://seitrace.com/api",
          browserURL: "https://seitrace.com/",
        },
      },
      {
        network: "ancient8Testnet",
        chainId: 28122024,
        urls: {
          apiURL: "https://scanv2-testnet.ancient8.gg/api",
          browserURL: "https://scanv2-testnet.ancient8.gg/",
        },
      },
      {
        network: "blastSepolia",
        chainId: 168587773,
        urls: {
          apiURL: "https://api-sepolia.blastscan.io/api",
          browserURL: "https://sepolia.blastscan.io/",
        },
      },
    ],
  },
  gasReporter: {
    enabled: Boolean(Number(process.env.REPORT_GAS)),
  },
  mocha: {
    timeout: 1000000,
  },
};

export default config;
