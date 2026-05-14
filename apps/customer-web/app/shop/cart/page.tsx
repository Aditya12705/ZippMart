"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useShop } from "../context/ShopContext";

export default function CartPage() {
  const router = useRouter();
  const { hydrated, sessionId, cart, refreshCart, message, loading, setLineQuantity } = useShop();

  useEffect(() => {
    if (!hydrated) return;
    if (!sessionId) {
      router.replace("/shop");
      return;
    }
    void refreshCart();
  }, [hydrated, sessionId, router, refreshCart]);

  const items = cart.items;
  const hasItems = items.length > 0;

  if (!hydrated || !sessionId) {
    return (
      <main className="pageCanvas pageCanvas--cart">
        <div className="skeletonLine" style={{ marginTop: 24 }} />
      </main>
    );
  }

  return (
    <main className="pageCanvas pageCanvas--cart">
      <p className="cartLead">
        Review quantities before checkout. Changes save instantly to your visit.
      </p>

      <section className="cartSheet">
        {hasItems ? (
          <ul className="cartListUi">
            {items.map((line) => {
              const pid = line.productId;
              const canEdit = Boolean(pid);
              return (
                <li key={pid ?? `${line.name}-${line.qty}`} className="cartRow cartRow--editable">
                  <div className="cartRow__main">
                    <p className="cartRow__name">{line.name}</p>
                    <p className="cartRow__unitMeta">
                      {line.unitPrice != null ? `₹${line.unitPrice} each` : null}
                      {line.taxPercent != null ? ` · ${line.taxPercent}% tax` : null}
                    </p>
                    <p className="cartRow__incl">Line total includes tax</p>
                  </div>
                  <div className="cartRow__side">
                    {canEdit ? (
                      <div className="cartRow__qtyRow">
                        <div className="qtyStepper qtyStepper--cart" aria-label={`Quantity for ${line.name}`}>
                          <button
                            type="button"
                            className="qtyStepper__btn"
                            disabled={loading || line.qty <= 1}
                            onClick={() => void setLineQuantity(pid!, line.qty - 1)}
                          >
                            −
                          </button>
                          <span className="qtyStepper__val">{line.qty}</span>
                          <button
                            type="button"
                            className="qtyStepper__btn"
                            disabled={loading || line.qty >= 99}
                            onClick={() => void setLineQuantity(pid!, line.qty + 1)}
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          className="cartRow__remove"
                          disabled={loading}
                          onClick={() => void setLineQuantity(pid!, 0)}
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <p className="cartRow__qty">Qty {line.qty}</p>
                    )}
                    <p className="cartRow__total">₹{line.lineTotal.toFixed(2)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="emptyCart">
            <p className="emptyCart__title">Your bag is empty</p>
            <p className="emptyCart__text">Scan a barcode or search for products to add items.</p>
            <Link href="/shop" className="btnPrimary btnPrimary--full">
              Continue shopping
            </Link>
          </div>
        )}

        {hasItems ? (
          <footer className="cartFooter">
            <div className="cartFooter__line">
              <span>Subtotal (excl. tax)</span>
              <span>₹{cart.subtotal.toFixed(2)}</span>
            </div>
            <div className="cartFooter__line">
              <span>Tax</span>
              <span>₹{cart.taxTotal.toFixed(2)}</span>
            </div>
            <div className="cartFooter__line cartFooter__line--grand">
              <span>Total (incl. tax)</span>
              <span>₹{cart.grandTotal.toFixed(2)}</span>
            </div>
            <p className="cartFooter__note">Subtotal + tax equals your total — same as adding each line above.</p>
            <Link href="/shop/checkout" className="btnPrimary btnPrimary--full" aria-disabled={!hasItems}>
              Checkout
            </Link>
          </footer>
        ) : null}
      </section>

      {message ? <div className="toast">{message}</div> : null}
    </main>
  );
}
