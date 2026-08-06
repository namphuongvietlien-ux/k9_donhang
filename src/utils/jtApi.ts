/**
 * J&T Express Tracking API Utilities
 * Parse tracking data from J&T Express website
 */

export interface JTTrackingEvent {
  time: string; // HH:mm:ss
  date: string; // YYYY-MM-DD
  description: string;
  location?: string;
  staffName?: string;
  staffPhone?: string;
  receiverName?: string;
}

export interface JTTrackingResponse {
  trackingCode: string;
  events: JTTrackingEvent[];
  isDelivered: boolean;
  latestStatus: string;
}

/**
 * Parse J&T Express HTML response to structured data
 * Uses regex parsing for compatibility with both browser and Edge Functions
 * @param html HTML content from J&T tracking page
 * @param trackingCode Tracking code used for the request
 */
export function parseJTTracking(html: string, trackingCode: string): JTTrackingResponse {
  const events: JTTrackingEvent[] = [];
  
  // Find all result-vandon-item divs
  // The HTML structure has nested divs, so we need to match carefully
  // Each event item is: <div class="result-vandon-item ...">...</div>
  // But it contains nested divs, so we need to match until the closing tag of result-vandon-item
  
  // First, find all opening tags
  const openingTagPattern = /<div class="result-vandon-item[^"]*">/g;
  const matches: Array<{ start: number; end: number }> = [];
  let match;
  
  while ((match = openingTagPattern.exec(html)) !== null) {
    const start = match.index;
    // Find the matching closing </div> tag for this result-vandon-item
    // We need to count opening and closing divs to find the right closing tag
    let depth = 0;
    let pos = start + match[0].length;
    let foundEnd = false;
    
    while (pos < html.length && !foundEnd) {
      const nextDivOpen = html.indexOf('<div', pos);
      const nextDivClose = html.indexOf('</div>', pos);
      
      if (nextDivClose === -1) {
        // No more closing tags, this must be the end
        matches.push({ start, end: html.length });
        break;
      }
      
      if (nextDivOpen !== -1 && nextDivOpen < nextDivClose) {
        // Found an opening div before the closing tag
        depth++;
        pos = nextDivOpen + 4;
      } else {
        // Found a closing div
        if (depth === 0) {
          // This is the closing tag for our result-vandon-item
          matches.push({ start, end: nextDivClose + 6 }); // +6 for '</div>'
          foundEnd = true;
        } else {
          depth--;
          pos = nextDivClose + 6;
        }
      }
    }
  }
  
  // Now extract each event item
  for (const { start, end } of matches) {
    const itemHtml = html.substring(start, end);
    
    // Extract time (after time-outline icon)
    const timeMatch = itemHtml.match(/<ion-icon name="time-outline"[^>]*>[\s\S]*?<\/ion-icon>\s*<span[^>]*>([^<]+)<\/span>/);
    const time = timeMatch?.[1]?.trim() || '';
    
    // Extract date (after calendar-clear-outline icon)
    const dateMatch = itemHtml.match(/<ion-icon name="calendar-clear-outline"[^>]*>[\s\S]*?<\/ion-icon>\s*<span[^>]*>([^<]+)<\/span>/);
    const date = dateMatch?.[1]?.trim() || '';
    
    // Extract description - it's in the last <div> that contains text (not the time/date divs)
    // HTML structure: 
    // <div class="flex flex-col min-w-[180px]"> (time/date section) ... </div>
    // <div> (description section) ... </div>
    let description = '';
    
    // Method 1: Find the div that comes after the time/date div (the description div)
    // Use string manipulation to find the description div more reliably
    const timeDateDivEnd = itemHtml.indexOf('</div>', itemHtml.indexOf('min-w-[180px]'));
    if (timeDateDivEnd > 0) {
      // Get everything after the time/date div
      const afterTimeDate = itemHtml.substring(timeDateDivEnd + 6); // +6 for '</div>'
      // Find the next <div> tag (the description div)
      const descDivStart = afterTimeDate.indexOf('<div');
      if (descDivStart >= 0) {
        // Find the content of this div (everything until its closing tag)
        const descContentStart = afterTimeDate.indexOf('>', descDivStart) + 1;
        const descDivEnd = afterTimeDate.lastIndexOf('</div>');
        if (descContentStart > 0 && descDivEnd > descContentStart) {
          description = afterTimeDate.substring(descContentStart, descDivEnd);
        }
      }
    }
    
    // Fallback: If description is still empty, try regex method
    if (!description.trim()) {
      const descriptionDivMatch = itemHtml.match(/<div class="flex flex-col[^"]*">[\s\S]*?<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>\s*$/);
      if (descriptionDivMatch && descriptionDivMatch[1]) {
        description = descriptionDivMatch[1];
      }
    }
    
    // Remove HTML tags from description but keep text
    // First, remove font tags but keep their content
    description = description.replace(/<font[^>]*>/g, '').replace(/<\/font>/g, '');
    // Then remove all other HTML tags
    description = description.replace(/<[^>]+>/g, '');
    // Clean up whitespace
    description = description.replace(/\s+/g, ' ').trim();
    
    // Remove date prefix if it exists (sometimes date gets parsed into description)
    // Pattern: "2025-12-30 " at the start
    description = description.replace(/^\d{4}-\d{2}-\d{2}\s+/, '');
    
    // Debug logging in development
    if (process.env.NODE_ENV === 'development') {
      const hasPickedUp = description.includes('đã nhận hàng') || description.includes('đã nhận');
      if (hasPickedUp) {
        console.log('Found "đã nhận hàng" event in parseJTTracking:', { date, time, description });
      }
    }
    
    // Extract location, staff name, phone, receiver name from description using 【】markers
    const locationMatches = description.match(/【([^】]+)】/g);
    const locations = locationMatches?.map(m => m.replace(/【|】/g, '')) || [];
    
    let location: string | undefined;
    let staffName: string | undefined;
    let staffPhone: string | undefined;
    let receiverName: string | undefined;
    
    // Parse description patterns
    if (description.includes('đã ký nhận')) {
      // "Đơn hàng đã ký nhận. Người ký nhận là:【Nguyễn thị thúy Mạnh】"
      receiverName = locations[0];
    } else if (description.includes('đang giao hàng')) {
      // "Nhân viên【Trần Nguyễn Anh Khoa】của bưu cục 【(HCM) Lê Văn Lương】đang giao hàng.【+84938700294】"
      staffName = locations[0];
      location = locations[1];
      staffPhone = locations[2];
    } else if (description.includes('đã nhận hàng')) {
      // "Nhân viên【Đào Chí Thiện】 của bưu cục 【(HCM) DC Quận 7】đã nhận hàng. SĐT nhân viên nhận hàng 【+84939022189】"
      staffName = locations[0];
      location = locations[1];
      staffPhone = locations[2];
    } else if (description.includes('đã được chuyển đến')) {
      // "Hàng đã được chuyển đến【(HCM) Lê Văn Lương】"
      location = locations[0];
    } else if (description.includes('đang chuyển hàng đến')) {
      // "Bưu cục【TTKT HỒ CHÍ MINH】đang chuyển hàng đến【(HCM) Lê Văn Lương】"
      location = locations[0];
    }
    
    if (time && date && description) {
      events.push({
        time,
        date,
        description,
        location,
        staffName,
        staffPhone,
        receiverName,
      });
    }
  }
  
  // Determine status
  const latestEvent = events[0]; // Events are in reverse chronological order
  const isDelivered = latestEvent?.description.includes('đã ký nhận') || false;
  const latestStatus = isDelivered ? 'delivered' : 
                      latestEvent?.description.includes('đang giao hàng') ? 'out_for_delivery' :
                      latestEvent?.description.includes('đã được chuyển đến') || latestEvent?.description.includes('đang chuyển hàng đến') ? 'in_transit' :
                      'tracking';
  
  return {
    trackingCode,
    events,
    isDelivered,
    latestStatus,
  };
}

/**
 * Fetch J&T tracking data from website
 * @param trackingCode Tracking code
 * @param phoneLast4 Last 4 digits of phone number
 */
export async function fetchJTTracking(
  trackingCode: string,
  phoneLast4: string
): Promise<string> {
  // J&T Express tracking URL
  const url = `https://jtexpress.vn/vi/tracking?type=track&billcode=${encodeURIComponent(trackingCode)}&cellphone=${encodeURIComponent(phoneLast4)}`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.text();
  } catch (error) {
    throw new Error(`Failed to fetch J&T tracking: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get delivery status text in Vietnamese
 */
export function getJTStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    'tracking': 'Đang theo dõi',
    'in_transit': 'Đang vận chuyển',
    'out_for_delivery': 'Đang giao hàng',
    'delivered': 'Đã giao hàng',
  };
  return statusMap[status] || status;
}

