-- ============================================================================
-- BOS Template Seeds
-- ============================================================================

insert into public.templates (key, name, description, icon, config) values

-- ─── Sari-Sari Store ─────────────────────────────────────────────────────────
('sari_sari', 'Sari-Sari Store', 'Complete management for sari-sari and convenience stores', 'Store',
'{
  "modules": ["inventory", "sales", "customers", "reports", "notifications"],
  "dashboard_widgets": [
    {"id": "daily_revenue", "type": "revenue_today", "title": "Today''s Revenue", "size": "md", "order": 1},
    {"id": "total_transactions", "type": "transactions_today", "title": "Transactions Today", "size": "sm", "order": 2},
    {"id": "low_stock_alert", "type": "low_stock", "title": "Low Stock Alerts", "size": "md", "order": 3},
    {"id": "outstanding_balances", "type": "outstanding_balance", "title": "Outstanding Balances", "size": "sm", "order": 4},
    {"id": "sales_chart", "type": "sales_trend", "title": "Sales (Last 7 Days)", "size": "xl", "order": 5},
    {"id": "top_products", "type": "top_products", "title": "Top Selling Products", "size": "lg", "order": 6}
  ],
  "navigation": [
    {"key": "dashboard", "label": "Dashboard", "href": "/dashboard", "icon": "LayoutDashboard"},
    {"key": "sales", "label": "Sales / POS", "href": "/sales/new", "icon": "ShoppingCart", "module": "sales"},
    {"key": "sales_history", "label": "Sales History", "href": "/sales/history", "icon": "Receipt", "module": "sales"},
    {"key": "inventory", "label": "Inventory", "href": "/inventory/products", "icon": "Package", "module": "inventory"},
    {"key": "customers", "label": "Customers", "href": "/customers", "icon": "Users", "module": "customers"},
    {"key": "reports", "label": "Reports", "href": "/reports", "icon": "BarChart2", "module": "reports"},
    {"key": "notifications", "label": "Notifications", "href": "/notifications", "icon": "Bell", "module": "notifications"},
    {"key": "settings", "label": "Settings", "href": "/settings", "icon": "Settings"}
  ],
  "settings": {
    "currency": "PHP",
    "tax_enabled": false,
    "credit_sales_enabled": true
  }
}'::jsonb),

-- ─── Laundry Shop ────────────────────────────────────────────────────────────
('laundry', 'Laundry Shop', 'Order tracking and revenue management for laundry shops', 'WashingMachine',
'{
  "modules": ["laundry_services", "laundry_orders", "customers", "reports", "notifications"],
  "dashboard_widgets": [
    {"id": "daily_revenue", "type": "revenue_today", "title": "Today''s Revenue", "size": "md", "order": 1},
    {"id": "active_orders", "type": "laundry_queue", "title": "Active Orders", "size": "md", "order": 2},
    {"id": "orders_ready", "type": "laundry_ready", "title": "Ready for Pickup", "size": "sm", "order": 3},
    {"id": "orders_today", "type": "orders_today", "title": "Orders Today", "size": "sm", "order": 4},
    {"id": "revenue_chart", "type": "sales_trend", "title": "Revenue (Last 7 Days)", "size": "xl", "order": 5},
    {"id": "service_breakdown", "type": "service_breakdown", "title": "Service Breakdown", "size": "lg", "order": 6}
  ],
  "navigation": [
    {"key": "dashboard", "label": "Dashboard", "href": "/dashboard", "icon": "LayoutDashboard"},
    {"key": "orders_new", "label": "New Order", "href": "/laundry/orders/new", "icon": "Plus", "module": "laundry_orders"},
    {"key": "orders", "label": "Orders", "href": "/laundry/orders", "icon": "ClipboardList", "module": "laundry_orders"},
    {"key": "services", "label": "Services", "href": "/laundry/services", "icon": "Layers", "module": "laundry_services"},
    {"key": "customers", "label": "Customers", "href": "/customers", "icon": "Users", "module": "customers"},
    {"key": "reports", "label": "Reports", "href": "/reports", "icon": "BarChart2", "module": "reports"},
    {"key": "notifications", "label": "Notifications", "href": "/notifications", "icon": "Bell", "module": "notifications"},
    {"key": "settings", "label": "Settings", "href": "/settings", "icon": "Settings"}
  ],
  "settings": {
    "currency": "PHP",
    "default_unit": "kg"
  }
}'::jsonb),

-- ─── Room Rental ─────────────────────────────────────────────────────────────
('room_rental', 'Room Rental', 'Room management, tenant tracking, and billing for rental properties', 'Home',
'{
  "modules": ["rooms", "tenants", "billing", "reports", "notifications"],
  "dashboard_widgets": [
    {"id": "occupancy_rate", "type": "occupancy_rate", "title": "Occupancy Rate", "size": "md", "order": 1},
    {"id": "monthly_collection", "type": "revenue_month", "title": "This Month''s Collection", "size": "md", "order": 2},
    {"id": "overdue_bills", "type": "overdue_bills", "title": "Overdue Bills", "size": "sm", "order": 3},
    {"id": "available_rooms", "type": "available_rooms", "title": "Available Rooms", "size": "sm", "order": 4},
    {"id": "collection_chart", "type": "collection_trend", "title": "Collections (Last 6 Months)", "size": "xl", "order": 5},
    {"id": "upcoming_dues", "type": "upcoming_dues", "title": "Upcoming Due Dates", "size": "lg", "order": 6}
  ],
  "navigation": [
    {"key": "dashboard", "label": "Dashboard", "href": "/dashboard", "icon": "LayoutDashboard"},
    {"key": "rooms", "label": "Rooms", "href": "/rooms", "icon": "DoorOpen", "module": "rooms"},
    {"key": "tenants", "label": "Tenants", "href": "/tenants", "icon": "Users", "module": "tenants"},
    {"key": "billing", "label": "Billing", "href": "/billing", "icon": "CreditCard", "module": "billing"},
    {"key": "reports", "label": "Reports", "href": "/reports", "icon": "BarChart2", "module": "reports"},
    {"key": "notifications", "label": "Notifications", "href": "/notifications", "icon": "Bell", "module": "notifications"},
    {"key": "settings", "label": "Settings", "href": "/settings", "icon": "Settings"}
  ],
  "settings": {
    "currency": "PHP",
    "billing_day": 1
  }
}'::jsonb);
