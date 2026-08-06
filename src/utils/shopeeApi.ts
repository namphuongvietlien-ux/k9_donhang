/**
 * Shopee Express API Client
 * Parse tracking events from Shopee API response
 */

export interface ShopeeTrackingEvent {
  tracking_code: string;
  tracking_name: string;
  description: string;
  actual_time: number; // Unix timestamp
  milestone_code: number; // 8 = Delivered
  milestone_name: string;
  current_location: {
    location_name: string;
    full_address: string;
    lat: string;
    lng: string;
  };
  next_location: {
    location_name: string;
    full_address: string;
    lat: string;
    lng: string;
  };
  reason_code: string;
  reason_desc: string;
  display_flag: number;
  buyer_description: string;
  seller_description: string;
}

export interface ShopeeTrackingResponse {
  retcode: number;
  data: {
    sls_tracking_info: {
      sls_tn: string; // Tracking code
      client_order_id: string; // Order ID trên Shopee
      receiver_name: string; // Thường rỗng
      receiver_type_name: string;
      records: ShopeeTrackingEvent[];
    };
  };
  message: string;
  detail: string;
}

export interface ParsedTrackingData {
  trackingCode: string;
  platformOrderId: string;
  isDelivered: boolean;
  isReturned: boolean; // Trả hàng (milestone_code = 10)
  latestMilestone: {
    code: number;
    name: string;
    time: Date;
  };
  events: Array<{
    code: string;
    name: string;
    description: string;
    milestoneCode: number;
    milestoneName: string;
    time: Date;
    location: {
      name: string;
      address: string;
      lat: string;
      lng: string;
    };
    nextLocation: {
      name: string;
      address: string;
      lat: string;
      lng: string;
    };
  }>;
}

/**
 * Parse Shopee API response to structured data
 */
export function parseShopeeTracking(data: ShopeeTrackingResponse): ParsedTrackingData {
  const tracking = data.data.sls_tracking_info;
  
  // Events được sort từ mới nhất → cũ nhất
  const latestEvent = tracking.records[0];
  const isDelivered = latestEvent?.milestone_code === 8;
  const isReturned = latestEvent?.milestone_code === 10; // Trả hàng
  
  return {
    trackingCode: tracking.sls_tn,
    platformOrderId: tracking.client_order_id,
    isDelivered,
    isReturned,
    latestMilestone: {
      code: latestEvent?.milestone_code || 0,
      name: latestEvent?.milestone_name || '',
      time: latestEvent ? new Date(latestEvent.actual_time * 1000) : new Date(),
    },
    events: tracking.records.map(event => ({
      code: event.tracking_code,
      name: event.tracking_name,
      description: event.description,
      milestoneCode: event.milestone_code,
      milestoneName: event.milestone_name,
      time: new Date(event.actual_time * 1000),
      location: {
        name: event.current_location.location_name || '',
        address: event.current_location.full_address || '',
        lat: event.current_location.lat || '',
        lng: event.current_location.lng || '',
      },
      nextLocation: {
        name: event.next_location.location_name || '',
        address: event.next_location.full_address || '',
        lat: event.next_location.lat || '',
        lng: event.next_location.lng || '',
      },
    })),
  };
}

/**
 * Get delivery status from milestone code
 */
export function getDeliveryStatus(milestoneCode: number): string {
  switch (milestoneCode) {
    case 8:
      return 'delivered';
    case 10:
      return 'returned'; // Trả hàng
    case 6:
      return 'out_for_delivery';
    case 5:
      return 'in_transit';
    case 1:
      return 'preparing';
    default:
      return 'tracking';
  }
}

/**
 * Check if order is delivered
 */
export function isDelivered(milestoneCode: number): boolean {
  return milestoneCode === 8;
}

/**
 * Get status text for display
 */
export function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    'pending': 'Chờ xử lý',
    'tracking': 'Đang theo dõi',
    'in_transit': 'Đang vận chuyển',
    'out_for_delivery': 'Đang giao hàng',
    'delivered': 'Đã giao hàng',
    'returned': 'Đã trả hàng',
    'cancelled': 'Đã hủy',
  };
  return statusMap[status] || status;
}

/**
 * Get milestone name in Vietnamese
 */
export function getMilestoneName(milestoneCode: number): string {
  const milestoneMap: Record<number, string> = {
    1: 'Chuẩn bị giao hàng',
    5: 'Đang vận chuyển',
    6: 'Đang giao hàng',
    8: 'Đã giao hàng',
    10: 'Trả hàng',
  };
  return milestoneMap[milestoneCode] || `Milestone ${milestoneCode}`;
}

/**
 * Call Shopee API to get tracking information
 * This calls the Supabase Edge Function which then calls Shopee API
 */
export async function fetchShopeeTracking(
  trackingCode: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<ShopeeTrackingResponse> {
  // Get auth token from Supabase
  const { data: { session } } = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
    },
  }).then(res => res.json()).catch(() => ({ data: { session: null } }));

  // Call Edge Function
  const response = await fetch(`${supabaseUrl}/functions/v1/shopee-tracking`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || supabaseKey}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({ trackingCode }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data as ShopeeTrackingResponse;
}

