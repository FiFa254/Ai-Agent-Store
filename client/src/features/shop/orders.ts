// Remembers the customer's recent orders (order number + access key) on this device.
const KEY = 'grocerai_orders_v2';

export function rememberOrder(orderNo: string, accessKey: string) {
  try {
    const list: { orderNo: string; accessKey: string }[] = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    localStorage.setItem(KEY, JSON.stringify([{ orderNo, accessKey }, ...list.filter((o) => o.orderNo !== orderNo)].slice(0, 10)));
  } catch {
    /* ignore */
  }
}
