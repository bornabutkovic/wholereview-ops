export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      batch: {
        Row: {
          batch_id: string;
          np_sku_id: string;
          supplier_partner_id: string;
          lot_number: string | null;
          expiry_date: string | null;
          qty_initial: number;
          qty_unit: string;
          received_at: string | null;
          status: string;
          source_file: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          batch_id: string;
          np_sku_id: string;
          supplier_partner_id: string;
          lot_number?: string | null;
          expiry_date?: string | null;
          qty_initial: number;
          qty_unit: string;
          received_at?: string | null;
          status: string;
          source_file?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          batch_id?: string;
          np_sku_id?: string;
          supplier_partner_id?: string;
          lot_number?: string | null;
          expiry_date?: string | null;
          qty_initial?: number;
          qty_unit?: string;
          received_at?: string | null;
          status?: string;
          source_file?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "batch_np_sku_id_fkey";
            columns: ["np_sku_id"];
            isOneToOne: false;
            referencedRelation: "np_sku";
            referencedColumns: ["np_sku_id"];
          },
          {
            foreignKeyName: "batch_supplier_partner_id_fkey";
            columns: ["supplier_partner_id"];
            isOneToOne: false;
            referencedRelation: "partner";
            referencedColumns: ["partner_id"];
          },
        ];
      };
      email_log: {
        Row: {
          id: string;
          direction: string;
          status: string;
          from_address: string | null;
          to_address: string | null;
          subject: string | null;
          received_at: string | null;
          parsed_at: string | null;
          body_text: string | null;
          has_attachments: boolean;
          doc_type: string | null;
          parse_status: string | null;
          partner_id: string | null;
          linked_request_id: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          direction: string;
          status: string;
          from_address?: string | null;
          to_address?: string | null;
          subject?: string | null;
          received_at?: string | null;
          parsed_at?: string | null;
          body_text?: string | null;
          has_attachments?: boolean;
          doc_type?: string | null;
          parse_status?: string | null;
          partner_id?: string | null;
          linked_request_id?: string | null;
          notes?: string | null;
        };
        Update: {
          id?: string;
          direction?: string;
          status?: string;
          from_address?: string | null;
          to_address?: string | null;
          subject?: string | null;
          received_at?: string | null;
          parsed_at?: string | null;
          body_text?: string | null;
          has_attachments?: boolean;
          doc_type?: string | null;
          parse_status?: string | null;
          partner_id?: string | null;
          linked_request_id?: string | null;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "email_log_partner_id_fkey";
            columns: ["partner_id"];
            isOneToOne: false;
            referencedRelation: "partner";
            referencedColumns: ["partner_id"];
          },
        ];
      };
      incoming_requests: {
        Row: {
          id: string;
          email_log_id: string | null;
          partner_id: string | null;
          doc_type: string;
          status: string;
          po_number: string | null;
          received_at: string | null;
          is_urgent: boolean;
          cycle_ref: string | null;
          payment_confirmed: boolean;
          raw_text: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email_log_id?: string | null;
          partner_id?: string | null;
          doc_type: string;
          status: string;
          po_number?: string | null;
          received_at?: string | null;
          is_urgent?: boolean;
          cycle_ref?: string | null;
          payment_confirmed?: boolean;
          raw_text?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email_log_id?: string | null;
          partner_id?: string | null;
          doc_type?: string;
          status?: string;
          po_number?: string | null;
          received_at?: string | null;
          is_urgent?: boolean;
          cycle_ref?: string | null;
          payment_confirmed?: boolean;
          raw_text?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "incoming_requests_email_log_id_fkey";
            columns: ["email_log_id"];
            isOneToOne: false;
            referencedRelation: "email_log";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incoming_requests_partner_id_fkey";
            columns: ["partner_id"];
            isOneToOne: false;
            referencedRelation: "partner";
            referencedColumns: ["partner_id"];
          },
        ];
      };
      np_product: {
        Row: {
          np_product_id: string;
          brand: string;
          inn: string | null;
          atc_code: string | null;
          cold_chain: boolean;
          narcotic: boolean;
          status: string;
          notes: string | null;
          parent_product_id: string | null;
        };
        Insert: {
          np_product_id: string;
          brand: string;
          inn?: string | null;
          atc_code?: string | null;
          cold_chain?: boolean;
          narcotic?: boolean;
          status: string;
          notes?: string | null;
          parent_product_id?: string | null;
        };
        Update: {
          np_product_id?: string;
          brand?: string;
          inn?: string | null;
          atc_code?: string | null;
          cold_chain?: boolean;
          narcotic?: boolean;
          status?: string;
          notes?: string | null;
          parent_product_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "np_product_parent_product_id_fkey";
            columns: ["parent_product_id"];
            isOneToOne: false;
            referencedRelation: "np_product";
            referencedColumns: ["np_product_id"];
          },
        ];
      };
      np_sku: {
        Row: {
          np_sku_id: string;
          np_product_id: string;
          pack_description: string | null;
          origin_country: string | null;
          gtin_ean: string | null;
          status: string;
          hr_approval_no: string | null;
          eu_approval_no: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          np_sku_id: string;
          np_product_id: string;
          pack_description?: string | null;
          origin_country?: string | null;
          gtin_ean?: string | null;
          status: string;
          hr_approval_no?: string | null;
          eu_approval_no?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          np_sku_id?: string;
          np_product_id?: string;
          pack_description?: string | null;
          origin_country?: string | null;
          gtin_ean?: string | null;
          status?: string;
          hr_approval_no?: string | null;
          eu_approval_no?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "np_sku_np_product_id_fkey";
            columns: ["np_product_id"];
            isOneToOne: false;
            referencedRelation: "np_product";
            referencedColumns: ["np_product_id"];
          },
        ];
      };
      partner: {
        Row: {
          partner_id: string;
          name: string;
          country: string | null;
          contact_email: string | null;
          is_buyer: boolean;
          is_supplier: boolean;
          is_mah: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          partner_id: string;
          name: string;
          country?: string | null;
          contact_email?: string | null;
          is_buyer?: boolean;
          is_supplier?: boolean;
          is_mah?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          partner_id?: string;
          name?: string;
          country?: string | null;
          contact_email?: string | null;
          is_buyer?: boolean;
          is_supplier?: boolean;
          is_mah?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_code_alias: {
        Row: {
          alias_id: string;
          np_sku_id: string;
          partner_id: string | null;
          external_name: string | null;
          external_code: string | null;
          external_eu_no: string | null;
          external_hr_no: string | null;
          created_at: string;
        };
        Insert: {
          alias_id?: string;
          np_sku_id: string;
          partner_id?: string | null;
          external_name?: string | null;
          external_code?: string | null;
          external_eu_no?: string | null;
          external_hr_no?: string | null;
          created_at?: string;
        };
        Update: {
          alias_id?: string;
          np_sku_id?: string;
          partner_id?: string | null;
          external_name?: string | null;
          external_code?: string | null;
          external_eu_no?: string | null;
          external_hr_no?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_code_alias_np_sku_id_fkey";
            columns: ["np_sku_id"];
            isOneToOne: false;
            referencedRelation: "np_sku";
            referencedColumns: ["np_sku_id"];
          },
          {
            foreignKeyName: "product_code_alias_partner_id_fkey";
            columns: ["partner_id"];
            isOneToOne: false;
            referencedRelation: "partner";
            referencedColumns: ["partner_id"];
          },
        ];
      };
      product_mapping_learned: {
        Row: {
          id: string;
          raw_input: string;
          np_sku_id: string | null;
          partner_id: string | null;
          confidence: number | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          raw_input: string;
          np_sku_id?: string | null;
          partner_id?: string | null;
          confidence?: number | null;
          status: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          raw_input?: string;
          np_sku_id?: string | null;
          partner_id?: string | null;
          confidence?: number | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_mapping_learned_np_sku_id_fkey";
            columns: ["np_sku_id"];
            isOneToOne: false;
            referencedRelation: "np_sku";
            referencedColumns: ["np_sku_id"];
          },
          {
            foreignKeyName: "product_mapping_learned_partner_id_fkey";
            columns: ["partner_id"];
            isOneToOne: false;
            referencedRelation: "partner";
            referencedColumns: ["partner_id"];
          },
        ];
      };
      request_items: {
        Row: {
          id: string;
          incoming_request_id: string;
          np_sku_id: string | null;
          raw_product_ref: string | null;
          qty_requested: number | null;
          qty_unit: string | null;
          offered_price: number | null;
          min_expiry_months: number | null;
          status: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          incoming_request_id: string;
          np_sku_id?: string | null;
          raw_product_ref?: string | null;
          qty_requested?: number | null;
          qty_unit?: string | null;
          offered_price?: number | null;
          min_expiry_months?: number | null;
          status: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          incoming_request_id?: string;
          np_sku_id?: string | null;
          raw_product_ref?: string | null;
          qty_requested?: number | null;
          qty_unit?: string | null;
          offered_price?: number | null;
          min_expiry_months?: number | null;
          status?: string;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "request_items_incoming_request_id_fkey";
            columns: ["incoming_request_id"];
            isOneToOne: false;
            referencedRelation: "incoming_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_items_np_sku_id_fkey";
            columns: ["np_sku_id"];
            isOneToOne: false;
            referencedRelation: "np_sku";
            referencedColumns: ["np_sku_id"];
          },
        ];
      };
      review_queue: {
        Row: {
          id: string;
          email_id: string | null;
          request_id: string | null;
          item_id: string | null;
          category: string;
          status: string;
          description: string | null;
          suggested_value: string | null;
          payload: Json | null;
          resolution_note: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email_id?: string | null;
          request_id?: string | null;
          item_id?: string | null;
          category: string;
          status?: string;
          description?: string | null;
          suggested_value?: string | null;
          payload?: Json | null;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email_id?: string | null;
          request_id?: string | null;
          item_id?: string | null;
          category?: string;
          status?: string;
          description?: string | null;
          suggested_value?: string | null;
          payload?: Json | null;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      supplier_offers: {
        Row: {
          id: string;
          incoming_request_id: string;
          supplier: string;
          np_sku_id: string | null;
          raw_product_name: string | null;
          quantity_offered: number;
          unit: string;
          price_per_unit: number | null;
          currency: string;
          expiry_date: string | null;
          batch_number: string | null;
          buyer_min_expiry_date: string | null;
          buyer_quantity_req: number | null;
          expiry_ok: boolean | null;
          status: string;
          source_email_id: string | null;
          raw_email_body: string | null;
          ivana_note: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          incoming_request_id: string;
          supplier: string;
          np_sku_id?: string | null;
          raw_product_name?: string | null;
          quantity_offered: number;
          unit: string;
          price_per_unit?: number | null;
          currency: string;
          expiry_date?: string | null;
          batch_number?: string | null;
          buyer_min_expiry_date?: string | null;
          buyer_quantity_req?: number | null;
          expiry_ok?: boolean | null;
          status: string;
          source_email_id?: string | null;
          raw_email_body?: string | null;
          ivana_note?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          incoming_request_id?: string;
          supplier?: string;
          np_sku_id?: string | null;
          raw_product_name?: string | null;
          quantity_offered?: number;
          unit?: string;
          price_per_unit?: number | null;
          currency?: string;
          expiry_date?: string | null;
          batch_number?: string | null;
          buyer_min_expiry_date?: string | null;
          buyer_quantity_req?: number | null;
          expiry_ok?: boolean | null;
          status?: string;
          source_email_id?: string | null;
          raw_email_body?: string | null;
          ivana_note?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "supplier_offers_incoming_request_id_fkey";
            columns: ["incoming_request_id"];
            isOneToOne: false;
            referencedRelation: "incoming_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_offers_np_sku_id_fkey";
            columns: ["np_sku_id"];
            isOneToOne: false;
            referencedRelation: "np_sku";
            referencedColumns: ["np_sku_id"];
          },
          {
            foreignKeyName: "supplier_offers_source_email_id_fkey";
            columns: ["source_email_id"];
            isOneToOne: false;
            referencedRelation: "email_log";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          role: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          role?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type DefaultSchema = Database[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;
