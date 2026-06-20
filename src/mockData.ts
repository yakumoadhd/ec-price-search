// Mock fetch if real API is unavailable or returns CORS logic
import { AffiliateItem } from './types';

// Used strictly fallback if the backend fetch fails or for immediate UX testing
export const mockItems: AffiliateItem[] = [
  {
    id: "1",
    rank: 1,
    mall: 'amazon',
    raw_name: "強炭酸水 ウィルキンソン タンサン 500ml×24本",
    price: 1980,
    shipping_fee: 0,
    point: 20,
    coupon_discount: 0,
    effective_total: 1960,
    total_units: 24,
    unit_price: 81.66,
    affiliate_url: "https://amazon.co.jp",
    image_url: "https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=200&h=200&fit=crop",
    capacity: "500ml×24本"
  },
  {
    id: "2",
    rank: 2,
    mall: 'rakuten',
    raw_name: "【送料無料】アサヒ ウィルキンソン タンサン 500ml 24本",
    price: 2160,
    shipping_fee: 0,
    point: 108,
    coupon_discount: 50,
    effective_total: 2002,
    total_units: 24,
    unit_price: { integer_part: "83", decimal_part: "41" },
    affiliate_url: "https://item.rakuten.co.jp",
    image_url: "https://images.unsplash.com/photo-1548685913-fe6678babe8d?w=200&h=200&fit=crop",
    capacity: "500ml×24本"
  },
  {
    id: "3",
    rank: 3,
    mall: 'yahoo',
    raw_name: "ウィルキンソン タンサン 500ml ペットボトル 48本 (24本入×2 まとめ買い)",
    price: 4100,
    shipping_fee: 0,
    point: 205,
    coupon_discount: 0,
    effective_total: 3895,
    total_units: 48,
    unit_price: { integer_part: "81", decimal_part: "14" },
    affiliate_url: "https://shopping.yahoo.co.jp",
    image_url: "https://images.unsplash.com/photo-1544144433-d50aff500b91?w=200&h=200&fit=crop",
    capacity: "500ml×48本"
  }
];
