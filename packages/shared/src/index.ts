import { z } from "zod";

export * from "./apparel";

export const paymentModeSchema = z.enum(["ONLINE", "COUNTER"]);
export type PaymentMode = z.infer<typeof paymentModeSchema>;

export const checkoutStatusSchema = z.enum([
  "OPEN",
  "PENDING_PAYMENT",
  "PAID",
  "CANCELLED"
]);

export const createSessionSchema = z.object({
  storeCode: z.string().min(2),
  customerPhone: z.string().min(10).max(15).optional()
});

export const addCartItemSchema = z.object({
  sessionId: z.string().uuid(),
  barcode: z.string().min(4),
  quantity: z.number().int().positive().default(1)
});

/** Set exact line quantity; use 0 to remove the line from the bag. */
export const setCartLineQtySchema = z.object({
  sessionId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().int().min(0).max(99)
});

export const checkoutSchema = z.object({
  sessionId: z.string().uuid(),
  paymentMode: paymentModeSchema,
  receiptEmail: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().email().optional()
  ),
  receiptPhone: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().min(8).max(20).optional()
  )
});
