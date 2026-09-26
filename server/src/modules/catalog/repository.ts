import type { CatalogProduct, Category, Product } from '@shared/types';
import type { Queryable } from '../../db/db';

export const toProduct = (r: any): Product => ({
  id: r.Id,
  sku: r.Sku,
  barcode: r.Barcode,
  name: r.Name,
  description: r.Description,
  categoryId: r.CategoryId,
  categoryName: r.CategoryName,
  price: Number(r.Price),
  promoPrice: r.PromoPrice === null ? null : Number(r.PromoPrice),
  stock: r.Stock,
  minStock: r.MinStock,
  isActive: Boolean(r.IsActive),
});

const PRODUCT_SELECT = `SELECT p.*, c.Name AS CategoryName FROM dbo.Products p JOIN dbo.Categories c ON c.Id = p.CategoryId`;

export async function listCategories(db: Queryable): Promise<Category[]> {
  const rows = await db.query(
    `SELECT c.Id, c.Name, c.SortOrder, COUNT(p.Id) AS ProductCount
     FROM dbo.Categories c LEFT JOIN dbo.Products p ON p.CategoryId = c.Id AND p.IsActive = 1
     GROUP BY c.Id, c.Name, c.SortOrder ORDER BY c.SortOrder, c.Name`
  );
  return rows.map((r) => ({ id: r.Id, name: r.Name, sortOrder: r.SortOrder, productCount: r.ProductCount }));
}

export async function listProducts(db: Queryable, opts: { q?: string; includeInactive?: boolean; lowStockOnly?: boolean } = {}): Promise<Product[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (!opts.includeInactive) where.push('p.IsActive = 1');
  if (opts.lowStockOnly) where.push('p.Stock <= p.MinStock');
  if (opts.q) {
    where.push('(p.Name LIKE ? OR p.Sku LIKE ? OR p.Barcode = ?)');
    params.push(`%${opts.q}%`, `%${opts.q}%`, opts.q);
  }
  const rows = await db.query(`${PRODUCT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.SortOrder, c.Name, p.Name`, params);
  return rows.map(toProduct);
}

export async function getProduct(db: Queryable, id: number): Promise<Product | undefined> {
  const row = await db.queryOne(`${PRODUCT_SELECT} WHERE p.Id = ?`, [id]);
  return row ? toProduct(row) : undefined;
}

/** Storefront view: active products only, stock shown as "available". */
export async function publicCatalog(db: Queryable): Promise<CatalogProduct[]> {
  const rows = await db.query(`${PRODUCT_SELECT} WHERE p.IsActive = 1 ORDER BY c.SortOrder, c.Name, p.Name`);
  return rows.map((r) => ({
    id: r.Id,
    name: r.Name,
    description: r.Description,
    categoryId: r.CategoryId,
    categoryName: r.CategoryName,
    price: Number(r.Price),
    promoPrice: r.PromoPrice === null ? null : Number(r.PromoPrice),
    available: r.Stock,
  }));
}
