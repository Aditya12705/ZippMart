import type { ReactNode } from "react";
import { ShopShell } from "./components/ShopShell";
import { ShopProvider } from "./context/ShopContext";

export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#shop-main" className="skipLink">
        Skip to shopping
      </a>
      <ShopProvider>
        <ShopShell>{children}</ShopShell>
      </ShopProvider>
    </>
  );
}
