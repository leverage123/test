import { logger } from '../logger';
import { web3 } from '../Web3Service';
import { Strategy } from './Strategy';
import { Order, OrderType } from '../Order';
import * as orderBook from '../OrderBook';

export class GridTradingPro implements Strategy {
  rebalance: boolean;
  min: number;
  max: number;
  gridMargin: number;
  totalBuyPower: number;
  buyPowerPerGrid: number;
  gridCount: number;
  gridSize: number;

  public constructor(strategyOptions: any) {
    this.rebalance = strategyOptions.rebalance;
    this.min = strategyOptions.range.min;
    this.max = strategyOptions.range.max;
    this.gridMargin = strategyOptions.gridMargin;
    this.totalBuyPower = strategyOptions.totalBuyPower;
    let range = this.max - this.min;
    let middle = range / 2 + this.min;
    this.gridSize = middle * (this.gridMargin / 100);
    this.gridCount = Math.ceil(range / this.gridSize);
    this.gridSize = range / this.gridCount;
    this.buyPowerPerGrid = this.totalBuyPower / this.gridCount;
  }

  public async init(conversion: number): Promise<void> {
    logger.info(`Grids: ${this.gridCount} Size: ${this.gridSize} Buy power per grid: ${this.buyPowerPerGrid}`);

    let currentGrid = this.calculateGrid(conversion);
    let amount = (this.gridCount - currentGrid) * this.buyPowerPerGrid;
    let refOrder = new Order(OrderType.BUY, amount);

    refOrder = await orderBook.executeOrder(refOrder);

    for (let i = currentGrid + 2; i <= this.gridCount; i++) {
      let total = refOrder.amountOut ?? amount / conversion;
      let value = total / (this.gridCount - (currentGrid + 2));
      let sellOrder = new Order(OrderType.SELL, value, this.calculatePrice(i), refOrder);
      orderBook.addOrder(sellOrder);
    }

    for (let i = currentGrid - 1; i >= 0; i--) {
      let buyOrder = new Order(OrderType.BUY, this.buyPowerPerGrid, this.calculatePrice(i));
      orderBook.addOrder(buyOrder);
    }
  }

  public async orderLiquidated(order: Order): Promise<void> {
    if (order.orderType === OrderType.SELL) {
      let profit = order.amountOut! - this.buyPowerPerGrid;
      logger.info(`Made ${profit} ${web3.stableTokenSymbol} profit`);
      if (order.limit !== undefined) {
        let buyOrder = new Order(OrderType.BUY, this.buyPowerPerGrid, this.calculatePrice(order.limit - 2));
        orderBook.addOrder(buyOrder);
      }
    } else if (order.orderType === OrderType.BUY) {
      if (order.limit !== undefined) {
        let sellOrder = new Order(OrderType.SELL, order.amountOut!, this.calculatePrice(order.limit + 2), order);
        orderBook.addOrder(sellOrder);
      }
    }
  }

  public async priceUpdate(): Promise<void> {}

  private calculateGrid(conversion: number): number {
    let grid = Math.floor((conversion - this.min) / this.gridSize);
    if (grid < 0) {
      logger.warn('Price is below the first grid');
      return 0;
    }
    if (grid > this.gridCount) {
      logger.warn('Price is above the last grid');
      return this.gridCount;
    }
    return grid;
  }

  private calculatePrice(grid: number): number {
    return this.min + grid * this.gridSize;
  }
}