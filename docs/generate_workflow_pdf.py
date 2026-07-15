#!/usr/bin/env python3
"""Generate SeamLine apparel checkout system — complete workflow & UI reference PDF."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent / "SeamLine_System_Workflow.pdf"

# Production Hugging Face Spaces (adi576)
CUSTOMER_URL = "https://adi576-seamline.hf.space"
ADMIN_URL = "https://adi576-seamline-admin.hf.space"
CASHIER_URL = "https://adi576-seamline-cashier.hf.space"
API_URL = f"{CUSTOMER_URL}/checkout-api"


def ascii_safe(text: str) -> str:
    return (
        text.replace("\u2014", "-")
        .replace("\u2013", "-")
        .replace("\u2019", "'")
        .replace("\u2018", "'")
        .replace("\u2026", "...")
        .replace("\u20b9", "Rs.")
        .replace("\u00d7", "x")
        .replace("\u2212", "-")
    )


class WorkflowPDF(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 8, "SeamLine - Complete System Documentation", align="R")
        self.ln(4)

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 8, f"Page {self.page_no()}", align="C")

    def section_title(self, title: str):
        self.ln(4)
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(20, 20, 20)
        self.multi_cell(0, 8, ascii_safe(title))
        self.ln(2)

    def sub_title(self, title: str):
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 6, ascii_safe(title))
        self.ln(1)

    def body(self, text: str):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 5, ascii_safe(text))
        self.ln(2)

    def bullet(self, text: str):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 5, ascii_safe(f"  -  {text}"))
        self.ln(1)

    def toc_line(self, num: str, title: str):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 5, ascii_safe(f"  {num}. {title}"))
        self.ln(0.5)

    def table_row(self, cols: list[str], bold: bool = False, widths: list[int] | None = None):
        """Render a table row with wrapped text so columns never overlap."""
        w = widths or [58, 122]
        lh = 4.5
        pad = 1.5
        self.set_font("Helvetica", "B" if bold else "", 8)
        texts = [ascii_safe(c) for c in cols]
        line_counts = []
        for i, text in enumerate(texts):
            width = w[i] if i < len(w) else w[-1]
            inner = max(width - pad * 2, 10)
            n = self.multi_cell(inner, lh, text, dry_run=True, output="LINES")
            line_counts.append(max(len(n), 1))
        row_h = max(line_counts) * lh + pad * 2

        if self.get_y() + row_h > self.page_break_trigger:
            self.add_page()

        x0 = self.l_margin
        y0 = self.get_y()
        for i, text in enumerate(texts):
            width = w[i] if i < len(w) else w[-1]
            x = x0 + sum(w[:i])
            self.rect(x, y0, width, row_h)
            self.set_xy(x + pad, y0 + pad)
            self.multi_cell(width - pad * 2, lh, text, border=0)
        self.set_xy(x0, y0 + row_h)

    def ui_row(self, screen: str, element: str, action: str):
        self.table_row([screen, element, action], widths=[48, 52, 80])


def generate_flowchart(output_path: str) -> None:
    width, height = 1600, 1650
    img = Image.new("RGBA", (width, height), (255, 255, 255, 255))
    draw = ImageDraw.Draw(img)

    themes = {
        "blue": {"fill": (240, 249, 255, 255), "border": (186, 230, 253, 255), "text": (3, 105, 161, 255)},
        "slate": {"fill": (248, 250, 252, 255), "border": (203, 213, 225, 255), "text": (51, 65, 85, 255)},
        "green": {"fill": (240, 253, 244, 255), "border": (187, 247, 208, 255), "text": (22, 101, 52, 255)},
        "indigo": {"fill": (245, 243, 255, 255), "border": (221, 214, 254, 255), "text": (67, 56, 202, 255)},
        "amber": {"fill": (255, 251, 235, 255), "border": (253, 230, 138, 255), "text": (180, 83, 9, 255)},
        "rose": {"fill": (255, 241, 242, 255), "border": (254, 205, 211, 255), "text": (159, 18, 57, 255)},
    }
    line_color = (100, 116, 139, 255)
    line_width = 4

    try:
        font_title = ImageFont.truetype("arial.ttf", 26)
        font_sub = ImageFont.truetype("arial.ttf", 20)
        font_label = ImageFont.truetype("arial.ttf", 22)
    except IOError:
        font_title = ImageFont.load_default()
        font_sub = ImageFont.load_default()
        font_label = ImageFont.load_default()

    def draw_arrowhead(draw_obj, tip, direction="down", color=line_color):
        x, y = tip
        if direction == "down":
            points = [(x, y), (x - 16, y - 24), (x + 16, y - 24)]
        elif direction == "up":
            points = [(x, y), (x - 16, y + 24), (x + 16, y + 24)]
        elif direction == "left":
            points = [(x, y), (x + 24, y - 16), (x + 24, y + 16)]
        elif direction == "right":
            points = [(x, y), (x - 24, y - 16), (x - 24, y + 16)]
        draw_obj.polygon(points, fill=color)

    def draw_path(draw_obj, points, label=None, label_pos=None):
        for i in range(len(points) - 1):
            draw_obj.line([points[i], points[i + 1]], fill=line_color, width=line_width)
        p_prev = points[-2]
        p_last = points[-1]
        if p_last[0] > p_prev[0]:
            draw_arrowhead(draw_obj, p_last, "right")
        elif p_last[0] < p_prev[0]:
            draw_arrowhead(draw_obj, p_last, "left")
        elif p_last[1] > p_prev[1]:
            draw_arrowhead(draw_obj, p_last, "down")
        elif p_last[1] < p_prev[1]:
            draw_arrowhead(draw_obj, p_last, "up")
        if label and label_pos:
            draw_obj.text(label_pos, label, fill=(71, 85, 105, 255), font=font_label, anchor="mm")

    nodes = [
        {"id": "session", "x": 800, "y": 100, "w": 520, "h": 110, "title": "Customer Session Starts", "sub": "Session initialized on device (60 min)", "theme": "blue"},
        {"id": "cart", "x": 800, "y": 270, "w": 520, "h": 110, "title": "Cart (Barcode Scan)", "sub": "Scan apparel hang-tag barcodes", "theme": "slate"},
        {"id": "reservation", "x": 800, "y": 440, "w": 520, "h": 110, "title": "Stock Reservation", "sub": "Hold items in ledger for 45 mins", "theme": "green"},
        {"id": "checkout", "x": 800, "y": 610, "w": 520, "h": 120, "title": "Checkout Selection", "sub": "Choose Cashier or Online Pay", "theme": "indigo"},
        {"id": "counter", "x": 480, "y": 790, "w": 420, "h": 110, "title": "Pay at Counter", "sub": "Generate token for Cashier POS queue", "theme": "slate"},
        {"id": "online", "x": 1120, "y": 790, "w": 420, "h": 110, "title": "Pay Online", "sub": "Direct settlement via Razorpay webhook", "theme": "slate"},
        {"id": "settlement", "x": 800, "y": 970, "w": 520, "h": 110, "title": "Payment Settlement", "sub": "Cashier settles token / online payment succeeds", "theme": "amber"},
        {"id": "commit", "x": 800, "y": 1140, "w": 520, "h": 110, "title": "Stock Commit (SALE)", "sub": "Atomic decrement in stock ledger", "theme": "green"},
        {"id": "receipt", "x": 800, "y": 1310, "w": 520, "h": 110, "title": "Receipt & Exit QR", "sub": "Generate receipt & secure exit gate QR JWT", "theme": "blue"},
        {"id": "gate", "x": 800, "y": 1480, "w": 520, "h": 110, "title": "Gate Verification", "sub": "Scan exit QR at gate to verify and exit", "theme": "rose"},
    ]

    draw_path(draw, [(800, 155), (800, 215)])
    draw_path(draw, [(800, 325), (800, 385)])
    draw_path(draw, [(800, 495), (800, 550)])
    draw_path(draw, [(800, 670), (800, 715), (480, 715), (480, 735)], label="Counter Pay", label_pos=(640, 695))
    draw_path(draw, [(800, 670), (800, 715), (1120, 715), (1120, 735)], label="Online Pay", label_pos=(960, 695))
    draw_path(draw, [(480, 845), (480, 900), (800, 900), (800, 915)])
    draw_path(draw, [(1120, 845), (1120, 900), (800, 900), (800, 915)])
    draw_path(draw, [(800, 1025), (800, 1085)])
    draw_path(draw, [(800, 1195), (800, 1255)])
    draw_path(draw, [(800, 1365), (800, 1425)])

    for node in nodes:
        t = themes[node["theme"]]
        x, y, w, h = node["x"], node["y"], node["w"], node["h"]
        left, top = x - w // 2, y - h // 2
        right, bottom = x + w // 2, y + h // 2
        draw.rounded_rectangle([left, top, right, bottom], radius=20, fill=t["fill"], outline=t["border"], width=4)
        draw.text((x, y - 18), node["title"], fill=t["text"], font=font_title, anchor="mm")
        draw.text((x, y + 18), node["sub"], fill=(100, 116, 139, 255), font=font_sub, anchor="mm")

    img.resize((800, 825), Image.Resampling.LANCZOS).save(output_path, "PNG")


def build() -> None:
    pdf = WorkflowPDF()
    pdf.set_auto_page_break(auto=True, margin=15)

    # --- Cover ---
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 28)
    pdf.set_text_color(15, 15, 15)
    pdf.ln(30)
    pdf.cell(0, 12, "SeamLine", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Helvetica", "", 16)
    pdf.cell(0, 10, "Apparel & Merchandising Checkout System", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(6)
    pdf.set_font("Helvetica", "", 12)
    pdf.set_text_color(60, 60, 60)
    pdf.cell(0, 8, "Complete System Documentation", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.cell(0, 8, "Theory, Architecture, Workflows & UI Reference", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(18)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, f"Document date: {date.today().strftime('%d %B %Y')}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.cell(0, 6, "Audience: Store operators, merchandising teams, developers, stakeholders", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.cell(0, 6, "Version: 2.1 - Production HF Spaces edition", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    # --- TOC ---
    pdf.add_page()
    pdf.section_title("Table of Contents")
    toc = [
        "Executive Summary",
        "Theoretical Foundation & Vision",
        "Industry Gaps in Apparel Retail",
        "How SeamLine Addresses These Gaps",
        "System Components & URLs",
        "Technology Stack & Repository Layout",
        "Database Schema",
        "API Reference",
        "Roles, Access & Authentication",
        "End-to-End Process Flow",
        "Merchandising Workflow (Admin Setup)",
        "Customer Self-Checkout Workflow",
        "Customer Shop - Complete UI Reference",
        "Cashier Counter Workflow",
        "Cashier & Exit Gate - UI Reference",
        "Admin HQ - Navigation & Sidebar",
        "Admin Overview Section",
        "Admin Inventory Section - UI Reference",
        "Admin Orders, Promotions & Audit",
        "Returns, Refunds & Void Orders",
        "Stock Ledger & Reservations",
        "Loyalty Circle & Offline Resilience",
        "Reporting & Analytics",
        "Deployment & Environment",
        "Summary",
    ]
    for i, t in enumerate(toc, 1):
        pdf.toc_line(str(i), t)

    # --- 1 Executive Summary ---
    pdf.add_page()
    pdf.section_title("1. Executive Summary")
    pdf.body(
        "SeamLine is a self-checkout and store-operations platform built specifically for clothing shops, "
        "boutiques, and merchandising retailers. It replaces generic grocery-style POS with workflows that "
        "understand size/color variants, seasonal collections, hang-tag barcodes, and the high return rates "
        "typical of fashion retail."
    )
    pdf.body(
        "The system connects four touchpoints - customer self-checkout (mobile web), admin merchandising HQ, "
        "cashier counter settlement, and exit-gate verification - through a single Express API backed by "
        "PostgreSQL (Supabase). Every sale, refund, stock adjustment, and gate passage is recorded in real time."
    )
    pdf.sub_title("What is in the system")
    for item in [
        f"Customer Shop ({CUSTOMER_URL}/shop) - browse catalogue, scan hang-tags, manage bag, checkout",
        f"Admin HQ ({ADMIN_URL}/admin) - catalogue variants, stock, promotions, orders, audit log",
        f"Cashier Terminal ({CASHIER_URL}) - settle counter orders, verify exit passes",
        f"API Service ({API_URL}) - sessions, cart, orders, inventory ledger, uploads",
        "Optional Worker - BullMQ background jobs (Redis) for receipt queues",
        "Shared Package - Zod schemas shared between API and frontends",
    ]:
        pdf.bullet(item)

    # --- 2 Theoretical Foundation ---
    pdf.section_title("2. Theoretical Foundation & Vision")
    pdf.body(
        "Traditional retail separates browsing, fitting, payment, and exit into distinct queues. SeamLine "
        "reimagines this for fashion by letting customers build their bag on their own phone while staff "
        "focus on styling advice and counter settlement rather than scanning every item."
    )
    pdf.sub_title("Core concepts")
    concepts = [
        ("Variant-as-SKU", "Each size/color combination is a distinct product row with its own barcode, price, and stock count."),
        ("Session-based visit", "A 60-minute customer session ties cart, reservations, and checkout together."),
        ("Stock ledger", "All inventory changes flow through an append-only ledger (INITIAL, SALE, REFUND, ADJUSTMENT)."),
        ("Reservation holds", "Cart items and unpaid orders reserve stock for up to 45 minutes to prevent overselling."),
        ("Counter token queue", "Pay-at-counter customers receive a numeric token; cashiers pull orders by token."),
        ("Exit gate JWT", "After payment, a one-time QR pass prevents walkouts without settlement."),
        ("Style grouping", "Products share a style code; customers pick size/color in a variant picker modal."),
    ]
    pdf.table_row(["Concept", "Meaning"], bold=True)
    for c, m in concepts:
        pdf.table_row([c, m])

    # --- 3 Industry Gaps ---
    pdf.section_title("3. Industry Gaps in Apparel Retail (2025-2026)")
    gaps = [
        ("Variant-heavy inventory", "One style x multiple sizes and colors creates thousands of SKUs."),
        ("Matrix stock visibility", "Selling out of M/Black while L/Navy sits on shelf is invisible without per-variant tracking."),
        ("Returns & exchanges", "25-40% return rates require fast refunds with stock restoration."),
        ("Seasonal markdowns", "Collections turn every 12-16 weeks; manual price changes cause errors."),
        ("Omnichannel drift", "Online and in-store stock must share one ledger."),
        ("Self-checkout for fashion", "Customers expect to scan hang-tags, filter by size, pay at counter or online."),
        ("Low-stock per variant", "Reorder triggers must fire at size/color level."),
        ("Merchandising analytics", "Reports need breakdown by department, style, color, and size."),
    ]
    pdf.table_row(["Gap", "Why it matters"], bold=True)
    for g, why in gaps:
        pdf.table_row([g, why])

    # --- 4 Solutions ---
    pdf.add_page()
    pdf.section_title("4. How SeamLine Addresses These Gaps")
    solutions = [
        ("Style-color-size SKU model", "Each variant: style code, size, color, brand, season, auto SKU, unique barcode."),
        ("Variant inventory matrix", "Admin filters by size/color; low-stock alerts below reorder level."),
        ("Stock ledger & reservations", "Cart holds and unpaid orders reserve stock 45 min; sales commit atomically."),
        ("Self-checkout + counter pay", "Customer builds bag on phone; pays at counter with token or online via Razorpay."),
        ("Promotions per SKU", "Percentage discounts on individual variants for clearance."),
        ("Returns with restock", "Manager refunds paid orders; inventory restored via REFUND ledger entry."),
        ("Exit gate security", "One-time QR pass prevents replay walkouts."),
        ("Merchandising dashboard", "Revenue, margin, category mix, top demand styles, stock health."),
    ]
    pdf.table_row(["Capability", "SeamLine approach"], bold=True)
    for cap, how in solutions:
        pdf.table_row([cap, how])

    # --- 5 Components ---
    pdf.section_title("5. System Components & URLs")
    pdf.body(
        "Production runs on three Hugging Face Spaces. The API is hosted on the main SeamLine Space "
        "and proxied at /checkout-api; admin and cashier Spaces call that API."
    )
    pdf.table_row(["Component", "Production URL"], bold=True, widths=[48, 132])
    comps = [
        ("Customer shop", f"{CUSTOMER_URL}/shop (?store=BLR001 for multi-store)"),
        ("Admin sign-in", f"{ADMIN_URL}/admin"),
        ("Admin dashboard", f"{ADMIN_URL}/admin/dashboard"),
        ("Cashier counter", f"{CASHIER_URL}/"),
        ("Exit gate scanner", f"{CASHIER_URL}/gate"),
        ("API (health)", f"{API_URL}/health"),
    ]
    for c, u in comps:
        pdf.table_row([c, u], widths=[48, 132])
    pdf.body(
        "Local development (optional): customer :3001, admin :3002, cashier :3003, API :4000 — "
        "run npm run dev from the monorepo root."
    )

    # --- 6 Tech stack ---
    pdf.section_title("6. Technology Stack & Repository Layout")
    pdf.body("Monorepo structure (TypeScript / Node.js 20+):")
    for line in [
        "apps/customer-web - Next.js customer self-checkout",
        "apps/admin-web - Next.js staff/manager dashboard",
        "apps/cashier-web - Next.js in-store cashier terminal",
        "services/api - Express + PostgreSQL (Supabase pooler)",
        "services/worker - Optional BullMQ jobs (Redis)",
        "packages/shared - Zod schemas, apparel constants",
        "supabase/migrations - SQL schema (run once in Supabase)",
    ]:
        pdf.bullet(line)
    pdf.sub_title("Key technologies")
    for t in [
        "Frontend: Next.js, React, CSS custom properties (Outfit/Syne typography)",
        "Backend: Express, pg (node-postgres), JWT auth, CORS",
        "Database: PostgreSQL via Supabase (products, orders, stock_movements, stock_reservations)",
        "Storage: Supabase Storage or local uploads/ for product images",
        "Payments: Razorpay webhook hook (online pay - integration placeholder in UI)",
        "Barcode/QR: Browser camera APIs (BarcodeDetector / html5-qrcode)",
    ]:
        pdf.bullet(t)

    # --- 7 Database ---
    pdf.section_title("7. Database Schema")
    pdf.body("Core tables (from supabase/migrations):")
    tables = [
        ("stores", "Multi-store support (code, name) - BLR001, DEL001, MUM001"),
        ("products", "Flat SKU rows: barcode, sku, name, category, style_code, size, color, brand, season, gender, prices, stock, demand_score, image_url"),
        ("customer_sessions", "Visit sessions (60 min expiry), optional customer_phone for recovery"),
        ("carts / cart_items", "Session cart with line totals and tax"),
        ("orders", "Checkout orders: payment_mode, payment_status, token_number, totals, receipt contact"),
        ("order_lines", "Snapshot of line items at checkout time"),
        ("stock_movements", "Ledger: delta, qty_after, reason (INITIAL/SALE/REFUND/ADJUSTMENT), actor, note"),
        ("stock_reservations", "Holds on inventory for sessions and unpaid orders (45 min)"),
        ("product_discounts", "Per-SKU percentage markdowns"),
        ("audit_log", "Manager security trail (void, refund, stock changes)"),
        ("gate_passes", "Exit QR verification and replay prevention"),
    ]
    pdf.table_row(["Table", "Purpose"], bold=True)
    for tbl, purpose in tables:
        pdf.table_row([tbl, purpose])

    # --- 8 API ---
    pdf.add_page()
    pdf.section_title("8. API Reference")
    pdf.body(f"All routes served from {API_URL}. Auth: JWT Bearer for admin; CASHIER_API_KEY header for cashier.")
    endpoints = [
        ("GET /health", "Public", "API and database health check"),
        ("POST /v1/customer/session", "Public", "Start or recover session (storeCode, customerPhone)"),
        ("GET /v1/customer/session/latest", "Public", "Recover latest session by phone"),
        ("GET /v1/customer/products", "Public", "Search/browse catalogue (?q=)"),
        ("GET /v1/customer/recommendations", "Public", "High-demand / trending products"),
        ("POST /v1/customer/cart/items", "Public", "Add item by barcode to session cart"),
        ("PATCH /v1/customer/cart/items", "Public", "Set line quantity (0 = remove)"),
        ("GET /v1/customer/cart/:sessionId", "Public", "Fetch cart totals and loyalty discount"),
        ("POST /v1/customer/checkout", "Public", "Create order (COUNTER or ONLINE); reserves stock"),
        ("GET /v1/customer/orders/:orderId", "Public", "Order status (paid flag)"),
        ("GET /v1/customer/orders/:orderId/receipt", "Public", "Paid receipt (after settlement)"),
        ("GET /v1/customer/orders/:orderId/exit-pass", "Public", "Exit gate QR (paid orders only)"),
        ("POST /v1/admin/auth/login", "Public", "Staff/manager login; returns JWT"),
        ("GET /v1/admin/metrics", "Staff JWT", "KPIs (?storeCode= filter)"),
        ("GET /v1/admin/products", "Staff JWT", "Full variant catalogue with economics"),
        ("POST /v1/admin/products", "Staff JWT", "Add new SKU variant"),
        ("PATCH /v1/admin/products/:id/inventory", "Staff JWT", "Set stock on hand (writes ledger)"),
        ("PATCH /v1/admin/products/:id/image", "Staff JWT", "Update product image URL"),
        ("POST /v1/admin/upload/product-image", "Staff JWT", "Upload image (dataUrl) to storage"),
        ("GET /v1/admin/inventory/movements", "Staff JWT", "Stock ledger history"),
        ("GET/POST/DELETE /v1/admin/discounts", "Staff JWT", "List, apply, remove promotions"),
        ("GET /v1/admin/orders", "Staff JWT", "Recent orders list"),
        ("POST /v1/admin/orders/:id/void", "Manager JWT", "Void unpaid order; release reservation"),
        ("POST /v1/admin/orders/:id/refund", "Manager JWT", "Refund paid order; restore stock"),
        ("GET /v1/admin/orders/:id/receipt", "Staff JWT", "View order receipt"),
        ("POST /v1/admin/orders/:id/receipt-send", "Staff JWT", "Queue receipt email/SMS webhook"),
        ("GET /v1/admin/export/products.csv", "Staff JWT", "Export full catalogue CSV"),
        ("GET /v1/admin/export/orders.csv", "Manager JWT", "Export order history CSV"),
        ("GET /v1/admin/audit", "Manager JWT", "Security audit log"),
        ("GET /v1/cashier/pending", "Cashier key", "Unpaid counter orders queue"),
        ("GET /v1/cashier/stats/today", "Cashier key", "Today's paid count, pending, revenue"),
        ("GET /v1/cashier/orders/:orderId", "Cashier key", "Lookup order by UUID"),
        ("GET /v1/cashier/orders/by-token/:token", "Cashier key", "Lookup order by counter token"),
        ("POST /v1/cashier/orders/:id/settle", "Cashier key", "Mark paid; commit SALE to ledger"),
        ("POST /v1/gate/verify", "Public", "Verify exit QR JWT; one-time use"),
        ("POST /v1/payments/razorpay/webhook", "Webhook", "Online payment confirmation"),
    ]
    pdf.table_row(["Endpoint", "Auth", "Description"], bold=True, widths=[56, 26, 98])
    for ep, auth, desc in endpoints:
        pdf.table_row([ep, auth, desc], widths=[56, 26, 98])

    # --- 9 Roles ---
    pdf.section_title("9. Roles, Access & Authentication")
    pdf.table_row(["Role", "Login (dev defaults)", "Capabilities"], bold=True, widths=[36, 44, 100])
    roles = [
        ("Customer", "No login", "Shop, scan, bag, checkout, receipt, exit pass"),
        ("Staff", "admin / admin123", "Add variants, adjust stock, discounts, view orders, products CSV"),
        ("Manager", "manager / manager123", "All staff + void, refund, audit log, orders CSV"),
        ("Cashier", "CASHIER_API_KEY env", "Settle tokens, pending queue, gate verify (no admin login)"),
    ]
    for r, login, cap in roles:
        pdf.table_row([r, login, cap], widths=[36, 44, 100])

    # --- 10 Process flow ---
    pdf.add_page()
    pdf.section_title("10. End-to-End Process Flow")
    flowchart_path = Path(__file__).parent / "data_flowchart.png"
    generate_flowchart(str(flowchart_path))
    pdf.image(str(flowchart_path), x=35, w=140)
    pdf.ln(6)
    pdf.sub_title("Step-by-step lifecycle")
    steps = [
        f"Customer opens {CUSTOMER_URL}/shop?store=CODE - API creates 60-min session; cart syncs to server.",
        "Customer scans hang-tag barcodes or browses catalogue - items added; stock reserved in session.",
        "Customer reviews bag (/shop/cart) - adjust quantities; loyalty discount applied if phone on file.",
        "Customer checks out (/shop/checkout) - chooses Pay at Counter or Pay Online.",
        "Counter path: order created with token number; stock reserved 45 min; cart cleared.",
        "Customer shows token at cashier - cashier looks up, verifies lines, records payment.",
        "Settlement: order marked paid; SALE entries decrement stock; receipt available on customer phone.",
        "Customer downloads receipt, requests exit pass - shows QR at gate; security scans once.",
        "Online path (roadmap): Razorpay webhook marks paid; same receipt and exit flow.",
        "Returns: manager refunds in Admin - REFUND restores stock; void releases unpaid reservations.",
    ]
    for i, s in enumerate(steps, 1):
        pdf.bullet(f"{i}. {s}")

    # --- 11 Merchandising ---
    pdf.section_title("11. Merchandising Workflow (Admin Setup)")
    for title, text in [
        ("Define the style", "Choose style code (OXF-2026), brand, category, season, gender for each design."),
        ("Create SKU per size/color", "Each variant: unique barcode, size, color, cost, list price, tax %, opening stock, image. SKU = STYLE-COLOR-SIZE."),
        ("Receive stock", "Use Set Stock in Admin; ledger records INITIAL or ADJUSTMENT with actor and note."),
        ("Monitor variant health", "Filter by size/color; low-stock view; reserved column shows cart holds."),
        ("Run promotions", "Apply % discount per variant; effective shelf price updates on customer shop instantly."),
        ("Print hang tags", "Print Tag button generates printable barcode label with size, color, price."),
    ]:
        pdf.sub_title(title)
        pdf.body(text)

    # --- 12 Customer workflow ---
    pdf.section_title("12. Customer Self-Checkout Workflow")
    for i, s in enumerate([
        f"Open shop at {CUSTOMER_URL}/shop?store=BLR001. Session auto-starts (60 min). Status chip shows Ready/Connecting/Offline.",
        "Optional: enter phone in visit recovery panel; Find visit reconnects cart on same device.",
        "Browse home: filter by category chips and size chips; Trending now rail; tap product for details.",
        "Scan (/shop/scan): camera reads barcode; or type digits manually with quantity stepper.",
        "Search (/shop/search): type-ahead suggestions; popular picks; open preview modal.",
        "Add to bag from card, rail, or modal; out-of-stock shows ribbon; sale shows discount ribbon.",
        "Bag strip on home shows item count; Review bag link; Restore saved bag from local backup.",
        "Cart page: +/- quantity, Remove line, view subtotal/tax/loyalty/total; Checkout button.",
        "Checkout: review bill; optional receipt email; Pay at Counter (active) or Pay Online (coming soon).",
        "Counter: queue number displayed; copy buttons; polls until cashier settles; receipt screen.",
        "Receipt: Download receipt HTML; Continue to exit gate for one-time QR.",
        "Exit: show QR at gate; Done starts new visit.",
    ], 1):
        pdf.bullet(f"Step {i}: {s}")

    # --- 13 Customer UI Reference ---
    pdf.add_page()
    pdf.section_title("13. Customer Shop - Complete UI Reference")
    pdf.body("Every interactive element in apps/customer-web. Base path: /shop")
    pdf.table_row(["Screen / Area", "Element", "What it does"], bold=True, widths=[48, 52, 80])

    customer_ui = [
        ("Global header", "SeamLine brand link", "Navigate to shop home (/shop)"),
        ("Global header", "Scan pill link", "Go to barcode scan page (/shop/scan)"),
        ("Global header", "Browse pill link", "Go to search/browse page (/shop/search)"),
        ("Global header", "Bag icon link", "Open cart (/shop/cart); badge shows item count"),
        ("Global header", "Back arrow (sub-pages)", "Checkout -> cart; others -> home"),
        ("Global footer", "Help button", "Opens help dialog: scan tips, browse, counter pay, tax note"),
        ("Global footer", "Close (help dialog)", "Dismiss help panel; Escape key also closes"),
        ("Home /shop", "Status chip", "Connecting / Ready / Offline session state"),
        ("Home", "Scan barcode quick link", "Navigate to scan (disabled until session ready)"),
        ("Home", "Search products quick link", "Navigate to browse (disabled until session ready)"),
        ("Home", "Bag strip - Review bag", "Link to cart when items in bag"),
        ("Home", "Bag strip - Restore saved bag", "Reload cart from localStorage backup via API"),
        ("Home", "Visit recovery panel", "Expandable: phone input saves to device; Find visit recovers session"),
        ("Home", "Try again button", "Retry session creation after connection error"),
        ("Home", "Retry button (catalog)", "Reload products after API unavailable"),
        ("Home", "Category chips", "Filter catalogue grid by department (Men's Wear, etc.)"),
        ("Home", "Size chips", "Filter catalogue by size (S, M, L, 32, etc.)"),
        ("Home", "Product card image/title", "Opens ProductPreviewModal with variant picker"),
        ("Home", "Product card qty -/+", "Set quantity before Add (1-99)"),
        ("Home", "Product card Add", "POST barcode to cart API; reserves stock"),
        ("Home", "Trending rail arrows", "Scroll high-demand products horizontally"),
        ("Scan /shop/scan", "Open camera / Scan another", "Toggle barcode camera scanner"),
        ("Scan", "Camera scanner", "Auto-add on decode; closes camera after each scan"),
        ("Scan", "Manual barcode input", "Type digits; Enter or Add to bag submits"),
        ("Scan", "Quantity stepper -/+", "Quantity for manual add (1-99)"),
        ("Scan", "Add to bag", "Add entered barcode with selected qty"),
        ("Scan", "Open your bag link", "Navigate to cart page"),
        ("Browse /shop/search", "Search input", "Debounced type-ahead; arrow keys navigate suggestions"),
        ("Browse", "Suggestion row click", "Opens ProductPreviewModal for that product"),
        ("Browse", "Popular right now row", "Opens preview when search field empty"),
        ("ProductPreviewModal", "Backdrop / X close", "Dismiss modal; Escape closes"),
        ("ProductPreviewModal", "Color chips", "Switch variant within same style code"),
        ("ProductPreviewModal", "Size chips", "Switch size; updates price/stock/barcode"),
        ("ProductPreviewModal", "Qty -/+ and Add to bag", "Add selected variant to session cart"),
        ("Cart /shop/cart", "Qty stepper per line", "PATCH cart quantity via API"),
        ("Cart", "Remove", "Set line quantity to 0"),
        ("Cart", "Continue shopping", "Link to home (empty cart state)"),
        ("Cart", "Checkout button", "Navigate to checkout (/shop/checkout)"),
        ("Checkout", "Email receipt input", "Optional; sent after cashier confirms if configured"),
        ("Checkout", "Pay online button", "Disabled - Razorpay coming soon"),
        ("Checkout", "Pay at counter", "Creates order; shows queue token; clears cart"),
        ("Checkout (token)", "Copy queue #", "Copies token to clipboard"),
        ("Checkout (paid)", "Download receipt", "Downloads HTML receipt file"),
        ("Checkout (paid)", "Continue to exit gate", "Fetches exit-pass QR image"),
        ("Checkout (exit)", "Done - shop again", "Clears session; returns to home for new visit"),
    ]
    for row in customer_ui:
        pdf.ui_row(*row)

    # --- 14 Cashier workflow ---
    pdf.add_page()
    pdf.section_title("14. Cashier Counter Workflow")
    for s in [
        f"Cashier opens {CASHIER_URL} (CASHIER_API_KEY configured on the API Space if routes are protected).",
        "Stats row shows paid today, awaiting pay count, revenue today (auto-refreshes every 15s).",
        "Pending queue chips list unpaid counter orders - click to look up by token.",
        "Enter order UUID or token # in lookup field; USB scanner can type + Enter.",
        "Review line items, subtotal, tax, total due in receipt panel.",
        "Record payment at counter - marks paid, commits SALE to stock ledger.",
        "Customer phone auto-polls payment status and shows receipt when settled.",
        "Navigate to Exit gate scanner for post-payment QR verification.",
    ]:
        pdf.bullet(s)

    # --- 15 Cashier UI ---
    pdf.section_title("15. Cashier & Exit Gate - UI Reference")
    pdf.table_row(["Screen", "Element", "What it does"], bold=True, widths=[48, 52, 80])
    cashier_ui = [
        ("Counter /", "Exit gate scanner link", "Navigate to /gate exit verification page"),
        ("Counter", "Stat pills", "Paid today, Awaiting pay, Revenue today from API"),
        ("Counter", "Queue chip buttons", "Click pending order to look up by token or order ID"),
        ("Counter", "Order lookup input", "Enter UUID or numeric token; Enter key triggers lookup"),
        ("Counter", "Look up button", "Fetch order from cashier API"),
        ("Counter", "Recent chips", "Re-load previously looked-up orders (localStorage)"),
        ("Counter", "New lookup", "Clear current order; start fresh lookup"),
        ("Counter", "Copy order ID / Copy token", "Clipboard copy with toast feedback"),
        ("Counter", "Print / PDF", "Browser print dialog for receipt panel"),
        ("Counter", "Record payment at counter", "POST settle; marks paid; updates queue"),
        ("Gate /gate", "Back to counter link", "Return to cashier home"),
        ("Gate", "QR camera scanner", "Auto-verify decoded exit JWT via API"),
        ("Gate", "Turn camera on", "Re-enable camera after successful scan"),
        ("Gate", "Manual token textarea", "Paste JWT from QR decode for verification"),
        ("Gate", "Verify token button", "POST /v1/gate/verify; shows pass/fail"),
        ("Gate (success)", "Scan next customer", "Reset for next exit verification"),
    ]
    for row in cashier_ui:
        pdf.ui_row(*row)

    # --- 16 Admin nav ---
    pdf.add_page()
    pdf.section_title("16. Admin HQ - Navigation & Sidebar")
    pdf.body(f"URL: {ADMIN_URL}/admin/dashboard after login at {ADMIN_URL}/admin")
    pdf.table_row(["Element", "Location", "What it does"], bold=True, widths=[44, 44, 92])
    admin_nav = [
        ("Sign in button", "Login page", "POST credentials; stores JWT; redirects to dashboard"),
        ("Mobile Menu toggle", "Top bar (mobile)", "Open/close collapsible sidebar"),
        ("Overview nav", "Sidebar", "KPIs, category breakdown, stock health, top demand"),
        ("Inventory nav", "Sidebar", "Add product form + variant table + stock ledger"),
        ("Orders nav", "Sidebar", "Recent orders table with actions"),
        ("Promotions nav", "Sidebar", "Apply/remove per-SKU discounts"),
        ("Audit log nav", "Sidebar (manager)", "Security event history"),
        ("Active Register select", "Sidebar", "Filter metrics/orders: All, BLR001, DEL001, MUM001"),
        ("Refresh button", "Sidebar footer", "Reload products, metrics, discounts, orders"),
        ("Log out button", "Sidebar footer", "Clear JWT; return to login"),
        ("Products CSV", "Header (inventory)", "Download full catalogue export"),
        ("Orders CSV", "Header (orders, manager)", "Download order history export"),
    ]
    for el, loc, act in admin_nav:
        pdf.table_row([el, loc, act], widths=[44, 44, 92])

    # --- 17 Overview ---
    pdf.section_title("17. Admin Overview Section")
    pdf.body("Read-only KPI cards and analysis tables (no action buttons except implicit navigation):")
    for item in [
        "Paid orders, Net revenue, Open orders, Average order value metric cards",
        "Revenue mix bar: paid vs pending order value share",
        "Inventory value at cost and at list price",
        "Low-stock SKU count, Active promotions count",
        "Stock health breakdown: in-stock / low / out counts",
        "Category breakdown table: SKU count, units on hand, list value by department",
        "Top demand styles: highest demand_score variants",
        "Margin at sale: aggregate profit potential on hand at promotional prices",
        "Order insights: counter vs online paid split, last 24h activity",
    ]:
        pdf.bullet(item)

    # --- 18 Inventory UI ---
    pdf.section_title("18. Admin Inventory Section - UI Reference")
    pdf.sub_title("Add product form")
    pdf.table_row(["Field / Button", "Section", "What it does"], bold=True, widths=[44, 44, 92])
    inv_form = [
        ("Barcode input", "Add product", "EAN/UPC/internal code; conflict warning if duplicate"),
        ("Generate button", "Add product", "Auto-generate unique 12-digit barcode"),
        ("Scan button", "Add product", "Toggle camera barcode scanner"),
        ("Product name", "Add product", "Display name e.g. Slim Fit Oxford Shirt"),
        ("Style code", "Add product", "Groups variants e.g. OXF-2026"),
        ("Brand / Category / Size / Color", "Add product", "Apparel attributes; SKU auto-built"),
        ("Gender / Season selects", "Add product", "Unisex/Men/Women/Kids; SS26/AW26/Core/Clearance"),
        ("Image URL / Upload file", "Add product", "Product photo for customer shop"),
        ("Unit cost / List price", "Add product", "Auto-calculates margin % and markup %"),
        ("Margin % / Markup % inputs", "Add product", "Bidirectional price calculator"),
        ("Tax % / Quantity on hand", "Add product", "Tax rate and opening stock"),
        ("Reorder alert / Demand score", "Add product", "Low-stock threshold; shop featuring weight"),
        ("Save product", "Add product", "POST new variant to API; writes INITIAL ledger"),
        ("Clear form", "Add product", "Reset all fields"),
    ]
    for row in inv_form:
        pdf.table_row(row, widths=[44, 44, 92])

    pdf.sub_title("Inventory table & actions")
    inv_table = [
        ("Search filter", "Toolbar", "Text filter across name, SKU, barcode, style, brand"),
        ("Size / Color filter selects", "Toolbar", "Matrix filter by variant attributes"),
        ("Clear search", "Toolbar", "Reset text filter"),
        ("Low stock only toggle", "Toolbar", "Show variants below reorder level only"),
        ("Set stock", "Row action", "Opens StockAdjustModal to set on-hand qty"),
        ("Image", "Row action", "Upload/replace product image for existing SKU"),
        ("Print Tag", "Row action", "Opens hang-tag modal with Code39 barcode; Print button"),
        ("Stock ledger table", "Below inventory", "Read-only recent movements (sale, refund, adjust)"),
    ]
    for el, loc, act in inv_table:
        pdf.table_row([el, loc, act], widths=[44, 44, 92])

    pdf.sub_title("StockAdjustModal buttons")
    for el, act in [
        ("New quantity input", "Target absolute on-hand count"),
        ("-10 / -1 / +1 / +10", "Quick adjust buttons"),
        ("Cancel", "Close without saving"),
        ("Save stock", "PATCH inventory; writes ADJUSTMENT ledger entry"),
    ]:
        pdf.table_row([el, "Stock modal", act], widths=[44, 44, 92])

    # --- 19 Orders, promo, audit ---
    pdf.add_page()
    pdf.section_title("19. Admin Orders, Promotions & Audit")
    pdf.sub_title("Orders table actions")
    for el, act in [
        ("View receipt", "Opens OrderReceiptModal for paid orders"),
        ("Void (manager)", "Cancel unpaid order; releases stock reservation"),
        ("Refund (manager)", "Refund paid order; REFUND ledger restores stock"),
        ("Send (manager)", "Prompt for email/phone; queue receipt webhook"),
    ]:
        pdf.table_row([el, "Orders row", act], widths=[44, 44, 92])

    pdf.sub_title("Promotions section")
    for el, act in [
        ("Product select", "Choose variant for markdown"),
        ("Discount % input", "1-90% off list price"),
        ("Apply button", "POST discount; updates effective shelf price on shop"),
        ("Remove button (per row)", "DELETE discount; reverts to list price"),
    ]:
        pdf.table_row([el, "Promotions", act], widths=[44, 44, 92])

    pdf.sub_title("Audit log (manager only)")
    pdf.body("Read-only table: timestamp, actor, role, action code, detail text. Populated by void, refund, stock changes.")

    # --- 20 Returns ---
    pdf.section_title("20. Returns, Refunds & Void Orders")
    pdf.bullet("Void: Manager only. Unpaid counter orders. Releases 45-min stock reservation. Order marked voided.")
    pdf.bullet("Refund: Manager only. Paid orders. Stock restored via REFUND ledger. Order marked refunded.")
    pdf.bullet("Resend receipt: Manager can trigger email/SMS webhook for lost receipts.")
    pdf.body("Roadmap: size-for-size exchanges without full refund + new sale.")

    # --- 21 Stock ledger ---
    pdf.section_title("21. Stock Ledger & Reservations")
    pdf.table_row(["Event", "Ledger reason / behavior"], bold=True)
    events = [
        ("New variant with opening stock", "INITIAL"),
        ("Customer adds to cart", "Reservation (session hold until expiry)"),
        ("Checkout without payment", "Reservation (order hold, 45 minutes)"),
        ("Cashier settles / online webhook", "SALE (stock decremented atomically)"),
        ("Manager refund", "REFUND (stock restored)"),
        ("Manual Set stock in admin", "ADJUSTMENT or CORRECTION"),
        ("Expired reservation cleanup", "Auto-release reserved units back to available"),
    ]
    for e, r in events:
        pdf.table_row([e, r])

    # --- 22 Loyalty ---
    pdf.section_title("22. Loyalty Circle & Offline Resilience")
    pdf.sub_title("Loyalty Circle (visit phone)")
    pdf.body(
        "When customer saves a 10+ digit phone: Bronze tier (registered), Silver (5% off), Gold (10% off). "
        "Discount applies to apparel subtotal pre-tax. Badge shown on shop home."
    )
    pdf.sub_title("Offline / resilience features")
    for f in [
        "Cart backup in localStorage - Restore saved bag on home page",
        "Offline cart queue - scans queued when API briefly unavailable, flushed on reconnect",
        "Session recovery by phone - GET /v1/customer/session/latest",
        "Catalog fallback via Supabase direct read when API catalog endpoint fails",
    ]:
        pdf.bullet(f)

    # --- 23 Reporting ---
    pdf.section_title("23. Reporting & Analytics")
    for r in [
        "Revenue, paid vs open orders, average order value",
        "Inventory value at cost and at list price",
        "Low-stock variant count and reserved units in open carts",
        "Category breakdown - units and value by department",
        "Top demand styles (demand_score driven featuring on home page)",
        "Margin per unit at list and promotional price",
        "CSV export: full variant catalogue (staff) and order history (manager)",
        "Cashier today stats: paid count, pending count, revenue",
    ]:
        pdf.bullet(r)

    # --- 24 Deployment ---
    pdf.add_page()
    pdf.section_title("24. Deployment & Environment")
    pdf.sub_title("Production (Hugging Face Spaces)")
    pdf.table_row(["Space", "URL", "Purpose"], bold=True, widths=[36, 72, 72])
    for space, url, purpose in [
        ("Customer", CUSTOMER_URL, "Shop at /shop; API at /checkout-api"),
        ("Admin", ADMIN_URL, "HQ dashboard at /admin"),
        ("Cashier", CASHIER_URL, "Counter + exit gate at /gate"),
    ]:
        pdf.table_row([space, url, purpose], widths=[36, 72, 72])
    pdf.body(
        "Admin and Cashier Spaces call the API on the main Customer Space "
        f"({API_URL}). Set PUBLIC_API_URL to that value on the API host."
    )
    pdf.sub_title("Alternative hosts (local / Vercel)")
    pdf.table_row(["Component", "Host"], bold=True, widths=[50, 130])
    for c, h in [
        ("Local dev", "npm run dev — customer :3001, admin :3002, cashier :3003, API :4000"),
        ("Vercel frontends", "One project per app; same repo, set NEXT_PUBLIC_API_BASE_URL"),
        ("Postgres", "Supabase managed"),
        ("worker (optional)", "Render/Railway + Redis"),
    ]:
        pdf.table_row([c, h], widths=[50, 130])

    pdf.sub_title("Key environment variables (API Space)")
    pdf.table_row(["Variable", "Description"], bold=True, widths=[52, 128])
    for var, note in [
        ("DATABASE_URL", "Supabase pooler URI (port 6543)"),
        ("JWT_SECRET", "Admin JWT signing secret"),
        ("ADMIN_USERNAME", "Staff login username"),
        ("ADMIN_PASSWORD", "Staff login password"),
        ("MANAGER_USERNAME", "Manager login username"),
        ("MANAGER_PASSWORD", "Manager login password"),
        ("CASHIER_API_KEY", "Protects /v1/cashier/* routes"),
        ("PUBLIC_API_URL", f"Public API origin e.g. {API_URL}"),
        ("REDIS_URL", "Optional - background worker"),
    ]:
        pdf.table_row([var, note], widths=[52, 128])

    pdf.sub_title("Frontend env (Admin & Cashier Spaces)")
    pdf.body(f"NEXT_PUBLIC_API_BASE_URL={API_URL}")
    pdf.body("Cashier only: NEXT_PUBLIC_CASHIER_API_KEY (same value as API CASHIER_API_KEY)")

    pdf.sub_title("Apparel categories supported")
    for c in [
        "Men's Wear, Women's Wear, Kids & Baby, Unisex",
        "Footwear, Accessories, Bags & Luggage",
        "Activewear, Ethnic & Traditional",
        "Innerwear & Loungewear, Winterwear",
        "Merchandise & Gifts",
    ]:
        pdf.bullet(c)

    # --- 25 Summary ---
    pdf.section_title("25. Summary")
    pdf.body(
        "SeamLine transforms a generic checkout engine into an apparel-aware retail platform. By treating every "
        "size/color as a tracked SKU with style grouping, real-time reservations, variant-level low-stock alerts, "
        "counter token settlement, and exit-gate verification, it closes the biggest operational gaps clothing "
        "retailers face when adopting self-checkout."
    )
    pdf.body(
        "This document covers the complete system from theoretical foundation through technical architecture, "
        "database and API reference, operational workflows, and every button and link in the customer shop, "
        "admin dashboard, and cashier terminal - ready for store teams, developers, and stakeholders."
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(OUT))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
