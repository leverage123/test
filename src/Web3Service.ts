import {
  GAS_LIMIT,
  GWEI,
  pairContract,
  provider,
  router,
  routerContract,
  SLIPPAGE,
  stableTokenContract,
  STABLE_TOKEN,
  tradeTokenContract,
  TRADE_TOKEN,
  wallet,
} from './const';
import options from './config/options.json';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { BigNumber, Contract, utils } from 'ethers';
import { logger, orderBook } from './logger';
import axios from 'axios';

class Web3Service {
  static tradeTokenDecimals: number;
  static tradeTokenSymbol: string;
  static stableTokenDecimals: number;
  static stableTokenSymbol: string;
  static gasPrice: number;

  static async init() {
    this.tradeTokenDecimals = await this.getTradeTokenDecimals();
    this.tradeTokenSymbol = await this.getTradeTokenSymbol();
    this.stableTokenDecimals = await this.getStableTokenDecimals();
    this.stableTokenSymbol = await this.getStableTokenSymbol();
    this.gasPrice = await this.getGasPrice();
  }

  static async swap(
    amountIn: BigNumber,
    amountOutMin: BigNumber,
    pair: string[],
    tokenContract: Contract,
  ): Promise<string> {
    const options = {
      gasPrice: utils.parseUnits(`${GWEI}`, 'gwei'),
      gasLimit: GAS_LIMIT,
    };

    logger.transaction('Swapping...');

    const approveTx: TransactionResponse = await tokenContract.approve(
      router,
      amountIn,
      options,
    );
    logger.transaction(`Approve transaction hash: ${approveTx.hash}`);
    await approveTx.wait();
    logger.transaction(`Swap approved.`);

    const swapTx: TransactionResponse =
      await routerContract.swapExactTokensForTokens(
        amountIn,
        amountOutMin,
        pair,
        wallet.address,
        Date.now() + 1000 * 60 * 10,
        options,
      );
    logger.transaction(`Swap transaction hash: ${swapTx.hash}`);
    await swapTx.wait();
    logger.transaction('Swap done!');

    await this.info('transaction');
    return swapTx.hash;
  }

  static async buy(buyPower: number, conversion?: number): Promise<string> {
    const amountIn: BigNumber = utils.parseUnits(
      buyPower.toFixed(this.stableTokenDecimals),
      this.stableTokenDecimals,
    );
    const amounts: BigNumber[] = await routerContract.getAmountsOut(amountIn, [
      STABLE_TOKEN,
      TRADE_TOKEN,
    ]);
    const amountOutMin = amounts[1].sub(amounts[1].div(100 / SLIPPAGE));

    logger.transaction(
      `Buying ${this.tradeTokenSymbol} for ${utils.formatUnits(
        amountIn,
        this.stableTokenDecimals,
      )} ${this.stableTokenSymbol} ...`,
    );

    let hash: string = await this.swap(
      amountIn,
      amountOutMin,
      [STABLE_TOKEN, TRADE_TOKEN],
      stableTokenContract,
    );

    orderBook.order(
      `Swapped ${buyPower} ${this.stableTokenSymbol} for ${utils.formatUnits(
        amounts[1],
        this.tradeTokenDecimals,
      )} ${this.tradeTokenSymbol} @${conversion}. Hash: ${hash}`,
    );
    return hash;
  }

  static async sell(amount: number, conversion?: number): Promise<string> {
    let amountIn = utils.parseUnits(
      amount.toFixed(this.tradeTokenDecimals),
      this.tradeTokenDecimals,
    );
    logger.transaction(
      `Selling ${amount} ${this.tradeTokenSymbol} for ${this.stableTokenSymbol}...`,
    );

    const amounts = await routerContract.getAmountsOut(amountIn, [
      TRADE_TOKEN,
      STABLE_TOKEN,
    ]);
    const amountOutMin = amounts![1].sub(amounts![1].div(100 / SLIPPAGE));

    let hash: string = await this.swap(
      amountIn,
      amountOutMin,
      [TRADE_TOKEN, STABLE_TOKEN],
      tradeTokenContract,
    );

    orderBook.order(
      `Swapped ${amount} ${this.tradeTokenSymbol} for ${utils.formatUnits(
        amounts![1],
        this.stableTokenDecimals,
      )} ${this.stableTokenSymbol} @${conversion}. Hash: ${hash}`,
    );
    return hash;
  }

  static async getCurrentPrice(): Promise<number> {
    const pairData = await pairContract.getReserves();
    const stableTokenReserve = utils.formatUnits(
      pairData[1],
      this.stableTokenDecimals,
    );
    const tradeTokenReserve = utils.formatUnits(
      pairData[0],
      this.tradeTokenDecimals,
    );
    const conversion = Number(stableTokenReserve) / Number(tradeTokenReserve);
    return Number(conversion.toFixed(this.stableTokenDecimals));
  }

  static async getCoinBalance(): Promise<number> {
    let balance = await provider.getBalance(wallet.address);
    return Number(utils.formatUnits(balance, options.coinDigits));
  }

  static async getGasPrice(): Promise<number> {
    let gasPrice = await provider.getGasPrice();
    return Number(utils.formatUnits(gasPrice, 'gwei'));
  }

  static async getStableTokenBalance(): Promise<number> {
    let balance = await stableTokenContract.balanceOf(wallet.address);
    return Number(utils.formatUnits(balance, this.stableTokenDecimals));
  }

  static async getTradeTokenBalance(): Promise<number> {
    let balance = await tradeTokenContract.balanceOf(wallet.address);
    return Number(utils.formatUnits(balance, this.tradeTokenDecimals));
  }

  static async getTradeTokenDecimals(): Promise<number> {
    let decimals = await tradeTokenContract.decimals();
    return decimals;
  }

  static async getTradeTokenSymbol(): Promise<string> {
    let symbol = await tradeTokenContract.symbol();
    return symbol;
  }

  static async getStableTokenDecimals(): Promise<number> {
    let decimals = await stableTokenContract.decimals();
    return decimals;
  }

  static async getStableTokenSymbol(): Promise<string> {
    let symbol = await stableTokenContract.symbol();
    return symbol;
  }

  static async getEstimatedGwei() {
    let res = await axios.get(
      'https://gpoly.blockscan.com/gasapi.ashx?apikey=key&method=gasoracle',
    );
    return res.data.result.ProposeGasPrice;
  }

  static async info(logLevel: string = 'info'): Promise<void> {
    const coinBalance = await this.getCoinBalance();
    const stableTokenBalance = await this.getStableTokenBalance();
    const tradeTokenBalance = await this.getTradeTokenBalance();

    logger.log(logLevel, `Balance Information:`);
    logger.log(logLevel, `${coinBalance} ${options.coinName}`);
    logger.log(logLevel, `${stableTokenBalance} ${this.stableTokenSymbol}`);
    logger.log(logLevel, `${tradeTokenBalance} ${this.tradeTokenSymbol}`);
  }
}

export const web3 = Web3Service;