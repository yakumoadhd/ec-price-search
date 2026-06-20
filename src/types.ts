export interface AffiliateItem {
  id?: string; // Appended locally for React mapping
  rank: number;
  mall: 'amazon' | 'rakuten' | 'yahoo' | 'yodobashi' | 'other';
  raw_name: string;
  price: number;
  shipping_fee: number;
  point: number;
  coupon_discount: number;
  effective_total: number;
  total_units: number;
  unit_price: number | { integer_part: string; decimal_part: string };
  affiliate_url: string;
  image_url: string;
  capacity?: string; // Optional capacity mapping if API supports it
}

export interface UnitPrice {
  integer: string;
  decimal: string;
}

// Utility to parse potentially messy unit_price from API
export const parseUnitPrice = (unitPriceRaw: any): UnitPrice => {
  let val = 0;
  if (typeof unitPriceRaw === 'number') {
    val = unitPriceRaw;
  } else if (typeof unitPriceRaw === 'string') {
    val = parseFloat(unitPriceRaw) || 0;
  } else if (unitPriceRaw && typeof unitPriceRaw === 'object') {
    const int = parseInt(unitPriceRaw.integer_part || '0', 10);
    const dec = parseInt(unitPriceRaw.decimal_part || '0', 10) / 100;
    val = int + dec;
  }
  
  const fixedStr = val.toFixed(2);
  const parts = fixedStr.split('.');
  
  return {
    integer: parts[0],
    decimal: parts[1],
  };
};