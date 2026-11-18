# WF-03 Order Stock Hold Reference

This research note describes a proposed demo for detecting unusually large stock holds on unpaid orders. The shop and data are simulated. The workflow, threshold, and event fields are proposals for the team to validate before registration and implementation.

## Store behavior to study

An online store can reserve stock while an order awaits payment. The reserved units reduce the quantity available to other shoppers. When an unpaid order expires or is canceled, the store can release the hold. A small retailer with many orders may need help spotting which active holds warrant review. [WooCommerce order troubleshooting and Hold stock](https://woocommerce.com/document/managing-orders/troubleshooting-orders/) · [WooCommerce checkout and payment behavior](https://woocommerce.com/document/elite-balance/checkout-and-wallet-payments/) · [Adobe Commerce inventory reservations](https://experienceleague.adobe.com/en/docs/commerce-admin/inventory/basics/selection-reservations?lang=en)

## Proposed demo

1. Load a mock online pet food shop with 994 ordinary orders in its history. One pet food product has 24 bags available for sale at the start of the scenario.
2. A script places six distinct unpaid orders for four bags each of the same pet food product. The shop reserves the bags, reducing the available quantity from 24 to zero. A subsequent shopper sees that the product is unavailable.
3. After recording each hold, the store sends the order event to FraudGuard through its REST API. FraudGuard checks the API key and validates and normalizes the event before evaluating the rule.
4. The proposed rule flags a pending-payment order that holds at least four bags of the selected pet food product. The Operator opens the Rule Alert and sees the order ID, product, held quantity, and matched condition. The alert gives the Operator a reason to review the order.
5. In a separate run, an unpaid order that holds one bag is accepted without triggering the rule. The shop releases reserved bags when the unpaid orders expire according to its own policy.

The rule evaluates one order at a time. Six orders create the stock shortage in the scenario, while the rule flags each qualifying order independently. FraudGuard monitors and alerts. The store owns stock reservations, expiration, and order decisions. [Software v1 business specification](../02_Reports/SOFTWARE_V1_BUSINESS_SPEC.md)

## Checks before registration

- Use a team-controlled store or sandbox to verify that placing an unpaid order reduces availability and that expiration restores it.
- Confirm when the store can emit an event with the order ID, product identifier, held quantity for that product, and payment status. Agree on how to represent the selected product if an order contains several line items.
- Verify the qualifying order, the one-unit control order, and an invalid API key. An invalid key should result in a rejected submission without a stored order or a Rule Alert in FraudGuard.
- Link the activity diagram and corresponding test cases when they reflect the same trigger, rule, exception, and outcome as the workflow registered on the capstone portal.
