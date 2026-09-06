/**
 * Centralized product + affiliate link configuration.
 *
 * LAUNCH: Amazon US only. Tag = placeholder until Associates account is approved.
 * To activate: replace "pielsmart-20" with your real Associates tag (one-line change).
 *
 * PHASE 2 (MercadoLibre): Add a `mercadolibre` field to any product object.
 * The AffiliateLink component already handles it — no refactor needed.
 *
 * Example MercadoLibre entry:
 *   mercadolibre: { url: 'https://articulo.mercadolibre.com.ar/...' }
 */

export type Provider = 'amazon' | 'mercadolibre';

export interface Product {
  id: string;
  name: string;
  brand: string;
  categoria: string; // matches URL slug: mascarillas-led | microcorriente | microneedling | limpieza-facial
  amazon: {
    asin: string;
    tag: string;
  };
  mercadolibre?: {
    url: string;
  };
}

// Replace "pielsmart-20" with your real Amazon Associates tag when approved.
const AMAZON_TAG = 'pielsmart-20';

export const products: Product[] = [
  {
    id: 'foreo-ufo-3',
    name: 'FOREO UFO 3',
    brand: 'FOREO',
    categoria: 'mascarillas-led',
    amazon: { asin: 'B0CXYZ1234', tag: AMAZON_TAG },
  },
  {
    id: 'medicube-age-r-booster-h',
    name: 'MEDICUBE Age-R Booster-H',
    brand: 'MEDICUBE',
    categoria: 'microcorriente',
    amazon: { asin: 'B0CXYZ5678', tag: AMAZON_TAG },
  },
  {
    id: 'geske-smartappguard-8in1',
    name: 'GESKE SmartAppGuard 8-en-1',
    brand: 'GESKE',
    categoria: 'limpieza-facial',
    amazon: { asin: 'B0CXYZ9012', tag: AMAZON_TAG },
  },
  {
    id: 'shark-cryoglow',
    name: 'Shark CryoGlow',
    brand: 'SHARK',
    categoria: 'mascarillas-led',
    amazon: { asin: 'B0CXYZ3456', tag: AMAZON_TAG },
  },
  {
    id: 'mixsoon-derma-shot',
    name: 'MIXSOON Derma Shot',
    brand: 'MIXSOON',
    categoria: 'microneedling',
    amazon: { asin: 'B0CXYZ7890', tag: AMAZON_TAG },
  },
];

export function getProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

export function getProductsByCategoria(categoria: string): Product[] {
  return products.filter((p) => p.categoria === categoria);
}

export function buildAmazonUrl(asin: string, tag: string): string {
  return `https://www.amazon.com/dp/${asin}?tag=${tag}`;
}
