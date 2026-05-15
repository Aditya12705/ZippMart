"use client";

export type AdminSection = "overview" | "inventory" | "orders" | "promotions" | "audit";

const ITEMS: {
  id: AdminSection;
  label: string;
  hint: string;
  managerOnly?: boolean;
}[] = [
  { id: "overview", label: "Overview", hint: "KPIs & analysis" },
  { id: "inventory", label: "Inventory", hint: "Catalogue & stock" },
  { id: "orders", label: "Orders", hint: "Checkouts & receipts" },
  { id: "promotions", label: "Promotions", hint: "Discount rules" },
  { id: "audit", label: "Audit log", hint: "Manager only", managerOnly: true }
];

type Props = {
  active: AdminSection;
  isManager: boolean;
  onChange: (section: AdminSection) => void;
};

export function AdminNav({ active, isManager, onChange }: Props) {
  const visible = ITEMS.filter((item) => !item.managerOnly || isManager);

  return (
    <nav className="adminNav" aria-label="Dashboard sections">
      {visible.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`adminNav__item${active === item.id ? " adminNav__item--active" : ""}`}
          onClick={() => onChange(item.id)}
          aria-current={active === item.id ? "page" : undefined}
        >
          <span className="adminNav__label">{item.label}</span>
          <span className="adminNav__hint">{item.hint}</span>
        </button>
      ))}
    </nav>
  );
}
