import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Client for public operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
});

// Admin client for server-side operations
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Helper functions for common operations
export const supabaseHelpers = {
  async uploadFile(bucket: string, path: string, file: File | Blob) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        upsert: true,
        cacheControl: '3600',
      });
      
    if (error) throw error;
    return data;
  },
  
  async getSignedUrl(bucket: string, path: string, expiresIn: number = 3600) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);
      
    if (error) throw error;
    return data.signedUrl;
  },
  
  async subscribeToChanges(
    table: string,
    callback: (payload: any) => void,
    filter?: { column: string; value: any }
  ) {
    const channel = supabase
      .channel(`${table}-changes`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: filter ? `${filter.column}=eq.${filter.value}` : undefined,
        },
        callback
      )
      .subscribe();
      
    return channel;
  },
  
  async batchInsert<T extends Record<string, any>>(
    table: string,
    records: T[],
    batchSize: number = 1000
  ) {
    const results = [];
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const { data, error } = await supabaseAdmin
        .from(table)
        .insert(batch)
        .select();
        
      if (error) throw error;
      results.push(...(data || []));
    }
    
    return results;
  },
  
  async upsertWithConflict<T extends Record<string, any>>(
    table: string,
    records: T[],
    conflictColumns: string[]
  ) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .upsert(records, {
        onConflict: conflictColumns.join(','),
        ignoreDuplicates: false,
      })
      .select();
      
    if (error) throw error;
    return data;
  },
};