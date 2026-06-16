"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useShop } from "../context/ShopContext";

const TITLES: Record<string, string> = {
  "/shop/scan": "Scan",
  "/shop/search": "Browse",
  "/shop/cart": "Your bag",
  "/shop/checkout": "Checkout"
};

function backHref(pathname: string): string {
  if (pathname === "/shop/checkout") return "/shop/cart";
  return "/shop";
}

export function ShopShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/shop";
  const { cartItemCount } = useShop();
  const isHome = pathname === "/shop";
  const title = TITLES[pathname];
  const [helpOpen, setHelpOpen] = useState(false);
  const helpCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!helpOpen) return;
    helpCloseRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHelpOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [helpOpen]);

  return (
    <div className="shopApp">
      <header className="siteHeader">
        <div className="siteHeader__inner">
          {isHome ? (
            <>
              <Link href="/shop" className="siteHeader__brand" aria-label="SeamLine home">
                <span className="brandZipp">Seam</span>
                <span className="brandMart">Line</span>
              </Link>
              <nav className="siteHeader__nav" aria-label="Shop sections">
                <Link href="/shop/scan" className="siteHeader__pill">
                  Scan
                </Link>
                <Link href="/shop/search" className="siteHeader__pill">
                  Browse
                </Link>
              </nav>
            </>
          ) : (
            <>
              <Link href={backHref(pathname)} className="siteHeader__back" aria-label="Back">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M15 18l-6-6 6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
              <h1 className="siteHeader__pageTitle">{title ?? "Shop"}</h1>
            </>
          )}
          <Link href="/shop/cart" className="siteHeader__bag" aria-label={`Shopping bag, ${cartItemCount} items`}>
            <span className="siteHeader__bagIcon" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 6h15l-1.5 9h-12L6 6zm0 0L5 3H2"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="9" cy="20" r="1" fill="currentColor" />
                <circle cx="18" cy="20" r="1" fill="currentColor" />
              </svg>
            </span>
            {cartItemCount > 0 ? <span className="siteHeader__bagCount">{cartItemCount > 99 ? "99+" : cartItemCount}</span> : null}
          </Link>
        </div>
      </header>

      <main className="shopShell" id="shop-main">
        {children}
      </main>

      <footer className="siteFooter">
        <div className="siteFooter__inner">
          <div className="siteFooter__links">
            <button type="button" className="siteFooter__linkBtn" onClick={() => setHelpOpen(true)}>
              Help
            </button>
            <span className="siteFooter__dot" aria-hidden>
              ·
            </span>
            <span className="siteFooter__muted">Store: self-checkout</span>
            <span className="siteFooter__dot" aria-hidden>
              ·
            </span>
            <span className="siteFooter__muted">Bag syncs while this visit is active</span>
          </div>
          <p className="siteFooter__legal">© {new Date().getFullYear()} SeamLine · Fashion at the speed of scan</p>
        </div>
      </footer>

      {helpOpen ? (
        <div
          className="helpBackdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setHelpOpen(false);
          }}
        >
          <div className="helpPanel" role="dialog" aria-modal="true" aria-labelledby="shop-help-title">
            <h2 id="shop-help-title" className="helpPanel__title">
              Quick help
            </h2>
            <ul className="helpPanel__list">
              <li>
                <strong>Scan</strong> uses your camera — allow access when prompted, or type the barcode digits
                manually.
              </li>
              <li>
                <strong>Browse</strong> suggests products as you type; pick one to see details and add to your bag.
              </li>
              <li>
                For <strong>pay at counter</strong>, show the cashier your queue number and order ID (copy buttons on
                the confirmation screen).
              </li>
              <li>
                Totals include tax per line. If something looks wrong, ask a staff member before paying.
              </li>
            </ul>
            <button ref={helpCloseRef} type="button" className="helpPanel__close" onClick={() => setHelpOpen(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
