/**
 * Hook for managing ecommerce orders
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parseShopeeTracking, type ParsedTrackingData, getDeliveryStatus } from "@/utils/shopeeApi";
import { parseJTTracking, type JTTrackingResponse } from "@/utils/jtApi";
import { type GHNTrackingResponse } from "@/utils/ghnApi";

export interface EcommerceOrder {
  id: string;
  platform_code: string;
  tracking_code: string;
  platform_order_id: string | null;
  phone_number: string | null;
  phone_last_4: string | null;
  internal_order_id: string | null;
  status: "pending" | "tracking" | "in_transit" | "delivered" | "cancelled";
  delivery_status: string | null;
  last_milestone_code: number | null;
  last_milestone_name: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  delivered_to: string | null;
  accounts_receivable_id: string | null;
  total_amount: number;
  last_synced_at: string | null;
  sync_count: number;
  notes: string | null;
  settlement_status: "pending" | "partial" | "completed" | "cancelled" | null;
  settlement_amount: number | null;
  settlement_date: string | null;
  settlement_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EcommerceOrderItem {
  id: string;
  ecommerce_order_id: string;
  internal_product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  order_item_id: string | null;
  created_at: string;
}

export interface EcommerceTrackingEvent {
  id: string;
  ecommerce_order_id: string;
  tracking_code: string;
  tracking_name: string;
  description: string | null;
  milestone_code: number;
  milestone_name: string;
  actual_time: string;
  current_location_name: string | null;
  current_location_address: string | null;
  current_location_lat: string | null;
  current_location_lng: string | null;
  next_location_name: string | null;
  next_location_address: string | null;
  reason_code: string | null;
  reason_desc: string | null;
  display_flag: number | null;
  created_at: string;
}

/**
 * Fetch all ecommerce orders
 */
export function useEcommerceOrders(platformCode?: string) {
  return useQuery({
    queryKey: ["ecommerce-orders", platformCode],
    queryFn: async () => {
      let query = supabase
        .from("ecommerce_orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (platformCode) {
        query = query.eq("platform_code", platformCode);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as EcommerceOrder[];
    },
  });
}

/**
 * Fetch single ecommerce order with items and events
 */
export function useEcommerceOrder(orderId: string) {
  return useQuery({
    queryKey: ["ecommerce-order", orderId],
    queryFn: async () => {
      // Fetch order
      const { data: order, error: orderError } = await supabase
        .from("ecommerce_orders")
        .select("*")
        .eq("id", orderId)
        .single();

      if (orderError) throw orderError;

      // Fetch items
      const { data: items, error: itemsError } = await supabase
        .from("ecommerce_order_items")
        .select("*")
        .eq("ecommerce_order_id", orderId);

      if (itemsError) throw itemsError;

      // Fetch tracking events
      const { data: events, error: eventsError } = await supabase
        .from("ecommerce_tracking_events")
        .select("*")
        .eq("ecommerce_order_id", orderId)
        .order("actual_time", { ascending: false });

      if (eventsError) throw eventsError;

      return {
        order: order as EcommerceOrder,
        items: (items || []) as EcommerceOrderItem[],
        events: (events || []) as EcommerceTrackingEvent[],
      };
    },
    enabled: !!orderId,
  });
}

/**
 * Create ecommerce order from tracking code
 */
export function useCreateEcommerceOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { trackingCode: string; platformCode: string; phoneNumber?: string; phoneLast4?: string }) => {
      // If phoneNumber is provided, extract last 4 digits
      let phoneLast4 = data.phoneLast4;
      if (data.phoneNumber && data.phoneNumber.length === 10) {
        phoneLast4 = data.phoneNumber.slice(-4);
      }

      const { data: order, error } = await supabase
        .from("ecommerce_orders")
        .insert({
          tracking_code: data.trackingCode,
          platform_code: data.platformCode,
          phone_number: data.phoneNumber || null,
          phone_last_4: phoneLast4 || null,
          status: "pending",
        })
        .select()
        .single();

      if (error) throw error;
      return order as EcommerceOrder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ecommerce-orders"] });
      toast.success("Đã tạo đơn hàng thành công");
    },
    onError: (error: Error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error creating ecommerce order:", error);
      }
      toast.error("Không thể tạo đơn hàng: " + error.message);
    },
  });
}

/**
 * Sync tracking from Shopee API
 * This would typically call a backend API endpoint that calls Shopee API
 * For now, we'll create a placeholder that expects the parsed data
 */
/**
 * Sync tracking from J&T Express
 */
export function useSyncJTTracking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      orderId: string;
      trackingData: JTTrackingResponse;
    }) => {
      const { trackingData, orderId } = data;
      const latestEvent = trackingData.events[0]; // Events are in reverse chronological order

      // Get current sync_count first
      const { data: currentOrder } = await supabase
        .from("ecommerce_orders")
        .select("sync_count")
        .eq("id", orderId)
        .single();

      // Combine date and time to create timestamp
      const latestEventDateTime = latestEvent 
        ? new Date(`${latestEvent.date}T${latestEvent.time}`)
        : new Date();

      // Map J&T status to milestone codes (similar to Shopee)
      // J&T doesn't have milestone codes, so we'll use:
      // 8 = delivered, 6 = out_for_delivery, 5 = in_transit, 1 = tracking
      let milestoneCode = 1;
      let milestoneName = "Tracking";
      
      if (trackingData.isDelivered) {
        milestoneCode = 8;
        milestoneName = "Đã giao hàng";
      } else if (trackingData.latestStatus === 'out_for_delivery') {
        milestoneCode = 6;
        milestoneName = "Đang giao hàng";
      } else if (trackingData.latestStatus === 'in_transit') {
        milestoneCode = 5;
        milestoneName = "Đang vận chuyển";
      }

      // Find the first "picked up" event (đã nhận hàng) - this is the FIRST event chronologically
      // Events array is in REVERSE chronological order (newest first):
      // - events[0] = newest event (latest status)
      // - events[events.length - 1] = oldest event (first status - "đã nhận hàng")
      // The "đã nhận hàng" event is unique and appears only once, always as the first event chronologically
      let pickedUpEvent = null;
      
      // Debug: Log all events to see what we're working with
      if (process.env.NODE_ENV === 'development') {
        console.log('J&T Tracking Events:', trackingData.events.map(e => ({
          date: e.date,
          time: e.time,
          description: e.description,
          descriptionLength: e.description.length,
          hasPickedUp: e.description.includes('đã nhận hàng') || e.description.includes('đã nhận')
        })));
      }
      
      // Search from the end of array (oldest events) to find the first "đã nhận hàng" event
      for (let i = trackingData.events.length - 1; i >= 0; i--) {
        const event = trackingData.events[i];
        // Check both variations: "đã nhận hàng" and "đã nhận"
        // Also check for variations with different spacing or case
        const descLower = event.description.toLowerCase();
        if (descLower.includes('đã nhận hàng') || 
            descLower.includes('đã nhận') ||
            descLower.includes('nhan hang') ||
            descLower.includes('nhận hàng')) {
          pickedUpEvent = event;
          if (process.env.NODE_ENV === 'development') {
            console.log('Found picked up event:', {
              index: i,
              date: event.date,
              time: event.time,
              description: event.description,
              descriptionFull: event.description
            });
          }
          break; // Found the first one chronologically (only one exists)
        }
      }
      
      const pickedUpAt = pickedUpEvent
        ? new Date(`${pickedUpEvent.date}T${pickedUpEvent.time}`).toISOString()
        : null;
      
      if (process.env.NODE_ENV === 'development') {
        console.log('Picked up at:', pickedUpAt);
      }

      // Map status to allowed values in CHECK constraint
      // Allowed: 'pending', 'tracking', 'in_transit', 'delivered', 'returned', 'cancelled'
      // Map 'out_for_delivery' to 'in_transit' (closest match)
      let mappedStatus = trackingData.latestStatus;
      if (mappedStatus === 'out_for_delivery') {
        mappedStatus = 'in_transit';
      }
      

      // Update order with latest status
      const updateData: any = {
        delivery_status: trackingData.latestStatus, // Keep original for delivery_status
        status: trackingData.isDelivered ? "delivered" : mappedStatus,
        last_milestone_code: milestoneCode,
        last_milestone_name: milestoneName,
        delivered_at: trackingData.isDelivered ? latestEventDateTime.toISOString() : null,
        delivered_to: latestEvent?.receiverName || null,
        last_synced_at: new Date().toISOString(),
        sync_count: (currentOrder?.sync_count || 0) + 1,
      };
      

      // Only update picked_up_at if we found it and it's not already set (preserve first pickup time)
      if (pickedUpAt) {
        // Check if picked_up_at is already set - if so, don't overwrite (keep the first one)
        const { data: existingOrder } = await supabase
          .from("ecommerce_orders")
          .select("picked_up_at")
          .eq("id", orderId)
          .single();
        
        if (!existingOrder?.picked_up_at) {
          updateData.picked_up_at = pickedUpAt;
        }
      }

      
      const { data: updatedOrder, error: updateError } = await supabase
        .from("ecommerce_orders")
        .update(updateData)
        .eq("id", orderId)
        .select()
        .single();
        

      if (updateError) throw updateError;

      // Insert tracking events (only new ones)
      const existingEvents = await supabase
        .from("ecommerce_tracking_events")
        .select("tracking_code, actual_time")
        .eq("ecommerce_order_id", orderId);

      const existingEventKeys = new Set(
        (existingEvents.data || []).map(
          (e) => `${e.tracking_code}-${e.actual_time}`
        )
      );

      const newEvents = trackingData.events
        .map((event, index) => {
          const eventDateTime = new Date(`${event.date}T${event.time}`);
          const eventKey = `${event.description}-${eventDateTime.toISOString()}`;
          return { event, eventDateTime, eventKey };
        })
        .filter(
          ({ eventKey }) => !existingEventKeys.has(eventKey)
        )
        .map(({ event, eventDateTime }) => {
          // Map J&T event to milestone
          let eventMilestoneCode = 1;
          let eventMilestoneName = "Tracking";
          
          if (event.description.includes('đã ký nhận')) {
            eventMilestoneCode = 8;
            eventMilestoneName = "Đã giao hàng";
          } else if (event.description.includes('đang giao hàng')) {
            eventMilestoneCode = 6;
            eventMilestoneName = "Đang giao hàng";
          } else if (event.description.includes('đã được chuyển đến') || event.description.includes('đang chuyển hàng đến')) {
            eventMilestoneCode = 5;
            eventMilestoneName = "Đang vận chuyển";
          }

          return {
            ecommerce_order_id: orderId,
            tracking_code: `JT-${event.date}-${event.time}`,
            tracking_name: event.description.split('【')[0].trim(),
            description: event.description,
            milestone_code: eventMilestoneCode,
            milestone_name: eventMilestoneName,
            actual_time: eventDateTime.toISOString(),
            current_location_name: event.location || null,
            current_location_address: null,
            current_location_lat: null,
            current_location_lng: null,
            next_location_name: null,
            next_location_address: null,
            reason_code: null,
            reason_desc: null,
            display_flag: null,
          };
        });

      if (newEvents.length > 0) {
        const { error: eventsError } = await supabase
          .from("ecommerce_tracking_events")
          .insert(newEvents);

        if (eventsError) throw eventsError;
      }

      return updatedOrder as EcommerceOrder;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ecommerce-order", variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ["ecommerce-orders"] });
      toast.success("Đã sync tracking thành công");
    },
    onError: (error: Error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error syncing J&T tracking:", error);
      }
      toast.error("Không thể sync tracking: " + error.message);
    },
  });
}

export function useSyncGHNTracking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      orderId: string;
      trackingData: GHNTrackingResponse;
    }) => {
      const { trackingData, orderId } = data;
      
      // Get current order
      const { data: currentOrder } = await supabase
        .from("ecommerce_orders")
        .select("sync_count, picked_up_at")
        .eq("id", orderId)
        .single();

      // Get latest event (last in array since events are chronological)
      const latestEvent = trackingData.events[trackingData.events.length - 1];

      // Combine date and time to create timestamp
      const latestEventDateTime = latestEvent 
        ? new Date(`${latestEvent.date}T${latestEvent.time}`)
        : new Date();

      // Map GHN status to milestone codes
      // 8 = delivered, 6 = out_for_delivery, 5 = in_transit, 1 = tracking
      let milestoneCode = 1;
      let milestoneName = "Tracking";
      
      if (trackingData.isDelivered) {
        milestoneCode = 8;
        milestoneName = "Đã giao hàng";
      } else if (trackingData.latestStatus === 'out_for_delivery') {
        milestoneCode = 6;
        milestoneName = "Đang giao hàng";
      } else if (trackingData.latestStatus === 'in_transit' || trackingData.latestStatus === 'at_delivery_office' || trackingData.latestStatus === 'ready_for_delivery') {
        milestoneCode = 5;
        milestoneName = "Đang vận chuyển";
      } else if (trackingData.latestStatus === 'picked_up') {
        milestoneCode = 1;
        milestoneName = "Đã lấy hàng";
      }

      // Map status to allowed values in CHECK constraint
      // Allowed: 'pending', 'tracking', 'in_transit', 'delivered', 'returned', 'cancelled'
      let mappedStatus = trackingData.latestStatus;
      if (mappedStatus === 'out_for_delivery' || mappedStatus === 'ready_for_delivery' || mappedStatus === 'at_delivery_office') {
        mappedStatus = 'in_transit';
      } else if (mappedStatus === 'picked_up' || mappedStatus === 'picking_up' || mappedStatus === 'pending_pickup') {
        mappedStatus = 'tracking';
      } else if (mappedStatus !== 'delivered' && mappedStatus !== 'in_transit' && mappedStatus !== 'tracking' && mappedStatus !== 'pending') {
        // Fallback: if status is not in allowed list, default to 'tracking'
        mappedStatus = 'tracking';
      }

      // deliveredAt and pickedUpAt are already in ISO format from parseGHNTracking
      // Update order with latest status
      const updateData: any = {
        delivery_status: trackingData.latestStatus,
        status: trackingData.isDelivered ? "delivered" : mappedStatus,
        last_milestone_code: milestoneCode,
        last_milestone_name: milestoneName,
        delivered_at: trackingData.deliveredAt || (trackingData.isDelivered && latestEvent ? latestEventDateTime.toISOString() : null),
        last_synced_at: new Date().toISOString(),
        sync_count: (currentOrder?.sync_count || 0) + 1,
      };

      // Only update picked_up_at if we found it and it's not already set
      if (trackingData.pickedUpAt && !currentOrder?.picked_up_at) {
        updateData.picked_up_at = trackingData.pickedUpAt;
      }
      
      const { data: updatedOrder, error: updateError } = await supabase
        .from("ecommerce_orders")
        .update(updateData)
        .eq("id", orderId)
        .select()
        .single();

      if (updateError) throw updateError;

      // Insert tracking events (only new ones)
      const existingEvents = await supabase
        .from("ecommerce_tracking_events")
        .select("tracking_code, actual_time")
        .eq("ecommerce_order_id", orderId);

      const existingEventKeys = new Set(
        (existingEvents.data || []).map(
          (e) => `${e.tracking_code}-${e.actual_time}`
        )
      );

      const newEvents = trackingData.events
        .map((event) => {
          const eventDateTime = new Date(`${event.date}T${event.time}`);
          const eventKey = `${event.description}-${eventDateTime.toISOString()}`;
          return { event, eventDateTime, eventKey };
        })
        .filter(
          ({ eventKey }) => !existingEventKeys.has(eventKey)
        )
        .map(({ event, eventDateTime }) => {
          // Map GHN event to milestone
          let eventMilestoneCode = 1;
          let eventMilestoneName = "Tracking";
          
          if (event.status.includes('Giao hàng thành công')) {
            eventMilestoneCode = 8;
            eventMilestoneName = "Đã giao hàng";
          } else if (event.status.includes('Đang giao hàng')) {
            eventMilestoneCode = 6;
            eventMilestoneName = "Đang giao hàng";
          } else if (event.status.includes('Sẵn sàng giao hàng') || event.status.includes('Nhập hàng vào bưu cục giao')) {
            eventMilestoneCode = 5;
            eventMilestoneName = "Đang vận chuyển";
          } else if (event.status.includes('Đang trung chuyển hàng') || event.status.includes('Xuất hàng đi khỏi kho')) {
            eventMilestoneCode = 5;
            eventMilestoneName = "Đang vận chuyển";
          } else if (event.status.includes('Lấy hàng thành công') || event.status.includes('Nhập bưu cục lấy')) {
            eventMilestoneCode = 1;
            eventMilestoneName = "Đã lấy hàng";
          }

          return {
            ecommerce_order_id: orderId,
            tracking_code: `GHN-${event.date}-${event.time}`,
            tracking_name: event.status,
            description: event.description,
            milestone_code: eventMilestoneCode,
            milestone_name: eventMilestoneName,
            actual_time: eventDateTime.toISOString(),
            current_location_name: event.location || null,
            current_location_address: null,
            current_location_lat: null,
            current_location_lng: null,
            next_location_name: null,
            next_location_address: null,
            reason_code: null,
            reason_desc: null,
            display_flag: null,
          };
        });

      if (newEvents.length > 0) {
        const { error: eventsError } = await supabase
          .from("ecommerce_tracking_events")
          .insert(newEvents);

        if (eventsError) throw eventsError;
      }

      return updatedOrder as EcommerceOrder;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ecommerce-order", variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ["ecommerce-orders"] });
      toast.success("Đã sync tracking thành công");
    },
    onError: (error: Error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error syncing GHN tracking:", error);
      }
      toast.error("Không thể sync tracking: " + error.message);
    },
  });
}

export function useSyncShopeeTracking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      orderId: string;
      trackingData: ParsedTrackingData;
    }) => {
      const { trackingData, orderId } = data;
      const latestMilestone = trackingData.latestMilestone;

      // Get current sync_count first
      const { data: currentOrder } = await supabase
        .from("ecommerce_orders")
        .select("sync_count, picked_up_at")
        .eq("id", orderId)
        .single();

      // Find the first "picked up" event (oldest event - milestone_code = 1)
      // Events are in reverse chronological order (newest first), so the last event is the oldest
      let pickedUpEvent = null;
      if (trackingData.events.length > 0) {
        // Find the oldest event (last in array) with milestone_code = 1 (Preparing to ship)
        for (let i = trackingData.events.length - 1; i >= 0; i--) {
          if (trackingData.events[i].milestoneCode === 1) {
            pickedUpEvent = trackingData.events[i];
            break;
          }
        }
      }
      const pickedUpAt = pickedUpEvent ? pickedUpEvent.time.toISOString() : null;

      // Update order with latest milestone
      // Convert empty string to null for platform_order_id
      const platformOrderId = trackingData.platformOrderId && trackingData.platformOrderId.trim() !== "" 
        ? trackingData.platformOrderId 
        : null;
      
      // Map delivery status to allowed values in CHECK constraint
      // Allowed: 'pending', 'tracking', 'in_transit', 'delivered', 'returned', 'cancelled'
      // getDeliveryStatus() can return 'out_for_delivery' or 'preparing', which are not allowed
      const rawDeliveryStatus = getDeliveryStatus(latestMilestone.code);
      let mappedStatus: string;
      
      if (trackingData.isDelivered) {
        mappedStatus = "delivered";
      } else if (trackingData.isReturned) {
        mappedStatus = "returned";
      } else {
        // Map other statuses to allowed values
        switch (rawDeliveryStatus) {
          case 'out_for_delivery':
            mappedStatus = 'in_transit'; // Map to closest allowed value
            break;
          case 'preparing':
            mappedStatus = 'tracking'; // Map to closest allowed value
            break;
          case 'in_transit':
            mappedStatus = 'in_transit';
            break;
          case 'tracking':
            mappedStatus = 'tracking';
            break;
          case 'pending':
            mappedStatus = 'pending';
            break;
          default:
            mappedStatus = 'tracking'; // Default fallback
        }
      }
      
      const updateData: any = {
        platform_order_id: platformOrderId,
        last_milestone_code: latestMilestone.code,
        last_milestone_name: latestMilestone.name,
        delivery_status: rawDeliveryStatus, // Keep original for delivery_status (no constraint)
        status: mappedStatus, // Use mapped status that matches CHECK constraint
        delivered_at: trackingData.isDelivered ? latestMilestone.time.toISOString() : null,
        last_synced_at: new Date().toISOString(),
        sync_count: (currentOrder?.sync_count || 0) + 1,
      };

      // Only update picked_up_at if we found it and it's not already set (preserve first pickup time)
      if (pickedUpAt && !currentOrder?.picked_up_at) {
        updateData.picked_up_at = pickedUpAt;
      }
      
      const { data: updatedOrder, error: updateError } = await supabase
        .from("ecommerce_orders")
        .update(updateData)
        .eq("id", orderId)
        .select()
        .single();

      if (updateError) throw updateError;

      // Insert tracking events (only new ones)
      const existingEvents = await supabase
        .from("ecommerce_tracking_events")
        .select("tracking_code, actual_time")
        .eq("ecommerce_order_id", orderId);

      const existingEventKeys = new Set(
        (existingEvents.data || []).map(
          (e) => `${e.tracking_code}-${e.actual_time}`
        )
      );

      const newEvents = trackingData.events
        .filter(
          (e) =>
            !existingEventKeys.has(
              `${e.code}-${e.time.toISOString()}`
            )
        )
        .map((event) => ({
          ecommerce_order_id: orderId,
          tracking_code: event.code,
          tracking_name: event.name,
          description: event.description,
          milestone_code: event.milestoneCode,
          milestone_name: event.milestoneName,
          actual_time: event.time.toISOString(),
          current_location_name: event.location.name || null,
          current_location_address: event.location.address || null,
          current_location_lat: event.location.lat || null,
          current_location_lng: event.location.lng || null,
          next_location_name: event.nextLocation.name || null,
          next_location_address: event.nextLocation.address || null,
          reason_code: null,
          reason_desc: null,
          display_flag: null,
        }));

      if (newEvents.length > 0) {
        const { error: eventsError } = await supabase
          .from("ecommerce_tracking_events")
          .insert(newEvents);

        if (eventsError) throw eventsError;
      }

      return updatedOrder as EcommerceOrder;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ecommerce-order", variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ["ecommerce-orders"] });
      toast.success("Đã sync tracking thành công");
    },
    onError: (error: Error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error syncing tracking:", error);
      }
      toast.error("Không thể sync tracking: " + error.message);
    },
  });
}

/**
 * Add items to ecommerce order
 */
export function useAddEcommerceOrderItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      orderId: string;
      items: Array<{
        internal_product_id: string;
        quantity: number;
        unit_price: number;
      }>;
    }) => {
      const orderItems = data.items.map((item) => ({
        ecommerce_order_id: data.orderId,
        internal_product_id: item.internal_product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.unit_price * item.quantity,
      }));

      const { data: items, error } = await supabase
        .from("ecommerce_order_items")
        .insert(orderItems)
        .select();

      if (error) throw error;
      return items as EcommerceOrderItem[];
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ecommerce-order", variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ["ecommerce-orders"] });
      toast.success("Đã thêm sản phẩm thành công");
    },
    onError: (error: Error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error adding order items:", error);
      }
      toast.error("Không thể thêm sản phẩm: " + error.message);
    },
  });
}

/**
 * Delete ecommerce order item
 */
export function useDeleteEcommerceOrderItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from("ecommerce_order_items")
        .delete()
        .eq("id", itemId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ecommerce-orders"] });
      toast.success("Đã xóa sản phẩm thành công");
    },
    onError: (error: Error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error deleting order item:", error);
      }
      toast.error("Không thể xóa sản phẩm: " + error.message);
    },
  });
}

