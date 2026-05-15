"use client";

import { useMemo } from "react";

type Metrics = {
  orderCount: number;
  paidOrderCount: number;
  openOrderCount: number;
  totalRevenue: number;
  pendingOrderValue: number;
  averagePaidOrderValue: number;
  productCount: number;
  lowStockSkuCount: number;
  inventoryValueAtCost: number;
  inventoryValueAtList: number;
  activeDiscountCount: number;
};

type Product = {
  id: string;
  name: string;
  category: string;
  inStock: number;
  demandScore: number;
  unitPrice: number;
  costPrice: number;
  profitPerUnitAtSale: number;
};

type OrderRow = {
  orderId: string;
  createdAt: string;
  grandTotal: number;
  paid: boolean;
  voided: boolean;
  refunded: boolean;
  paymentMode: string;
};

type Props = {
  metrics: Metrics | null;
  products: Product[];
  orders: OrderRow[];
  money: (n: number) => string;
};

function pct(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export function OverviewSection({ metrics, products, orders, money }: Props) {
  const stockHealth = useMemo(() => {
    let out = 0;
    let low = 0;
    let ok = 0;
    for (const p of products) {
      if (p.inStock <= 0) out += 1;
      else if (p.inStock < 15) low += 1;
      else ok += 1;
    }
    return { out, low, ok, total: products.length };
  }, [products]);

  const topDemand = useMemo(
    () => [...products].sort((a, b) => b.demandScore - a.demandScore).slice(0, 5),
    [products]
  );

  const categoryRows = useMemo(() => {
    const map = new Map<string, { count: number; stock: number; listValue: number }>();
    for (const p of products) {
      const cur = map.get(p.category) ?? { count: 0, stock: 0, listValue: 0 };
      cur.count += 1;
      cur.stock += p.inStock;
      cur.listValue += p.inStock * p.unitPrice;
      map.set(p.category, cur);
    }
    return [...map.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.listValue - a.listValue);
  }, [products]);

  const orderInsights = useMemo(() => {
    const paid = orders.filter((o) => o.paid && !o.voided && !o.refunded);
    const counter = paid.filter((o) => o.paymentMode === "COUNTER").length;
    const online = paid.filter((o) => o.paymentMode === "ONLINE").length;
    const last24h = orders.filter((o) => Date.now() - new Date(o.createdAt).getTime() < 86_400_000).length;
    return { paid: paid.length, counter, online, last24h, sample: orders.length };
  }, [orders]);

  const marginAtSale = useMemo(
    () => products.reduce((sum, p) => sum + Math.max(0, p.inStock) * p.profitPerUnitAtSale, 0),
    [products]
  );

  if (!metrics) {
    return <p className="muted">Loading analytics…</p>;
  }

  const revenueTotal = metrics.totalRevenue + metrics.pendingOrderValue;
  const paidShare = pct(metrics.totalRevenue, revenueTotal);

  return (
    <>
      <section className="metricsGrid" aria-label="Store KPIs">
        <div className="metricCard">
          <p className="metricCard__label">Paid orders</p>
          <p className="metricCard__value">{metrics.paidOrderCount}</p>
          <p className="metricCard__hint">All time (filtered store)</p>
        </div>
        <div className="metricCard metricCard--accent">
          <p className="metricCard__label">Net revenue</p>
          <p className="metricCard__value">{money(metrics.totalRevenue)}</p>
          <p className="metricCard__hint">Completed payments</p>
        </div>
        <div className="metricCard">
          <p className="metricCard__label">Open orders</p>
          <p className="metricCard__value">{metrics.openOrderCount}</p>
          <p className="metricCard__hint">{money(metrics.pendingOrderValue)} pending</p>
        </div>
        <div className="metricCard">
          <p className="metricCard__label">Avg paid ticket</p>
          <p className="metricCard__value">{money(metrics.averagePaidOrderValue)}</p>
          <p className="metricCard__hint">Per settled order</p>
        </div>
        <div className="metricCard">
          <p className="metricCard__label">SKU count</p>
          <p className="metricCard__value">{metrics.productCount}</p>
          <p className="metricCard__hint">{metrics.lowStockSkuCount} low stock (&lt; 15)</p>
        </div>
        <div className="metricCard">
          <p className="metricCard__label">Inventory @ cost</p>
          <p className="metricCard__value">{money(metrics.inventoryValueAtCost)}</p>
          <p className="metricCard__hint">On-hand × unit cost</p>
        </div>
        <div className="metricCard">
          <p className="metricCard__label">Inventory @ list</p>
          <p className="metricCard__value">{money(metrics.inventoryValueAtList)}</p>
          <p className="metricCard__hint">On-hand × list price</p>
        </div>
        <div className="metricCard">
          <p className="metricCard__label">Active promos</p>
          <p className="metricCard__value">{metrics.activeDiscountCount}</p>
          <p className="metricCard__hint">Live discount rules</p>
        </div>
      </section>

      {metrics.lowStockSkuCount > 0 ? (
        <div className="alertBanner" role="status">
          <strong>{metrics.lowStockSkuCount}</strong> SKU{metrics.lowStockSkuCount === 1 ? "" : "s"} below 15 units —
          open <strong>Inventory</strong> and use low-stock filter to replenish.
        </div>
      ) : null}

      <div className="analysisGrid">
        <section className="panel adminPanel analysisCard">
          <h2 className="adminPanel__title">Revenue mix</h2>
          <p className="adminPanel__lede">Settled vs still-open order value in the current filter.</p>
          <div className="analysisBar" aria-hidden>
            <span className="analysisBar__paid" style={{ width: `${paidShare}%` }} />
          </div>
          <div className="analysisLegend">
            <span>
              <i className="analysisDot analysisDot--paid" /> Paid {money(metrics.totalRevenue)} ({paidShare}%)
            </span>
            <span>
              <i className="analysisDot analysisDot--pending" /> Pending {money(metrics.pendingOrderValue)} (
              {100 - paidShare}%)
            </span>
          </div>
          <p className="analysisFoot">
            Est. margin on current stock (at shelf promo prices): <strong>{money(marginAtSale)}</strong>
          </p>
        </section>

        <section className="panel adminPanel analysisCard">
          <h2 className="adminPanel__title">Stock health</h2>
          <p className="adminPanel__lede">{stockHealth.total} SKUs in catalogue.</p>
          <ul className="analysisList">
            <li>
              <span>Healthy (15+ units)</span>
              <strong>{stockHealth.ok}</strong>
            </li>
            <li>
              <span>Low stock</span>
              <strong className="textWarn">{stockHealth.low}</strong>
            </li>
            <li>
              <span>Out of stock</span>
              <strong className="textDanger">{stockHealth.out}</strong>
            </li>
          </ul>
        </section>

        <section className="panel adminPanel analysisCard">
          <h2 className="adminPanel__title">Orders snapshot</h2>
          <p className="adminPanel__lede">From the latest {orderInsights.sample} orders loaded.</p>
          <ul className="analysisList">
            <li>
              <span>Paid (in sample)</span>
              <strong>{orderInsights.paid}</strong>
            </li>
            <li>
              <span>Last 24 hours</span>
              <strong>{orderInsights.last24h}</strong>
            </li>
            <li>
              <span>Counter / online paid</span>
              <strong>
                {orderInsights.counter} / {orderInsights.online}
              </strong>
            </li>
          </ul>
        </section>

        <section className="panel adminPanel analysisCard analysisCard--wide">
          <h2 className="adminPanel__title">Top demand SKUs</h2>
          <p className="adminPanel__lede">Higher demand score surfaces first on the customer shop.</p>
          {topDemand.length === 0 ? (
            <p className="emptyHint">No products yet.</p>
          ) : (
            <div className="tableWrap">
              <table className="adminTable adminTable--compact">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Demand</th>
                    <th>Stock</th>
                    <th>List</th>
                  </tr>
                </thead>
                <tbody>
                  {topDemand.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td className="muted">{p.category}</td>
                      <td>{p.demandScore}</td>
                      <td>{p.inStock}</td>
                      <td>{money(p.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel adminPanel analysisCard analysisCard--wide">
          <h2 className="adminPanel__title">Category breakdown</h2>
          <p className="adminPanel__lede">SKU count and list-value on hand by aisle.</p>
          {categoryRows.length === 0 ? (
            <p className="emptyHint">No categories yet.</p>
          ) : (
            <div className="tableWrap">
              <table className="adminTable adminTable--compact">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>SKUs</th>
                    <th>Units on hand</th>
                    <th>List value</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryRows.map((row) => (
                    <tr key={row.category}>
                      <td>{row.category}</td>
                      <td>{row.count}</td>
                      <td>{row.stock}</td>
                      <td>{money(row.listValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

