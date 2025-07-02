import { z } from 'zod';
import { RestaurantPlatform, Reservation, RestaurantEntity } from '@/lib/types';
import { DataCanonicalizer } from '@/lib/utils/data-canonicalizer';

export interface OpenTableConfig {
  clientId: string;
  clientSecret: string;
  restaurantId: string;
  apiUrl?: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface OpenTableReservation {
  confirmationNumber: string;
  restaurantId: string;
  partySize: number;
  reservationDateTime: string;
  status: 'Booked' | 'Seated' | 'Completed' | 'Cancelled' | 'No Show';
  guestDetails: {
    guestId?: string;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber?: string;
    vipStatus?: boolean;
  };
  tableAssignment?: {
    tableNumber: string;
    sectionName?: string;
  };
  specialRequests?: string;
  tags?: string[];
  source?: string;
  createdDateTime: string;
  lastUpdatedDateTime: string;
}

export interface OpenTableGuest {
  guestId: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  vipStatus: boolean;
  visitCount: number;
  totalSpent: number;
  averageSpent: number;
  lastVisitDate?: string;
  preferences?: {
    dietary?: string[];
    seating?: string[];
    occasions?: string[];
  };
  notes?: string[];
  tags?: string[];
}

export interface OpenTableAvailability {
  date: string;
  times: Array<{
    time: string;
    available: boolean;
    partySize: number[];
    tableTypes?: string[];
  }>;
}

export class OpenTableIntegration {
  private config: OpenTableConfig;
  private canonicalizer: DataCanonicalizer;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  
  constructor(config: OpenTableConfig) {
    this.config = {
      ...config,
      apiUrl: config.apiUrl || 'https://platform.opentable.com/api/v2',
    };
    this.canonicalizer = new DataCanonicalizer();
  }
  
  // ==================== Authentication ====================
  
  async authenticate(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }
    
    const response = await fetch(`${this.config.apiUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'read write',
      }),
    });
    
    if (!response.ok) {
      throw new Error(`OpenTable authentication failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = new Date(Date.now() + (data.expires_in * 1000));
    
    return this.accessToken;
  }
  
  private async makeRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<any> {
    const token = await this.authenticate();
    
    const response = await fetch(`${this.config.apiUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers,
      },
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenTable API error: ${response.status} - ${error}`);
    }
    
    return response.json();
  }
  
  // ==================== Restaurant Information ====================
  
  async getRestaurant(): Promise<RestaurantEntity> {
    const data = await this.makeRequest(`/restaurants/${this.config.restaurantId}`);
    return this.canonicalizer.canonicalize(data, 'opentable', 'restaurant');
  }
  
  async getRestaurantSettings(): Promise<any> {
    const data = await this.makeRequest(`/restaurants/${this.config.restaurantId}/settings`);
    return data;
  }
  
  async updateRestaurantSettings(settings: any): Promise<any> {
    const data = await this.makeRequest(`/restaurants/${this.config.restaurantId}/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    return data;
  }
  
  // ==================== Reservations ====================
  
  async getReservations(params?: {
    startDate?: Date;
    endDate?: Date;
    status?: string[];
    pageSize?: number;
    pageToken?: string;
  }): Promise<{
    reservations: Reservation[];
    nextPageToken?: string;
  }> {
    const queryParams = new URLSearchParams();
    
    if (params?.startDate) {
      queryParams.append('startDate', params.startDate.toISOString());
    }
    if (params?.endDate) {
      queryParams.append('endDate', params.endDate.toISOString());
    }
    if (params?.status) {
      params.status.forEach(s => queryParams.append('status', s));
    }
    if (params?.pageSize) {
      queryParams.append('pageSize', params.pageSize.toString());
    }
    if (params?.pageToken) {
      queryParams.append('pageToken', params.pageToken);
    }
    
    const data = await this.makeRequest(
      `/restaurants/${this.config.restaurantId}/reservations?${queryParams}`
    );
    
    const reservations = await Promise.all(
      data.reservations.map((res: any) => 
        this.canonicalizer.canonicalize(res, 'opentable', 'reservation')
      )
    );
    
    return {
      reservations,
      nextPageToken: data.nextPageToken,
    };
  }
  
  async getReservation(confirmationNumber: string): Promise<Reservation> {
    const data = await this.makeRequest(
      `/restaurants/${this.config.restaurantId}/reservations/${confirmationNumber}`
    );
    return this.canonicalizer.canonicalize(data, 'opentable', 'reservation');
  }
  
  async createReservation(reservationData: {
    partySize: number;
    dateTime: Date;
    guest: {
      firstName: string;
      lastName: string;
      email: string;
      phone?: string;
    };
    tablePreference?: string;
    specialRequests?: string;
    tags?: string[];
  }): Promise<Reservation> {
    const payload = {
      restaurantId: this.config.restaurantId,
      partySize: reservationData.partySize,
      reservationDateTime: reservationData.dateTime.toISOString(),
      guestDetails: {
        firstName: reservationData.guest.firstName,
        lastName: reservationData.guest.lastName,
        email: reservationData.guest.email,
        phoneNumber: reservationData.guest.phone,
      },
      tablePreference: reservationData.tablePreference,
      specialRequests: reservationData.specialRequests,
      tags: reservationData.tags,
    };
    
    const data = await this.makeRequest(
      `/restaurants/${this.config.restaurantId}/reservations`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    
    return this.canonicalizer.canonicalize(data, 'opentable', 'reservation');
  }
  
  async updateReservation(
    confirmationNumber: string,
    updates: Partial<{
      partySize: number;
      dateTime: Date;
      status: string;
      tableNumber: string;
      specialRequests: string;
      tags: string[];
    }>
  ): Promise<Reservation> {
    const payload: any = {};
    
    if (updates.partySize) payload.partySize = updates.partySize;
    if (updates.dateTime) payload.reservationDateTime = updates.dateTime.toISOString();
    if (updates.status) payload.status = updates.status;
    if (updates.tableNumber) {
      payload.tableAssignment = { tableNumber: updates.tableNumber };
    }
    if (updates.specialRequests) payload.specialRequests = updates.specialRequests;
    if (updates.tags) payload.tags = updates.tags;
    
    const data = await this.makeRequest(
      `/restaurants/${this.config.restaurantId}/reservations/${confirmationNumber}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
    
    return this.canonicalizer.canonicalize(data, 'opentable', 'reservation');
  }
  
  async cancelReservation(
    confirmationNumber: string,
    reason?: string
  ): Promise<void> {
    await this.updateReservation(confirmationNumber, {
      status: 'Cancelled',
    });
    
    if (reason) {
      await this.addReservationNote(confirmationNumber, `Cancellation reason: ${reason}`);
    }
  }
  
  async seatReservation(
    confirmationNumber: string,
    tableNumber: string
  ): Promise<Reservation> {
    return this.updateReservation(confirmationNumber, {
      status: 'Seated',
      tableNumber,
    });
  }
  
  async completeReservation(confirmationNumber: string): Promise<Reservation> {
    return this.updateReservation(confirmationNumber, {
      status: 'Completed',
    });
  }
  
  async markNoShow(confirmationNumber: string): Promise<Reservation> {
    return this.updateReservation(confirmationNumber, {
      status: 'No Show',
    });
  }
  
  // ==================== Guest Management ====================
  
  async getGuests(params?: {
    searchTerm?: string;
    email?: string;
    phone?: string;
    pageSize?: number;
    pageToken?: string;
  }): Promise<{
    guests: OpenTableGuest[];
    nextPageToken?: string;
  }> {
    const queryParams = new URLSearchParams();
    
    if (params?.searchTerm) {
      queryParams.append('searchTerm', params.searchTerm);
    }
    if (params?.email) {
      queryParams.append('email', params.email);
    }
    if (params?.phone) {
      queryParams.append('phone', params.phone);
    }
    if (params?.pageSize) {
      queryParams.append('pageSize', params.pageSize.toString());
    }
    if (params?.pageToken) {
      queryParams.append('pageToken', params.pageToken);
    }
    
    const data = await this.makeRequest(
      `/restaurants/${this.config.restaurantId}/guests?${queryParams}`
    );
    
    return {
      guests: data.guests,
      nextPageToken: data.nextPageToken,
    };
  }
  
  async getGuest(guestId: string): Promise<OpenTableGuest> {
    const data = await this.makeRequest(
      `/restaurants/${this.config.restaurantId}/guests/${guestId}`
    );
    return data;
  }
  
  async updateGuestPreferences(
    guestId: string,
    preferences: {
      dietary?: string[];
      seating?: string[];
      occasions?: string[];
    }
  ): Promise<OpenTableGuest> {
    const data = await this.makeRequest(
      `/restaurants/${this.config.restaurantId}/guests/${guestId}/preferences`,
      {
        method: 'PUT',
        body: JSON.stringify(preferences),
      }
    );
    return data;
  }
  
  async addGuestNote(guestId: string, note: string): Promise<void> {
    await this.makeRequest(
      `/restaurants/${this.config.restaurantId}/guests/${guestId}/notes`,
      {
        method: 'POST',
        body: JSON.stringify({ note }),
      }
    );
  }
  
  async tagGuest(guestId: string, tags: string[]): Promise<void> {
    await this.makeRequest(
      `/restaurants/${this.config.restaurantId}/guests/${guestId}/tags`,
      {
        method: 'PUT',
        body: JSON.stringify({ tags }),
      }
    );
  }
  
  // ==================== Availability ====================
  
  async getAvailability(params: {
    startDate: Date;
    endDate: Date;
    partySize: number;
    timePreference?: 'breakfast' | 'lunch' | 'dinner';
  }): Promise<OpenTableAvailability[]> {
    const queryParams = new URLSearchParams({
      startDate: params.startDate.toISOString().split('T')[0],
      endDate: params.endDate.toISOString().split('T')[0],
      partySize: params.partySize.toString(),
    });
    
    if (params.timePreference) {
      queryParams.append('timePreference', params.timePreference);
    }
    
    const data = await this.makeRequest(
      `/restaurants/${this.config.restaurantId}/availability?${queryParams}`
    );
    
    return data.availability;
  }
  
  async checkAvailability(params: {
    dateTime: Date;
    partySize: number;
  }): Promise<boolean> {
    const date = params.dateTime.toISOString().split('T')[0];
    const time = params.dateTime.toTimeString().slice(0, 5);
    
    const availability = await this.getAvailability({
      startDate: params.dateTime,
      endDate: params.dateTime,
      partySize: params.partySize,
    });
    
    const dayAvailability = availability.find(a => a.date === date);
    if (!dayAvailability) return false;
    
    const timeSlot = dayAvailability.times.find(t => t.time === time);
    return timeSlot?.available || false;
  }
  
  // ==================== Tables & Floor Plan ====================
  
  async getTables(): Promise<any[]> {
    const data = await this.makeRequest(
      `/restaurants/${this.config.restaurantId}/tables`
    );
    return data.tables;
  }
  
  async getFloorPlan(): Promise<any> {
    const data = await this.makeRequest(
      `/restaurants/${this.config.restaurantId}/floor-plan`
    );
    return data;
  }
  
  async updateTableStatus(
    tableNumber: string,
    status: 'available' | 'occupied' | 'reserved' | 'cleaning'
  ): Promise<void> {
    await this.makeRequest(
      `/restaurants/${this.config.restaurantId}/tables/${tableNumber}/status`,
      {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }
    );
  }
  
  // ==================== Reviews & Feedback ====================
  
  async getReviews(params?: {
    startDate?: Date;
    endDate?: Date;
    minRating?: number;
    maxRating?: number;
    pageSize?: number;
    pageToken?: string;
  }): Promise<{
    reviews: any[];
    averageRating: number;
    totalReviews: number;
    nextPageToken?: string;
  }> {
    const queryParams = new URLSearchParams();
    
    if (params?.startDate) {
      queryParams.append('startDate', params.startDate.toISOString());
    }
    if (params?.endDate) {
      queryParams.append('endDate', params.endDate.toISOString());
    }
    if (params?.minRating) {
      queryParams.append('minRating', params.minRating.toString());
    }
    if (params?.maxRating) {
      queryParams.append('maxRating', params.maxRating.toString());
    }
    if (params?.pageSize) {
      queryParams.append('pageSize', params.pageSize.toString());
    }
    if (params?.pageToken) {
      queryParams.append('pageToken', params.pageToken);
    }
    
    const data = await this.makeRequest(
      `/restaurants/${this.config.restaurantId}/reviews?${queryParams}`
    );
    
    return data;
  }
  
  async respondToReview(reviewId: string, response: string): Promise<void> {
    await this.makeRequest(
      `/restaurants/${this.config.restaurantId}/reviews/${reviewId}/response`,
      {
        method: 'POST',
        body: JSON.stringify({ response }),
      }
    );
  }
  
  // ==================== Waitlist ====================
  
  async getWaitlist(): Promise<any[]> {
    const data = await this.makeRequest(
      `/restaurants/${this.config.restaurantId}/waitlist`
    );
    return data.entries;
  }
  
  async addToWaitlist(params: {
    partySize: number;
    guest: {
      firstName: string;
      lastName: string;
      phone: string;
    };
    estimatedWait?: number;
    notes?: string;
  }): Promise<any> {
    const data = await this.makeRequest(
      `/restaurants/${this.config.restaurantId}/waitlist`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
    return data;
  }
  
  async removeFromWaitlist(entryId: string, reason?: string): Promise<void> {
    await this.makeRequest(
      `/restaurants/${this.config.restaurantId}/waitlist/${entryId}`,
      {
        method: 'DELETE',
        body: reason ? JSON.stringify({ reason }) : undefined,
      }
    );
  }
  
  // ==================== Analytics & Reports ====================
  
  async getReservationStats(params: {
    startDate: Date;
    endDate: Date;
    groupBy?: 'day' | 'week' | 'month';
  }): Promise<any> {
    const queryParams = new URLSearchParams({
      startDate: params.startDate.toISOString(),
      endDate: params.endDate.toISOString(),
    });
    
    if (params.groupBy) {
      queryParams.append('groupBy', params.groupBy);
    }
    
    const data = await this.makeRequest(
      `/restaurants/${this.config.restaurantId}/analytics/reservations?${queryParams}`
    );
    
    return data;
  }
  
  async getGuestStats(params: {
    startDate: Date;
    endDate: Date;
  }): Promise<any> {
    const queryParams = new URLSearchParams({
      startDate: params.startDate.toISOString(),
      endDate: params.endDate.toISOString(),
    });
    
    const data = await this.makeRequest(
      `/restaurants/${this.config.restaurantId}/analytics/guests?${queryParams}`
    );
    
    return data;
  }
  
  // ==================== Helper Methods ====================
  
  async addReservationNote(
    confirmationNumber: string,
    note: string
  ): Promise<void> {
    await this.makeRequest(
      `/restaurants/${this.config.restaurantId}/reservations/${confirmationNumber}/notes`,
      {
        method: 'POST',
        body: JSON.stringify({ note }),
      }
    );
  }
  
  async sendConfirmationEmail(confirmationNumber: string): Promise<void> {
    await this.makeRequest(
      `/restaurants/${this.config.restaurantId}/reservations/${confirmationNumber}/confirmation-email`,
      {
        method: 'POST',
      }
    );
  }
  
  async sendReminderEmail(confirmationNumber: string): Promise<void> {
    await this.makeRequest(
      `/restaurants/${this.config.restaurantId}/reservations/${confirmationNumber}/reminder-email`,
      {
        method: 'POST',
      }
    );
  }
  
  // ==================== Sync Operations ====================
  
  async syncReservations(params?: {
    startDate?: Date;
    endDate?: Date;
    includeGuests?: boolean;
  }): Promise<{
    reservations: Reservation[];
    guests?: OpenTableGuest[];
  }> {
    const result: any = {
      reservations: [],
    };
    
    // Get all reservations with pagination
    let pageToken: string | undefined;
    do {
      const response = await this.getReservations({
        startDate: params?.startDate,
        endDate: params?.endDate,
        pageSize: 100,
        pageToken,
      });
      
      result.reservations.push(...response.reservations);
      pageToken = response.nextPageToken;
    } while (pageToken);
    
    // Optionally get unique guests
    if (params?.includeGuests) {
      const guestIds = new Set<string>();
      result.reservations.forEach((res: any) => {
        if (res.customer?.id) {
          guestIds.add(res.customer.id);
        }
      });
      
      result.guests = await Promise.all(
        Array.from(guestIds).map(id => this.getGuest(id))
      );
    }
    
    return result;
  }
}