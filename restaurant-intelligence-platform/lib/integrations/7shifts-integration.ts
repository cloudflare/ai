import { z } from 'zod';
import { RestaurantPlatform, Employee, Shift } from '@/lib/types';
import { DataCanonicalizer } from '@/lib/utils/data-canonicalizer';

export interface SevenShiftsConfig {
  apiKey: string;
  companyId: string;
  apiUrl?: string;
}

export interface SevenShiftsEmployee {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  mobile_phone?: string;
  home_phone?: string;
  employee_id?: string;
  birth_date?: string;
  hire_date?: string;
  type: 'employee' | 'manager';
  active: boolean;
  invited: boolean;
  location_ids: number[];
  department_ids: number[];
  role_ids: number[];
  wage_type: 'hourly' | 'salary';
  wage: {
    hourly_rate?: number;
    yearly_salary?: number;
  };
  skills?: string[];
  certifications?: string[];
  max_hours_per_week?: number;
  min_hours_per_week?: number;
  created: string;
  modified: string;
}

export interface SevenShiftsShift {
  id: number;
  user_id: number;
  location_id: number;
  department_id: number;
  role_id: number;
  start: string;
  end: string;
  break_duration: number;
  status: 'Draft' | 'Published' | 'Deleted';
  published: boolean;
  published_date?: string;
  notes?: string;
  close_notes?: string;
  created: string;
  modified: string;
  acknowledged: boolean;
  acknowledged_at?: string;
  creator_id: number;
  actual_start?: string;
  actual_end?: string;
  actual_break_duration?: number;
}

export interface SevenShiftsTimeOff {
  id: number;
  user_id: number;
  status: 'pending' | 'approved' | 'declined';
  type: 'unpaid' | 'vacation' | 'sick' | 'other';
  dates: string[];
  partial_dates?: Array<{
    date: string;
    start_time: string;
    end_time: string;
  }>;
  comments?: string;
  created: string;
  modified: string;
  approver_id?: number;
  approved_date?: string;
}

export interface SevenShiftsSchedule {
  week_start: string;
  week_end: string;
  location_id: number;
  published: boolean;
  shifts: SevenShiftsShift[];
  labor_cost: number;
  projected_sales?: number;
  labor_percentage?: number;
}

export class SevenShiftsIntegration {
  private config: SevenShiftsConfig;
  private canonicalizer: DataCanonicalizer;
  
  constructor(config: SevenShiftsConfig) {
    this.config = {
      ...config,
      apiUrl: config.apiUrl || 'https://api.7shifts.com/v2',
    };
    this.canonicalizer = new DataCanonicalizer();
  }
  
  private async makeRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<any> {
    const response = await fetch(`${this.config.apiUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'x-company-id': this.config.companyId,
        ...options.headers,
      },
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`7shifts API error: ${response.status} - ${error}`);
    }
    
    return response.json();
  }
  
  // ==================== Company & Locations ====================
  
  async getCompany(): Promise<any> {
    const data = await this.makeRequest('/company');
    return data;
  }
  
  async getLocations(): Promise<any[]> {
    const data = await this.makeRequest('/locations');
    return data.data;
  }
  
  async getLocation(locationId: number): Promise<any> {
    const data = await this.makeRequest(`/locations/${locationId}`);
    return data;
  }
  
  // ==================== Employees ====================
  
  async getEmployees(params?: {
    locationId?: number;
    active?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{
    employees: Employee[];
    total: number;
  }> {
    const queryParams = new URLSearchParams();
    
    if (params?.locationId) {
      queryParams.append('location_id', params.locationId.toString());
    }
    if (params?.active !== undefined) {
      queryParams.append('active', params.active.toString());
    }
    if (params?.limit) {
      queryParams.append('limit', params.limit.toString());
    }
    if (params?.offset) {
      queryParams.append('offset', params.offset.toString());
    }
    
    const data = await this.makeRequest(`/users?${queryParams}`);
    
    const employees = await Promise.all(
      data.data.map((emp: any) => this.canonicalizer.canonicalize(emp, '7shifts', 'employee'))
    );
    
    return {
      employees,
      total: data.meta.total,
    };
  }
  
  async getEmployee(employeeId: number): Promise<Employee> {
    const data = await this.makeRequest(`/users/${employeeId}`);
    return this.canonicalizer.canonicalize(data, '7shifts', 'employee');
  }
  
  async createEmployee(employeeData: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    employeeId?: string;
    locationIds: number[];
    departmentIds: number[];
    roleIds: number[];
    wageType: 'hourly' | 'salary';
    hourlyRate?: number;
    yearlySalary?: number;
    hireDate?: Date;
  }): Promise<Employee> {
    const payload = {
      first_name: employeeData.firstName,
      last_name: employeeData.lastName,
      email: employeeData.email,
      mobile_phone: employeeData.phone,
      employee_id: employeeData.employeeId,
      location_ids: employeeData.locationIds,
      department_ids: employeeData.departmentIds,
      role_ids: employeeData.roleIds,
      wage_type: employeeData.wageType,
      wage: employeeData.wageType === 'hourly'
        ? { hourly_rate: employeeData.hourlyRate }
        : { yearly_salary: employeeData.yearlySalary },
      hire_date: employeeData.hireDate?.toISOString().split('T')[0],
      active: true,
    };
    
    const data = await this.makeRequest('/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    
    return this.canonicalizer.canonicalize(data, '7shifts', 'employee');
  }
  
  async updateEmployee(
    employeeId: number,
    updates: Partial<{
      active: boolean;
      phone: string;
      departmentIds: number[];
      roleIds: number[];
      hourlyRate: number;
      maxHoursPerWeek: number;
      minHoursPerWeek: number;
    }>
  ): Promise<Employee> {
    const payload: any = {};
    
    if (updates.active !== undefined) payload.active = updates.active;
    if (updates.phone) payload.mobile_phone = updates.phone;
    if (updates.departmentIds) payload.department_ids = updates.departmentIds;
    if (updates.roleIds) payload.role_ids = updates.roleIds;
    if (updates.hourlyRate) payload.wage = { hourly_rate: updates.hourlyRate };
    if (updates.maxHoursPerWeek) payload.max_hours_per_week = updates.maxHoursPerWeek;
    if (updates.minHoursPerWeek) payload.min_hours_per_week = updates.minHoursPerWeek;
    
    const data = await this.makeRequest(`/users/${employeeId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    
    return this.canonicalizer.canonicalize(data, '7shifts', 'employee');
  }
  
  async deactivateEmployee(employeeId: number): Promise<void> {
    await this.updateEmployee(employeeId, { active: false });
  }
  
  // ==================== Departments & Roles ====================
  
  async getDepartments(locationId?: number): Promise<any[]> {
    const queryParams = locationId ? `?location_id=${locationId}` : '';
    const data = await this.makeRequest(`/departments${queryParams}`);
    return data.data;
  }
  
  async getRoles(locationId?: number): Promise<any[]> {
    const queryParams = locationId ? `?location_id=${locationId}` : '';
    const data = await this.makeRequest(`/roles${queryParams}`);
    return data.data;
  }
  
  // ==================== Shifts ====================
  
  async getShifts(params: {
    startDate: Date;
    endDate: Date;
    locationId?: number;
    departmentId?: number;
    userId?: number;
    status?: 'published' | 'unpublished';
  }): Promise<Shift[]> {
    const queryParams = new URLSearchParams({
      start: params.startDate.toISOString().split('T')[0],
      end: params.endDate.toISOString().split('T')[0],
    });
    
    if (params.locationId) {
      queryParams.append('location_id', params.locationId.toString());
    }
    if (params.departmentId) {
      queryParams.append('department_id', params.departmentId.toString());
    }
    if (params.userId) {
      queryParams.append('user_id', params.userId.toString());
    }
    if (params.status) {
      queryParams.append('status', params.status);
    }
    
    const data = await this.makeRequest(`/shifts?${queryParams}`);
    
    return Promise.all(
      data.data.map((shift: any) => this.canonicalizer.canonicalize(shift, '7shifts', 'shift'))
    );
  }
  
  async getShift(shiftId: number): Promise<Shift> {
    const data = await this.makeRequest(`/shifts/${shiftId}`);
    return this.canonicalizer.canonicalize(data, '7shifts', 'shift');
  }
  
  async createShift(shiftData: {
    userId: number;
    locationId: number;
    departmentId: number;
    roleId: number;
    start: Date;
    end: Date;
    breakDuration?: number;
    published?: boolean;
    notes?: string;
  }): Promise<Shift> {
    const payload = {
      user_id: shiftData.userId,
      location_id: shiftData.locationId,
      department_id: shiftData.departmentId,
      role_id: shiftData.roleId,
      start: shiftData.start.toISOString(),
      end: shiftData.end.toISOString(),
      break_duration: shiftData.breakDuration || 0,
      published: shiftData.published || false,
      notes: shiftData.notes,
    };
    
    const data = await this.makeRequest('/shifts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    
    return this.canonicalizer.canonicalize(data, '7shifts', 'shift');
  }
  
  async updateShift(
    shiftId: number,
    updates: Partial<{
      start: Date;
      end: Date;
      breakDuration: number;
      notes: string;
      published: boolean;
    }>
  ): Promise<Shift> {
    const payload: any = {};
    
    if (updates.start) payload.start = updates.start.toISOString();
    if (updates.end) payload.end = updates.end.toISOString();
    if (updates.breakDuration !== undefined) payload.break_duration = updates.breakDuration;
    if (updates.notes) payload.notes = updates.notes;
    if (updates.published !== undefined) payload.published = updates.published;
    
    const data = await this.makeRequest(`/shifts/${shiftId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    
    return this.canonicalizer.canonicalize(data, '7shifts', 'shift');
  }
  
  async deleteShift(shiftId: number): Promise<void> {
    await this.makeRequest(`/shifts/${shiftId}`, {
      method: 'DELETE',
    });
  }
  
  async publishShifts(shiftIds: number[]): Promise<void> {
    await this.makeRequest('/shifts/publish', {
      method: 'POST',
      body: JSON.stringify({ shift_ids: shiftIds }),
    });
  }
  
  async unpublishShifts(shiftIds: number[]): Promise<void> {
    await this.makeRequest('/shifts/unpublish', {
      method: 'POST',
      body: JSON.stringify({ shift_ids: shiftIds }),
    });
  }
  
  // ==================== Time Punches ====================
  
  async getTimePunches(params: {
    startDate: Date;
    endDate: Date;
    locationId?: number;
    userId?: number;
  }): Promise<any[]> {
    const queryParams = new URLSearchParams({
      start: params.startDate.toISOString().split('T')[0],
      end: params.endDate.toISOString().split('T')[0],
    });
    
    if (params.locationId) {
      queryParams.append('location_id', params.locationId.toString());
    }
    if (params.userId) {
      queryParams.append('user_id', params.userId.toString());
    }
    
    const data = await this.makeRequest(`/time_punches?${queryParams}`);
    return data.data;
  }
  
  async clockIn(params: {
    userId: number;
    locationId: number;
    departmentId: number;
    roleId: number;
    timestamp?: Date;
  }): Promise<any> {
    const payload = {
      user_id: params.userId,
      location_id: params.locationId,
      department_id: params.departmentId,
      role_id: params.roleId,
      clocked_in: params.timestamp?.toISOString() || new Date().toISOString(),
    };
    
    const data = await this.makeRequest('/time_punches', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    
    return data;
  }
  
  async clockOut(timePunchId: number, timestamp?: Date): Promise<any> {
    const payload = {
      clocked_out: timestamp?.toISOString() || new Date().toISOString(),
    };
    
    const data = await this.makeRequest(`/time_punches/${timePunchId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    
    return data;
  }
  
  // ==================== Time Off ====================
  
  async getTimeOffRequests(params?: {
    startDate?: Date;
    endDate?: Date;
    userId?: number;
    status?: 'pending' | 'approved' | 'declined';
    limit?: number;
    offset?: number;
  }): Promise<{
    requests: SevenShiftsTimeOff[];
    total: number;
  }> {
    const queryParams = new URLSearchParams();
    
    if (params?.startDate) {
      queryParams.append('start', params.startDate.toISOString().split('T')[0]);
    }
    if (params?.endDate) {
      queryParams.append('end', params.endDate.toISOString().split('T')[0]);
    }
    if (params?.userId) {
      queryParams.append('user_id', params.userId.toString());
    }
    if (params?.status) {
      queryParams.append('status', params.status);
    }
    if (params?.limit) {
      queryParams.append('limit', params.limit.toString());
    }
    if (params?.offset) {
      queryParams.append('offset', params.offset.toString());
    }
    
    const data = await this.makeRequest(`/time_off?${queryParams}`);
    
    return {
      requests: data.data,
      total: data.meta.total,
    };
  }
  
  async createTimeOffRequest(request: {
    userId: number;
    type: 'unpaid' | 'vacation' | 'sick' | 'other';
    dates: Date[];
    partialDates?: Array<{
      date: Date;
      startTime: string;
      endTime: string;
    }>;
    comments?: string;
  }): Promise<SevenShiftsTimeOff> {
    const payload = {
      user_id: request.userId,
      type: request.type,
      dates: request.dates.map(d => d.toISOString().split('T')[0]),
      partial_dates: request.partialDates?.map(pd => ({
        date: pd.date.toISOString().split('T')[0],
        start_time: pd.startTime,
        end_time: pd.endTime,
      })),
      comments: request.comments,
    };
    
    const data = await this.makeRequest('/time_off', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    
    return data;
  }
  
  async approveTimeOff(requestId: number, approverId: number): Promise<void> {
    await this.makeRequest(`/time_off/${requestId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approver_id: approverId }),
    });
  }
  
  async declineTimeOff(requestId: number, reason?: string): Promise<void> {
    await this.makeRequest(`/time_off/${requestId}/decline`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }
  
  // ==================== Scheduling & Labor ====================
  
  async getSchedule(params: {
    weekStart: Date;
    locationId: number;
  }): Promise<SevenShiftsSchedule> {
    const queryParams = new URLSearchParams({
      week_start: params.weekStart.toISOString().split('T')[0],
      location_id: params.locationId.toString(),
    });
    
    const data = await this.makeRequest(`/schedule?${queryParams}`);
    return data;
  }
  
  async getLaborCost(params: {
    startDate: Date;
    endDate: Date;
    locationId?: number;
    departmentId?: number;
  }): Promise<{
    total: number;
    byDay: Array<{ date: string; cost: number }>;
    byDepartment: Array<{ departmentId: number; cost: number }>;
    byRole: Array<{ roleId: number; cost: number }>;
  }> {
    const queryParams = new URLSearchParams({
      start: params.startDate.toISOString().split('T')[0],
      end: params.endDate.toISOString().split('T')[0],
    });
    
    if (params.locationId) {
      queryParams.append('location_id', params.locationId.toString());
    }
    if (params.departmentId) {
      queryParams.append('department_id', params.departmentId.toString());
    }
    
    const data = await this.makeRequest(`/reports/labor_cost?${queryParams}`);
    return data;
  }
  
  async getOptimalSchedule(params: {
    weekStart: Date;
    locationId: number;
    targetLaborCost?: number;
    minStaffing?: Record<string, number>;
    maxStaffing?: Record<string, number>;
  }): Promise<any> {
    const payload = {
      week_start: params.weekStart.toISOString().split('T')[0],
      location_id: params.locationId,
      target_labor_cost: params.targetLaborCost,
      min_staffing: params.minStaffing,
      max_staffing: params.maxStaffing,
    };
    
    const data = await this.makeRequest('/schedule/optimize', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    
    return data;
  }
  
  // ==================== Availability ====================
  
  async getAvailability(params: {
    userId: number;
    startDate: Date;
    endDate: Date;
  }): Promise<any[]> {
    const queryParams = new URLSearchParams({
      user_id: params.userId.toString(),
      start: params.startDate.toISOString().split('T')[0],
      end: params.endDate.toISOString().split('T')[0],
    });
    
    const data = await this.makeRequest(`/availability?${queryParams}`);
    return data.data;
  }
  
  async setAvailability(availability: {
    userId: number;
    dayOfWeek: number;
    available: boolean;
    startTime?: string;
    endTime?: string;
  }): Promise<any> {
    const payload = {
      user_id: availability.userId,
      day_of_week: availability.dayOfWeek,
      available: availability.available,
      start_time: availability.startTime,
      end_time: availability.endTime,
    };
    
    const data = await this.makeRequest('/availability', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    
    return data;
  }
  
  // ==================== Reports & Analytics ====================
  
  async getAttendanceReport(params: {
    startDate: Date;
    endDate: Date;
    locationId?: number;
    userId?: number;
  }): Promise<any> {
    const queryParams = new URLSearchParams({
      start: params.startDate.toISOString().split('T')[0],
      end: params.endDate.toISOString().split('T')[0],
    });
    
    if (params.locationId) {
      queryParams.append('location_id', params.locationId.toString());
    }
    if (params.userId) {
      queryParams.append('user_id', params.userId.toString());
    }
    
    const data = await this.makeRequest(`/reports/attendance?${queryParams}`);
    return data;
  }
  
  async getScheduleAdherence(params: {
    startDate: Date;
    endDate: Date;
    locationId?: number;
  }): Promise<any> {
    const queryParams = new URLSearchParams({
      start: params.startDate.toISOString().split('T')[0],
      end: params.endDate.toISOString().split('T')[0],
    });
    
    if (params.locationId) {
      queryParams.append('location_id', params.locationId.toString());
    }
    
    const data = await this.makeRequest(`/reports/schedule_adherence?${queryParams}`);
    return data;
  }
  
  // ==================== Webhooks ====================
  
  async validateWebhook(payload: string, signature: string): Promise<boolean> {
    const crypto = await import('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', this.config.apiKey)
      .update(payload)
      .digest('hex');
      
    return signature === expectedSignature;
  }
  
  async processWebhook(event: {
    type: string;
    data: any;
  }): Promise<any> {
    switch (event.type) {
      case 'shift.created':
      case 'shift.updated':
      case 'shift.deleted':
        return this.canonicalizer.canonicalize(event.data, '7shifts', 'shift');
        
      case 'user.created':
      case 'user.updated':
        return this.canonicalizer.canonicalize(event.data, '7shifts', 'employee');
        
      case 'time_punch.created':
      case 'time_punch.updated':
        return event.data;
        
      default:
        return event.data;
    }
  }
  
  // ==================== Sync Operations ====================
  
  async syncEmployees(): Promise<Employee[]> {
    const allEmployees: Employee[] = [];
    let offset = 0;
    const limit = 100;
    
    while (true) {
      const response = await this.getEmployees({
        active: true,
        limit,
        offset,
      });
      
      allEmployees.push(...response.employees);
      
      if (allEmployees.length >= response.total) {
        break;
      }
      
      offset += limit;
    }
    
    return allEmployees;
  }
  
  async syncShifts(params: {
    startDate: Date;
    endDate: Date;
    locationId?: number;
  }): Promise<Shift[]> {
    return this.getShifts({
      startDate: params.startDate,
      endDate: params.endDate,
      locationId: params.locationId,
      status: 'published',
    });
  }
  
  async syncAllData(params?: {
    startDate?: Date;
    endDate?: Date;
    locationId?: number;
  }): Promise<{
    employees: Employee[];
    shifts: Shift[];
    departments: any[];
    roles: any[];
  }> {
    const [employees, shifts, departments, roles] = await Promise.all([
      this.syncEmployees(),
      params ? this.syncShifts(params) : Promise.resolve([]),
      this.getDepartments(params?.locationId),
      this.getRoles(params?.locationId),
    ]);
    
    return {
      employees,
      shifts,
      departments,
      roles,
    };
  }
}