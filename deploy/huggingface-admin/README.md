---
title: SeamLine Admin
emoji: 📊
colorFrom: purple
colorTo: red
sdk: docker
app_port: 7860
pinned: false
---

# SeamLine Admin HQ

Staff and manager dashboard for catalogue, stock, orders, and store KPIs.

Open **/admin** to sign in.

Uses the API on the main SeamLine Space: `https://adi576-seamline.hf.space/checkout-api`

## Default logins

Set via secrets on the **main** API Space (`ADMIN_*` / `MANAGER_*`). Dev defaults if unchanged:

- Staff: `admin` / `admin123`
- Manager: `manager` / `manager123`
