import { describe, it, expect } from 'vitest';
import { GetPastOrders } from '../../src/uber/operations.js';

describe('GetPastOrders', () => {
  it('buildBody sends an empty workflow cursor', () => {
    expect(GetPastOrders.buildBody()).toEqual({ lastWorkflowUUID: '' });
  });

  it('parseData throws when ordersMap is missing', () => {
    expect(() => GetPastOrders.parseData({})).toThrow(/ordersMap/);
  });

  it('parseData maps a raw order and applies defaults', () => {
    const { orders } = GetPastOrders.parseData({
      ordersMap: {
        'order-1': {
          baseEaterOrder: {
            uuid: 'order-1',
            storeUuid: 'store-1',
            completedAt: '2026-04-10T18:00:00Z',
            totalCents: 4250,
            storeInfo: { title: "Perla's" },
            shoppingCart: {
              items: [
                {
                  uuid: 'item-1',
                  storeUuid: 'store-1',
                  shoppingCartItemUuid: 'sci-1',
                  sectionUuid: 'sec-1',
                  subsectionUuid: 'sub-1',
                  title: 'Oysters',
                  price: 1800,
                  quantity: 1,
                },
              ],
            },
          },
        },
      },
    });

    expect(orders).toHaveLength(1);
    expect(orders[0].restaurantName).toBe("Perla's");
    expect(orders[0].totalCents).toBe(4250);
    // Defaults filled in for fields the raw order omitted.
    expect(orders[0].isCancelled).toBe(false);
    expect(orders[0].shoppingCartItems[0].specialInstructions).toBe('');
    expect(orders[0].shoppingCartItems[0].customizations).toEqual({});
  });

  it('parseData skips entries without a baseEaterOrder', () => {
    const { orders } = GetPastOrders.parseData({
      ordersMap: { 'order-1': { storeInfo: { title: 'No base' } } },
    });
    expect(orders).toEqual([]);
  });

  it('parseData sorts orders newest-first by completedAt', () => {
    const { orders } = GetPastOrders.parseData({
      ordersMap: {
        older: { baseEaterOrder: { uuid: 'older', storeUuid: 's', completedAt: '2026-01-01T00:00:00Z' } },
        newer: { baseEaterOrder: { uuid: 'newer', storeUuid: 's', completedAt: '2026-05-01T00:00:00Z' } },
      },
    });
    expect(orders.map((o) => o.orderUuid)).toEqual(['newer', 'older']);
  });
});
