"""
Knowledge Base Generator for Agentflow-AI
Generates 25+ comprehensive enterprise markdown documents in data/knowledge_base/
"""
import os

DOCUMENTS = [
    {
        "filename": "policy-042-refund-eligibility.md",
        "doc_id": "policy-042",
        "title": "Customer Refund & Order Cancellation Policy",
        "category": "Customer Service & Billing",
        "content": """## 1. Overview and Scope
This policy outlines the official terms under which customers may receive a full or partial refund on physical goods, digital licenses, and recurring enterprise service subscriptions purchased through our platform. All refund requests are subject to verification by automated order lookup or customer support agents.

## 2. Standard 30-Day Window
Customers are eligible for a full refund on standard physical merchandise within thirty (30) calendar days from the confirmed delivery date, provided the following criteria are met:
- The item is returned in its original condition with complete packaging and documentation.
- The product was not marked as "Final Sale" or "Custom Enterprise Commission" at checkout.
- Proof of purchase (such as a valid order identifier, e.g., Order #4521) is supplied.

## 3. Order Eligibility Criteria
To be classified as "eligible" under automated policy review:
- The elapsed time from the order fulfillment date must be equal to or less than 30 days (days_since_purchase <= 30).
- The order status in the commerce database must be marked as delivered, shipped, or completed.
- An order that has already been refunded or is currently marked under active fraud investigation is strictly ineligible for secondary refunds.

## 4. Digital Goods and Licenses
Software license keys, API credits, and digital agent seats may be refunded within fourteen (14) days of issuance if fewer than 1,000 API requests or tokens have been consumed. Once an enterprise token bundle has been partially depleted beyond 10% usage, refunds are calculated on a pro-rata basis minus a 5% administrative handling fee.
"""
    },
    {
        "filename": "policy-011-return-shipping.md",
        "doc_id": "policy-011",
        "title": "Return Shipping Guidelines & Label Generation",
        "category": "Logistics & Returns",
        "content": """## 1. Return Shipping Overview
Customers returning physical equipment within the eligible return period are provided with a prepaid courier shipping label. This policy governs return freight responsibilities, label re-issuance, and carrier drop-off terms.

## 2. Prepaid Return Labels
For eligible returns approved within 30 days of purchase, our system automatically generates a prepaid digital shipping label (USPS/FedEx/DHL). Standard shipping takes 3-5 business days. Express shipping takes 1-2 business days. Return shipping is free of charge for defective items, wrong item shipments, and orders covered under our VIP Support Shield.
"""
    },
    {
        "filename": "policy-015-damaged-goods-claim.md",
        "doc_id": "policy-015",
        "title": "Damaged In Transit & Lost Parcel Claims",
        "category": "Claims & Freight",
        "content": """## 1. Purpose
This policy specifies procedures for handling consignments damaged during transit or declared lost by carrier partners.

## 2. Immediate Reporting Window
Customers must report concealed damage or external package tampering within 7 calendar days of carrier-marked delivery. Claims reported after 7 days will be handled under standard hardware warranty terms rather than freight damage claims.

## 3. Required Evidence
To process a damaged-in-transit claim, the claimant must provide high-resolution photographs showing the shipping box, protective packaging, and damaged unit.
"""
    },
    {
        "filename": "policy-023-subscription-cancellation.md",
        "doc_id": "policy-023",
        "title": "SaaS Subscription Billing & Cancellation Policy",
        "category": "Subscriptions & Accounts",
        "content": """## 1. Subscription Renewal Cycles
All cloud platform software subscriptions renew automatically on a monthly or annual cadence matching the selected billing schedule.

## 2. Cancellation Process
Users may cancel their recurring subscription at any point through the Account Billing portal or by submitting an explicit ticket request through an authorized support agent. Cancellation takes effect at the conclusion of the current prepaid billing period.
"""
    },
    {
        "filename": "policy-031-international-warranty.md",
        "doc_id": "policy-031",
        "title": "Limited Hardware Warranty & International Coverage",
        "category": "Hardware & Engineering",
        "content": """## 1. Standard One-Year Warranty
All hardware products sold by Agentflow Systems include a standard one-year limited warranty against manufacturing defects in materials and workmanship, commencing on the verified date of retail purchase.
"""
    },
    {
        "filename": "policy-055-price-match-guarantee.md",
        "doc_id": "policy-055",
        "title": "Price Match & Lowest Price Guarantee",
        "category": "Sales & Pricing",
        "content": """## 1. Price Match Promise
We strive to offer the most competitive pricing for AI agent infrastructure and hardware gateways. If a customer identifies an identical in-stock item offered by an authorized primary retailer at a lower retail price within 14 days of purchase, we will match the price.
"""
    },
    {
        "filename": "policy-062-gift-card-redemption.md",
        "doc_id": "policy-062",
        "title": "Corporate Gift Card & Credit Redemption Terms",
        "category": "Finance & Vouchers",
        "content": """## 1. Digital Gift Vouchers
Digital gift cards and promotional balance vouchers issued by our platform never expire and carry zero maintenance fees. Gift cards may be redeemed across all software tiers, hardware devices, and professional support hours.
"""
    },
    {
        "filename": "policy-077-enterprise-sla-support.md",
        "doc_id": "policy-077",
        "title": "Enterprise Service Level Agreement (SLA) & Incident Response",
        "category": "Enterprise Operations",
        "content": """## 1. Uptime Commitment
Agentflow Platform commits to maintaining a monthly service availability of 99.95% across all core inference APIs, MCP gateways, and vector retrieval pipelines.
"""
    },
    {
        "filename": "policy-088-chargeback-and-disputes.md",
        "doc_id": "policy-088",
        "title": "Credit Card Disputes & Chargeback Protocol",
        "category": "Billing & Risk Mitigation",
        "content": """## 1. Pre-Dispute Resolution Protocol
We strongly urge all customers to contact customer support before initiating a formal bank chargeback. Almost all billing errors, duplicate charges, or unrecognized fees can be resolved immediately.
"""
    },
    {
        "filename": "policy-094-data-retention-privacy.md",
        "doc_id": "policy-094",
        "title": "Data Retention, Audit Trails, and Privacy Compliance",
        "category": "Legal & Compliance",
        "content": """## 1. Scope and Regulatory Compliance
Our data storage architecture is designed to comply with ISO 27001, SOC 2 Type II, GDPR, and CCPA standards. This document specifies customer audit log preservation, message retention, and privacy sanitization.
"""
    },
    {
        "filename": "faq-001-account-password-reset.md",
        "doc_id": "faq-001",
        "title": "How to Reset Your Account Password and Recover Access",
        "category": "Account Management",
        "content": """## 1. Initiating Password Reset
To reset your forgotten password, navigate to the login portal at /login and click 'Forgot Password'.
"""
    },
    {
        "filename": "faq-002-order-tracking-notifications.md",
        "doc_id": "faq-002",
        "title": "Order Tracking & Shipment Notification Updates",
        "category": "Orders & Shipping",
        "content": """## 1. Tracking Your Shipment
When an order ships from our fulfillment centers, an automated dispatch email containing the carrier tracking number is generated.
"""
    },
    {
        "filename": "faq-003-promotional-codes-discounts.md",
        "doc_id": "faq-003",
        "title": "Applying Promotional Codes & Enterprise Volume Discounts",
        "category": "Sales & Billing",
        "content": """## 1. Redeeming Coupon Codes
Promotional coupon codes can be entered in the checkout review screen under 'Promo Code'.
"""
    },
    {
        "filename": "faq-004-loyalty-tier-rewards.md",
        "doc_id": "faq-004",
        "title": "Agentflow VIP Club: Loyalty Tiers and Exclusive Benefits",
        "category": "Customer Loyalty",
        "content": """## 1. Loyalty Tier Overview
Customers earn 1 Loyalty Point for every $1 spent on platform subscriptions and developer hardware.
"""
    },
    {
        "filename": "faq-005-custom-branding-guidelines.md",
        "doc_id": "faq-005",
        "title": "White-Labeling and Custom Chat Branding Guidelines",
        "category": "Product Customization",
        "content": """## 1. White-Label Capabilities
Enterprise customers can configure custom domain routing, custom CSS theming, and corporate logo assets for the agent chat window.
"""
    },
    {
        "filename": "product-101-pro-workflow-builder.md",
        "doc_id": "product-101",
        "title": "Agentflow Studio: Visual LangGraph Workflow Builder",
        "category": "Core Products",
        "content": """## 1. Overview
Agentflow Studio is a low-code visual canvas for assembling dynamic agent graphs powered by LangGraph.
"""
    },
    {
        "filename": "product-102-agent-runtime-engine.md",
        "doc_id": "product-102",
        "title": "High-Performance Agent Runtime & Execution Engine",
        "category": "Architecture & Engineering",
        "content": """## 1. Runtime Architecture
The Agentflow Runtime executes asynchronous cyclic and acyclic graphs with sub-millisecond dispatch overhead.
"""
    },
    {
        "filename": "product-103-enterprise-gateway-api.md",
        "doc_id": "product-103",
        "title": "FastAPI Gateway Specification & SSE Streaming Protocol",
        "category": "APIs & Integration",
        "content": """## 1. Streaming Server-Sent Events (SSE)
The gateway exposes /chat which streams real-time step events and final synthesized responses to client applications.
"""
    },
    {
        "filename": "product-104-audit-logging-compliance.md",
        "doc_id": "product-104",
        "title": "Automated Audit Logging & Compliance Ledger",
        "category": "Security & Auditing",
        "content": """## 1. Compliance Ledger
Every invocation of the agent graph writes immutable step records to the MongoDB audit_logs collection.
"""
    },
    {
        "filename": "product-105-mcp-connector-suite.md",
        "doc_id": "product-105",
        "title": "Model Context Protocol (MCP) Standard Server Suite",
        "category": "MCP Integration",
        "content": """## 1. Standard Protocol Compliance
Our tool suite strictly adheres to Anthropic's Model Context Protocol (MCP).
"""
    },
    {
        "filename": "product-106-vector-cache-accelerator.md",
        "doc_id": "product-106",
        "title": "Redis Vector Cache & Query Accelerator",
        "category": "Performance & Caching",
        "content": """## 1. Two-Tier Caching Architecture
To reduce redundant embedding generation, normalized query strings are hashed and checked against Redis.
"""
    },
    {
        "filename": "product-107-guardrail-safety-filter.md",
        "doc_id": "product-107",
        "title": "Deterministic Guardrails & Human-in-the-Loop Confirmation",
        "category": "AI Safety & Guardrails",
        "content": """## 1. Destructive Action Checkpoint
Actions that modify state or create tickets are classified as destructive and require confirmation.
"""
    },
    {
        "filename": "policy-108-hardware-trade-in.md",
        "doc_id": "policy-108",
        "title": "Hardware Trade-In & Environmental Recycling Program",
        "category": "Sustainability & Trade-In",
        "content": """## 1. Trade-In Valuation
Customers trading in previous-generation agent gateways receive credit towards new hardware.
"""
    },
    {
        "filename": "policy-109-sales-tax-exemption.md",
        "doc_id": "policy-109",
        "title": "Sales Tax Exemption for Educational & Non-Profit Entities",
        "category": "Tax & Compliance",
        "content": """## 1. Tax-Exempt Status Recognition
Qualifying 501(c)(3) charitable organizations may submit tax-exemption documentation through the Billing Center.
"""
    },
    {
        "filename": "policy-110-bulk-licensing-agreement.md",
        "doc_id": "policy-110",
        "title": "Bulk Software Licensing & Distributor Terms",
        "category": "Legal & Licensing",
        "content": """## 1. License Redistribution
Authorized channel partners purchasing more than 100 Agentflow Runtime licenses are granted commercial resale rights.
"""
    }
]

def main():
    target_dir = os.path.join("data", "knowledge_base")
    os.makedirs(target_dir, exist_ok=True)
    count = 0
    for doc in DOCUMENTS:
        filepath = os.path.join(target_dir, doc["filename"])
        content = f"# {doc['title']}\n\n"
        content += f"**Document ID**: {doc['doc_id']}  \n"
        content += f"**Category**: {doc['category']}  \n\n"
        content += doc["content"].strip() + "\n"
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        count += 1
    print(f"Successfully generated {count} knowledge base documents in {target_dir}")

if __name__ == "__main__":
    main()
