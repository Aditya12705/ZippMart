#!/usr/bin/env python3
"""Generate SeamLine apparel checkout system workflow PDF."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent / "SeamLine_System_Workflow.pdf"


def ascii_safe(text: str) -> str:
    return (
        text.replace("\u2014", "-")
        .replace("\u2013", "-")
        .replace("\u2019", "'")
        .replace("\u2018", "'")
        .replace("\u2026", "...")
    )


class WorkflowPDF(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 8, "SeamLine - Apparel Checkout System Workflow", align="R")
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

    def table_row(self, cols: list[str], bold: bool = False):
        w = [55, 125]
        self.set_font("Helvetica", "B" if bold else "", 9)
        for i, col in enumerate(cols):
            self.cell(w[i], 6, ascii_safe(col)[:80], border=1)
        self.ln()


def generate_flowchart(output_path: str) -> None:
    # Create a high-resolution canvas for crisp lines/text
    # 2x scale: design at 1600x1650, resize to 800x825
    width, height = 1600, 1650
    img = Image.new("RGBA", (width, height), (255, 255, 255, 255))
    draw = ImageDraw.Draw(img)

    # Color themes matching the clean visual style of the application
    themes = {
        "blue": {
            "fill": (240, 249, 255, 255),
            "border": (186, 230, 253, 255),
            "text": (3, 105, 161, 255),
        },
        "slate": {
            "fill": (248, 250, 252, 255),
            "border": (203, 213, 225, 255),
            "text": (51, 65, 85, 255),
        },
        "green": {
            "fill": (240, 253, 244, 255),
            "border": (187, 247, 208, 255),
            "text": (22, 101, 52, 255),
        },
        "indigo": {
            "fill": (245, 243, 255, 255),
            "border": (221, 214, 254, 255),
            "text": (67, 56, 202, 255),
        },
        "amber": {
            "fill": (255, 251, 235, 255),
            "border": (253, 230, 138, 255),
            "text": (180, 83, 9, 255),
        },
        "rose": {
            "fill": (255, 241, 242, 255),
            "border": (254, 205, 211, 255),
            "text": (159, 18, 57, 255),
        },
    }

    line_color = (100, 116, 139, 255)
    line_width = 4

    # Load fonts
    try:
        font_title = ImageFont.truetype("arial.ttf", 26)
        font_sub = ImageFont.truetype("arial.ttf", 20)
        font_label = ImageFont.truetype("arial.ttf", 22)
    except IOError:
        font_title = ImageFont.load_default()
        font_sub = ImageFont.load_default()
        font_label = ImageFont.load_default()

    # Draw helper for arrowheads
    def draw_arrowhead(draw, tip, direction="down", color=line_color):
        x, y = tip
        if direction == "down":
            points = [(x, y), (x - 16, y - 24), (x + 16, y - 24)]
        elif direction == "up":
            points = [(x, y), (x - 16, y + 24), (x + 16, y + 24)]
        elif direction == "left":
            points = [(x, y), (x + 24, y - 16), (x + 24, y + 16)]
        elif direction == "right":
            points = [(x, y), (x - 24, y - 16), (x - 24, y + 16)]
        draw.polygon(points, fill=color)

    # Draw path helper
    def draw_path(draw, points, label=None, label_pos=None):
        for i in range(len(points) - 1):
            draw.line([points[i], points[i+1]], fill=line_color, width=line_width)
        
        p_prev = points[-2]
        p_last = points[-1]
        if p_last[0] > p_prev[0]:
            draw_arrowhead(draw, p_last, "right")
        elif p_last[0] < p_prev[0]:
            draw_arrowhead(draw, p_last, "left")
        elif p_last[1] > p_prev[1]:
            draw_arrowhead(draw, p_last, "down")
        elif p_last[1] < p_prev[1]:
            draw_arrowhead(draw, p_last, "up")

        if label and label_pos:
            draw.text(label_pos, label, fill=(71, 85, 105, 255), font=font_label, anchor="mm")

    # Define nodes
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

    # Draw paths
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

    # Draw nodes
    for node in nodes:
        t = themes[node["theme"]]
        x, y, w, h = node["x"], node["y"], node["w"], node["h"]
        left = x - w // 2
        top = y - h // 2
        right = x + w // 2
        bottom = y + h // 2

        draw.rounded_rectangle(
            [left, top, right, bottom],
            radius=20,
            fill=t["fill"],
            outline=t["border"],
            width=4
        )

        draw.text((x, y - 18), node["title"], fill=t["text"], font=font_title, anchor="mm")
        draw.text((x, y + 18), node["sub"], fill=(100, 116, 139, 255), font=font_sub, anchor="mm")

    img_resized = img.resize((800, 825), Image.Resampling.LANCZOS)
    img_resized.save(output_path, "PNG")


def build() -> None:
    pdf = WorkflowPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    # Cover
    pdf.set_font("Helvetica", "B", 28)
    pdf.set_text_color(15, 15, 15)
    pdf.ln(35)
    pdf.cell(0, 12, "SeamLine", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Helvetica", "", 16)
    pdf.cell(0, 10, "Apparel & Merchandising Checkout System", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(6)
    pdf.set_font("Helvetica", "", 12)
    pdf.set_text_color(60, 60, 60)
    pdf.cell(0, 8, "Complete Operational Workflow Guide", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(20)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, f"Document date: {date.today().strftime('%d %B %Y')}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.cell(0, 6, "Prepared for: Store operators, merchandising teams, and stakeholders", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.cell(0, 6, "Version: 1.0 - Apparel retail edition", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.add_page()
    pdf.section_title("1. Executive Summary")
    pdf.body(
        "SeamLine is a self-checkout and store-operations platform built specifically for clothing "
        "shops, boutiques, and merchandising retailers. It replaces generic grocery-style POS with "
        "workflows that understand size/color variants, seasonal collections, hang-tag barcodes, "
        "and the high return rates typical of fashion retail."
    )
    pdf.body(
        "The system connects four touchpoints — customer self-checkout, admin merchandising HQ, "
        "cashier counter settlement, and exit-gate verification — through a single API and inventory "
        "ledger. Every sale, refund, and stock adjustment is recorded in real time."
    )

    pdf.section_title("2. Industry Gaps in Apparel Retail (2025–2026)")
    pdf.body("Research across apparel POS guides, inventory management platforms, and fashion retail operations identifies these critical gaps:")
    gaps = [
        ("Variant-heavy inventory", "One style x multiple sizes and colors creates thousands of SKUs. Flat product catalogs fail."),
        ("Matrix stock visibility", "Selling out of M/Black while L/Navy sits on shelf is invisible without per-variant tracking."),
        ("Returns & exchanges", "25–40% return rates in apparel require fast size swaps, not full-order refunds only."),
        ("Seasonal markdowns", "Collections turn every 12–16 weeks; manual price changes cause errors."),
        ("Omnichannel drift", "Online and in-store stock must share one ledger to prevent overselling."),
        ("Self-checkout for fashion", "Customers expect to scan hang-tags, filter by size, and pay at counter or online."),
        ("Low-stock per variant", "Reorder triggers must fire at size/color level, not style level."),
        ("Merchandising analytics", "Reports need breakdown by department, style, color, and size — not just revenue."),
    ]
    pdf.table_row(["Gap", "Why it matters"], bold=True)
    for g, why in gaps:
        pdf.table_row([g, why])
    pdf.ln(4)

    pdf.section_title("3. How SeamLine Addresses These Gaps")
    solutions = [
        ("Style-color-size SKU model", "Each variant is a product row with style code, size, color, brand, season, auto-generated SKU, and unique barcode."),
        ("Variant inventory matrix", "Admin filters by size and color; low-stock alerts fire below 5 units per variant."),
        ("Stock ledger & reservations", "Cart holds and unpaid orders reserve stock for 45 minutes; sales commit atomically."),
        ("Self-checkout + counter pay", "Customer builds bag on phone; pays at counter with token or online via Razorpay."),
        ("Promotions per SKU", "Percentage discounts on individual variants for clearance and seasonal markdowns."),
        ("Returns with restock", "Manager refunds paid orders and restores inventory through the ledger."),
        ("Exit gate security", "One-time QR pass prevents walkouts without settlement."),
        ("Merchandising dashboard", "Overview shows revenue, margin, category mix, top demand styles, and stock health."),
    ]
    pdf.table_row(["Capability", "SeamLine approach"], bold=True)
    for cap, how in solutions:
        pdf.table_row([cap, how])
    pdf.ln(4)

    pdf.add_page()
    pdf.section_title("4. System Architecture")
    pdf.body("SeamLine is a TypeScript monorepo with four applications and one API:")
    arch = [
        "Customer Shop (port 3001) — Browse, scan hang-tags, filter by category/size, checkout",
        "Admin HQ (port 3002) — Catalogue variants, stock, promotions, orders, audit log",
        "Cashier Terminal (port 3003) — Settle counter orders, exit gate verification",
        "API Service (port 4000) — Express + PostgreSQL (Supabase), JWT auth, stock ledger",
        "Database — products, stock_movements, stock_reservations, orders, receipts, audit_log",
    ]
    for a in arch:
        pdf.bullet(a)

    pdf.sub_title("Data Flow Diagram")
    flowchart_path = Path(__file__).parent / "data_flowchart.png"
    generate_flowchart(str(flowchart_path))
    pdf.image(str(flowchart_path), x=35, w=140)
    pdf.ln(6)

    pdf.section_title("5. Roles & Access")
    pdf.table_row(["Role", "Access"], bold=True)
    roles = [
        ("Customer", "Self-checkout shop, session recovery by phone, receipt download"),
        ("Staff", "Add variants, adjust stock, view orders, set promotions, CSV export"),
        ("Manager", "Void unpaid orders, refund paid orders, audit log, order CSV export"),
        ("Cashier", "Settle counter tokens, view pending queue, verify exit passes"),
    ]
    for r, a in roles:
        pdf.table_row([r, a])

    pdf.add_page()
    pdf.section_title("6. Merchandising Workflow — Setting Up the Catalogue")
    pdf.sub_title("Step 1: Define the style")
    pdf.body(
        "For each design (e.g. Slim Fit Oxford Shirt), choose a style code (OXF-2026), brand, category "
        "(Men's Wear, Women's Wear, etc.), season/collection (SS26, AW26, Core, Clearance), and gender."
    )
    pdf.sub_title("Step 2: Create one SKU per size/color")
    pdf.body(
        "Each size/color combination gets its own row: unique hang-tag barcode, size (S/M/L/XL or numeric), "
        "color, cost price, list price, tax %, opening stock, and product image. SKU auto-generates as "
        "STYLE-COLOR-SIZE (e.g. OXF-2026-NAVY-M)."
    )
    pdf.sub_title("Step 3: Receive stock")
    pdf.body(
        "When shipment arrives, use Set Stock in Admin to update quantity. Every change writes to the "
        "stock ledger (INITIAL, ADJUSTMENT, CORRECTION) with actor and note for audit."
    )
    pdf.sub_title("Step 4: Monitor variant health")
    pdf.body(
        "Filter inventory by size or color. Low-stock view highlights variants below 5 units. "
        "Reserved column shows units held in active carts or unpaid orders."
    )
    pdf.sub_title("Step 5: Run promotions")
    pdf.body(
        "Apply percentage discounts to specific variants for end-of-season clearance. "
        "Effective shelf price updates instantly on the customer shop."
    )

    pdf.section_title("7. Customer Self-Checkout Workflow")
    steps = [
        "Customer opens shop URL (?store=BLR001 for multi-store). Session auto-starts (60 min).",
        "Optional: enter phone number to recover cart if they leave and return.",
        "Browse by category (Men's Wear, Footwear, Accessories, etc.) or filter by size.",
        "Scan hang-tag barcode with camera or search by name, style, color, SKU.",
        "Add items to bag; adjust quantities. Out-of-stock variants show ribbon.",
        "Proceed to checkout: choose Pay at Counter (token number) or Pay Online (Razorpay).",
        "For counter: receive token number; proceed to cashier with items.",
        "For online: complete payment; system marks order paid on webhook.",
        "Download receipt; show exit QR pass at store gate.",
    ]
    for i, s in enumerate(steps, 1):
        pdf.bullet(f"Step {i}: {s}")

    pdf.add_page()
    pdf.section_title("8. Cashier & Counter Settlement Workflow")
    pdf.body("The cashier terminal is optimized for fashion retail counter service:")
    pdf.bullet("Pending queue shows all unpaid counter orders with token numbers.")
    pdf.bullet("Lookup by token number or order UUID.")
    pdf.bullet("Review line items, totals, and customer bag.")
    pdf.bullet("Settle — marks paid, commits stock (SALE in ledger), issues receipt.")
    pdf.bullet("Customer receives receipt and exit pass.")
    pdf.sub_title("Exit gate")
    pdf.body(
        "Security scans the one-time exit QR JWT. System verifies payment, prevents replay, "
        "and logs gate passage. Anti-walkout control for high-shrink apparel categories."
    )

    pdf.section_title("9. Returns & Refunds Workflow")
    pdf.body("Fashion retail returns are handled at manager level:")
    pdf.bullet("Locate order in Admin > Orders by receipt or order ID.")
    pdf.bullet("Manager issues refund on paid order — stock restored via REFUND ledger entry.")
    pdf.bullet("Void available for unpaid/abandoned counter orders — releases reservation.")
    pdf.bullet("Resend receipt email if customer lost original.")
    pdf.body(
        "Roadmap: size-for-size exchanges without full refund + new sale (common apparel gap)."
    )

    pdf.section_title("10. Stock Ledger & Reservations")
    pdf.table_row(["Event", "Ledger reason"], bold=True)
    events = [
        ("New variant created with stock", "INITIAL"),
        ("Customer adds to cart", "Reservation (session hold)"),
        ("Checkout without payment", "Reservation (order hold, 45 min)"),
        ("Payment settled", "SALE (stock decremented)"),
        ("Refund processed", "REFUND (stock restored)"),
        ("Manual count correction", "ADJUSTMENT or CORRECTION"),
    ]
    for e, r in events:
        pdf.table_row([e, r])

    pdf.add_page()
    pdf.section_title("11. Reporting & Analytics (Admin Overview)")
    pdf.bullet("Revenue, paid vs open orders, average order value")
    pdf.bullet("Inventory value at cost and at list price")
    pdf.bullet("Low-stock variant count and reserved units")
    pdf.bullet("Category breakdown — units and value by department")
    pdf.bullet("Top demand styles (demand score driven featuring)")
    pdf.bullet("Margin per unit at list and promotional price")
    pdf.bullet("CSV export: full variant catalogue and order history (manager)")

    pdf.section_title("12. Enterprise UI & Responsive Layouts")
    pdf.body(
        "SeamLine features a modernized, enterprise-grade interface tailored for high-volume retail operations across all device types:"
    )
    ui_features = [
        "Admin Dashboard: Persistent sticky-sidebar layout for desktop, converting to a clean collapsible hamburger menu on mobile.",
        "Cashier Terminal: High-efficiency split-screen workspace separating queue/lookup controls from the active receipt/action panel.",
        "Responsive Data Grids: Complex inventory tables gracefully downgrade to card-based grid layouts on mobile to eliminate horizontal scrolling.",
        "Dark Theme Optimization: Deep, high-contrast dark palette tailored for point-of-sale environments (with configurable light themes for back-office).",
        "Unified Design System: Consistent typography (Outfit/Syne/Fraunces) and shared CSS variable tokens across Customer, Admin, and Cashier portals.",
    ]
    for f in ui_features:
        pdf.bullet(f)

    pdf.section_title("13. Apparel Categories Supported")
    cats = [
        "Men's Wear, Women's Wear, Kids & Baby, Unisex",
        "Footwear, Accessories, Bags & Luggage",
        "Activewear, Ethnic & Traditional",
        "Innerwear & Loungewear, Winterwear",
        "Merchandise & Gifts",
    ]
    for c in cats:
        pdf.bullet(c)

    pdf.section_title("14. Summary")
    pdf.body(
        "SeamLine transforms a generic checkout engine into an apparel-aware retail platform. "
        "By treating every size/color as a tracked SKU with style grouping, real-time reservations, "
        "and variant-level low-stock alerts, it closes the biggest operational gaps that clothing "
        "and merchandising shops face when adopting self-checkout."
    )
    pdf.body(
        "This document describes the complete workflow from catalogue setup through customer checkout, "
        "counter settlement, stock ledger management, and returns — ready for store teams and stakeholders."
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(OUT))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
