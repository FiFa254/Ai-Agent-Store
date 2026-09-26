import crypto from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { createOrderSchema } from '@shared/schemas';
import type { PublicOrder } from '@shared/types';
import type { Deps } from '../../app';
import { auditContext } from '../../lib/audit';
import { notFound } from '../../lib/errors';
import { promptPayQrSvg } from '../../lib/promptpay';
import { requireRole } from '../../middleware/auth';
import { handle, parse } from '../../middleware/http';
import { stockConflict } from '../inventory/service';
import { getSettings } from '../settings/service';
import { closeUnpaidOrder, confirmOrder, createOrder, loadOrders } from './service';

const orderNoSchema = z.string().regex(/^W\d{6}-\d{4}$/, 'เลขคำสั่งซื้อไม่ถูกต้อง');

// Storefront actions are the customer's, even if a staff member is signed in on the same browser.
const customerContext = (req: import('express').Request) => ({ userId: null, ip: req.ip ?? null });

const sameKey = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Customer-facing: place an order, see it (with the access key from the order link), cancel it. */
export function publicOrderRoutes({ db, config }: Deps): Router {
  const router = Router();
  const limiter = rateLimit({ windowMs: 60_000, limit: config.NODE_ENV === 'test' ? 1000 : 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'ส่งคำสั่งซื้อบ่อยเกินไป กรุณารอสักครู่' } });

  const findWithKey = async (orderNo: string, key: unknown) => {
    const order = (await loadOrders(db, 'WHERE o.OrderNo = ?', [parse(orderNoSchema, orderNo)]))[0];
    if (!order || typeof key !== 'string' || !sameKey(order.accessKey, key)) throw notFound('ไม่พบคำสั่งซื้อ');
    return order;
  };

  router.post(
    '/',
    limiter,
    handle(async (req, res) => {
      const input = parse(createOrderSchema, req.body);
      const created = await createOrder(db, customerContext(req), input).catch(stockConflict);
      res.status(201).json(created);
    })
  );

  router.get(
    '/:orderNo',
    handle(async (req, res) => {
      const order = await findWithKey(String(req.params.orderNo), req.query.key);
      const settings = await getSettings(db);
      const { accessKey: _key, customerPhone: _phone, note: _note, ...rest } = order;
      const body: PublicOrder = {
        ...rest,
        storeName: settings.storeName,
        promptPayQrSvg: order.status === 'awaiting_payment' && settings.promptPayId ? await promptPayQrSvg(settings.promptPayId, order.total) : null,
      };
      res.json(body);
    })
  );

  router.post(
    '/:orderNo/cancel',
    handle(async (req, res) => {
      const order = await findWithKey(String(req.params.orderNo), req.query.key);
      await closeUnpaidOrder(db, customerContext(req), order.orderNo, 'cancelled');
      res.status(204).end();
    })
  );

  return router;
}

/** Staff: order queue, confirm payment, cancel. */
export function orderRoutes({ db }: Deps): Router {
  const router = Router();
  router.use(requireRole('cashier', 'manager'));

  router.get(
    '/',
    handle(async (req, res) => {
      const { status } = parse(z.object({ status: z.enum(['awaiting_payment', 'paid', 'cancelled', 'expired', 'all']).default('awaiting_payment') }), req.query);
      const orders = await loadOrders(
        db,
        status === 'all' ? '' : 'WHERE o.Status = ?',
        status === 'all' ? [] : [status],
        status === 'awaiting_payment' ? 'ORDER BY o.Id' : 'ORDER BY o.Id DESC OFFSET 0 ROWS FETCH NEXT 200 ROWS ONLY'
      );
      res.json(orders.map(({ accessKey: _k, ...o }) => o));
    })
  );

  router.post(
    '/:orderNo/confirm',
    handle(async (req, res) => {
      const orderNo = parse(orderNoSchema, req.params.orderNo);
      const { paymentMethod } = parse(z.object({ paymentMethod: z.enum(['cash', 'promptpay']).default('promptpay') }), req.body ?? {});
      const receiptNo = await confirmOrder(db, auditContext(req), orderNo, paymentMethod);
      res.json({ receiptNo });
    })
  );

  router.post(
    '/:orderNo/cancel',
    handle(async (req, res) => {
      await closeUnpaidOrder(db, auditContext(req), parse(orderNoSchema, req.params.orderNo), 'cancelled');
      res.status(204).end();
    })
  );

  return router;
}
