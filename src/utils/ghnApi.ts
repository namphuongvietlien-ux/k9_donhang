/**
 * GHN (Giao Hàng Nhanh) Tracking API Utilities
 * Using official GHN public API
 */

export interface GHNTrackingEvent {
  time: string; // HH:mm
  date: string; // YYYY-MM-DD
  status: string; // Status name (e.g., "Giao hàng thành công", "Lấy hàng thành công")
  description: string;
  location?: string;
}

export interface GHNTrackingResponse {
  trackingCode: string;
  events: GHNTrackingEvent[];
  isDelivered: boolean;
  isPickedUp: boolean;
  latestStatus: string;
  pickedUpAt?: string; // ISO datetime string
  deliveredAt?: string; // ISO datetime string
}

/**
 * GHN API Response Types
 */
interface GHNOrderInfo {
  order_code: string;
  client_order_code: string;
  shop_id: number;
  status: string;
  action: string;
  status_name: string;
  picktime: string;
  leadtime: string;
  leadtime_order: {
    from_estimate_date: string;
    to_estimate_date: string;
    picked_date?: string;
    delivered_date?: string;
  };
  finish_date?: string;
  to_name: string;
  to_phone: string;
  to_address: string;
  from_name: string;
  from_phone: string;
  from_address: string;
  return_name?: string;
  return_phone?: string;
  return_address?: string;
  payment_type_id: number;
  order_version: string;
  is_partial_return: boolean;
  danger_zone_sender: boolean;
  danger_zone_deliver: boolean;
  sub: number;
  is_sss: boolean;
  items: any;
}

interface GHNTrackingLog {
  order_code: string;
  status: string;
  status_name: string;
  location: {
    address: string;
    ward_code?: string;
    district_id?: number;
    warehouse_id?: number;
    next_warehouse_id?: number;
  };
  executor?: {
    client_id?: number;
    employee_id?: number;
    name: string;
    phone: string;
  };
  action_at: string;
  action_code?: string;
  sync_data_at?: string | null;
}

interface GHNApiResponse {
  code: number;
  message: string;
  data: {
    order_info: GHNOrderInfo;
    tracking_logs: GHNTrackingLog[];
    ticket_logs: any[];
    is_sender: boolean;
  };
}

/**
 * Convert GHN API response to our tracking format
 * @param apiResponse Response from GHN API
 * @param trackingCode Tracking code used for the request
 */
export function parseGHNTrackingFromAPI(
  apiResponse: GHNApiResponse,
  trackingCode: string
): GHNTrackingResponse {
  const { order_info, tracking_logs } = apiResponse.data;
  const events: GHNTrackingEvent[] = [];

  // Convert tracking_logs to events
  for (const log of tracking_logs) {
    // Parse action_at to get date and time
    const actionDate = new Date(log.action_at);
    const date = actionDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const time = actionDate.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    // Extract location from log.location.address
    const location = log.location?.address || undefined;

    events.push({
      time,
      date,
      status: log.status_name,
      description: log.location?.address || log.status_name,
      location,
    });
  }

  // Sort events by action_at (oldest first)
  events.sort((a, b) => {
    const dateA = new Date(`${a.date}T${a.time}`);
    const dateB = new Date(`${b.date}T${b.time}`);
    return dateA.getTime() - dateB.getTime();
  });

  // Determine status and find important milestones
  const latestEvent = events.length > 0 ? events[events.length - 1] : null;
  const firstEvent = events.length > 0 ? events[0] : null;

  // Check for delivered status
  const isDelivered = 
    order_info.status === 'delivered' ||
    order_info.action === 'DELIVER_IN_TRIP' ||
    latestEvent?.status.includes('Giao hàng thành công') ||
    false;

  // Check for picked up status
  const isPickedUp = events.some(
    (e) =>
      e.status.includes('Lấy hàng thành công') ||
      e.status.includes('Nhập bưu cục lấy') ||
      e.status.includes('Lấy hàng')
  );

  // Find picked up and delivered timestamps
  let pickedUpAt: string | undefined;
  let deliveredAt: string | undefined;

  // Use order_info dates if available
  if (order_info.leadtime_order?.picked_date) {
    pickedUpAt = new Date(order_info.leadtime_order.picked_date).toISOString();
  } else {
    // Find from events
    for (const event of events) {
      if (
        !pickedUpAt &&
        (event.status.includes('Lấy hàng thành công') ||
          event.status.includes('Nhập bưu cục lấy'))
      ) {
        const dateTimeString = `${event.date}T${event.time}:00`;
        const dateObj = new Date(dateTimeString);
        pickedUpAt = dateObj.toISOString();
      }
    }
  }

  if (order_info.leadtime_order?.delivered_date) {
    deliveredAt = new Date(order_info.leadtime_order.delivered_date).toISOString();
  } else if (order_info.finish_date) {
    deliveredAt = new Date(order_info.finish_date).toISOString();
  } else {
    // Find from events
    for (const event of events) {
      if (!deliveredAt && event.status.includes('Giao hàng thành công')) {
        const dateTimeString = `${event.date}T${event.time}:00`;
        const dateObj = new Date(dateTimeString);
        deliveredAt = dateObj.toISOString();
      }
    }
  }

  // Determine latest status based on order_info and latest event
  let latestStatus: string = 'tracking';

  if (!latestEvent) {
    latestStatus = 'tracking';
  } else if (isDelivered || latestEvent.status.includes('Giao hàng thành công')) {
    latestStatus = 'delivered';
  } else if (latestEvent.status.includes('Đang giao hàng')) {
    latestStatus = 'out_for_delivery';
  } else if (latestEvent.status.includes('Sẵn sàng giao hàng')) {
    latestStatus = 'ready_for_delivery';
  } else if (
    latestEvent.status.includes('Nhập hàng vào bưu cục giao') ||
    latestEvent.status.includes('Nhập bưu cục giao')
  ) {
    latestStatus = 'at_delivery_office';
  } else if (
    latestEvent.status.includes('Đang trung chuyển hàng') ||
    latestEvent.status.includes('Xuất hàng đi khỏi kho') ||
    latestEvent.status.includes('Nhập hàng vào kho trung chuyển')
  ) {
    latestStatus = 'in_transit';
  } else if (
    latestEvent.status.includes('Lấy hàng thành công') ||
    latestEvent.status.includes('Nhập bưu cục lấy')
  ) {
    latestStatus = 'picked_up';
  } else if (latestEvent.status.includes('Đang lấy hàng')) {
    latestStatus = 'picking_up';
  } else if (latestEvent.status.includes('Chờ lấy hàng')) {
    latestStatus = 'pending_pickup';
  } else {
    latestStatus = 'tracking';
  }

  return {
    trackingCode,
    events,
    isDelivered,
    isPickedUp,
    latestStatus,
    pickedUpAt,
    deliveredAt,
  };
}

/**
 * Fetch GHN tracking data from official API
 * @param trackingCode Tracking code (order_code)
 * API endpoint: https://fe-online-gateway.ghn.vn/order-tracking/public-api/client/tracking-logs?order_code={trackingCode}
 */
export async function fetchGHNTracking(trackingCode: string): Promise<GHNApiResponse> {
  const url = `https://fe-online-gateway.ghn.vn/order-tracking/public-api/client/tracking-logs?order_code=${encodeURIComponent(trackingCode)}`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.code !== 200) {
      throw new Error(data.message || 'Failed to fetch tracking data');
    }
    
    return data;
  } catch (error) {
    throw new Error(
      `Failed to fetch GHN tracking: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get delivery status text in Vietnamese
 */
export function getGHNStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    tracking: 'Đang theo dõi',
    pending_pickup: 'Chờ lấy hàng',
    picking_up: 'Đang lấy hàng',
    picked_up: 'Đã lấy hàng',
    in_transit: 'Đang vận chuyển',
    at_delivery_office: 'Tại bưu cục giao',
    ready_for_delivery: 'Sẵn sàng giao hàng',
    out_for_delivery: 'Đang giao hàng',
    delivered: 'Đã giao hàng',
  };
  return statusMap[status] || status;
}
