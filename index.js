const { Web3 } = require('web3');
const { ChainId, Fetcher, Route, Trade, TokenAmount, TradeType, Percent } = require('@pancakeswap-libs/sdk');
require('dotenv').config();

// PancakeRouter ABI
const pancakeRouterAbi = [
  {
    "inputs": [
      { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
      { "internalType": "uint256", "name": "amountOutMin", "type": "uint256" },
      { "internalType": "address[]", "name": "path", "type": "address[]" },
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "deadline", "type": "uint256" }
    ],
    "name": "swapExactTokensForTokens",
    "outputs": [{ "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// Connect to Basechain using Infura
const web3 = new Web3(new Web3.providers.HttpProvider(`https://base-mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`));

const PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY; // Your private key
const USDT_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CAKE_ADDRESS = '0x3055913c90Fcc1A6CE9a358911721eEb942013A1';
const PANCAKE_ROUTER_ADDRESS = '0xFE6508f0015C778Bdcc1fB5465bA5ebE224C9912';
const RECIPIENT = '0x527D1560930735Ae5aDb2f867b29502aDa2bc9f0'; // Your wallet address

async function main() {
  const chainId = ChainId.MAINNET;  // Adjust this if Basechain uses a different chain ID
  const usdt = await Fetcher.fetchTokenData(chainId, USDT_ADDRESS, web3);
  const cake = await Fetcher.fetchTokenData(chainId, CAKE_ADDRESS, web3);
  const pair = await Fetcher.fetchPairData(usdt, cake, web3);
  const route = new Route([pair], usdt);
  const amountIn = web3.utils.toWei('1', 'ether'); // Amount of USDT to swap (1 USDT)

  const trade = new Trade(route, new TokenAmount(usdt, amountIn), TradeType.EXACT_INPUT);

  const slippageTolerance = new Percent('50', '10000'); // 0.50% slippage tolerance

  const amountOutMin = trade.minimumAmountOut(slippageTolerance).raw.toString();
  const path = [USDT_ADDRESS, CAKE_ADDRESS];
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

  const account = web3.eth.accounts.privateKeyToAccount(PRIVATE_KEY);
  web3.eth.accounts.wallet.add(account);
  web3.eth.defaultAccount = account.address;

  const router = new web3.eth.Contract(pancakeRouterAbi, PANCAKE_ROUTER_ADDRESS);

  // Approve the router to spend USDT
  const usdtContract = new web3.eth.Contract([
    {
      "constant": false,
      "inputs": [
        { "name": "_spender", "type": "address" },
        { "name": "_value", "type": "uint256" }
      ],
      "name": "approve",
      "outputs": [{ "name": "success", "type": "bool" }],
      "type": "function"
    }
  ], USDT_ADDRESS);

  const approveTx = usdtContract.methods.approve(PANCAKE_ROUTER_ADDRESS, amountIn);
  const approveGas = await approveTx.estimateGas({ from: account.address });
  const approveGasPrice = await web3.eth.getGasPrice();
  const approveData = approveTx.encodeABI();

  const approveTxData = {
    from: account.address,
    to: USDT_ADDRESS,
    data: approveData,
    gas: approveGas,
    gasPrice: approveGasPrice
  };

  await web3.eth.sendTransaction(approveTxData);

  // Execute the swap
  const tx = router.methods.swapExactTokensForTokens(
    amountIn,
    amountOutMin,
    path,
    RECIPIENT,
    deadline
  );

  const gas = await tx.estimateGas({ from: account.address });
  const gasPrice = await web3.eth.getGasPrice();

  const data = tx.encodeABI();
  const txData = {
    from: account.address,
    to: PANCAKE_ROUTER_ADDRESS,
    data,
    gas,
    gasPrice
  };

  const receipt = await web3.eth.sendTransaction(txData);
  console.log(`Transaction hash: ${receipt.transactionHash}`);
}

main().catch(console.error);
