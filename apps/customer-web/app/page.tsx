import Link from "next/link";

export default function Home() {
  return (
    <main className="landing">
      <p className="landing__eyebrow">ProFlo</p>
      <h1 className="landing__title">
        <span className="brandZipp">Scan in.</span> <span className="brandMart">Style out.</span>
      </h1>
      <p className="landing__text">Scan the store QR, grab what you need, and bounce — your bag stays synced while you shop.</p>
      <Link href="/shop" className="btnPrimary btnPrimary--full landing__cta">
        Continue to shop
      </Link>
    </main>
  );
}
