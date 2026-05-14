import Link from "next/link";

export default function Home() {
  return (
    <main className="adminHome">
      <h1 className="adminHome__title">ZippMart HQ</h1>
      <p className="adminHome__text">Operations console for catalogue, counter tokens, receipts, and store KPIs.</p>
      <Link href="/admin" className="adminHome__link">
        Open admin sign-in
      </Link>
    </main>
  );
}
