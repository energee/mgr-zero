export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      allocations: {
        Row: {
          brewery_id: string
          created_at: string
          id: string
          qty: number
          ref: string
          sku_id: string
          source: Database["public"]["Enums"]["allocation_source"]
          status: Database["public"]["Enums"]["allocation_status"]
        }
        Insert: {
          brewery_id: string
          created_at?: string
          id?: string
          qty: number
          ref: string
          sku_id: string
          source: Database["public"]["Enums"]["allocation_source"]
          status?: Database["public"]["Enums"]["allocation_status"]
        }
        Update: {
          brewery_id?: string
          created_at?: string
          id?: string
          qty?: number
          ref?: string
          sku_id?: string
          source?: Database["public"]["Enums"]["allocation_source"]
          status?: Database["public"]["Enums"]["allocation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "allocations_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "atp"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "allocations_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "sku_prices"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "allocations_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      batch_additions: {
        Row: {
          at: string
          batch_id: string
          brewery_id: string
          id: string
          movement_id: string
          occupancy_id: string | null
          recipe_ingredient_id: string | null
          stage: Database["public"]["Enums"]["ingredient_stage"]
        }
        Insert: {
          at?: string
          batch_id: string
          brewery_id: string
          id?: string
          movement_id: string
          occupancy_id?: string | null
          recipe_ingredient_id?: string | null
          stage: Database["public"]["Enums"]["ingredient_stage"]
        }
        Update: {
          at?: string
          batch_id?: string
          brewery_id?: string
          id?: string
          movement_id?: string
          occupancy_id?: string | null
          recipe_ingredient_id?: string | null
          stage?: Database["public"]["Enums"]["ingredient_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "batch_additions_batch_id_brewery_id_fkey"
            columns: ["batch_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "batch_additions_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_additions_movement_id_brewery_id_fkey"
            columns: ["movement_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "material_movements"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "batch_additions_occupancy_id_brewery_id_fkey"
            columns: ["occupancy_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "occupancy_volumes"
            referencedColumns: ["occupancy_id", "brewery_id"]
          },
          {
            foreignKeyName: "batch_additions_occupancy_id_brewery_id_fkey"
            columns: ["occupancy_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "vessel_occupancies"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "batch_additions_recipe_ingredient_id_brewery_id_fkey"
            columns: ["recipe_ingredient_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "recipe_ingredients"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      batches: {
        Row: {
          batch_no: number | null
          brewed_on: string | null
          brewery_id: string
          closed_at: string | null
          completion_adjustment_id: string | null
          created_at: string
          created_by: string
          id: string
          intended_brand_id: string | null
          note: string | null
          planned_bbl: number
          planned_on: string
          recipe_version_id: string | null
        }
        Insert: {
          batch_no?: number | null
          brewed_on?: string | null
          brewery_id: string
          closed_at?: string | null
          completion_adjustment_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          intended_brand_id?: string | null
          note?: string | null
          planned_bbl: number
          planned_on: string
          recipe_version_id?: string | null
        }
        Update: {
          batch_no?: number | null
          brewed_on?: string | null
          brewery_id?: string
          closed_at?: string | null
          completion_adjustment_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          intended_brand_id?: string | null
          note?: string | null
          planned_bbl?: number
          planned_on?: string
          recipe_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_completion_adjustment_fk"
            columns: ["completion_adjustment_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "volume_adjustments"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "batches_intended_brand_id_brewery_id_fkey"
            columns: ["intended_brand_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "batches_intended_brand_id_brewery_id_fkey"
            columns: ["intended_brand_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "product_volume_requirements"
            referencedColumns: ["brand_id", "brewery_id"]
          },
          {
            foreignKeyName: "batches_recipe_version_id_brewery_id_fkey"
            columns: ["recipe_version_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      bins: {
        Row: {
          brewery_id: string
          created_at: string
          id: string
          location_id: string
          name: string
        }
        Insert: {
          brewery_id: string
          created_at?: string
          id?: string
          location_id: string
          name: string
        }
        Update: {
          brewery_id?: string
          created_at?: string
          id?: string
          location_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "bins_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bins_location_id_brewery_id_fkey"
            columns: ["location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      brand_approvals: {
        Row: {
          approved_on: string | null
          brand_id: string
          brewery_id: string
          expires_on: string | null
          id: string
          kind: Database["public"]["Enums"]["approval_kind"]
          note: string | null
          ttb_id: string
        }
        Insert: {
          approved_on?: string | null
          brand_id: string
          brewery_id: string
          expires_on?: string | null
          id?: string
          kind: Database["public"]["Enums"]["approval_kind"]
          note?: string | null
          ttb_id: string
        }
        Update: {
          approved_on?: string | null
          brand_id?: string
          brewery_id?: string
          expires_on?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["approval_kind"]
          note?: string | null
          ttb_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_approvals_brand_id_brewery_id_fkey"
            columns: ["brand_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "brand_approvals_brand_id_brewery_id_fkey"
            columns: ["brand_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "product_volume_requirements"
            referencedColumns: ["brand_id", "brewery_id"]
          },
          {
            foreignKeyName: "brand_approvals_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          abv: number | null
          brewery_id: string
          category: string | null
          created_at: string
          description: string | null
          hops: string | null
          id: string
          name: string
          price_group_id: string | null
          style_id: string | null
          ttb_tax_class: string
        }
        Insert: {
          abv?: number | null
          brewery_id: string
          category?: string | null
          created_at?: string
          description?: string | null
          hops?: string | null
          id?: string
          name: string
          price_group_id?: string | null
          style_id?: string | null
          ttb_tax_class?: string
        }
        Update: {
          abv?: number | null
          brewery_id?: string
          category?: string | null
          created_at?: string
          description?: string | null
          hops?: string | null
          id?: string
          name?: string
          price_group_id?: string | null
          style_id?: string | null
          ttb_tax_class?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brands_catalog_category_fk"
            columns: ["brewery_id", "category"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["brewery_id", "name"]
          },
          {
            foreignKeyName: "brands_price_group_id_brewery_id_fkey"
            columns: ["price_group_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "price_groups"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "brands_style_id_brewery_id_fkey"
            columns: ["style_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "styles"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      breweries: {
        Row: {
          created_at: string
          customer_phone: string | null
          fermentation_reading_due_hours: number
          gravity_unit: string
          id: string
          name: string
          pa_license_no: string | null
          portal_fulfillment_location_id: string | null
          settings: Json
          timezone: string
          ttb_registry_no: string | null
        }
        Insert: {
          created_at?: string
          customer_phone?: string | null
          fermentation_reading_due_hours?: number
          gravity_unit?: string
          id?: string
          name: string
          pa_license_no?: string | null
          portal_fulfillment_location_id?: string | null
          settings?: Json
          timezone?: string
          ttb_registry_no?: string | null
        }
        Update: {
          created_at?: string
          customer_phone?: string | null
          fermentation_reading_due_hours?: number
          gravity_unit?: string
          id?: string
          name?: string
          pa_license_no?: string | null
          portal_fulfillment_location_id?: string | null
          settings?: Json
          timezone?: string
          ttb_registry_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "breweries_portal_fulfillment_location_id_id_fkey"
            columns: ["portal_fulfillment_location_id", "id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      brewery_counters: {
        Row: {
          brewery_id: string
          key: string
          next: number
        }
        Insert: {
          brewery_id: string
          key: string
          next?: number
        }
        Update: {
          brewery_id?: string
          key?: string
          next?: number
        }
        Relationships: [
          {
            foreignKeyName: "brewery_counters_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      brewery_state_licenses: {
        Row: {
          brewery_id: string
          expires_on: string | null
          id: string
          kind: string
          license_no: string | null
          note: string | null
          state: string
        }
        Insert: {
          brewery_id: string
          expires_on?: string | null
          id?: string
          kind: string
          license_no?: string | null
          note?: string | null
          state: string
        }
        Update: {
          brewery_id?: string
          expires_on?: string | null
          id?: string
          kind?: string
          license_no?: string | null
          note?: string | null
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "brewery_state_licenses_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      brewery_users: {
        Row: {
          brewery_id: string
          created_at: string
          gravity_unit: string | null
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Insert: {
          brewery_id: string
          created_at?: string
          gravity_unit?: string | null
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Update: {
          brewery_id?: string
          created_at?: string
          gravity_unit?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brewery_users_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_categories: {
        Row: {
          brewery_id: string
          name: string
        }
        Insert: {
          brewery_id: string
          name: string
        }
        Update: {
          brewery_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_categories_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_prices: {
        Row: {
          brewery_id: string
          format_id: string
          price_group_id: string
          sale_channel_id: string
          unit_price_cents: number
        }
        Insert: {
          brewery_id: string
          format_id: string
          price_group_id: string
          sale_channel_id: string
          unit_price_cents: number
        }
        Update: {
          brewery_id?: string
          format_id?: string
          price_group_id?: string
          sale_channel_id?: string
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "channel_prices_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_prices_format_id_brewery_id_fkey"
            columns: ["format_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "format_volumes"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "channel_prices_format_id_brewery_id_fkey"
            columns: ["format_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "channel_prices_price_group_id_brewery_id_fkey"
            columns: ["price_group_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "price_groups"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "channel_prices_sale_channel_id_brewery_id_fkey"
            columns: ["sale_channel_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "sale_channels"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      chat_action_intents: {
        Row: {
          action_origin_hash: string
          allowed_action: string
          brewery_id: string
          command_name: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          external_user_id: string | null
          first_result_reference: string | null
          id: string
          input_hash: string
          installation_id: string
          integration_input: Json
          preview_token_hash: string
          provider: string
          request_id: string
          subject_id: string
          subject_type: string
          subject_version: string
          user_id: string
        }
        Insert: {
          action_origin_hash: string
          allowed_action: string
          brewery_id: string
          command_name: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          external_user_id?: string | null
          first_result_reference?: string | null
          id?: string
          input_hash: string
          installation_id: string
          integration_input?: Json
          preview_token_hash: string
          provider: string
          request_id: string
          subject_id: string
          subject_type: string
          subject_version: string
          user_id: string
        }
        Update: {
          action_origin_hash?: string
          allowed_action?: string
          brewery_id?: string
          command_name?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          external_user_id?: string | null
          first_result_reference?: string | null
          id?: string
          input_hash?: string
          installation_id?: string
          integration_input?: Json
          preview_token_hash?: string
          provider?: string
          request_id?: string
          subject_id?: string
          subject_type?: string
          subject_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_action_intents_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_action_intents_installation_id_brewery_id_provider_fkey"
            columns: ["installation_id", "brewery_id", "provider"]
            isOneToOne: false
            referencedRelation: "chat_installations"
            referencedColumns: ["id", "brewery_id", "provider"]
          },
        ]
      }
      chat_callback_receipts: {
        Row: {
          brewery_id: string
          callback_id: string
          callback_kind: string
          completed_at: string | null
          disposition: string
          error_code: string | null
          external_user_id: string | null
          id: string
          installation_id: string
          payload_hash: string
          processing_at: string | null
          provider: string
          received_at: string
          result: Json | null
        }
        Insert: {
          brewery_id: string
          callback_id: string
          callback_kind: string
          completed_at?: string | null
          disposition: string
          error_code?: string | null
          external_user_id?: string | null
          id?: string
          installation_id: string
          payload_hash: string
          processing_at?: string | null
          provider: string
          received_at: string
          result?: Json | null
        }
        Update: {
          brewery_id?: string
          callback_id?: string
          callback_kind?: string
          completed_at?: string | null
          disposition?: string
          error_code?: string | null
          external_user_id?: string | null
          id?: string
          installation_id?: string
          payload_hash?: string
          processing_at?: string | null
          provider?: string
          received_at?: string
          result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_callback_receipts_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_callback_receipts_installation_id_brewery_id_provider_fkey"
            columns: ["installation_id", "brewery_id", "provider"]
            isOneToOne: false
            referencedRelation: "chat_installations"
            referencedColumns: ["id", "brewery_id", "provider"]
          },
        ]
      }
      chat_installations: {
        Row: {
          brewery_id: string
          created_at: string
          disabled_at: string | null
          disconnected_at: string | null
          display_label: string
          external_enterprise_id: string | null
          external_installation_id: string
          granted_capabilities: Json
          id: string
          installed_at: string | null
          installer_user_id: string
          last_failure_code: string | null
          last_health_checked_at: string | null
          last_healthy_at: string | null
          oauth_consumed_at: string | null
          oauth_expires_at: string | null
          oauth_intent_hash: string | null
          oauth_intent_kind: string | null
          oauth_reconciled_at: string | null
          oauth_redirect_uri: string | null
          provider: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          quiet_hours_timezone: string | null
          state: string
          token_store_key: string
          updated_at: string
        }
        Insert: {
          brewery_id: string
          created_at?: string
          disabled_at?: string | null
          disconnected_at?: string | null
          display_label: string
          external_enterprise_id?: string | null
          external_installation_id: string
          granted_capabilities?: Json
          id?: string
          installed_at?: string | null
          installer_user_id: string
          last_failure_code?: string | null
          last_health_checked_at?: string | null
          last_healthy_at?: string | null
          oauth_consumed_at?: string | null
          oauth_expires_at?: string | null
          oauth_intent_hash?: string | null
          oauth_intent_kind?: string | null
          oauth_reconciled_at?: string | null
          oauth_redirect_uri?: string | null
          provider: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          quiet_hours_timezone?: string | null
          state: string
          token_store_key: string
          updated_at?: string
        }
        Update: {
          brewery_id?: string
          created_at?: string
          disabled_at?: string | null
          disconnected_at?: string | null
          display_label?: string
          external_enterprise_id?: string | null
          external_installation_id?: string
          granted_capabilities?: Json
          id?: string
          installed_at?: string | null
          installer_user_id?: string
          last_failure_code?: string | null
          last_health_checked_at?: string | null
          last_healthy_at?: string | null
          oauth_consumed_at?: string | null
          oauth_expires_at?: string | null
          oauth_intent_hash?: string | null
          oauth_intent_kind?: string | null
          oauth_reconciled_at?: string | null
          oauth_redirect_uri?: string | null
          provider?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          quiet_hours_timezone?: string | null
          state?: string
          token_store_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_installations_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_user_links: {
        Row: {
          brewery_id: string
          created_at: string
          disabled_at: string | null
          external_user_id: string
          id: string
          installation_id: string
          linked_at: string | null
          proof_consumed_at: string | null
          proof_expires_at: string | null
          proof_hash: string | null
          proof_issued_at: string | null
          provider: string
          state: string
          unlinked_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          brewery_id: string
          created_at?: string
          disabled_at?: string | null
          external_user_id: string
          id?: string
          installation_id: string
          linked_at?: string | null
          proof_consumed_at?: string | null
          proof_expires_at?: string | null
          proof_hash?: string | null
          proof_issued_at?: string | null
          provider: string
          state: string
          unlinked_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          brewery_id?: string
          created_at?: string
          disabled_at?: string | null
          external_user_id?: string
          id?: string
          installation_id?: string
          linked_at?: string | null
          proof_consumed_at?: string | null
          proof_expires_at?: string | null
          proof_hash?: string | null
          proof_issued_at?: string | null
          provider?: string
          state?: string
          unlinked_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_user_links_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_user_links_installation_id_brewery_id_provider_fkey"
            columns: ["installation_id", "brewery_id", "provider"]
            isOneToOne: false
            referencedRelation: "chat_installations"
            referencedColumns: ["id", "brewery_id", "provider"]
          },
        ]
      }
      customer_users: {
        Row: {
          created_at: string
          customer_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_users_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          brewery_id: string
          created_at: string
          id: string
          license_no: string | null
          name: string
          payment_terms: string
          qbo_customer_id: string | null
          qbo_realm_id: string | null
          sale_channel_id: string
          state: string
          tax_treatment: Database["public"]["Enums"]["tax_treatment"] | null
          type: Database["public"]["Enums"]["customer_type"]
        }
        Insert: {
          brewery_id: string
          created_at?: string
          id?: string
          license_no?: string | null
          name: string
          payment_terms?: string
          qbo_customer_id?: string | null
          qbo_realm_id?: string | null
          sale_channel_id: string
          state: string
          tax_treatment?: Database["public"]["Enums"]["tax_treatment"] | null
          type?: Database["public"]["Enums"]["customer_type"]
        }
        Update: {
          brewery_id?: string
          created_at?: string
          id?: string
          license_no?: string | null
          name?: string
          payment_terms?: string
          qbo_customer_id?: string | null
          qbo_realm_id?: string | null
          sale_channel_id?: string
          state?: string
          tax_treatment?: Database["public"]["Enums"]["tax_treatment"] | null
          type?: Database["public"]["Enums"]["customer_type"]
        }
        Relationships: [
          {
            foreignKeyName: "customers_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_sale_channel_fk"
            columns: ["sale_channel_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "sale_channels"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      deliveries: {
        Row: {
          brewery_id: string
          delivered_at: string | null
          id: string
          note: string | null
          route_id: string
          shipment_id: string | null
          signed_by: string | null
          stock_transfer_id: string | null
          stop_no: number
        }
        Insert: {
          brewery_id: string
          delivered_at?: string | null
          id?: string
          note?: string | null
          route_id: string
          shipment_id?: string | null
          signed_by?: string | null
          stock_transfer_id?: string | null
          stop_no: number
        }
        Update: {
          brewery_id?: string
          delivered_at?: string | null
          id?: string
          note?: string | null
          route_id?: string
          shipment_id?: string | null
          signed_by?: string | null
          stock_transfer_id?: string | null
          stop_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_route_id_brewery_id_fkey"
            columns: ["route_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "deliveries_shipment_id_brewery_id_fkey"
            columns: ["shipment_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "deliveries_stock_transfer_id_brewery_id_fkey"
            columns: ["stock_transfer_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      fermentation_readings: {
        Row: {
          at: string
          brewery_id: string
          created_by: string
          gravity_plato: number | null
          id: string
          note: string | null
          occupancy_id: string
          ph: number | null
          temp_f: number | null
        }
        Insert: {
          at?: string
          brewery_id: string
          created_by: string
          gravity_plato?: number | null
          id?: string
          note?: string | null
          occupancy_id: string
          ph?: number | null
          temp_f?: number | null
        }
        Update: {
          at?: string
          brewery_id?: string
          created_by?: string
          gravity_plato?: number | null
          id?: string
          note?: string | null
          occupancy_id?: string
          ph?: number | null
          temp_f?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fermentation_readings_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fermentation_readings_occupancy_id_brewery_id_fkey"
            columns: ["occupancy_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "occupancy_volumes"
            referencedColumns: ["occupancy_id", "brewery_id"]
          },
          {
            foreignKeyName: "fermentation_readings_occupancy_id_brewery_id_fkey"
            columns: ["occupancy_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "vessel_occupancies"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      format_bom: {
        Row: {
          brewery_id: string
          format_id: string
          material_id: string
          on_break: Database["public"]["Enums"]["format_material_disposition"]
          qty_per_unit: number
        }
        Insert: {
          brewery_id: string
          format_id: string
          material_id: string
          on_break?: Database["public"]["Enums"]["format_material_disposition"]
          qty_per_unit: number
        }
        Update: {
          brewery_id?: string
          format_id?: string
          material_id?: string
          on_break?: Database["public"]["Enums"]["format_material_disposition"]
          qty_per_unit?: number
        }
        Relationships: [
          {
            foreignKeyName: "format_bom_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "format_bom_format_id_brewery_id_fkey"
            columns: ["format_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "format_volumes"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "format_bom_format_id_brewery_id_fkey"
            columns: ["format_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "format_bom_material_id_brewery_id_fkey"
            columns: ["material_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      format_components: {
        Row: {
          brewery_id: string
          child_format_id: string
          parent_format_id: string
          qty: number
        }
        Insert: {
          brewery_id: string
          child_format_id: string
          parent_format_id: string
          qty: number
        }
        Update: {
          brewery_id?: string
          child_format_id?: string
          parent_format_id?: string
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "format_components_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "format_components_child_format_id_brewery_id_fkey"
            columns: ["child_format_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "format_volumes"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "format_components_child_format_id_brewery_id_fkey"
            columns: ["child_format_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "format_components_parent_format_id_brewery_id_fkey"
            columns: ["parent_format_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "format_volumes"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "format_components_parent_format_id_brewery_id_fkey"
            columns: ["parent_format_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      formats: {
        Row: {
          basis: Database["public"]["Enums"]["format_basis"]
          bbl_per_unit: number | null
          brand_id: string | null
          brewery_id: string
          created_at: string
          id: string
          keg_size: Database["public"]["Enums"]["keg_size"] | null
          name: string
          ounces: number | null
          package_type: Database["public"]["Enums"]["package_type"] | null
          units_per_case: number | null
        }
        Insert: {
          basis: Database["public"]["Enums"]["format_basis"]
          bbl_per_unit?: number | null
          brand_id?: string | null
          brewery_id: string
          created_at?: string
          id?: string
          keg_size?: Database["public"]["Enums"]["keg_size"] | null
          name: string
          ounces?: number | null
          package_type?: Database["public"]["Enums"]["package_type"] | null
          units_per_case?: number | null
        }
        Update: {
          basis?: Database["public"]["Enums"]["format_basis"]
          bbl_per_unit?: number | null
          brand_id?: string | null
          brewery_id?: string
          created_at?: string
          id?: string
          keg_size?: Database["public"]["Enums"]["keg_size"] | null
          name?: string
          ounces?: number | null
          package_type?: Database["public"]["Enums"]["package_type"] | null
          units_per_case?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "formats_brand_id_brewery_id_fkey"
            columns: ["brand_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "formats_brand_id_brewery_id_fkey"
            columns: ["brand_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "product_volume_requirements"
            referencedColumns: ["brand_id", "brewery_id"]
          },
          {
            foreignKeyName: "formats_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          bbl: number
          bin_id: string
          brewery_id: string
          compensates_id: string | null
          correction_source_id: string | null
          created_at: string
          created_by: string
          dest_state: string | null
          id: string
          location_id: string
          lot_id: string | null
          note: string | null
          package_type: Database["public"]["Enums"]["package_type"]
          qty: number
          ref: string | null
          sale_channel_id: string | null
          sku_id: string
          source_movement_id: string | null
          tax_treatment: Database["public"]["Enums"]["tax_treatment"] | null
          type: Database["public"]["Enums"]["movement_type"]
        }
        Insert: {
          bbl: number
          bin_id: string
          brewery_id: string
          compensates_id?: string | null
          correction_source_id?: string | null
          created_at?: string
          created_by: string
          dest_state?: string | null
          id?: string
          location_id: string
          lot_id?: string | null
          note?: string | null
          package_type: Database["public"]["Enums"]["package_type"]
          qty: number
          ref?: string | null
          sale_channel_id?: string | null
          sku_id: string
          source_movement_id?: string | null
          tax_treatment?: Database["public"]["Enums"]["tax_treatment"] | null
          type: Database["public"]["Enums"]["movement_type"]
        }
        Update: {
          bbl?: number
          bin_id?: string
          brewery_id?: string
          compensates_id?: string | null
          correction_source_id?: string | null
          created_at?: string
          created_by?: string
          dest_state?: string | null
          id?: string
          location_id?: string
          lot_id?: string | null
          note?: string | null
          package_type?: Database["public"]["Enums"]["package_type"]
          qty?: number
          ref?: string | null
          sale_channel_id?: string | null
          sku_id?: string
          source_movement_id?: string | null
          tax_treatment?: Database["public"]["Enums"]["tax_treatment"] | null
          type?: Database["public"]["Enums"]["movement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_bin_id_location_id_brewery_id_fkey"
            columns: ["bin_id", "location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "bins"
            referencedColumns: ["id", "location_id", "brewery_id"]
          },
          {
            foreignKeyName: "inventory_movements_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_compensates_id_brewery_id_fkey"
            columns: ["compensates_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "inventory_movements_correction_source_id_brewery_id_fkey"
            columns: ["correction_source_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "inventory_movements_location_id_brewery_id_fkey"
            columns: ["location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "inventory_movements_lot_fk"
            columns: ["lot_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "inventory_movements_sale_channel_id_brewery_id_fkey"
            columns: ["sale_channel_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "sale_channels"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "inventory_movements_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "atp"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "inventory_movements_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "sku_prices"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "inventory_movements_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "inventory_movements_source_movement_id_brewery_id_fkey"
            columns: ["source_movement_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          amount_cents: number | null
          brewery_id: string
          credited_invoice_line_id: string | null
          description: string
          id: string
          invoice_id: string
          keg_pool_id: string | null
          keg_size: Database["public"]["Enums"]["keg_size"] | null
          kind: Database["public"]["Enums"]["invoice_line_kind"]
          order_line_id: string | null
          qty: number
          sku_id: string | null
          unit_price_cents: number
        }
        Insert: {
          amount_cents?: number | null
          brewery_id: string
          credited_invoice_line_id?: string | null
          description: string
          id?: string
          invoice_id: string
          keg_pool_id?: string | null
          keg_size?: Database["public"]["Enums"]["keg_size"] | null
          kind?: Database["public"]["Enums"]["invoice_line_kind"]
          order_line_id?: string | null
          qty: number
          sku_id?: string | null
          unit_price_cents: number
        }
        Update: {
          amount_cents?: number | null
          brewery_id?: string
          credited_invoice_line_id?: string | null
          description?: string
          id?: string
          invoice_id?: string
          keg_pool_id?: string | null
          keg_size?: Database["public"]["Enums"]["keg_size"] | null
          kind?: Database["public"]["Enums"]["invoice_line_kind"]
          order_line_id?: string | null
          qty?: number
          sku_id?: string | null
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_credited_invoice_line_id_brewery_id_fkey"
            columns: ["credited_invoice_line_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "invoice_lines"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_brewery_id_fkey"
            columns: ["invoice_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "invoice_totals"
            referencedColumns: ["invoice_id", "brewery_id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_brewery_id_fkey"
            columns: ["invoice_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "invoice_lines_keg_pool_id_brewery_id_fkey"
            columns: ["keg_pool_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "keg_pools"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "invoice_lines_order_line_id_brewery_id_fkey"
            columns: ["order_line_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "order_lines"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "invoice_lines_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "atp"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "invoice_lines_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "sku_prices"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "invoice_lines_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      invoice_questions: {
        Row: {
          answered_at: string | null
          answered_by: string | null
          body: string
          brewery_id: string
          created_at: string
          created_by: string
          customer_id: string
          id: string
          invoice_id: string
        }
        Insert: {
          answered_at?: string | null
          answered_by?: string | null
          body: string
          brewery_id: string
          created_at?: string
          created_by: string
          customer_id: string
          id?: string
          invoice_id: string
        }
        Update: {
          answered_at?: string | null
          answered_by?: string | null
          body?: string
          brewery_id?: string
          created_at?: string
          created_by?: string
          customer_id?: string
          id?: string
          invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_questions_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_questions_customer_id_brewery_id_fkey"
            columns: ["customer_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "invoice_questions_invoice_id_brewery_id_fkey"
            columns: ["invoice_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "invoice_totals"
            referencedColumns: ["invoice_id", "brewery_id"]
          },
          {
            foreignKeyName: "invoice_questions_invoice_id_brewery_id_fkey"
            columns: ["invoice_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      invoices: {
        Row: {
          brewery_id: string
          created_at: string
          customer_id: string
          due_on: string | null
          id: string
          invoice_no: number | null
          issued_on: string
          kind: Database["public"]["Enums"]["invoice_kind"]
          paid_at: string | null
          qbo_accountant_drift: boolean
          qbo_balance_cents: number | null
          qbo_cash_collected_cents: number
          qbo_idempotency_key: string
          qbo_invoice_id: string | null
          qbo_remote_state: Database["public"]["Enums"]["qbo_remote_state"]
          qbo_sync_error: string | null
          qbo_sync_generation: number
          qbo_sync_status: Database["public"]["Enums"]["qbo_sync_status"]
          qbo_sync_token: string | null
          qbo_tax_cents: number | null
          qbo_total_cents: number | null
          shipment_id: string | null
          written_off_at: string | null
          written_off_by: string | null
          written_off_reason: string | null
        }
        Insert: {
          brewery_id: string
          created_at?: string
          customer_id: string
          due_on?: string | null
          id?: string
          invoice_no?: number | null
          issued_on?: string
          kind?: Database["public"]["Enums"]["invoice_kind"]
          paid_at?: string | null
          qbo_accountant_drift?: boolean
          qbo_balance_cents?: number | null
          qbo_cash_collected_cents?: number
          qbo_idempotency_key?: string
          qbo_invoice_id?: string | null
          qbo_remote_state?: Database["public"]["Enums"]["qbo_remote_state"]
          qbo_sync_error?: string | null
          qbo_sync_generation?: number
          qbo_sync_status?: Database["public"]["Enums"]["qbo_sync_status"]
          qbo_sync_token?: string | null
          qbo_tax_cents?: number | null
          qbo_total_cents?: number | null
          shipment_id?: string | null
          written_off_at?: string | null
          written_off_by?: string | null
          written_off_reason?: string | null
        }
        Update: {
          brewery_id?: string
          created_at?: string
          customer_id?: string
          due_on?: string | null
          id?: string
          invoice_no?: number | null
          issued_on?: string
          kind?: Database["public"]["Enums"]["invoice_kind"]
          paid_at?: string | null
          qbo_accountant_drift?: boolean
          qbo_balance_cents?: number | null
          qbo_cash_collected_cents?: number
          qbo_idempotency_key?: string
          qbo_invoice_id?: string | null
          qbo_remote_state?: Database["public"]["Enums"]["qbo_remote_state"]
          qbo_sync_error?: string | null
          qbo_sync_generation?: number
          qbo_sync_status?: Database["public"]["Enums"]["qbo_sync_status"]
          qbo_sync_token?: string | null
          qbo_tax_cents?: number | null
          qbo_total_cents?: number | null
          shipment_id?: string | null
          written_off_at?: string | null
          written_off_by?: string | null
          written_off_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_brewery_id_fkey"
            columns: ["customer_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "invoices_shipment_id_brewery_id_fkey"
            columns: ["shipment_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      keg_events: {
        Row: {
          at: string
          bin_id: string
          brewery_id: string
          created_at: string
          created_by: string
          customer_id: string | null
          id: string
          keg_size: Database["public"]["Enums"]["keg_size"]
          location_id: string
          note: string | null
          pool_id: string
          qty: number
          reason: Database["public"]["Enums"]["keg_event_reason"]
          shipment_id: string | null
        }
        Insert: {
          at?: string
          bin_id: string
          brewery_id: string
          created_at?: string
          created_by: string
          customer_id?: string | null
          id?: string
          keg_size: Database["public"]["Enums"]["keg_size"]
          location_id: string
          note?: string | null
          pool_id: string
          qty: number
          reason: Database["public"]["Enums"]["keg_event_reason"]
          shipment_id?: string | null
        }
        Update: {
          at?: string
          bin_id?: string
          brewery_id?: string
          created_at?: string
          created_by?: string
          customer_id?: string | null
          id?: string
          keg_size?: Database["public"]["Enums"]["keg_size"]
          location_id?: string
          note?: string | null
          pool_id?: string
          qty?: number
          reason?: Database["public"]["Enums"]["keg_event_reason"]
          shipment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "keg_events_bin_id_location_id_brewery_id_fkey"
            columns: ["bin_id", "location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "bins"
            referencedColumns: ["id", "location_id", "brewery_id"]
          },
          {
            foreignKeyName: "keg_events_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keg_events_customer_id_brewery_id_fkey"
            columns: ["customer_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "keg_events_location_id_brewery_id_fkey"
            columns: ["location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "keg_events_pool_id_brewery_id_fkey"
            columns: ["pool_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "keg_pools"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "keg_events_shipment_id_brewery_id_fkey"
            columns: ["shipment_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      keg_pools: {
        Row: {
          active: boolean
          brewery_id: string
          contract_note: string | null
          created_at: string
          deposit_cents: number
          id: string
          kind: Database["public"]["Enums"]["keg_pool_kind"]
          name: string
          per_fill_cents: number | null
          vendor_id: string | null
        }
        Insert: {
          active?: boolean
          brewery_id: string
          contract_note?: string | null
          created_at?: string
          deposit_cents?: number
          id?: string
          kind: Database["public"]["Enums"]["keg_pool_kind"]
          name: string
          per_fill_cents?: number | null
          vendor_id?: string | null
        }
        Update: {
          active?: boolean
          brewery_id?: string
          contract_note?: string | null
          created_at?: string
          deposit_cents?: number
          id?: string
          kind?: Database["public"]["Enums"]["keg_pool_kind"]
          name?: string
          per_fill_cents?: number | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "keg_pools_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keg_pools_vendor_id_brewery_id_fkey"
            columns: ["vendor_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          brewery_id: string
          id: string
          name: string
          uses: Database["public"]["Enums"]["location_kind"][]
        }
        Insert: {
          address?: string | null
          brewery_id: string
          id?: string
          name: string
          uses: Database["public"]["Enums"]["location_kind"][]
        }
        Update: {
          address?: string | null
          brewery_id?: string
          id?: string
          name?: string
          uses?: Database["public"]["Enums"]["location_kind"][]
        }
        Relationships: [
          {
            foreignKeyName: "locations_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      lots: {
        Row: {
          best_by: string | null
          brand_id: string
          brewery_id: string
          code: string
          created_at: string
          id: string
          packaged_on: string
          packaging_run_id: string
        }
        Insert: {
          best_by?: string | null
          brand_id: string
          brewery_id: string
          code: string
          created_at?: string
          id?: string
          packaged_on: string
          packaging_run_id: string
        }
        Update: {
          best_by?: string | null
          brand_id?: string
          brewery_id?: string
          code?: string
          created_at?: string
          id?: string
          packaged_on?: string
          packaging_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lots_brand_id_brewery_id_fkey"
            columns: ["brand_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "lots_brand_id_brewery_id_fkey"
            columns: ["brand_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "product_volume_requirements"
            referencedColumns: ["brand_id", "brewery_id"]
          },
          {
            foreignKeyName: "lots_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_packaging_run_id_brewery_id_fkey"
            columns: ["packaging_run_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "packaging_run_requirements"
            referencedColumns: ["run_id", "brewery_id"]
          },
          {
            foreignKeyName: "lots_packaging_run_id_brewery_id_fkey"
            columns: ["packaging_run_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "packaging_run_yields"
            referencedColumns: ["run_id", "brewery_id"]
          },
          {
            foreignKeyName: "lots_packaging_run_id_brewery_id_fkey"
            columns: ["packaging_run_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "packaging_runs"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      material_contracts: {
        Row: {
          brewery_id: string
          contract_no: string | null
          created_at: string
          ends_on: string | null
          id: string
          material_id: string
          qty_committed: number
          starts_on: string | null
          unit_cost_cents: number | null
          vendor_id: string
        }
        Insert: {
          brewery_id: string
          contract_no?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          material_id: string
          qty_committed: number
          starts_on?: string | null
          unit_cost_cents?: number | null
          vendor_id: string
        }
        Update: {
          brewery_id?: string
          contract_no?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          material_id?: string
          qty_committed?: number
          starts_on?: string | null
          unit_cost_cents?: number | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_contracts_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_contracts_material_id_brewery_id_fkey"
            columns: ["material_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "material_contracts_vendor_id_brewery_id_fkey"
            columns: ["vendor_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      material_count_lines: {
        Row: {
          brewery_id: string
          count_id: string
          id: string
          lot_id: string | null
          material_id: string
          movement_id: string | null
          qty_counted: number
          qty_expected: number
        }
        Insert: {
          brewery_id: string
          count_id: string
          id?: string
          lot_id?: string | null
          material_id: string
          movement_id?: string | null
          qty_counted: number
          qty_expected: number
        }
        Update: {
          brewery_id?: string
          count_id?: string
          id?: string
          lot_id?: string | null
          material_id?: string
          movement_id?: string | null
          qty_counted?: number
          qty_expected?: number
        }
        Relationships: [
          {
            foreignKeyName: "material_count_lines_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_count_lines_count_id_brewery_id_fkey"
            columns: ["count_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "material_counts"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "material_count_lines_lot_id_material_id_brewery_id_fkey"
            columns: ["lot_id", "material_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "material_lots"
            referencedColumns: ["id", "material_id", "brewery_id"]
          },
          {
            foreignKeyName: "material_count_lines_material_id_brewery_id_fkey"
            columns: ["material_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "material_count_lines_movement_id_brewery_id_fkey"
            columns: ["movement_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "material_movements"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      material_counts: {
        Row: {
          bin_id: string
          brewery_id: string
          counted_by: string
          counted_on: string
          created_at: string
          id: string
          location_id: string
          note: string | null
        }
        Insert: {
          bin_id: string
          brewery_id: string
          counted_by: string
          counted_on?: string
          created_at?: string
          id?: string
          location_id: string
          note?: string | null
        }
        Update: {
          bin_id?: string
          brewery_id?: string
          counted_by?: string
          counted_on?: string
          created_at?: string
          id?: string
          location_id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_counts_bin_id_location_id_brewery_id_fkey"
            columns: ["bin_id", "location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "bins"
            referencedColumns: ["id", "location_id", "brewery_id"]
          },
          {
            foreignKeyName: "material_counts_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_counts_location_id_brewery_id_fkey"
            columns: ["location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      material_lots: {
        Row: {
          best_by: string | null
          brewery_id: string
          created_at: string
          id: string
          lot_code: string
          material_id: string
          received_on: string | null
          vendor_id: string | null
        }
        Insert: {
          best_by?: string | null
          brewery_id: string
          created_at?: string
          id?: string
          lot_code: string
          material_id: string
          received_on?: string | null
          vendor_id?: string | null
        }
        Update: {
          best_by?: string | null
          brewery_id?: string
          created_at?: string
          id?: string
          lot_code?: string
          material_id?: string
          received_on?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_lots_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_lots_material_id_brewery_id_fkey"
            columns: ["material_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "material_lots_vendor_id_brewery_id_fkey"
            columns: ["vendor_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      material_movements: {
        Row: {
          bin_id: string
          brewery_id: string
          created_at: string
          created_by: string
          id: string
          location_id: string
          lot_id: string | null
          material_id: string
          note: string | null
          qty: number
          type: Database["public"]["Enums"]["material_movement_type"]
          unit_cost_cents: number | null
        }
        Insert: {
          bin_id: string
          brewery_id: string
          created_at?: string
          created_by: string
          id?: string
          location_id: string
          lot_id?: string | null
          material_id: string
          note?: string | null
          qty: number
          type: Database["public"]["Enums"]["material_movement_type"]
          unit_cost_cents?: number | null
        }
        Update: {
          bin_id?: string
          brewery_id?: string
          created_at?: string
          created_by?: string
          id?: string
          location_id?: string
          lot_id?: string | null
          material_id?: string
          note?: string | null
          qty?: number
          type?: Database["public"]["Enums"]["material_movement_type"]
          unit_cost_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "material_movements_bin_id_location_id_brewery_id_fkey"
            columns: ["bin_id", "location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "bins"
            referencedColumns: ["id", "location_id", "brewery_id"]
          },
          {
            foreignKeyName: "material_movements_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_movements_location_id_brewery_id_fkey"
            columns: ["location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "material_movements_lot_id_material_id_brewery_id_fkey"
            columns: ["lot_id", "material_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "material_lots"
            referencedColumns: ["id", "material_id", "brewery_id"]
          },
          {
            foreignKeyName: "material_movements_material_id_brewery_id_fkey"
            columns: ["material_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      materials: {
        Row: {
          active: boolean
          base_uom: Database["public"]["Enums"]["uom"]
          brewery_id: string
          category: Database["public"]["Enums"]["material_category"]
          created_at: string
          default_vendor_id: string | null
          extract_potential: number | null
          id: string
          lot_tracked: boolean
          name: string
          purchase_uom: Database["public"]["Enums"]["uom"]
          purchase_uom_factor: number
          reorder_point: number | null
        }
        Insert: {
          active?: boolean
          base_uom: Database["public"]["Enums"]["uom"]
          brewery_id: string
          category: Database["public"]["Enums"]["material_category"]
          created_at?: string
          default_vendor_id?: string | null
          extract_potential?: number | null
          id?: string
          lot_tracked?: boolean
          name: string
          purchase_uom: Database["public"]["Enums"]["uom"]
          purchase_uom_factor?: number
          reorder_point?: number | null
        }
        Update: {
          active?: boolean
          base_uom?: Database["public"]["Enums"]["uom"]
          brewery_id?: string
          category?: Database["public"]["Enums"]["material_category"]
          created_at?: string
          default_vendor_id?: string | null
          extract_potential?: number | null
          id?: string
          lot_tracked?: boolean
          name?: string
          purchase_uom?: Database["public"]["Enums"]["uom"]
          purchase_uom_factor?: number
          reorder_point?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "materials_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_default_vendor_id_brewery_id_fkey"
            columns: ["default_vendor_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempt_count: number
          brewery_id: string
          created_at: string
          destination_id: string
          id: string
          installation_id: string
          last_error_code: string | null
          lease_expires_at: string | null
          next_attempt_at: string
          occurrence_id: string
          provider: string
          provider_conversation_id: string | null
          provider_message_id: string | null
          resolved_at: string | null
          semantic_key: string
          sent_at: string | null
          state: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          brewery_id: string
          created_at?: string
          destination_id: string
          id?: string
          installation_id: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          next_attempt_at?: string
          occurrence_id: string
          provider: string
          provider_conversation_id?: string | null
          provider_message_id?: string | null
          resolved_at?: string | null
          semantic_key: string
          sent_at?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          brewery_id?: string
          created_at?: string
          destination_id?: string
          id?: string
          installation_id?: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          next_attempt_at?: string
          occurrence_id?: string
          provider?: string
          provider_conversation_id?: string | null
          provider_message_id?: string | null
          resolved_at?: string | null
          semantic_key?: string
          sent_at?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_destination_id_brewery_id_fkey"
            columns: ["destination_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "notification_destinations"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "notification_deliveries_installation_id_brewery_id_provide_fkey"
            columns: ["installation_id", "brewery_id", "provider"]
            isOneToOne: false
            referencedRelation: "chat_installations"
            referencedColumns: ["id", "brewery_id", "provider"]
          },
          {
            foreignKeyName: "notification_deliveries_occurrence_id_brewery_id_fkey"
            columns: ["occurrence_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "notification_occurrences"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      notification_destinations: {
        Row: {
          blocked_reason: string | null
          brewery_id: string
          capabilities: Json
          created_at: string
          external_destination_id: string
          id: string
          installation_id: string
          kind: string
          privacy_class: string
          state: string
          updated_at: string
          user_id: string | null
          validated_at: string | null
        }
        Insert: {
          blocked_reason?: string | null
          brewery_id: string
          capabilities?: Json
          created_at?: string
          external_destination_id: string
          id?: string
          installation_id: string
          kind: string
          privacy_class: string
          state?: string
          updated_at?: string
          user_id?: string | null
          validated_at?: string | null
        }
        Update: {
          blocked_reason?: string | null
          brewery_id?: string
          capabilities?: Json
          created_at?: string
          external_destination_id?: string
          id?: string
          installation_id?: string
          kind?: string
          privacy_class?: string
          state?: string
          updated_at?: string
          user_id?: string | null
          validated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_destinations_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_destinations_installation_id_brewery_id_fkey"
            columns: ["installation_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "chat_installations"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      notification_occurrences: {
        Row: {
          brewery_id: string
          created_at: string
          due_at: string | null
          id: string
          occurred_at: string
          owner_query: string
          payload: Json
          reason: string
          resolved_at: string | null
          semantic_key: string
          source_version: string
          state: string
          subject_id: string
          subject_type: string
          updated_at: string
          urgency: string
        }
        Insert: {
          brewery_id: string
          created_at?: string
          due_at?: string | null
          id?: string
          occurred_at: string
          owner_query: string
          payload: Json
          reason: string
          resolved_at?: string | null
          semantic_key: string
          source_version: string
          state?: string
          subject_id: string
          subject_type: string
          updated_at?: string
          urgency: string
        }
        Update: {
          brewery_id?: string
          created_at?: string
          due_at?: string | null
          id?: string
          occurred_at?: string
          owner_query?: string
          payload?: Json
          reason?: string
          resolved_at?: string | null
          semantic_key?: string
          source_version?: string
          state?: string
          subject_id?: string
          subject_type?: string
          updated_at?: string
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_occurrences_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          brewery_id: string
          created_at: string
          enabled: boolean
          id: string
          personal_destination_id: string | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          quiet_hours_timezone: string | null
          reason: string
          updated_at: string
          use_brewery_timezone: boolean
          user_id: string
        }
        Insert: {
          brewery_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          personal_destination_id?: string | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          quiet_hours_timezone?: string | null
          reason: string
          updated_at?: string
          use_brewery_timezone?: boolean
          user_id: string
        }
        Update: {
          brewery_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          personal_destination_id?: string | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          quiet_hours_timezone?: string | null
          reason?: string
          updated_at?: string
          use_brewery_timezone?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_personal_destination_id_brewery_i_fkey"
            columns: ["personal_destination_id", "brewery_id", "user_id"]
            isOneToOne: false
            referencedRelation: "notification_destinations"
            referencedColumns: ["id", "brewery_id", "user_id"]
          },
        ]
      }
      order_deposit_lines: {
        Row: {
          amount_cents: number | null
          brewery_id: string
          description: string
          id: string
          keg_pool_id: string
          keg_size: Database["public"]["Enums"]["keg_size"]
          order_id: string
          order_line_id: string
          qty_ordered: number
          unit_price_cents: number
        }
        Insert: {
          amount_cents?: number | null
          brewery_id: string
          description: string
          id?: string
          keg_pool_id: string
          keg_size: Database["public"]["Enums"]["keg_size"]
          order_id: string
          order_line_id: string
          qty_ordered: number
          unit_price_cents: number
        }
        Update: {
          amount_cents?: number | null
          brewery_id?: string
          description?: string
          id?: string
          keg_pool_id?: string
          keg_size?: Database["public"]["Enums"]["keg_size"]
          order_id?: string
          order_line_id?: string
          qty_ordered?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_deposit_lines_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_deposit_lines_keg_pool_id_brewery_id_fkey"
            columns: ["keg_pool_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "keg_pools"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "order_deposit_lines_order_id_brewery_id_fkey"
            columns: ["order_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "order_deposit_lines_order_line_id_brewery_id_fkey"
            columns: ["order_line_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "order_lines"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor: string
          brewery_id: string
          created_at: string
          event: string
          id: string
          order_id: string
          payload: Json
        }
        Insert: {
          actor: string
          brewery_id: string
          created_at?: string
          event: string
          id?: string
          order_id: string
          payload?: Json
        }
        Update: {
          actor?: string
          brewery_id?: string
          created_at?: string
          event?: string
          id?: string
          order_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "order_events_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_order_id_brewery_id_fkey"
            columns: ["order_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      order_lines: {
        Row: {
          brewery_id: string
          id: string
          order_id: string
          qty_ordered: number
          qty_picked: number | null
          qty_shipped: number | null
          short_reason: string | null
          sku_id: string
          unit_price_cents: number
        }
        Insert: {
          brewery_id: string
          id?: string
          order_id: string
          qty_ordered: number
          qty_picked?: number | null
          qty_shipped?: number | null
          short_reason?: string | null
          sku_id: string
          unit_price_cents: number
        }
        Update: {
          brewery_id?: string
          id?: string
          order_id?: string
          qty_ordered?: number
          qty_picked?: number | null
          qty_shipped?: number | null
          short_reason?: string | null
          sku_id?: string
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_order_id_brewery_id_fkey"
            columns: ["order_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "order_lines_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "atp"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "order_lines_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "sku_prices"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "order_lines_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      orders: {
        Row: {
          brewery_id: string
          created_at: string
          created_by: string
          customer_id: string | null
          from_location_id: string
          id: string
          kind: Database["public"]["Enums"]["order_kind"]
          needs_restock: boolean
          note: string | null
          order_no: number | null
          po_number: string | null
          requested_ship_date: string | null
          sale_channel_id: string
          ship_to_id: string | null
          shipped_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          to_location_id: string | null
        }
        Insert: {
          brewery_id: string
          created_at?: string
          created_by: string
          customer_id?: string | null
          from_location_id: string
          id?: string
          kind?: Database["public"]["Enums"]["order_kind"]
          needs_restock?: boolean
          note?: string | null
          order_no?: number | null
          po_number?: string | null
          requested_ship_date?: string | null
          sale_channel_id: string
          ship_to_id?: string | null
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          to_location_id?: string | null
        }
        Update: {
          brewery_id?: string
          created_at?: string
          created_by?: string
          customer_id?: string | null
          from_location_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["order_kind"]
          needs_restock?: boolean
          note?: string | null
          order_no?: number | null
          po_number?: string | null
          requested_ship_date?: string | null
          sale_channel_id?: string
          ship_to_id?: string | null
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          to_location_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_brewery_id_fkey"
            columns: ["customer_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "orders_from_location_id_brewery_id_fkey"
            columns: ["from_location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "orders_sale_channel_id_brewery_id_fkey"
            columns: ["sale_channel_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "sale_channels"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "orders_ship_to_id_customer_id_brewery_id_fkey"
            columns: ["ship_to_id", "customer_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "ship_tos"
            referencedColumns: ["id", "customer_id", "brewery_id"]
          },
          {
            foreignKeyName: "orders_to_location_id_brewery_id_fkey"
            columns: ["to_location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      packaging_run_consumptions: {
        Row: {
          brewery_id: string
          id: string
          movement_id: string
          run_id: string
        }
        Insert: {
          brewery_id: string
          id?: string
          movement_id: string
          run_id: string
        }
        Update: {
          brewery_id?: string
          id?: string
          movement_id?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packaging_run_consumptions_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_run_consumptions_movement_id_brewery_id_fkey"
            columns: ["movement_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "material_movements"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "packaging_run_consumptions_run_id_brewery_id_fkey"
            columns: ["run_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "packaging_run_requirements"
            referencedColumns: ["run_id", "brewery_id"]
          },
          {
            foreignKeyName: "packaging_run_consumptions_run_id_brewery_id_fkey"
            columns: ["run_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "packaging_run_yields"
            referencedColumns: ["run_id", "brewery_id"]
          },
          {
            foreignKeyName: "packaging_run_consumptions_run_id_brewery_id_fkey"
            columns: ["run_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "packaging_runs"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      packaging_run_outputs: {
        Row: {
          brewery_id: string
          id: string
          movement_id: string | null
          qty_actual: number | null
          qty_planned: number
          run_id: string
          sku_id: string
        }
        Insert: {
          brewery_id: string
          id?: string
          movement_id?: string | null
          qty_actual?: number | null
          qty_planned?: number
          run_id: string
          sku_id: string
        }
        Update: {
          brewery_id?: string
          id?: string
          movement_id?: string | null
          qty_actual?: number | null
          qty_planned?: number
          run_id?: string
          sku_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packaging_run_outputs_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_run_outputs_movement_id_brewery_id_fkey"
            columns: ["movement_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "packaging_run_outputs_run_id_brewery_id_fkey"
            columns: ["run_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "packaging_run_requirements"
            referencedColumns: ["run_id", "brewery_id"]
          },
          {
            foreignKeyName: "packaging_run_outputs_run_id_brewery_id_fkey"
            columns: ["run_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "packaging_run_yields"
            referencedColumns: ["run_id", "brewery_id"]
          },
          {
            foreignKeyName: "packaging_run_outputs_run_id_brewery_id_fkey"
            columns: ["run_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "packaging_runs"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "packaging_run_outputs_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "atp"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "packaging_run_outputs_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "sku_prices"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "packaging_run_outputs_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      packaging_runs: {
        Row: {
          bbl_drawn: number | null
          brand_id: string
          brewery_id: string
          closed_at: string | null
          created_at: string
          created_by: string
          id: string
          note: string | null
          occupancy_id: string | null
          planned_on: string
          run_no: number | null
          started_at: string | null
        }
        Insert: {
          bbl_drawn?: number | null
          brand_id: string
          brewery_id: string
          closed_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          note?: string | null
          occupancy_id?: string | null
          planned_on: string
          run_no?: number | null
          started_at?: string | null
        }
        Update: {
          bbl_drawn?: number | null
          brand_id?: string
          brewery_id?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          note?: string | null
          occupancy_id?: string | null
          planned_on?: string
          run_no?: number | null
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packaging_runs_brand_id_brewery_id_fkey"
            columns: ["brand_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "packaging_runs_brand_id_brewery_id_fkey"
            columns: ["brand_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "product_volume_requirements"
            referencedColumns: ["brand_id", "brewery_id"]
          },
          {
            foreignKeyName: "packaging_runs_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_runs_occupancy_id_brewery_id_fkey"
            columns: ["occupancy_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "occupancy_volumes"
            referencedColumns: ["occupancy_id", "brewery_id"]
          },
          {
            foreignKeyName: "packaging_runs_occupancy_id_brewery_id_fkey"
            columns: ["occupancy_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "vessel_occupancies"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      pos_catalog_items: {
        Row: {
          brand_id: string
          brewery_id: string
          catalog_group: string
          connection_id: string
          created_at: string
          external_item_id: string
          ownership: string
          retired_at: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          brewery_id: string
          catalog_group: string
          connection_id: string
          created_at?: string
          external_item_id: string
          ownership: string
          retired_at?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          brewery_id?: string
          catalog_group?: string
          connection_id?: string
          created_at?: string
          external_item_id?: string
          ownership?: string
          retired_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_catalog_items_brand_id_brewery_id_fkey"
            columns: ["brand_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "pos_catalog_items_brand_id_brewery_id_fkey"
            columns: ["brand_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "product_volume_requirements"
            referencedColumns: ["brand_id", "brewery_id"]
          },
          {
            foreignKeyName: "pos_catalog_items_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_catalog_items_connection_id_brewery_id_fkey"
            columns: ["connection_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "pos_connections"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      pos_catalog_ownership: {
        Row: {
          brand_id: string
          brewery_id: string
          catalog_group: string
          connection_id: string
          created_at: string
          external_item_id: string
          external_variation_id: string
          format_id: string
          retired_at: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          brewery_id: string
          catalog_group: string
          connection_id: string
          created_at?: string
          external_item_id: string
          external_variation_id: string
          format_id: string
          retired_at?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          brewery_id?: string
          catalog_group?: string
          connection_id?: string
          created_at?: string
          external_item_id?: string
          external_variation_id?: string
          format_id?: string
          retired_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_catalog_ownership_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_catalog_ownership_connection_id_brand_id_catalog_group_fkey"
            columns: [
              "connection_id",
              "brand_id",
              "catalog_group",
              "external_item_id",
              "brewery_id",
            ]
            isOneToOne: false
            referencedRelation: "pos_catalog_items"
            referencedColumns: [
              "connection_id",
              "brand_id",
              "catalog_group",
              "external_item_id",
              "brewery_id",
            ]
          },
          {
            foreignKeyName: "pos_catalog_ownership_format_id_brewery_id_fkey"
            columns: ["format_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "format_volumes"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "pos_catalog_ownership_format_id_brewery_id_fkey"
            columns: ["format_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      pos_catalog_variations: {
        Row: {
          available: boolean
          brewery_id: string
          connection_id: string
          external_item_id: string
          external_item_name: string | null
          external_variation_id: string
          external_variation_name: string | null
          last_seen_at: string
          source_version: number
        }
        Insert: {
          available?: boolean
          brewery_id: string
          connection_id: string
          external_item_id: string
          external_item_name?: string | null
          external_variation_id: string
          external_variation_name?: string | null
          last_seen_at?: string
          source_version: number
        }
        Update: {
          available?: boolean
          brewery_id?: string
          connection_id?: string
          external_item_id?: string
          external_item_name?: string | null
          external_variation_id?: string
          external_variation_name?: string | null
          last_seen_at?: string
          source_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_catalog_variations_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_catalog_variations_connection_id_brewery_id_fkey"
            columns: ["connection_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "pos_connections"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      pos_connections: {
        Row: {
          access_expires_at: string | null
          brewery_id: string
          catalog_sync_generation: number
          connected_by: string | null
          credential_version: number
          granted_scopes: string[]
          id: string
          last_error: string | null
          merchant_id: string | null
          merchant_label: string | null
          provider: string
          refresh_expires_at: string | null
          refresh_hard_expires_at: string | null
          remote_revocation_state: string
          sales_synced_through: string | null
          state: string
          updated_at: string
        }
        Insert: {
          access_expires_at?: string | null
          brewery_id: string
          catalog_sync_generation?: number
          connected_by?: string | null
          credential_version?: number
          granted_scopes?: string[]
          id?: string
          last_error?: string | null
          merchant_id?: string | null
          merchant_label?: string | null
          provider?: string
          refresh_expires_at?: string | null
          refresh_hard_expires_at?: string | null
          remote_revocation_state?: string
          sales_synced_through?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          access_expires_at?: string | null
          brewery_id?: string
          catalog_sync_generation?: number
          connected_by?: string | null
          credential_version?: number
          granted_scopes?: string[]
          id?: string
          last_error?: string | null
          merchant_id?: string | null
          merchant_label?: string | null
          provider?: string
          refresh_expires_at?: string | null
          refresh_hard_expires_at?: string | null
          remote_revocation_state?: string
          sales_synced_through?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_connections_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_item_mappings: {
        Row: {
          brewery_id: string
          connection_id: string
          external_item_id: string
          external_item_name: string | null
          external_variation_id: string
          format_id: string | null
          ignored: boolean
          sku_id: string | null
        }
        Insert: {
          brewery_id: string
          connection_id: string
          external_item_id: string
          external_item_name?: string | null
          external_variation_id?: string
          format_id?: string | null
          ignored?: boolean
          sku_id?: string | null
        }
        Update: {
          brewery_id?: string
          connection_id?: string
          external_item_id?: string
          external_item_name?: string | null
          external_variation_id?: string
          format_id?: string | null
          ignored?: boolean
          sku_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_item_mappings_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_item_mappings_connection_id_brewery_id_fkey"
            columns: ["connection_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "pos_connections"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "pos_item_mappings_format_id_brewery_id_fkey"
            columns: ["format_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "format_volumes"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "pos_item_mappings_format_id_brewery_id_fkey"
            columns: ["format_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "pos_item_mappings_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "atp"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "pos_item_mappings_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "sku_prices"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "pos_item_mappings_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      pos_locations: {
        Row: {
          available: boolean
          brewery_id: string
          connection_id: string
          external_location_id: string
          external_name: string | null
          external_status: string | null
          last_seen_at: string | null
          location_id: string | null
        }
        Insert: {
          available?: boolean
          brewery_id: string
          connection_id: string
          external_location_id: string
          external_name?: string | null
          external_status?: string | null
          last_seen_at?: string | null
          location_id?: string | null
        }
        Update: {
          available?: boolean
          brewery_id?: string
          connection_id?: string
          external_location_id?: string
          external_name?: string | null
          external_status?: string | null
          last_seen_at?: string | null
          location_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_locations_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_locations_connection_id_brewery_id_fkey"
            columns: ["connection_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "pos_connections"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "pos_locations_location_id_brewery_id_fkey"
            columns: ["location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      pos_menu_lines: {
        Row: {
          brewery_id: string
          format_id: string
          menu_id: string
          price_override_cents: number | null
          updated_at: string
          website_published_at: string | null
        }
        Insert: {
          brewery_id: string
          format_id: string
          menu_id: string
          price_override_cents?: number | null
          updated_at?: string
          website_published_at?: string | null
        }
        Update: {
          brewery_id?: string
          format_id?: string
          menu_id?: string
          price_override_cents?: number | null
          updated_at?: string
          website_published_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_menu_lines_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_menu_lines_format_id_brewery_id_fkey"
            columns: ["format_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "format_volumes"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "pos_menu_lines_format_id_brewery_id_fkey"
            columns: ["format_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "pos_menu_lines_menu_id_brewery_id_fkey"
            columns: ["menu_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "pos_menus"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      pos_menus: {
        Row: {
          bin_id: string
          brewery_id: string
          connection_id: string
          created_at: string
          external_location_id: string
          id: string
          location_id: string
          public_id: string
          sale_channel_id: string
          updated_at: string
        }
        Insert: {
          bin_id: string
          brewery_id: string
          connection_id: string
          created_at?: string
          external_location_id: string
          id?: string
          location_id: string
          public_id?: string
          sale_channel_id: string
          updated_at?: string
        }
        Update: {
          bin_id?: string
          brewery_id?: string
          connection_id?: string
          created_at?: string
          external_location_id?: string
          id?: string
          location_id?: string
          public_id?: string
          sale_channel_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_menus_bin_id_location_id_brewery_id_fkey"
            columns: ["bin_id", "location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "bins"
            referencedColumns: ["id", "location_id", "brewery_id"]
          },
          {
            foreignKeyName: "pos_menus_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_menus_connection_id_external_location_id_fkey"
            columns: ["connection_id", "external_location_id"]
            isOneToOne: true
            referencedRelation: "pos_locations"
            referencedColumns: ["connection_id", "external_location_id"]
          },
          {
            foreignKeyName: "pos_menus_location_id_brewery_id_fkey"
            columns: ["location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "pos_menus_sale_channel_id_brewery_id_fkey"
            columns: ["sale_channel_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "sale_channels"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      pos_sale_expectations: {
        Row: {
          brand_id: string
          brewery_id: string
          expected_bbl: number
          format_id: string
          location_id: string
          reconciled_at: string
          sale_id: string
          serving_ounces: number
          sku_id: string | null
        }
        Insert: {
          brand_id: string
          brewery_id: string
          expected_bbl: number
          format_id: string
          location_id: string
          reconciled_at?: string
          sale_id: string
          serving_ounces: number
          sku_id?: string | null
        }
        Update: {
          brand_id?: string
          brewery_id?: string
          expected_bbl?: number
          format_id?: string
          location_id?: string
          reconciled_at?: string
          sale_id?: string
          serving_ounces?: number
          sku_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_sale_expectations_brand_id_brewery_id_fkey"
            columns: ["brand_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "pos_sale_expectations_brand_id_brewery_id_fkey"
            columns: ["brand_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "product_volume_requirements"
            referencedColumns: ["brand_id", "brewery_id"]
          },
          {
            foreignKeyName: "pos_sale_expectations_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_expectations_format_id_brewery_id_fkey"
            columns: ["format_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "format_volumes"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "pos_sale_expectations_format_id_brewery_id_fkey"
            columns: ["format_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "pos_sale_expectations_location_id_brewery_id_fkey"
            columns: ["location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "pos_sale_expectations_sale_id_brewery_id_fkey"
            columns: ["sale_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "pos_sale_expectations_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "atp"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "pos_sale_expectations_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "sku_prices"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "pos_sale_expectations_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      pos_sales: {
        Row: {
          brewery_id: string
          catalog_version: number | null
          connection_id: string
          external_item_id: string | null
          external_line_id: string
          external_location_id: string | null
          external_order_id: string
          external_variation_id: string | null
          fact_kind: string
          fact_status: string
          gross_cents: number | null
          id: string
          ingested_at: string
          merchant_id: string | null
          qty: number | null
          quantity_unit: Json | null
          sold_at: string
          source_hash: string | null
          source_line_id: string | null
          source_order_id: string | null
          source_order_updated_at: string | null
          source_quantity: string | null
          source_version: number
          unsupported_reason: string | null
        }
        Insert: {
          brewery_id: string
          catalog_version?: number | null
          connection_id: string
          external_item_id?: string | null
          external_line_id: string
          external_location_id?: string | null
          external_order_id: string
          external_variation_id?: string | null
          fact_kind?: string
          fact_status?: string
          gross_cents?: number | null
          id?: string
          ingested_at?: string
          merchant_id?: string | null
          qty?: number | null
          quantity_unit?: Json | null
          sold_at: string
          source_hash?: string | null
          source_line_id?: string | null
          source_order_id?: string | null
          source_order_updated_at?: string | null
          source_quantity?: string | null
          source_version?: number
          unsupported_reason?: string | null
        }
        Update: {
          brewery_id?: string
          catalog_version?: number | null
          connection_id?: string
          external_item_id?: string | null
          external_line_id?: string
          external_location_id?: string | null
          external_order_id?: string
          external_variation_id?: string | null
          fact_kind?: string
          fact_status?: string
          gross_cents?: number | null
          id?: string
          ingested_at?: string
          merchant_id?: string | null
          qty?: number | null
          quantity_unit?: Json | null
          sold_at?: string
          source_hash?: string | null
          source_line_id?: string | null
          source_order_id?: string | null
          source_order_updated_at?: string | null
          source_quantity?: string | null
          source_version?: number
          unsupported_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_sales_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_connection_id_brewery_id_fkey"
            columns: ["connection_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "pos_connections"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      pos_sales_coverage: {
        Row: {
          brewery_id: string
          complete: boolean
          connection_id: string
          ends_at: string
          external_location_id: string
          id: string
          location_id: string | null
          observed_at: string
          starts_at: string
        }
        Insert: {
          brewery_id: string
          complete: boolean
          connection_id: string
          ends_at: string
          external_location_id: string
          id?: string
          location_id?: string | null
          observed_at?: string
          starts_at: string
        }
        Update: {
          brewery_id?: string
          complete?: boolean
          connection_id?: string
          ends_at?: string
          external_location_id?: string
          id?: string
          location_id?: string | null
          observed_at?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_sales_coverage_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_coverage_connection_id_external_location_id_loca_fkey"
            columns: [
              "connection_id",
              "external_location_id",
              "location_id",
              "brewery_id",
            ]
            isOneToOne: false
            referencedRelation: "pos_locations"
            referencedColumns: [
              "connection_id",
              "external_location_id",
              "location_id",
              "brewery_id",
            ]
          },
        ]
      }
      price_groups: {
        Row: {
          brewery_id: string
          cost_ceiling_cents: number | null
          created_at: string
          id: string
          name: string
          position: number
        }
        Insert: {
          brewery_id: string
          cost_ceiling_cents?: number | null
          created_at?: string
          id?: string
          name: string
          position: number
        }
        Update: {
          brewery_id?: string
          cost_ceiling_cents?: number | null
          created_at?: string
          id?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_groups_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_lines: {
        Row: {
          brewery_id: string
          contract_id: string | null
          expected_lot_code: string | null
          id: string
          material_id: string
          po_id: string
          qty_ordered: number
          unit_cost_cents: number | null
        }
        Insert: {
          brewery_id: string
          contract_id?: string | null
          expected_lot_code?: string | null
          id?: string
          material_id: string
          po_id: string
          qty_ordered: number
          unit_cost_cents?: number | null
        }
        Update: {
          brewery_id?: string
          contract_id?: string | null
          expected_lot_code?: string | null
          id?: string
          material_id?: string
          po_id?: string
          qty_ordered?: number
          unit_cost_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_contract_id_brewery_id_fkey"
            columns: ["contract_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "contract_balances"
            referencedColumns: ["contract_id", "brewery_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_contract_id_brewery_id_fkey"
            columns: ["contract_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "material_contracts"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_material_id_brewery_id_fkey"
            columns: ["material_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_po_id_brewery_id_fkey"
            columns: ["po_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          brewery_id: string
          created_at: string
          created_by: string
          expected_on: string | null
          id: string
          note: string | null
          ordered_on: string | null
          po_no: number | null
          sent_by: string | null
          sent_via: string | null
          status: Database["public"]["Enums"]["po_status"]
          vendor_id: string
        }
        Insert: {
          brewery_id: string
          created_at?: string
          created_by: string
          expected_on?: string | null
          id?: string
          note?: string | null
          ordered_on?: string | null
          po_no?: number | null
          sent_by?: string | null
          sent_via?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          vendor_id: string
        }
        Update: {
          brewery_id?: string
          created_at?: string
          created_by?: string
          expected_on?: string | null
          id?: string
          note?: string | null
          ordered_on?: string | null
          po_no?: number | null
          sent_by?: string | null
          sent_via?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_brewery_id_fkey"
            columns: ["vendor_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      qbo_connections: {
        Row: {
          access_expires_at: string | null
          allow_online_ach_payment: boolean
          allow_online_credit_card_payment: boolean
          brewery_id: string
          connected_by: string | null
          credential_version: number
          granted_scopes: string[]
          id: string
          last_error: string | null
          qbo_deposit_item_id: string | null
          realm_id: string
          realm_label: string | null
          refresh_expires_at: string | null
          refresh_hard_expires_at: string | null
          remote_revocation_state: string
          state: string
          updated_at: string
        }
        Insert: {
          access_expires_at?: string | null
          allow_online_ach_payment?: boolean
          allow_online_credit_card_payment?: boolean
          brewery_id: string
          connected_by?: string | null
          credential_version?: number
          granted_scopes?: string[]
          id?: string
          last_error?: string | null
          qbo_deposit_item_id?: string | null
          realm_id: string
          realm_label?: string | null
          refresh_expires_at?: string | null
          refresh_hard_expires_at?: string | null
          remote_revocation_state?: string
          state?: string
          updated_at?: string
        }
        Update: {
          access_expires_at?: string | null
          allow_online_ach_payment?: boolean
          allow_online_credit_card_payment?: boolean
          brewery_id?: string
          connected_by?: string | null
          credential_version?: number
          granted_scopes?: string[]
          id?: string
          last_error?: string | null
          qbo_deposit_item_id?: string | null
          realm_id?: string
          realm_label?: string | null
          refresh_expires_at?: string | null
          refresh_hard_expires_at?: string | null
          remote_revocation_state?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qbo_connections_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: true
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      qbo_pushes: {
        Row: {
          attempt_reason: string
          brewery_id: string
          connection_id: string
          created_at: string
          entity_type: string
          error: string | null
          finish_request_id: string
          finished_at: string | null
          id: string
          invoice_id: string
          local_snapshot: Json
          provider_request_id: string
          qbo_entity_id: string | null
          realm_id: string
          request_body: string
          response: Json | null
          status: Database["public"]["Enums"]["qbo_sync_status"]
          supersedes_push_id: string | null
        }
        Insert: {
          attempt_reason: string
          brewery_id: string
          connection_id: string
          created_at?: string
          entity_type: string
          error?: string | null
          finish_request_id?: string
          finished_at?: string | null
          id?: string
          invoice_id: string
          local_snapshot: Json
          provider_request_id: string
          qbo_entity_id?: string | null
          realm_id: string
          request_body: string
          response?: Json | null
          status?: Database["public"]["Enums"]["qbo_sync_status"]
          supersedes_push_id?: string | null
        }
        Update: {
          attempt_reason?: string
          brewery_id?: string
          connection_id?: string
          created_at?: string
          entity_type?: string
          error?: string | null
          finish_request_id?: string
          finished_at?: string | null
          id?: string
          invoice_id?: string
          local_snapshot?: Json
          provider_request_id?: string
          qbo_entity_id?: string | null
          realm_id?: string
          request_body?: string
          response?: Json | null
          status?: Database["public"]["Enums"]["qbo_sync_status"]
          supersedes_push_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qbo_pushes_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qbo_pushes_invoice_id_brewery_id_fkey"
            columns: ["invoice_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "invoice_totals"
            referencedColumns: ["invoice_id", "brewery_id"]
          },
          {
            foreignKeyName: "qbo_pushes_invoice_id_brewery_id_fkey"
            columns: ["invoice_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "qbo_pushes_supersedes_push_id_fkey"
            columns: ["supersedes_push_id"]
            isOneToOne: false
            referencedRelation: "qbo_pushes"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_lines: {
        Row: {
          brewery_id: string
          id: string
          lot_id: string | null
          movement_id: string | null
          po_line_id: string
          qty_counted: number
          qty_expected: number
          receipt_id: string
          variance: number | null
        }
        Insert: {
          brewery_id: string
          id?: string
          lot_id?: string | null
          movement_id?: string | null
          po_line_id: string
          qty_counted: number
          qty_expected: number
          receipt_id: string
          variance?: number | null
        }
        Update: {
          brewery_id?: string
          id?: string
          lot_id?: string | null
          movement_id?: string | null
          po_line_id?: string
          qty_counted?: number
          qty_expected?: number
          receipt_id?: string
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_lines_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_lines_lot_id_brewery_id_fkey"
            columns: ["lot_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "material_lots"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "receipt_lines_movement_id_brewery_id_fkey"
            columns: ["movement_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "material_movements"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "receipt_lines_po_line_id_brewery_id_fkey"
            columns: ["po_line_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "po_open_balances"
            referencedColumns: ["po_line_id", "brewery_id"]
          },
          {
            foreignKeyName: "receipt_lines_po_line_id_brewery_id_fkey"
            columns: ["po_line_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "receipt_lines_receipt_id_brewery_id_fkey"
            columns: ["receipt_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      receipts: {
        Row: {
          brewery_id: string
          created_at: string
          id: string
          note: string | null
          po_id: string
          received_by: string
          received_on: string
        }
        Insert: {
          brewery_id: string
          created_at?: string
          id?: string
          note?: string | null
          po_id: string
          received_by: string
          received_on?: string
        }
        Update: {
          brewery_id?: string
          created_at?: string
          id?: string
          note?: string | null
          po_id?: string
          received_by?: string
          received_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_po_id_brewery_id_fkey"
            columns: ["po_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          brewery_id: string
          extract_snapshot: number | null
          id: string
          material_id: string
          per_bbl_qty: number
          recipe_version_id: string
          sort: number
          stage: Database["public"]["Enums"]["ingredient_stage"]
          timing_minutes: number | null
        }
        Insert: {
          brewery_id: string
          extract_snapshot?: number | null
          id?: string
          material_id: string
          per_bbl_qty: number
          recipe_version_id: string
          sort?: number
          stage: Database["public"]["Enums"]["ingredient_stage"]
          timing_minutes?: number | null
        }
        Update: {
          brewery_id?: string
          extract_snapshot?: number | null
          id?: string
          material_id?: string
          per_bbl_qty?: number
          recipe_version_id?: string
          sort?: number
          stage?: Database["public"]["Enums"]["ingredient_stage"]
          timing_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_material_id_brewery_id_fkey"
            columns: ["material_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_version_id_brewery_id_fkey"
            columns: ["recipe_version_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      recipe_versions: {
        Row: {
          boil_minutes: number | null
          brewery_id: string
          brewhouse_efficiency: number | null
          created_at: string
          created_by: string
          fermentation_schedule: Json
          id: string
          knockout_temp_f: number | null
          mash_schedule: Json
          mash_temp_f: number | null
          mash_water_gal: number | null
          note: string | null
          pre_boil_bbl: number | null
          recipe_id: string
          source_water_profile_id: string | null
          sparge_water_gal: number | null
          target_ibu: number | null
          target_mash_ph: number | null
          target_water_profile_id: string | null
          version: number
          whirlpool_minutes: number | null
          whirlpool_rest_minutes: number | null
          whirlpool_temp_f: number | null
          yeast_attenuation: number | null
        }
        Insert: {
          boil_minutes?: number | null
          brewery_id: string
          brewhouse_efficiency?: number | null
          created_at?: string
          created_by: string
          fermentation_schedule?: Json
          id?: string
          knockout_temp_f?: number | null
          mash_schedule?: Json
          mash_temp_f?: number | null
          mash_water_gal?: number | null
          note?: string | null
          pre_boil_bbl?: number | null
          recipe_id: string
          source_water_profile_id?: string | null
          sparge_water_gal?: number | null
          target_ibu?: number | null
          target_mash_ph?: number | null
          target_water_profile_id?: string | null
          version: number
          whirlpool_minutes?: number | null
          whirlpool_rest_minutes?: number | null
          whirlpool_temp_f?: number | null
          yeast_attenuation?: number | null
        }
        Update: {
          boil_minutes?: number | null
          brewery_id?: string
          brewhouse_efficiency?: number | null
          created_at?: string
          created_by?: string
          fermentation_schedule?: Json
          id?: string
          knockout_temp_f?: number | null
          mash_schedule?: Json
          mash_temp_f?: number | null
          mash_water_gal?: number | null
          note?: string | null
          pre_boil_bbl?: number | null
          recipe_id?: string
          source_water_profile_id?: string | null
          sparge_water_gal?: number | null
          target_ibu?: number | null
          target_mash_ph?: number | null
          target_water_profile_id?: string | null
          version?: number
          whirlpool_minutes?: number | null
          whirlpool_rest_minutes?: number | null
          whirlpool_temp_f?: number | null
          yeast_attenuation?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_versions_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_versions_recipe_id_brewery_id_fkey"
            columns: ["recipe_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "recipe_versions_source_water_profile_id_brewery_id_fkey"
            columns: ["source_water_profile_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "water_profiles"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "recipe_versions_target_water_profile_id_brewery_id_fkey"
            columns: ["target_water_profile_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "water_profiles"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      recipe_water_additions: {
        Row: {
          brewery_id: string
          id: string
          material_id: string
          qty: number
          recipe_version_id: string
          sort: number
          stage: string
          unit: string
        }
        Insert: {
          brewery_id: string
          id?: string
          material_id: string
          qty: number
          recipe_version_id: string
          sort?: number
          stage: string
          unit: string
        }
        Update: {
          brewery_id?: string
          id?: string
          material_id?: string
          qty?: number
          recipe_version_id?: string
          sort?: number
          stage?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_water_additions_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_water_additions_material_id_brewery_id_fkey"
            columns: ["material_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "recipe_water_additions_recipe_version_id_brewery_id_fkey"
            columns: ["recipe_version_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      recipes: {
        Row: {
          brand_id: string | null
          brewery_id: string
          created_at: string
          default_price_group_id: string | null
          id: string
          name: string
          note: string | null
        }
        Insert: {
          brand_id?: string | null
          brewery_id: string
          created_at?: string
          default_price_group_id?: string | null
          id?: string
          name: string
          note?: string | null
        }
        Update: {
          brand_id?: string | null
          brewery_id?: string
          created_at?: string
          default_price_group_id?: string | null
          id?: string
          name?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipes_brand_id_brewery_id_fkey"
            columns: ["brand_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "recipes_brand_id_brewery_id_fkey"
            columns: ["brand_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "product_volume_requirements"
            referencedColumns: ["brand_id", "brewery_id"]
          },
          {
            foreignKeyName: "recipes_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_default_price_group_id_brewery_id_fkey"
            columns: ["default_price_group_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "price_groups"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      report_filings: {
        Row: {
          brewery_id: string
          created_at: string
          figures: Json
          filed_at: string | null
          filed_by: string | null
          id: string
          jurisdiction: string
          note: string | null
          period_end: string
          period_start: string
        }
        Insert: {
          brewery_id: string
          created_at?: string
          figures: Json
          filed_at?: string | null
          filed_by?: string | null
          id?: string
          jurisdiction: string
          note?: string | null
          period_end: string
          period_start: string
        }
        Update: {
          brewery_id?: string
          created_at?: string
          figures?: Json
          filed_at?: string | null
          filed_by?: string | null
          id?: string
          jurisdiction?: string
          note?: string | null
          period_end?: string
          period_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_filings_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          brewery_id: string
          created_at: string
          delivery_date: string
          departed_at: string | null
          driver_user_id: string | null
          id: string
          name: string | null
          note: string | null
          returned_at: string | null
          vehicle: string | null
        }
        Insert: {
          brewery_id: string
          created_at?: string
          delivery_date: string
          departed_at?: string | null
          driver_user_id?: string | null
          id?: string
          name?: string | null
          note?: string | null
          returned_at?: string | null
          vehicle?: string | null
        }
        Update: {
          brewery_id?: string
          created_at?: string
          delivery_date?: string
          departed_at?: string | null
          driver_user_id?: string | null
          id?: string
          name?: string | null
          note?: string | null
          returned_at?: string | null
          vehicle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routes_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_channels: {
        Row: {
          brewery_id: string
          id: string
          name: string
          system_code: string | null
          tax_treatment: Database["public"]["Enums"]["tax_treatment"]
        }
        Insert: {
          brewery_id: string
          id?: string
          name: string
          system_code?: string | null
          tax_treatment?: Database["public"]["Enums"]["tax_treatment"]
        }
        Update: {
          brewery_id?: string
          id?: string
          name?: string
          system_code?: string | null
          tax_treatment?: Database["public"]["Enums"]["tax_treatment"]
        }
        Relationships: [
          {
            foreignKeyName: "sale_channels_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      ship_tos: {
        Row: {
          address1: string
          address2: string | null
          brewery_id: string
          city: string
          created_at: string
          customer_id: string
          id: string
          is_default: boolean
          label: string
          state: string
          zip: string
        }
        Insert: {
          address1: string
          address2?: string | null
          brewery_id: string
          city: string
          created_at?: string
          customer_id: string
          id?: string
          is_default?: boolean
          label: string
          state: string
          zip: string
        }
        Update: {
          address1?: string
          address2?: string | null
          brewery_id?: string
          city?: string
          created_at?: string
          customer_id?: string
          id?: string
          is_default?: boolean
          label?: string
          state?: string
          zip?: string
        }
        Relationships: [
          {
            foreignKeyName: "ship_tos_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ship_tos_customer_id_brewery_id_fkey"
            columns: ["customer_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      shipments: {
        Row: {
          brewery_id: string
          carrier: string | null
          created_at: string
          created_by: string
          id: string
          invoice_timing: string
          order_id: string
          shipped_at: string
          tracking: string | null
        }
        Insert: {
          brewery_id: string
          carrier?: string | null
          created_at?: string
          created_by: string
          id?: string
          invoice_timing?: string
          order_id: string
          shipped_at?: string
          tracking?: string | null
        }
        Update: {
          brewery_id?: string
          carrier?: string | null
          created_at?: string
          created_by?: string
          id?: string
          invoice_timing?: string
          order_id?: string
          shipped_at?: string
          tracking?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_order_id_brewery_id_fkey"
            columns: ["order_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      skus: {
        Row: {
          active: boolean
          brand_id: string
          brewery_id: string
          container_source:
            | Database["public"]["Enums"]["keg_container_source"]
            | null
          created_at: string
          format_id: string
          id: string
          keg_pool_id: string | null
          name: string
          qbo_item_id: string | null
          qbo_realm_id: string | null
          upc: string | null
        }
        Insert: {
          active?: boolean
          brand_id: string
          brewery_id: string
          container_source?:
            | Database["public"]["Enums"]["keg_container_source"]
            | null
          created_at?: string
          format_id: string
          id?: string
          keg_pool_id?: string | null
          name: string
          qbo_item_id?: string | null
          qbo_realm_id?: string | null
          upc?: string | null
        }
        Update: {
          active?: boolean
          brand_id?: string
          brewery_id?: string
          container_source?:
            | Database["public"]["Enums"]["keg_container_source"]
            | null
          created_at?: string
          format_id?: string
          id?: string
          keg_pool_id?: string | null
          name?: string
          qbo_item_id?: string | null
          qbo_realm_id?: string | null
          upc?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "skus_brand_id_brewery_id_fkey"
            columns: ["brand_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "skus_brand_id_brewery_id_fkey"
            columns: ["brand_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "product_volume_requirements"
            referencedColumns: ["brand_id", "brewery_id"]
          },
          {
            foreignKeyName: "skus_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skus_format_id_brewery_id_fkey"
            columns: ["format_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "format_volumes"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "skus_format_id_brewery_id_fkey"
            columns: ["format_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "skus_keg_pool_id_brewery_id_fkey"
            columns: ["keg_pool_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "keg_pools"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      state_registrations: {
        Row: {
          approved_on: string | null
          brand_id: string
          brewery_id: string
          expires_on: string | null
          id: string
          registration_no: string | null
          state: string
        }
        Insert: {
          approved_on?: string | null
          brand_id: string
          brewery_id: string
          expires_on?: string | null
          id?: string
          registration_no?: string | null
          state: string
        }
        Update: {
          approved_on?: string | null
          brand_id?: string
          brewery_id?: string
          expires_on?: string | null
          id?: string
          registration_no?: string | null
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "state_registrations_brand_id_brewery_id_fkey"
            columns: ["brand_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "state_registrations_brand_id_brewery_id_fkey"
            columns: ["brand_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "product_volume_requirements"
            referencedColumns: ["brand_id", "brewery_id"]
          },
          {
            foreignKeyName: "state_registrations_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_lines: {
        Row: {
          brewery_id: string
          from_bin_id: string
          id: string
          keg_pool_id: string | null
          keg_size: Database["public"]["Enums"]["keg_size"] | null
          material_id: string | null
          note: string | null
          qty: number
          qty_picked: number | null
          sku_id: string | null
          to_bin_id: string
          transfer_id: string
        }
        Insert: {
          brewery_id: string
          from_bin_id: string
          id?: string
          keg_pool_id?: string | null
          keg_size?: Database["public"]["Enums"]["keg_size"] | null
          material_id?: string | null
          note?: string | null
          qty: number
          qty_picked?: number | null
          sku_id?: string | null
          to_bin_id: string
          transfer_id: string
        }
        Update: {
          brewery_id?: string
          from_bin_id?: string
          id?: string
          keg_pool_id?: string | null
          keg_size?: Database["public"]["Enums"]["keg_size"] | null
          material_id?: string | null
          note?: string | null
          qty?: number
          qty_picked?: number | null
          sku_id?: string | null
          to_bin_id?: string
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_lines_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_from_bin_id_brewery_id_fkey"
            columns: ["from_bin_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "bins"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_keg_pool_id_brewery_id_fkey"
            columns: ["keg_pool_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "keg_pools"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_material_id_brewery_id_fkey"
            columns: ["material_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "atp"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "sku_prices"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_to_bin_id_brewery_id_fkey"
            columns: ["to_bin_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "bins"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_transfer_id_brewery_id_fkey"
            columns: ["transfer_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          brewery_id: string
          created_at: string
          created_by: string
          from_location_id: string
          id: string
          note: string | null
          received_at: string | null
          requested_date: string | null
          status: Database["public"]["Enums"]["stock_transfer_status"]
          to_location_id: string
          transfer_no: number | null
        }
        Insert: {
          brewery_id: string
          created_at?: string
          created_by: string
          from_location_id: string
          id?: string
          note?: string | null
          received_at?: string | null
          requested_date?: string | null
          status?: Database["public"]["Enums"]["stock_transfer_status"]
          to_location_id: string
          transfer_no?: number | null
        }
        Update: {
          brewery_id?: string
          created_at?: string
          created_by?: string
          from_location_id?: string
          id?: string
          note?: string | null
          received_at?: string | null
          requested_date?: string | null
          status?: Database["public"]["Enums"]["stock_transfer_status"]
          to_location_id?: string
          transfer_no?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_from_location_id_brewery_id_fkey"
            columns: ["from_location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "stock_transfers_to_location_id_brewery_id_fkey"
            columns: ["to_location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      styles: {
        Row: {
          brewery_id: string
          id: string
          name: string
        }
        Insert: {
          brewery_id: string
          id?: string
          name: string
        }
        Update: {
          brewery_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "styles_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      tap_intervals: {
        Row: {
          brewery_id: string
          close_reason: string | null
          closed_at: string | null
          closed_by: string | null
          closing_fill: number | null
          id: string
          label: string | null
          location_id: string
          nominal_bbl: number
          not_in_inventory: boolean
          opened_at: string
          opened_by: string
          opening_fill: number
          sku_id: string | null
          tap_number: string | null
        }
        Insert: {
          brewery_id: string
          close_reason?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closing_fill?: number | null
          id?: string
          label?: string | null
          location_id: string
          nominal_bbl: number
          not_in_inventory: boolean
          opened_at?: string
          opened_by: string
          opening_fill: number
          sku_id?: string | null
          tap_number?: string | null
        }
        Update: {
          brewery_id?: string
          close_reason?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closing_fill?: number | null
          id?: string
          label?: string | null
          location_id?: string
          nominal_bbl?: number
          not_in_inventory?: boolean
          opened_at?: string
          opened_by?: string
          opening_fill?: number
          sku_id?: string | null
          tap_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tap_intervals_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tap_intervals_location_id_brewery_id_fkey"
            columns: ["location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "tap_intervals_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "atp"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "tap_intervals_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "sku_prices"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "tap_intervals_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      taproom_count_lines: {
        Row: {
          bin_id: string
          brewery_id: string
          corrects_line_id: string | null
          count_id: string
          id: string
          location_id: string
          lot_id: string | null
          movement_id: string | null
          qty_before: number
          qty_counted: number
          sku_id: string
        }
        Insert: {
          bin_id: string
          brewery_id: string
          corrects_line_id?: string | null
          count_id: string
          id?: string
          location_id: string
          lot_id?: string | null
          movement_id?: string | null
          qty_before: number
          qty_counted: number
          sku_id: string
        }
        Update: {
          bin_id?: string
          brewery_id?: string
          corrects_line_id?: string | null
          count_id?: string
          id?: string
          location_id?: string
          lot_id?: string | null
          movement_id?: string | null
          qty_before?: number
          qty_counted?: number
          sku_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "taproom_count_lines_bin_id_location_id_brewery_id_fkey"
            columns: ["bin_id", "location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "bins"
            referencedColumns: ["id", "location_id", "brewery_id"]
          },
          {
            foreignKeyName: "taproom_count_lines_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taproom_count_lines_corrects_line_id_location_id_brewery_i_fkey"
            columns: ["corrects_line_id", "location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "taproom_count_lines"
            referencedColumns: ["id", "location_id", "brewery_id"]
          },
          {
            foreignKeyName: "taproom_count_lines_count_id_location_id_brewery_id_fkey"
            columns: ["count_id", "location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "taproom_counts"
            referencedColumns: ["id", "location_id", "brewery_id"]
          },
          {
            foreignKeyName: "taproom_count_lines_lot_id_brewery_id_fkey"
            columns: ["lot_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "taproom_count_lines_movement_id_brewery_id_fkey"
            columns: ["movement_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "taproom_count_lines_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "atp"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "taproom_count_lines_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "sku_prices"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "taproom_count_lines_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      taproom_counts: {
        Row: {
          brewery_id: string
          correction_reason: string | null
          corrects_count_id: string | null
          counted_by: string
          counted_on: string
          created_at: string
          id: string
          location_id: string
          observed_at: string
          prior_count_id: string | null
        }
        Insert: {
          brewery_id: string
          correction_reason?: string | null
          corrects_count_id?: string | null
          counted_by: string
          counted_on: string
          created_at?: string
          id?: string
          location_id: string
          observed_at?: string
          prior_count_id?: string | null
        }
        Update: {
          brewery_id?: string
          correction_reason?: string | null
          corrects_count_id?: string | null
          counted_by?: string
          counted_on?: string
          created_at?: string
          id?: string
          location_id?: string
          observed_at?: string
          prior_count_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "taproom_counts_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taproom_counts_corrects_count_id_location_id_brewery_id_fkey"
            columns: ["corrects_count_id", "location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "taproom_counts"
            referencedColumns: ["id", "location_id", "brewery_id"]
          },
          {
            foreignKeyName: "taproom_counts_location_id_brewery_id_fkey"
            columns: ["location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "taproom_counts_prior_count_id_location_id_brewery_id_fkey"
            columns: ["prior_count_id", "location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "taproom_counts"
            referencedColumns: ["id", "location_id", "brewery_id"]
          },
        ]
      }
      taproom_pars: {
        Row: {
          brewery_id: string
          location_id: string
          par_qty: number
          sku_id: string
        }
        Insert: {
          brewery_id: string
          location_id: string
          par_qty: number
          sku_id: string
        }
        Update: {
          brewery_id?: string
          location_id?: string
          par_qty?: number
          sku_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "taproom_pars_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taproom_pars_location_id_brewery_id_fkey"
            columns: ["location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "taproom_pars_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "atp"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "taproom_pars_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "sku_prices"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "taproom_pars_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      transfers: {
        Row: {
          at: string
          bbl: number
          brewery_id: string
          created_at: string
          created_by: string
          from_occupancy_id: string
          id: string
          loss_bbl: number
          note: string | null
          to_occupancy_id: string
        }
        Insert: {
          at?: string
          bbl: number
          brewery_id: string
          created_at?: string
          created_by: string
          from_occupancy_id: string
          id?: string
          loss_bbl?: number
          note?: string | null
          to_occupancy_id: string
        }
        Update: {
          at?: string
          bbl?: number
          brewery_id?: string
          created_at?: string
          created_by?: string
          from_occupancy_id?: string
          id?: string
          loss_bbl?: number
          note?: string | null
          to_occupancy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_from_occupancy_id_brewery_id_fkey"
            columns: ["from_occupancy_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "occupancy_volumes"
            referencedColumns: ["occupancy_id", "brewery_id"]
          },
          {
            foreignKeyName: "transfers_from_occupancy_id_brewery_id_fkey"
            columns: ["from_occupancy_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "vessel_occupancies"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "transfers_to_occupancy_id_brewery_id_fkey"
            columns: ["to_occupancy_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "occupancy_volumes"
            referencedColumns: ["occupancy_id", "brewery_id"]
          },
          {
            foreignKeyName: "transfers_to_occupancy_id_brewery_id_fkey"
            columns: ["to_occupancy_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "vessel_occupancies"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      vendors: {
        Row: {
          active: boolean
          address: string | null
          brewery_id: string
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          lead_time_days: number | null
          name: string
          payment_terms: string
          phone: string | null
          qbo_vendor_id: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          brewery_id: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lead_time_days?: number | null
          name: string
          payment_terms?: string
          phone?: string | null
          qbo_vendor_id?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          brewery_id?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lead_time_days?: number | null
          name?: string
          payment_terms?: string
          phone?: string | null
          qbo_vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      vessel_occupancies: {
        Row: {
          batch_id: string
          brewery_id: string
          created_at: string
          ended_at: string | null
          id: string
          initial_bbl: number
          started_at: string
          vessel_id: string
        }
        Insert: {
          batch_id: string
          brewery_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          initial_bbl?: number
          started_at?: string
          vessel_id: string
        }
        Update: {
          batch_id?: string
          brewery_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          initial_bbl?: number
          started_at?: string
          vessel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vessel_occupancies_batch_id_brewery_id_fkey"
            columns: ["batch_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "vessel_occupancies_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vessel_occupancies_vessel_id_brewery_id_fkey"
            columns: ["vessel_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "vessel_contents"
            referencedColumns: ["vessel_id", "brewery_id"]
          },
          {
            foreignKeyName: "vessel_occupancies_vessel_id_brewery_id_fkey"
            columns: ["vessel_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      vessels: {
        Row: {
          active: boolean
          brewery_id: string
          capacity_bbl: number
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["vessel_kind"]
          name: string
        }
        Insert: {
          active?: boolean
          brewery_id: string
          capacity_bbl: number
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["vessel_kind"]
          name: string
        }
        Update: {
          active?: boolean
          brewery_id?: string
          capacity_bbl?: number
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["vessel_kind"]
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "vessels_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      volume_adjustment_reclassifications: {
        Row: {
          bbl: number
          brewery_id: string
          created_at: string
          created_by: string
          dest_state: string | null
          id: string
          source_adjustment_id: string
          target_class: Database["public"]["Enums"]["cellar_removal_class"]
          tax_treatment: Database["public"]["Enums"]["tax_treatment"] | null
        }
        Insert: {
          bbl: number
          brewery_id: string
          created_at?: string
          created_by: string
          dest_state?: string | null
          id?: string
          source_adjustment_id: string
          target_class: Database["public"]["Enums"]["cellar_removal_class"]
          tax_treatment?: Database["public"]["Enums"]["tax_treatment"] | null
        }
        Update: {
          bbl?: number
          brewery_id?: string
          created_at?: string
          created_by?: string
          dest_state?: string | null
          id?: string
          source_adjustment_id?: string
          target_class?: Database["public"]["Enums"]["cellar_removal_class"]
          tax_treatment?: Database["public"]["Enums"]["tax_treatment"] | null
        }
        Relationships: [
          {
            foreignKeyName: "volume_adjustment_reclassific_source_adjustment_id_brewery_fkey"
            columns: ["source_adjustment_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "volume_adjustments"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "volume_adjustment_reclassifications_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      volume_adjustments: {
        Row: {
          affects_occupancy: boolean
          at: string
          bbl: number
          brewery_id: string
          created_at: string
          created_by: string
          dest_state: string | null
          id: string
          note: string | null
          occupancy_id: string
          reason: Database["public"]["Enums"]["volume_adjustment_reason"]
          reclassification_id: string | null
          reclassification_leg: string | null
          removal_class:
            | Database["public"]["Enums"]["cellar_removal_class"]
            | null
          tax_treatment: Database["public"]["Enums"]["tax_treatment"] | null
        }
        Insert: {
          affects_occupancy?: boolean
          at?: string
          bbl: number
          brewery_id: string
          created_at?: string
          created_by: string
          dest_state?: string | null
          id?: string
          note?: string | null
          occupancy_id: string
          reason: Database["public"]["Enums"]["volume_adjustment_reason"]
          reclassification_id?: string | null
          reclassification_leg?: string | null
          removal_class?:
            | Database["public"]["Enums"]["cellar_removal_class"]
            | null
          tax_treatment?: Database["public"]["Enums"]["tax_treatment"] | null
        }
        Update: {
          affects_occupancy?: boolean
          at?: string
          bbl?: number
          brewery_id?: string
          created_at?: string
          created_by?: string
          dest_state?: string | null
          id?: string
          note?: string | null
          occupancy_id?: string
          reason?: Database["public"]["Enums"]["volume_adjustment_reason"]
          reclassification_id?: string | null
          reclassification_leg?: string | null
          removal_class?:
            | Database["public"]["Enums"]["cellar_removal_class"]
            | null
          tax_treatment?: Database["public"]["Enums"]["tax_treatment"] | null
        }
        Relationships: [
          {
            foreignKeyName: "volume_adjustments_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volume_adjustments_occupancy_id_brewery_id_fkey"
            columns: ["occupancy_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "occupancy_volumes"
            referencedColumns: ["occupancy_id", "brewery_id"]
          },
          {
            foreignKeyName: "volume_adjustments_occupancy_id_brewery_id_fkey"
            columns: ["occupancy_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "vessel_occupancies"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "volume_adjustments_reclassification_fk"
            columns: ["reclassification_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "volume_adjustment_reclassifications"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      water_profiles: {
        Row: {
          bicarbonate_ppm: number
          brewery_id: string
          calcium_ppm: number
          chloride_ppm: number
          created_at: string
          id: string
          magnesium_ppm: number
          name: string
          sodium_ppm: number
          sulfate_ppm: number
        }
        Insert: {
          bicarbonate_ppm: number
          brewery_id: string
          calcium_ppm: number
          chloride_ppm: number
          created_at?: string
          id?: string
          magnesium_ppm: number
          name: string
          sodium_ppm: number
          sulfate_ppm: number
        }
        Update: {
          bicarbonate_ppm?: number
          brewery_id?: string
          calcium_ppm?: number
          chloride_ppm?: number
          created_at?: string
          id?: string
          magnesium_ppm?: number
          name?: string
          sodium_ppm?: number
          sulfate_ppm?: number
        }
        Relationships: [
          {
            foreignKeyName: "water_profiles_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      atp: {
        Row: {
          brewery_id: string | null
          qty: number | null
          sku_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "skus_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      bin_move_stock: {
        Row: {
          bin_id: string | null
          brewery_id: string | null
          keg_size: string | null
          kind: string | null
          location_id: string | null
          lot_code: string | null
          lot_id: string | null
          name: string | null
          qty: number | null
          stock_id: string | null
          unit: string | null
        }
        Relationships: []
      }
      bin_on_hand: {
        Row: {
          bin_id: string | null
          brewery_id: string | null
          location_id: string | null
          qty: number | null
          sku_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_bin_id_location_id_brewery_id_fkey"
            columns: ["bin_id", "location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "bins"
            referencedColumns: ["id", "location_id", "brewery_id"]
          },
          {
            foreignKeyName: "inventory_movements_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_location_id_brewery_id_fkey"
            columns: ["location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "inventory_movements_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "atp"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "inventory_movements_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "sku_prices"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "inventory_movements_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      contract_balances: {
        Row: {
          brewery_id: string | null
          contract_id: string | null
          material_id: string | null
          qty_available: number | null
          qty_committed: number | null
          qty_on_order: number | null
          qty_received: number | null
          vendor_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_contracts_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_contracts_material_id_brewery_id_fkey"
            columns: ["material_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "material_contracts_vendor_id_brewery_id_fkey"
            columns: ["vendor_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      format_volumes: {
        Row: {
          basis: Database["public"]["Enums"]["format_basis"] | null
          bbl_per_unit: number | null
          brewery_id: string | null
          composed: boolean | null
          id: string | null
          name: string | null
        }
        Insert: {
          basis?: Database["public"]["Enums"]["format_basis"] | null
          bbl_per_unit?: never
          brewery_id?: string | null
          composed?: never
          id?: string | null
          name?: string | null
        }
        Update: {
          basis?: Database["public"]["Enums"]["format_basis"] | null
          bbl_per_unit?: never
          brewery_id?: string | null
          composed?: never
          id?: string | null
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "formats_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_totals: {
        Row: {
          brewery_id: string | null
          collected_cents: number | null
          customer_id: string | null
          invoice_id: string | null
          kind: Database["public"]["Enums"]["invoice_kind"] | null
          paid_at: string | null
          qbo_balance_cents: number | null
          qbo_sync_status: Database["public"]["Enums"]["qbo_sync_status"] | null
          qbo_tax_cents: number | null
          qbo_total_cents: number | null
          subtotal_cents: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_brewery_id_fkey"
            columns: ["customer_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      keg_bin_on_hand: {
        Row: {
          bin_id: string | null
          brewery_id: string | null
          keg_size: Database["public"]["Enums"]["keg_size"] | null
          location_id: string | null
          pool_id: string | null
          qty: number | null
        }
        Relationships: []
      }
      keg_bin_totals: {
        Row: {
          bin_id: string | null
          brewery_id: string | null
          keg_size: Database["public"]["Enums"]["keg_size"] | null
          location_id: string | null
          pool_id: string | null
          qty: number | null
        }
        Relationships: [
          {
            foreignKeyName: "keg_events_bin_id_location_id_brewery_id_fkey"
            columns: ["bin_id", "location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "bins"
            referencedColumns: ["id", "location_id", "brewery_id"]
          },
          {
            foreignKeyName: "keg_events_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keg_events_location_id_brewery_id_fkey"
            columns: ["location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "keg_events_pool_id_brewery_id_fkey"
            columns: ["pool_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "keg_pools"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      keg_customer_balances: {
        Row: {
          brewery_id: string | null
          customer_id: string | null
          keg_size: Database["public"]["Enums"]["keg_size"] | null
          pool_id: string | null
          qty: number | null
        }
        Relationships: [
          {
            foreignKeyName: "keg_events_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keg_events_customer_id_brewery_id_fkey"
            columns: ["customer_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "keg_events_pool_id_brewery_id_fkey"
            columns: ["pool_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "keg_pools"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      keg_deposit_balances: {
        Row: {
          brewery_id: string | null
          customer_id: string | null
          deposit_cents: number | null
          keg_pool_id: string | null
          keg_size: Database["public"]["Enums"]["keg_size"] | null
          kegs_on_deposit: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_brewery_id_fkey"
            columns: ["customer_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      keg_fleet_totals: {
        Row: {
          brewery_id: string | null
          keg_size: Database["public"]["Enums"]["keg_size"] | null
          pool_id: string | null
          qty: number | null
        }
        Relationships: [
          {
            foreignKeyName: "keg_events_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keg_events_pool_id_brewery_id_fkey"
            columns: ["pool_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "keg_pools"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      keg_loss_rates: {
        Row: {
          brewery_id: string | null
          loss_rate: number | null
          lost: number | null
          pool_id: string | null
          shipped: number | null
        }
        Relationships: [
          {
            foreignKeyName: "keg_events_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keg_events_pool_id_brewery_id_fkey"
            columns: ["pool_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "keg_pools"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      lot_on_hand: {
        Row: {
          brewery_id: string | null
          location_id: string | null
          lot_id: string | null
          qty: number | null
          sku_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_location_id_brewery_id_fkey"
            columns: ["location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "inventory_movements_lot_fk"
            columns: ["lot_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "inventory_movements_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "atp"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "inventory_movements_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "sku_prices"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "inventory_movements_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      material_bin_on_hand: {
        Row: {
          bin_id: string | null
          brewery_id: string | null
          location_id: string | null
          material_id: string | null
          qty: number | null
        }
        Relationships: [
          {
            foreignKeyName: "material_movements_bin_id_location_id_brewery_id_fkey"
            columns: ["bin_id", "location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "bins"
            referencedColumns: ["id", "location_id", "brewery_id"]
          },
          {
            foreignKeyName: "material_movements_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_movements_location_id_brewery_id_fkey"
            columns: ["location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "material_movements_material_id_brewery_id_fkey"
            columns: ["material_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      material_last_cost: {
        Row: {
          brewery_id: string | null
          created_at: string | null
          material_id: string | null
          unit_cost_cents: number | null
        }
        Relationships: [
          {
            foreignKeyName: "material_movements_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_movements_material_id_brewery_id_fkey"
            columns: ["material_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      material_lot_bin_on_hand: {
        Row: {
          bin_id: string | null
          brewery_id: string | null
          location_id: string | null
          lot_id: string | null
          material_id: string | null
          qty: number | null
        }
        Relationships: [
          {
            foreignKeyName: "material_movements_bin_id_location_id_brewery_id_fkey"
            columns: ["bin_id", "location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "bins"
            referencedColumns: ["id", "location_id", "brewery_id"]
          },
          {
            foreignKeyName: "material_movements_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_movements_location_id_brewery_id_fkey"
            columns: ["location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "material_movements_lot_id_material_id_brewery_id_fkey"
            columns: ["lot_id", "material_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "material_lots"
            referencedColumns: ["id", "material_id", "brewery_id"]
          },
          {
            foreignKeyName: "material_movements_material_id_brewery_id_fkey"
            columns: ["material_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      material_lot_on_hand: {
        Row: {
          brewery_id: string | null
          lot_id: string | null
          material_id: string | null
          qty: number | null
          received_on: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_movements_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_movements_lot_id_material_id_brewery_id_fkey"
            columns: ["lot_id", "material_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "material_lots"
            referencedColumns: ["id", "material_id", "brewery_id"]
          },
          {
            foreignKeyName: "material_movements_material_id_brewery_id_fkey"
            columns: ["material_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      material_on_hand: {
        Row: {
          brewery_id: string | null
          material_id: string | null
          qty: number | null
        }
        Relationships: [
          {
            foreignKeyName: "material_movements_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_movements_material_id_brewery_id_fkey"
            columns: ["material_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      material_on_order: {
        Row: {
          brewery_id: string | null
          material_id: string | null
          qty: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_material_id_brewery_id_fkey"
            columns: ["material_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      material_requirements: {
        Row: {
          base_uom: Database["public"]["Enums"]["uom"] | null
          brewery_id: string | null
          buy_by: string | null
          contract_id: string | null
          contract_qty_available: number | null
          contract_unit_cost_cents: number | null
          lead_time_days: number | null
          material_id: string | null
          material_name: string | null
          needed_by: string | null
          on_hand: number | null
          on_order: number | null
          out_of_reach: boolean | null
          purchase_units_short: number | null
          purchase_uom: Database["public"]["Enums"]["uom"] | null
          purchase_uom_factor: number | null
          required: number | null
          short: number | null
          vendor_id: string | null
          vendor_name: string | null
        }
        Relationships: []
      }
      occupancy_volumes: {
        Row: {
          batch_id: string | null
          bbl: number | null
          brewery_id: string | null
          ended_at: string | null
          occupancy_id: string | null
          started_at: string | null
          vessel_id: string | null
        }
        Insert: {
          batch_id?: string | null
          bbl?: never
          brewery_id?: string | null
          ended_at?: string | null
          occupancy_id?: string | null
          started_at?: string | null
          vessel_id?: string | null
        }
        Update: {
          batch_id?: string | null
          bbl?: never
          brewery_id?: string | null
          ended_at?: string | null
          occupancy_id?: string | null
          started_at?: string | null
          vessel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vessel_occupancies_batch_id_brewery_id_fkey"
            columns: ["batch_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "vessel_occupancies_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vessel_occupancies_vessel_id_brewery_id_fkey"
            columns: ["vessel_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "vessel_contents"
            referencedColumns: ["vessel_id", "brewery_id"]
          },
          {
            foreignKeyName: "vessel_occupancies_vessel_id_brewery_id_fkey"
            columns: ["vessel_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      on_hand: {
        Row: {
          brewery_id: string | null
          location_id: string | null
          qty: number | null
          sku_id: string | null
        }
        Relationships: []
      }
      packaging_run_requirements: {
        Row: {
          brewery_id: string | null
          material_id: string | null
          on_hand: number | null
          on_order: number | null
          required: number | null
          run_id: string | null
          short: number | null
        }
        Relationships: [
          {
            foreignKeyName: "packaging_runs_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      packaging_run_yields: {
        Row: {
          bbl_drawn: number | null
          bbl_packaged: number | null
          brewery_id: string | null
          loss_bbl: number | null
          run_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packaging_runs_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      po_open_balances: {
        Row: {
          brewery_id: string | null
          contract_id: string | null
          material_id: string | null
          po_id: string | null
          po_line_id: string | null
          qty_open: number | null
          qty_ordered: number | null
          qty_received: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_contract_id_brewery_id_fkey"
            columns: ["contract_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "contract_balances"
            referencedColumns: ["contract_id", "brewery_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_contract_id_brewery_id_fkey"
            columns: ["contract_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "material_contracts"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_material_id_brewery_id_fkey"
            columns: ["material_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_po_id_brewery_id_fkey"
            columns: ["po_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      portal_brewery: {
        Row: {
          customer_phone: string | null
          id: string | null
          name: string | null
          portal_fulfillment_location_id: string | null
          timezone: string | null
        }
        Relationships: []
      }
      portal_schedule: {
        Row: {
          brand_id: string | null
          brand_name: string | null
          brewery_id: string | null
          listed: boolean | null
          planned_week: string | null
        }
        Relationships: []
      }
      pos_unmapped_items: {
        Row: {
          brewery_id: string | null
          connection_id: string | null
          external_item_id: string | null
          external_variation_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_sales_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_connection_id_brewery_id_fkey"
            columns: ["connection_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "pos_connections"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      product_volume_requirements: {
        Row: {
          brand_id: string | null
          brand_name: string | null
          brew_bbl: number | null
          brewery_id: string | null
          demand_bbl: number | null
          supply_bbl: number | null
        }
        Relationships: [
          {
            foreignKeyName: "brands_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_version_costs: {
        Row: {
          brewery_id: string | null
          cost_cents_per_bbl: number | null
          recipe_version_id: string | null
          uncosted_material_ids: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_version_id_brewery_id_fkey"
            columns: ["recipe_version_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      route_loads: {
        Row: {
          brewery_id: string | null
          customer_id: string | null
          order_id: string | null
          qty: number | null
          route_id: string | null
          shipment_id: string | null
          sku_id: string | null
          stop_no: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_route_id_brewery_id_fkey"
            columns: ["route_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "deliveries_shipment_id_brewery_id_fkey"
            columns: ["shipment_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      sku_prices: {
        Row: {
          active: boolean | null
          brand_name: string | null
          brewery_id: string | null
          sale_channel_id: string | null
          sku_id: string | null
          sku_name: string | null
          unit_price_cents: number | null
        }
        Relationships: [
          {
            foreignKeyName: "skus_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_brewery: {
        Row: {
          ai_model: string | null
          gravity_unit: string | null
          id: string | null
          name: string | null
          timezone: string | null
        }
        Relationships: []
      }
      taproom_replenishment: {
        Row: {
          brewery_id: string | null
          location_id: string | null
          on_hand_qty: number | null
          par_qty: number | null
          sku_id: string | null
          suggested_qty: number | null
        }
        Relationships: [
          {
            foreignKeyName: "taproom_pars_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taproom_pars_location_id_brewery_id_fkey"
            columns: ["location_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "brewery_id"]
          },
          {
            foreignKeyName: "taproom_pars_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "atp"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "taproom_pars_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "sku_prices"
            referencedColumns: ["sku_id", "brewery_id"]
          },
          {
            foreignKeyName: "taproom_pars_sku_id_brewery_id_fkey"
            columns: ["sku_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      vendor_lead_times: {
        Row: {
          avg_first_lead_days: number | null
          avg_late_days: number | null
          avg_lead_days: number | null
          brewery_id: string | null
          n: number | null
          sent_via: string | null
          vendor_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_brewery_id_fkey"
            columns: ["vendor_id", "brewery_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id", "brewery_id"]
          },
        ]
      }
      vessel_contents: {
        Row: {
          batch_id: string | null
          bbl: number | null
          brewery_id: string | null
          capacity_bbl: number | null
          kind: Database["public"]["Enums"]["vessel_kind"] | null
          name: string | null
          occupancy_id: string | null
          vessel_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vessels_brewery_id_fkey"
            columns: ["brewery_id"]
            isOneToOne: false
            referencedRelation: "breweries"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_chat_installation: {
        Args: {
          p_actor: string
          p_display_label: string
          p_external_enterprise_id: string
          p_external_installation_id: string
          p_granted_capabilities: Json
          p_installation: string
          p_redirect_uri: string
          p_state_hash: string
          p_token_store_key: string
        }
        Returns: Json
      }
      adjust_order_lines: {
        Args: {
          p_lines: Json
          p_order: string
          p_reason: string
          p_request_id: string
        }
        Returns: Json
      }
      advance_square_catalog_sync: {
        Args: {
          p_actor: string
          p_brewery: string
          p_connection: string
          p_expected_version: number
          p_next_version: number
          p_request_id: string
        }
        Returns: boolean
      }
      advance_square_sales_sync: {
        Args: {
          p_actor: string
          p_brewery: string
          p_connection: string
          p_expected_version: number
          p_next_version: number
          p_request_id: string
        }
        Returns: boolean
      }
      append_chat_message: {
        Args: {
          p_brewery: string
          p_content: string
          p_conversation: string
          p_request_id: string
          p_role: string
        }
        Returns: Json
      }
      assert_chat_admin: { Args: { b: string }; Returns: undefined }
      begin_chat_installation: {
        Args: {
          p_brewery: string
          p_provider: string
          p_redirect_uri: string
          p_request_id: string
          p_state_hash: string
        }
        Returns: Json
      }
      begin_chat_reauthorization: {
        Args: {
          p_brewery: string
          p_installation: string
          p_redirect_uri: string
          p_request_id: string
          p_state_hash: string
        }
        Returns: Json
      }
      begin_csv_import: {
        Args: {
          p_brewery: string
          p_kind: string
          p_request_id: string
          p_rows: Json
        }
        Returns: Json
      }
      begin_qbo_disconnect: {
        Args: {
          p_actor: string
          p_brewery: string
          p_connection: string
          p_request_id: string
        }
        Returns: {
          refresh_token: string
          replay_result: Json
        }[]
      }
      begin_qbo_invoice_sync: {
        Args: { p_brewery: string; p_request_id: string }
        Returns: Json
      }
      begin_qbo_oauth: {
        Args: {
          p_brewery: string
          p_provider_intent: string
          p_redirect_uri: string
          p_request_id: string
          p_requested_scopes?: string[]
          p_state_hash: string
        }
        Returns: Json
      }
      begin_square_catalog_sync: {
        Args: { p_brewery: string; p_request_id: string }
        Returns: Json
      }
      begin_square_disconnect: {
        Args: {
          p_actor: string
          p_brewery: string
          p_connection: string
          p_request_id: string
        }
        Returns: {
          access_token: string
          replay_result: Json
        }[]
      }
      begin_square_menu_publication: {
        Args: {
          p_brewery: string
          p_external_location: string
          p_request_id: string
          p_retry_conflict: boolean
        }
        Returns: Json
      }
      begin_square_oauth: {
        Args: {
          p_brewery: string
          p_provider_intent: string
          p_redirect_uri: string
          p_request_id: string
          p_requested_scopes: string[]
          p_state_hash: string
        }
        Returns: Json
      }
      begin_square_publication: {
        Args: {
          p_adopt_item: string
          p_adopt_variation: string
          p_brand: string
          p_brewery: string
          p_command: string
          p_external_location: string
          p_menu_publication?: string
          p_request_id: string
          p_retry_conflict: boolean
        }
        Returns: Json
      }
      begin_square_sales_sync: {
        Args: { p_brewery: string; p_request_id: string }
        Returns: Json
      }
      block_notification_destination: {
        Args: { p_destination: string; p_reason: string }
        Returns: undefined
      }
      cancel_order: {
        Args: { p_order: string; p_reason: string; p_request_id: string }
        Returns: Json
      }
      cas_integration_tokens: {
        Args: {
          p_access_seconds: number
          p_access_token: string
          p_actor: string
          p_brewery: string
          p_connection: string
          p_expected_version: number
          p_hard_seconds: number
          p_provider: string
          p_received_at: string
          p_refresh_seconds: number
          p_refresh_token: string
        }
        Returns: boolean
      }
      cas_portal_qbo_payment_tokens: {
        Args: {
          p_access_seconds: number
          p_access_token: string
          p_actor: string
          p_brewery: string
          p_connection: string
          p_customer: string
          p_expected_version: number
          p_granted_scopes: string[]
          p_hard_seconds: number
          p_invoice: string
          p_realm_id: string
          p_received_at: string
          p_refresh_seconds: number
          p_refresh_token: string
          p_remote_invoice_id: string
        }
        Returns: boolean
      }
      chat_assert_job: { Args: never; Returns: undefined }
      chat_credential_has_canonical_owner: {
        Args: { p_external_installation_id: string }
        Returns: boolean
      }
      chat_fanout_deliveries: {
        Args: { p_brewery: string; p_now: string; p_occurrence?: string }
        Returns: number
      }
      chat_quiet_release: {
        Args: { p_end: string; p_now: string; p_start: string; p_tz: string }
        Returns: string
      }
      chat_settings_request_completed: {
        Args: { p_brewery: string; p_request_id: string; p_user: string }
        Returns: boolean
      }
      chat_take_lease: {
        Args: { p_delivery: string; p_lease: string }
        Returns: {
          attempt_count: number
          brewery_id: string
          created_at: string
          destination_id: string
          id: string
          installation_id: string
          last_error_code: string | null
          lease_expires_at: string | null
          next_attempt_at: string
          occurrence_id: string
          provider: string
          provider_conversation_id: string | null
          provider_message_id: string | null
          resolved_at: string | null
          semantic_key: string
          sent_at: string | null
          state: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "notification_deliveries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      chat_upsert_occurrences: {
        Args: { p_brewery: string; p_now: string; p_subject_id?: string }
        Returns: number
      }
      claim_chat_callback_receipts: {
        Args: { p_limit: number; p_now: string }
        Returns: {
          brewery_id: string
          callback_kind: string
          external_installation_id: string
          external_user_id: string
          id: string
          installation_id: string
        }[]
      }
      claim_invite_request: {
        Args: {
          p_brewery: string
          p_customer: string
          p_email: string
          p_kind: string
          p_request_id: string
          p_role: Database["public"]["Enums"]["staff_role"]
        }
        Returns: Json
      }
      claim_qbo_oauth: {
        Args: {
          p_actor: string
          p_brewery: string
          p_redirect_uri: string
          p_state_hash: string
        }
        Returns: {
          brewery_id: string
          intent_id: string
          provider_intent: string
          requested_scopes: string[]
        }[]
      }
      claim_square_oauth: {
        Args: {
          p_actor: string
          p_brewery: string
          p_redirect_uri: string
          p_state_hash: string
        }
        Returns: {
          brewery_id: string
          intent_id: string
          provider_intent: string
          requested_scopes: string[]
        }[]
      }
      clear_channel_price: {
        Args: {
          p_brewery: string
          p_format: string
          p_price_group: string
          p_request_id: string
          p_sale_channel: string
        }
        Returns: Json
      }
      close_packaging_run: {
        Args: {
          p_bbl_drawn: number
          p_best_by: string
          p_bin: string
          p_brewery: string
          p_location: string
          p_lot_code: string
          p_outputs: Json
          p_packaged_on: string
          p_request_id: string
          p_run: string
        }
        Returns: Json
      }
      complete_batch: {
        Args: { p_batch: string; p_brewery: string; p_request_id: string }
        Returns: Json
      }
      complete_chat_callback_receipt: {
        Args: { p_disposition: string; p_error_code: string; p_receipt: string }
        Returns: undefined
      }
      complete_chat_delivery: {
        Args: {
          p_conversation_id: string
          p_delivery: string
          p_lease: string
          p_message_id: string
        }
        Returns: undefined
      }
      complete_invite_membership: {
        Args: { p_request_id: string }
        Returns: Json
      }
      complete_qbo_invoice_sync: {
        Args: {
          p_actor: string
          p_brewery: string
          p_connection: string
          p_observations: Json
          p_realm: string
          p_request_id: string
        }
        Returns: Json
      }
      complete_qbo_oauth: {
        Args: {
          p_access_seconds: number
          p_access_token: string
          p_actor: string
          p_granted_scopes?: string[]
          p_hard_seconds: number
          p_intent: string
          p_realm_id: string
          p_realm_label: string
          p_received_at: string
          p_refresh_seconds: number
          p_refresh_token: string
        }
        Returns: string
      }
      complete_square_oauth: {
        Args: {
          p_access_expires_at: string
          p_access_token: string
          p_actor: string
          p_granted_scopes: string[]
          p_intent: string
          p_locations: Json
          p_merchant_id: string
          p_merchant_label: string
          p_refresh_token: string
        }
        Returns: string
      }
      configure_pos_menu: {
        Args: {
          p_bin: string
          p_brewery: string
          p_external_location: string
          p_request_id: string
          p_sale_channel: string
        }
        Returns: Json
      }
      confirm_delivery: {
        Args: { p_delivery: string; p_request_id: string; p_signed_by: string }
        Returns: Json
      }
      confirm_order: {
        Args: { p_order: string; p_request_id: string }
        Returns: Json
      }
      confirm_portal_qbo_payment: {
        Args: {
          p_actor: string
          p_brewery: string
          p_connection: string
          p_customer: string
          p_expected_version: number
          p_granted_scopes: string[]
          p_invoice: string
          p_realm_id: string
          p_remote_invoice_id: string
        }
        Returns: boolean
      }
      confirm_restock: {
        Args: { p_order: string; p_request_id: string }
        Returns: Json
      }
      consume_chat_action_intent: {
        Args: {
          p_action: string
          p_input: Json
          p_intent: string
          p_receipt: string
        }
        Returns: Json
      }
      consume_chat_link_proof: {
        Args: { p_brewery: string; p_proof_hash: string; p_request_id: string }
        Returns: Json
      }
      consume_command_admission: {
        Args: never
        Returns: {
          allowed: boolean
          retry_after: number
        }[]
      }
      correct_taproom_count: {
        Args: {
          p_brewery: string
          p_corrections: Json
          p_count: string
          p_reason: string
          p_request_id: string
        }
        Returns: Json
      }
      create_bin: {
        Args: {
          p_brewery: string
          p_location: string
          p_name: string
          p_request_id: string
        }
        Returns: Json
      }
      create_chat_conversation: {
        Args: { p_brewery: string; p_request_id: string; p_title: string }
        Returns: Json
      }
      create_composed_format: {
        Args: {
          p_brewery: string
          p_components: Json
          p_name: string
          p_package_type: Database["public"]["Enums"]["package_type"]
          p_request_id: string
        }
        Returns: Json
      }
      create_credit_memo: {
        Args: {
          p_invoice: string
          p_lines: Json
          p_location: string
          p_reason: string
          p_request_id: string
        }
        Returns: Json
      }
      create_keg_pool: {
        Args: {
          p_brewery: string
          p_deposit_cents: number
          p_kind: Database["public"]["Enums"]["keg_pool_kind"]
          p_name: string
          p_per_fill_cents: number
          p_request_id: string
          p_vendor: string
        }
        Returns: Json
      }
      create_location: {
        Args: {
          p_brewery: string
          p_name: string
          p_request_id: string
          p_uses: Database["public"]["Enums"]["location_kind"][]
        }
        Returns: Json
      }
      create_order: {
        Args: {
          p_brewery: string
          p_customer: string
          p_from_location: string
          p_kind: Database["public"]["Enums"]["order_kind"]
          p_lines: Json
          p_note: string
          p_po: string
          p_request_id: string
          p_requested: string
          p_ship_to: string
          p_to_location: string
        }
        Returns: Json
      }
      create_purchase_order: {
        Args: {
          p_brewery: string
          p_expected_on: string
          p_lines: Json
          p_note: string
          p_request_id: string
          p_vendor: string
        }
        Returns: Json
      }
      create_recipe: {
        Args: {
          p_brand: string
          p_brewery: string
          p_name: string
          p_note: string
          p_request_id: string
        }
        Returns: Json
      }
      create_recipe_version: {
        Args: {
          p_boil_minutes: number
          p_brewery: string
          p_brewhouse_efficiency: number
          p_fermentation_schedule: Json
          p_ingredients: Json
          p_mash_schedule: Json
          p_note: string
          p_process: Json
          p_recipe: string
          p_request_id: string
          p_target_ibu: number
          p_yeast_attenuation: number
        }
        Returns: Json
      }
      create_replenishment_order: {
        Args: {
          p_from: string
          p_lines: Json
          p_request_id: string
          p_to: string
        }
        Returns: Json
      }
      create_sku: {
        Args: {
          p_brand: string
          p_brewery: string
          p_format: string
          p_name: string
          p_request_id: string
          p_upc: string
        }
        Returns: Json
      }
      create_stock_transfer: {
        Args: {
          p_brewery: string
          p_from: string
          p_lines: Json
          p_note: string
          p_request_id: string
          p_requested: string
          p_to: string
        }
        Returns: Json
      }
      delete_bin: {
        Args: { p_bin: string; p_brewery: string; p_request_id: string }
        Returns: Json
      }
      delete_catalog_category: {
        Args: { p_brewery: string; p_name: string; p_request_id: string }
        Returns: Json
      }
      delete_customer: {
        Args: { p_brewery: string; p_id: string; p_request_id: string }
        Returns: Json
      }
      delete_format: {
        Args: { p_brewery: string; p_id: string; p_request_id: string }
        Returns: Json
      }
      delete_price_group: {
        Args: { p_brewery: string; p_id: string; p_request_id: string }
        Returns: Json
      }
      delete_sale_channel: {
        Args: { p_brewery: string; p_id: string; p_request_id: string }
        Returns: Json
      }
      depart_route: {
        Args: { p_request_id: string; p_route: string }
        Returns: Json
      }
      disable_chat_installation: {
        Args: {
          p_brewery: string
          p_installation: string
          p_request_id: string
        }
        Returns: Json
      }
      disconnect_chat_installation: {
        Args: {
          p_brewery: string
          p_installation: string
          p_request_id: string
        }
        Returns: Json
      }
      draft_purchase_order_from_requirements: {
        Args: { p_brewery: string; p_materials: string[]; p_request_id: string }
        Returns: Json
      }
      fail_qbo_oauth: {
        Args: { p_actor: string; p_intent: string }
        Returns: boolean
      }
      fail_square_oauth: {
        Args: {
          p_actor: string
          p_cleanup_state: string
          p_intent: string
          p_merchant_id: string
        }
        Returns: boolean
      }
      file_compliance_report: {
        Args: {
          p_brewery: string
          p_end: string
          p_jurisdiction: string
          p_note: string
          p_request_id: string
          p_start: string
        }
        Returns: Json
      }
      find_chat_oauth_intent: {
        Args: { p_actor: string; p_state_hash: string }
        Returns: Json
      }
      finish_portal_quote_tax: {
        Args: {
          p_actor: string
          p_brewery: string
          p_connection: string
          p_customer: string
          p_quote: string
          p_tax_cents: number
        }
        Returns: Json
      }
      finish_qbo_disconnect: {
        Args: {
          p_actor: string
          p_brewery: string
          p_connection: string
          p_request_id: string
          p_revoked: boolean
        }
        Returns: Json
      }
      finish_qbo_push: {
        Args: {
          p_actor: string
          p_brewery: string
          p_error: string
          p_push: string
          p_qbo_entity_id: string
          p_request_id: string
          p_response: Json
          p_status: string
        }
        Returns: Json
      }
      finish_square_disconnect: {
        Args: {
          p_actor: string
          p_brewery: string
          p_connection: string
          p_request_id: string
          p_revoked: boolean
        }
        Returns: Json
      }
      finish_square_menu_publication: {
        Args: { p_actor: string; p_brewery: string; p_publication: string }
        Returns: Json
      }
      finish_square_publication: {
        Args: {
          p_actor: string
          p_brewery: string
          p_error_code: string
          p_publication: string
          p_response: Json
        }
        Returns: Json
      }
      generate_compliance_report: {
        Args: {
          p_brewery: string
          p_end: string
          p_jurisdiction: string
          p_start: string
        }
        Returns: Json
      }
      get_batch_completion_preview: {
        Args: { p_batch: string; p_brewery: string }
        Returns: Json
      }
      get_chat_delivery_context: {
        Args: { p_delivery: string; p_now?: string }
        Returns: Json
      }
      get_chat_history: {
        Args: { p_brewery: string; p_conversation: string }
        Returns: Json
      }
      get_chat_home_items: {
        Args: { p_external_user_id: string; p_installation: string }
        Returns: Json
      }
      get_chat_installation_lifecycle: {
        Args: { p_installation: string }
        Returns: Json
      }
      get_chat_integration_health: {
        Args: { p_brewery: string }
        Returns: Json
      }
      get_chat_link_intent: {
        Args: { p_brewery: string; p_proof_hash: string }
        Returns: Json
      }
      get_chat_settings_installation: {
        Args: { p_actor: string; p_brewery: string; p_installation: string }
        Returns: Json
      }
      get_loss_review: {
        Args: { p_brewery: string; p_end: string; p_start: string }
        Returns: Json
      }
      get_pos_menu: {
        Args: { p_brewery: string; p_external_location: string }
        Returns: Json
      }
      get_pos_menu_item: {
        Args: {
          p_brewery: string
          p_external_location: string
          p_format: string
        }
        Returns: Json
      }
      get_published_pos_menu: { Args: { p_public_id: string }; Returns: Json }
      get_taproom_count: {
        Args: { p_brewery: string; p_count: string }
        Returns: Json
      }
      get_taproom_count_snapshot: {
        Args: { p_brewery: string; p_location: string }
        Returns: Json
      }
      get_taproom_draft_projection: {
        Args: { p_brewery: string; p_location: string }
        Returns: Json
      }
      get_taproom_print_labels: {
        Args: { p_brewery: string; p_location: string; p_revision: string }
        Returns: Json
      }
      get_taproom_variance: {
        Args: { p_brewery: string; p_location: string; p_weeks: number }
        Returns: Json
      }
      get_today_items: {
        Args: { p_brewery: string; p_now?: string }
        Returns: unknown[]
        SetofOptions: {
          from: "*"
          to: "today_candidates"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_active_canonical_chat_installation: {
        Args: { p_external_installation_id: string }
        Returns: boolean
      }
      import_csv_row: {
        Args: { p_brewery: string; p_request_id: string; p_row_n: number }
        Returns: Json
      }
      is_staff_of: { Args: { b: string }; Returns: boolean }
      issue_chat_action_intent: {
        Args: {
          p_action: string
          p_delivery?: string
          p_external_user_id: string
          p_installation: string
        }
        Returns: string
      }
      issue_chat_link_proof: {
        Args: {
          p_external_user_id: string
          p_installation: string
          p_proof_hash: string
        }
        Returns: Json
      }
      keg_bin_on_hand_rows: {
        Args: never
        Returns: {
          bin_id: string
          brewery_id: string
          keg_size: Database["public"]["Enums"]["keg_size"]
          location_id: string
          pool_id: string
          qty: number
        }[]
      }
      kick_keg: {
        Args: {
          p_brewery: string
          p_closing_fill: number
          p_interval: string
          p_reason: string
          p_request_id: string
        }
        Returns: Json
      }
      lease_chat_deliveries: {
        Args: { p_lease_seconds: number; p_limit: number; p_now: string }
        Returns: {
          attempt_count: number
          destination_id: string
          id: string
          installation_id: string
          lease_expires_at: string
          occurrence_id: string
          provider: string
        }[]
      }
      lease_square_publication: {
        Args: { p_actor: string; p_brewery: string; p_publication: string }
        Returns: {
          access_expires_at: string
          access_token: string
          credential_version: number
          merchant_id: string
          refresh_token: string
          request_body: string
          superseded: boolean
        }[]
      }
      list_chat_conversations: { Args: { p_brewery: string }; Returns: Json }
      list_chat_scan_targets: { Args: never; Returns: string[] }
      list_chat_user_links: { Args: { p_brewery: string }; Returns: Json }
      list_open_taps: {
        Args: { p_brewery: string; p_location: string }
        Returns: Json
      }
      list_tap_history: {
        Args: { p_brewery: string; p_location: string }
        Returns: Json
      }
      list_taproom_counts: {
        Args: { p_brewery: string; p_location: string }
        Returns: Json
      }
      list_team_members: {
        Args: { p_brewery: string }
        Returns: {
          created_at: string
          email: string
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }[]
      }
      mark_chat_installation_reauthorization: {
        Args: { p_failure_code: string; p_installation: string }
        Returns: undefined
      }
      mark_square_authorization_failed: {
        Args: {
          p_actor: string
          p_brewery: string
          p_connection: string
          p_expected_version: number
        }
        Returns: boolean
      }
      move_stock_bin: {
        Args: {
          p_brewery: string
          p_from_bin: string
          p_keg_pool: string
          p_keg_size: Database["public"]["Enums"]["keg_size"]
          p_material: string
          p_material_lot?: string
          p_note: string
          p_qty: number
          p_request_id: string
          p_sku: string
          p_sku_lot?: string
          p_to_bin: string
        }
        Returns: Json
      }
      my_brewery_ids: { Args: never; Returns: string[] }
      my_customer_ids: { Args: never; Returns: string[] }
      on_hand_rows: {
        Args: never
        Returns: {
          brewery_id: string
          location_id: string
          qty: number
          sku_id: string
        }[]
      }
      portal_availability: {
        Args: { p_customer: string }
        Returns: {
          badge: string
          sku_id: string
        }[]
      }
      portal_brewery_rows: {
        Args: never
        Returns: {
          customer_phone: string
          id: string
          name: string
          portal_fulfillment_location_id: string
          timezone: string
        }[]
      }
      portal_create_order: {
        Args: {
          p_brewery: string
          p_customer: string
          p_lines: Json
          p_note: string
          p_po: string
          p_request_id: string
          p_requested?: string
          p_ship_to: string
        }
        Returns: Json
      }
      portal_quote_order: {
        Args: {
          p_brewery: string
          p_customer: string
          p_lines: Json
          p_note: string
          p_po: string
          p_request_id: string
          p_requested: string
          p_ship_to: string
        }
        Returns: Json
      }
      portal_schedule_rows: {
        Args: never
        Returns: {
          brand_id: string
          brand_name: string
          brewery_id: string
          listed: boolean
          planned_week: string
        }[]
      }
      portal_submit_quote: {
        Args: {
          p_brewery: string
          p_customer: string
          p_order: string
          p_quote: string
          p_request_id: string
        }
        Returns: Json
      }
      pos_order_versions: {
        Args: never
        Returns: {
          brewery_id: string
          connection_id: string
          external_order_id: string
          source_version: number
        }[]
      }
      prepare_square_publication: {
        Args: {
          p_actor: string
          p_brewery: string
          p_item_version: number
          p_publication: string
          p_request_body: string
          p_variation_versions: Json
        }
        Returns: boolean
      }
      preview_inventory_movement: {
        Args: {
          p_bin: string
          p_brewery: string
          p_conversation: string
          p_dest_state: string
          p_location: string
          p_lot: string
          p_note: string
          p_qty: number
          p_sale_channel: string
          p_sku: string
          p_type: Database["public"]["Enums"]["movement_type"]
        }
        Returns: Json
      }
      provision_brewery: {
        Args: {
          p_name: string
          p_request_id: string
          p_timezone: string
          p_ttb: string
        }
        Returns: string
      }
      prune_chat_integration_logs: {
        Args: { p_older_than?: string }
        Returns: Json
      }
      raise_invoice_question: {
        Args: {
          p_body: string
          p_brewery: string
          p_invoice: string
          p_request_id: string
        }
        Returns: Json
      }
      read_integration_tokens: {
        Args: {
          p_actor: string
          p_brewery: string
          p_connection: string
          p_provider: string
        }
        Returns: {
          access_expires_at: string
          access_token: string
          credential_version: number
          refresh_expires_at: string
          refresh_hard_expires_at: string
          refresh_token: string
        }[]
      }
      read_portal_qbo_payment: {
        Args: {
          p_actor: string
          p_brewery: string
          p_customer: string
          p_invoice: string
        }
        Returns: {
          access_expires_at: string
          access_token: string
          connection_id: string
          credential_version: number
          granted_scopes: string[]
          realm_id: string
          refresh_expires_at: string
          refresh_hard_expires_at: string
          refresh_token: string
          remote_invoice_id: string
        }[]
      }
      read_portal_quote_tax: {
        Args: {
          p_actor: string
          p_brewery: string
          p_customer: string
          p_quote: string
        }
        Returns: {
          access_token: string
          connection_id: string
          tax_input: Json
        }[]
      }
      reattribute_loss: {
        Args: {
          p_adjustment: string
          p_bbl: number
          p_brewery: string
          p_classification: Database["public"]["Enums"]["cellar_removal_class"]
          p_destination_state: string
          p_request_id: string
        }
        Returns: Json
      }
      receive_purchase_order: {
        Args: {
          p_bin: string
          p_brewery: string
          p_lines: Json
          p_location: string
          p_po: string
          p_received_on: string
          p_request_id: string
        }
        Returns: Json
      }
      receive_stock_transfer: {
        Args: { p_lines: Json; p_request_id: string; p_transfer: string }
        Returns: Json
      }
      reconcile_chat_installation: {
        Args: {
          p_credential_deleted: boolean
          p_failure_code: string
          p_installation: string
        }
        Returns: undefined
      }
      record_batch_addition: {
        Args: {
          p_brewery: string
          p_lot: string
          p_material: string
          p_note: string
          p_occupancy: string
          p_qty: number
          p_request_id: string
          p_stage: Database["public"]["Enums"]["ingredient_stage"]
        }
        Returns: Json
      }
      record_brew_day: {
        Args: {
          p_batch: string
          p_brewed_on: string
          p_brewery: string
          p_initial_bbl: number
          p_request_id: string
          p_vessel: string
        }
        Returns: Json
      }
      record_cellar_transfer: {
        Args: {
          p_brewery: string
          p_from_occupancy: string
          p_loss_bbl: number
          p_request_id: string
          p_to_vessel: string
          p_volume_bbl: number
        }
        Returns: Json
      }
      record_chat_callback_receipt: {
        Args: {
          p_callback_id: string
          p_callback_kind: string
          p_external_installation_id: string
          p_external_user_id: string
          p_payload_hash: string
          p_provider: string
        }
        Returns: Json
      }
      record_fermentation_reading: {
        Args: {
          p_at: string
          p_brewery: string
          p_gravity_plato: number
          p_note: string
          p_occupancy: string
          p_ph: number
          p_request_id: string
          p_temp_f: number
        }
        Returns: Json
      }
      record_inventory_movement: {
        Args: {
          p_bin: string
          p_brewery: string
          p_conversation?: string
          p_dest_state: string
          p_location: string
          p_lot?: string
          p_note: string
          p_origin?: string
          p_preview_token?: string
          p_qty: number
          p_request_id: string
          p_sale_channel: string
          p_sku: string
          p_type: Database["public"]["Enums"]["movement_type"]
        }
        Returns: Json
      }
      record_invite_failure: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      record_keg_event: {
        Args: {
          p_bin: string
          p_brewery: string
          p_customer: string
          p_keg_size: Database["public"]["Enums"]["keg_size"]
          p_location: string
          p_note: string
          p_pool: string
          p_qty: number
          p_reason: Database["public"]["Enums"]["keg_event_reason"]
          p_request_id: string
        }
        Returns: Json
      }
      record_material_count: {
        Args: {
          p_bin: string
          p_brewery: string
          p_counted_on: string
          p_lines: Json
          p_location: string
          p_request_id: string
        }
        Returns: Json
      }
      record_pick: {
        Args: { p_order: string; p_picks: Json; p_request_id: string }
        Returns: Json
      }
      record_repack: {
        Args: {
          p_bin: string
          p_brewery: string
          p_child_qty: number
          p_child_sku: string
          p_location: string
          p_parent_qty: number
          p_parent_sku: string
          p_request_id: string
        }
        Returns: Json
      }
      record_square_catalog_snapshot: {
        Args: {
          p_actor: string
          p_brewery: string
          p_connection: string
          p_expected_version: number
          p_locations: Json
          p_request_id: string
          p_variations: Json
        }
        Returns: Json
      }
      record_square_sales_locations: {
        Args: {
          p_actor: string
          p_brewery: string
          p_connection: string
          p_expected_version: number
          p_locations: Json
          p_request_id: string
        }
        Returns: Json
      }
      record_square_sales_page: {
        Args: {
          p_actor: string
          p_brewery: string
          p_connection: string
          p_cursor: string
          p_expected_version: number
          p_facts: Json
          p_location_ids: string[]
          p_next_cursor: string
          p_orders: Json
          p_request_id: string
        }
        Returns: Json
      }
      record_stock_transfer_pick: {
        Args: { p_picks: Json; p_request_id: string; p_transfer: string }
        Returns: Json
      }
      record_submitted_order_occurrence: {
        Args: { p_order: string }
        Returns: undefined
      }
      record_taproom_count: {
        Args: {
          p_brewery: string
          p_counted_on: string
          p_lines: Json
          p_location: string
          p_request_id: string
          p_revision: string
        }
        Returns: Json
      }
      release_allocation: {
        Args: { p_allocation: string; p_request_id: string }
        Returns: Json
      }
      replace_format_bom: {
        Args: {
          p_brewery: string
          p_format: string
          p_lines: Json
          p_request_id: string
        }
        Returns: Json
      }
      replace_format_components: {
        Args: {
          p_brewery: string
          p_components: Json
          p_format: string
          p_request_id: string
        }
        Returns: Json
      }
      resolve_chat_actor: {
        Args: {
          p_external_installation_id: string
          p_external_user_id: string
          p_provider: string
        }
        Returns: Json
      }
      resolve_invoice_question: {
        Args: { p_brewery: string; p_question: string; p_request_id: string }
        Returns: Json
      }
      resolve_short_pick: {
        Args: {
          p_line: string
          p_order: string
          p_qty_picked: number
          p_reason: string
          p_request_id: string
          p_resolution: string
        }
        Returns: Json
      }
      retry_chat_delivery: {
        Args: {
          p_delivery: string
          p_error_code: string
          p_lease: string
          p_next_attempt_at: string
        }
        Returns: undefined
      }
      return_route: {
        Args: { p_request_id: string; p_route: string }
        Returns: Json
      }
      return_shipment: {
        Args: {
          p_invoice: string
          p_lines: Json
          p_location: string
          p_reason: string
          p_request_id: string
        }
        Returns: Json
      }
      reverse_inventory_movement: {
        Args: {
          p_brewery: string
          p_movement: string
          p_note: string
          p_request_id: string
        }
        Returns: Json
      }
      revoke_staff: {
        Args: { p_brewery: string; p_request_id: string; p_user: string }
        Returns: Json
      }
      save_catalog_category: {
        Args: {
          p_brewery: string
          p_name: string
          p_previous_name: string
          p_request_id: string
        }
        Returns: Json
      }
      save_route: {
        Args: {
          p_brewery: string
          p_delivery_date: string
          p_driver: string
          p_id: string
          p_name: string
          p_note: string
          p_request_id: string
          p_stops: Json
          p_vehicle: string
        }
        Returns: Json
      }
      scan_chat_notification_occurrences: {
        Args: { p_brewery: string; p_now: string }
        Returns: Json
      }
      scan_chat_today_candidates: {
        Args: { p_brewery_id: string; p_now: string }
        Returns: unknown[]
        SetofOptions: {
          from: "*"
          to: "today_candidates"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      schedule_batch: {
        Args: {
          p_brand: string
          p_brewery: string
          p_note: string
          p_planned_bbl: number
          p_planned_on: string
          p_recipe_version: string
          p_request_id: string
        }
        Returns: Json
      }
      schedule_packaging_run: {
        Args: {
          p_brand: string
          p_brewery: string
          p_occupancy: string
          p_outputs: Json
          p_planned_on: string
          p_request_id: string
        }
        Returns: Json
      }
      send_purchase_order: {
        Args: {
          p_brewery: string
          p_po: string
          p_request_id: string
          p_sent_via: string
        }
        Returns: Json
      }
      set_brewery_ai_model: {
        Args: { p_brewery: string; p_model: string; p_request_id: string }
        Returns: Json
      }
      set_brewery_gravity_unit: {
        Args: { p_brewery: string; p_request_id: string; p_unit: string }
        Returns: Json
      }
      set_brewery_operating_defaults: {
        Args: {
          p_brewery: string
          p_reading_due_hours: number
          p_request_id: string
        }
        Returns: Json
      }
      set_brewery_quiet_hours: {
        Args: {
          p_brewery: string
          p_end: string
          p_installation: string
          p_request_id: string
          p_start: string
        }
        Returns: Json
      }
      set_channel_price: {
        Args: {
          p_brewery: string
          p_format: string
          p_price_group: string
          p_request_id: string
          p_sale_channel: string
          p_unit_price_cents: number
        }
        Returns: Json
      }
      set_my_gravity_unit: {
        Args: { p_brewery: string; p_request_id: string; p_unit: string }
        Returns: Json
      }
      set_notification_destination: {
        Args: {
          p_actor: string
          p_brewery: string
          p_external_destination_id: string
          p_installation: string
          p_request_id: string
          p_version: string
        }
        Returns: Json
      }
      set_notification_preference: {
        Args: {
          p_brewery: string
          p_enabled: boolean
          p_quiet_end: string
          p_quiet_start: string
          p_quiet_tz: string
          p_reason: string
          p_request_id: string
          p_set_quiet: boolean
        }
        Returns: Json
      }
      set_personal_notification_destination: {
        Args: {
          p_brewery: string
          p_personal_destination: string
          p_reason: string
          p_request_id: string
        }
        Returns: Json
      }
      set_personal_quiet_hours: {
        Args: {
          p_brewery: string
          p_end: string
          p_request_id: string
          p_start: string
          p_timezone: string
        }
        Returns: Json
      }
      set_portal_fulfillment_source: {
        Args: { p_brewery: string; p_location: string; p_request_id: string }
        Returns: Json
      }
      set_pos_item_mapping: {
        Args: {
          p_brewery: string
          p_external_item: string
          p_external_variation: string
          p_format: string
          p_ignored: boolean
          p_request_id: string
          p_sku: string
        }
        Returns: Json
      }
      set_pos_location_mapping: {
        Args: {
          p_brewery: string
          p_external_location: string
          p_location: string
          p_request_id: string
        }
        Returns: Json
      }
      set_pos_price_override: {
        Args: {
          p_brewery: string
          p_external_location: string
          p_format: string
          p_request_id: string
          p_unit_price_cents: number
        }
        Returns: Json
      }
      set_pos_website_publication: {
        Args: {
          p_brewery: string
          p_external_location: string
          p_format: string
          p_published: boolean
          p_request_id: string
        }
        Returns: Json
      }
      set_qbo_customer_mapping: {
        Args: {
          p_brewery: string
          p_customer: string
          p_qbo_customer_id: string
          p_request_id: string
        }
        Returns: Json
      }
      set_qbo_deposit_mapping: {
        Args: { p_brewery: string; p_qbo_item_id: string; p_request_id: string }
        Returns: Json
      }
      set_qbo_item_mapping: {
        Args: {
          p_brewery: string
          p_qbo_item_id: string
          p_request_id: string
          p_sku: string
        }
        Returns: Json
      }
      set_qbo_push_defaults: {
        Args: {
          p_allow_ach: boolean
          p_allow_card: boolean
          p_brewery: string
          p_request_id: string
        }
        Returns: Json
      }
      set_standing_allocation: {
        Args: {
          p_location: string
          p_qty: number
          p_request_id: string
          p_sku: string
        }
        Returns: Json
      }
      set_taproom_par: {
        Args: {
          p_brewery: string
          p_location: string
          p_par_qty: number
          p_request_id: string
          p_sku: string
        }
        Returns: Json
      }
      ship_order: {
        Args: {
          p_carrier: string
          p_invoice_timing?: string
          p_order: string
          p_request_id: string
          p_ship: Json
          p_tracking: string
        }
        Returns: Json
      }
      snooze_notification: {
        Args: {
          p_brewery: string
          p_delivery: string
          p_request_id: string
          p_until: string
        }
        Returns: Json
      }
      staff_brewery_rows: {
        Args: never
        Returns: {
          ai_model: string
          gravity_unit: string
          id: string
          name: string
          timezone: string
        }[]
      }
      staff_role: {
        Args: { b: string }
        Returns: Database["public"]["Enums"]["staff_role"]
      }
      start_qbo_push: {
        Args: {
          p_brewery: string
          p_invoice: string
          p_new_attempt_reason: string
          p_request_id: string
        }
        Returns: Json
      }
      store_integration_tokens: {
        Args: {
          p_access_token: string
          p_actor: string
          p_brewery: string
          p_connection: string
          p_provider: string
          p_refresh_token: string
        }
        Returns: boolean
      }
      submit_order: {
        Args: {
          p_expected_brewery?: string
          p_expected_customer?: string
          p_order: string
          p_request_id: string
        }
        Returns: Json
      }
      submit_stock_transfer: {
        Args: { p_request_id: string; p_transfer: string }
        Returns: Json
      }
      suppress_chat_delivery: {
        Args: {
          p_delivery: string
          p_error_code: string
          p_lease: string
          p_state: string
        }
        Returns: undefined
      }
      swap_keg: {
        Args: {
          p_brewery: string
          p_closing_fill: number
          p_interval: string
          p_label: string
          p_nominal_bbl: number
          p_opening_fill: number
          p_reason: string
          p_request_id: string
          p_sku: string
          p_tap_number: string
        }
        Returns: Json
      }
      tap_keg: {
        Args: {
          p_brewery: string
          p_label: string
          p_location: string
          p_nominal_bbl: number
          p_opening_fill: number
          p_request_id: string
          p_sku: string
          p_tap_number: string
        }
        Returns: Json
      }
      taproom_can: { Args: { b: string; t: string }; Returns: boolean }
      today_live_reasons: { Args: never; Returns: string[] }
      unlink_chat_user: {
        Args: { p_brewery: string; p_link: string; p_request_id: string }
        Returns: Json
      }
      update_bin: {
        Args: {
          p_bin: string
          p_brewery: string
          p_name: string
          p_request_id: string
        }
        Returns: Json
      }
      update_brewery: {
        Args: {
          p_brewery: string
          p_customer_phone: string
          p_name: string
          p_pa_license_no: string
          p_reading_due_hours: number
          p_request_id: string
          p_timezone: string
          p_ttb_registry_no: string
        }
        Returns: Json
      }
      update_draft_order: {
        Args: {
          p_clear_requested?: boolean
          p_expected_brewery?: string
          p_expected_customer?: string
          p_lines: Json
          p_note: string
          p_order: string
          p_po: string
          p_request_id: string
          p_requested: string
          p_ship_to: string
        }
        Returns: Json
      }
      update_keg_pool: {
        Args: {
          p_active: boolean
          p_brewery: string
          p_deposit_cents: number
          p_id: string
          p_name: string
          p_per_fill_cents: number
          p_request_id: string
          p_vendor: string
        }
        Returns: Json
      }
      update_location: {
        Args: {
          p_brewery: string
          p_id: string
          p_name: string
          p_request_id: string
          p_uses: Database["public"]["Enums"]["location_kind"][]
        }
        Returns: Json
      }
      update_packaging_run: {
        Args: {
          p_brewery: string
          p_occupancy: string
          p_outputs: Json
          p_request_id: string
          p_run: string
          p_started_at: string
        }
        Returns: Json
      }
      update_sku: {
        Args: {
          p_active: boolean
          p_brewery: string
          p_id: string
          p_request_id: string
          p_upc: string
        }
        Returns: Json
      }
      update_staff_role: {
        Args: {
          p_brewery: string
          p_request_id: string
          p_role: Database["public"]["Enums"]["staff_role"]
          p_user: string
        }
        Returns: Json
      }
      upsert_brand: {
        Args: {
          p_abv: number
          p_brewery: string
          p_category: string
          p_description: string
          p_hops: string
          p_id: string
          p_name: string
          p_price_group: string
          p_request_id: string
          p_style: string
        }
        Returns: Json
      }
      upsert_brand_approval: {
        Args: {
          p_approved_on: string
          p_brand: string
          p_brewery: string
          p_expires_on: string
          p_id: string
          p_kind: Database["public"]["Enums"]["approval_kind"]
          p_note: string
          p_request_id: string
          p_ttb_id: string
        }
        Returns: Json
      }
      upsert_brewery_state_license: {
        Args: {
          p_brewery: string
          p_expires_on: string
          p_kind: string
          p_license_no: string
          p_note: string
          p_request_id: string
          p_state: string
        }
        Returns: Json
      }
      upsert_customer: {
        Args: {
          p_brewery: string
          p_id: string
          p_license_no: string
          p_name: string
          p_payment_terms: string
          p_request_id: string
          p_sale_channel: string
          p_state: string
          p_tax_treatment: Database["public"]["Enums"]["tax_treatment"]
          p_type: Database["public"]["Enums"]["customer_type"]
        }
        Returns: Json
      }
      upsert_format: {
        Args: {
          p_basis: Database["public"]["Enums"]["format_basis"]
          p_bbl_per_unit: number
          p_brand?: string
          p_brewery: string
          p_id: string
          p_keg_size: Database["public"]["Enums"]["keg_size"]
          p_name: string
          p_ounces?: number
          p_package_type: Database["public"]["Enums"]["package_type"]
          p_request_id: string
          p_units_per_case: number
        }
        Returns: Json
      }
      upsert_material: {
        Args: {
          p_active: boolean
          p_base_uom: Database["public"]["Enums"]["uom"]
          p_brewery: string
          p_category: Database["public"]["Enums"]["material_category"]
          p_default_vendor: string
          p_extract_potential: number
          p_lot_tracked: boolean
          p_material: string
          p_name: string
          p_purchase_uom: Database["public"]["Enums"]["uom"]
          p_purchase_uom_factor: number
          p_reorder_point: number
          p_request_id: string
        }
        Returns: Json
      }
      upsert_material_contract: {
        Args: {
          p_brewery: string
          p_contract: string
          p_contract_no: string
          p_ends_on: string
          p_material: string
          p_qty_committed: number
          p_request_id: string
          p_starts_on: string
          p_unit_cost_cents: number
          p_vendor: string
        }
        Returns: Json
      }
      upsert_price_group: {
        Args: {
          p_brewery: string
          p_cost_ceiling_cents: number
          p_id: string
          p_name: string
          p_position: number
          p_request_id: string
        }
        Returns: Json
      }
      upsert_sale_channel: {
        Args: {
          p_brewery: string
          p_id: string
          p_name: string
          p_request_id: string
          p_tax_treatment: Database["public"]["Enums"]["tax_treatment"]
        }
        Returns: Json
      }
      upsert_ship_to: {
        Args: {
          p_address1: string
          p_address2: string
          p_brewery: string
          p_city: string
          p_customer: string
          p_id: string
          p_is_default?: boolean
          p_label: string
          p_request_id: string
          p_state: string
          p_zip: string
        }
        Returns: Json
      }
      upsert_state_registration: {
        Args: {
          p_approved_on: string
          p_brand: string
          p_brewery: string
          p_expires_on: string
          p_registration_no: string
          p_request_id: string
          p_state: string
        }
        Returns: Json
      }
      upsert_vendor: {
        Args: {
          p_active: boolean
          p_brewery: string
          p_email: string
          p_lead_time_days: number
          p_name: string
          p_payment_terms: string
          p_phone: string
          p_request_id: string
          p_vendor: string
        }
        Returns: Json
      }
      upsert_vessel: {
        Args: {
          p_brewery: string
          p_capacity_bbl: number
          p_kind: Database["public"]["Enums"]["vessel_kind"]
          p_name: string
          p_request_id: string
          p_vessel: string
        }
        Returns: Json
      }
      upsert_water_profile: {
        Args: {
          p_bicarbonate: number
          p_brewery: string
          p_calcium: number
          p_chloride: number
          p_magnesium: number
          p_name: string
          p_profile: string
          p_request_id: string
          p_sodium: number
          p_sulfate: number
        }
        Returns: Json
      }
      write_off_invoice: {
        Args: {
          p_brewery: string
          p_invoice: string
          p_reason: string
          p_request_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      allocation_source: "order_line" | "taproom_standing"
      allocation_status: "open" | "fulfilled" | "released"
      approval_kind: "cola" | "formula"
      cellar_removal_class: "loss" | "sample" | "taproom" | "destruction"
      customer_type: "distributor" | "retailer" | "brewery" | "other"
      format_basis: "packaged" | "poured"
      format_material_disposition: "consumed" | "return_to_stock"
      ingredient_stage:
        | "mash"
        | "boil"
        | "whirlpool"
        | "fermentation"
        | "dry_hop"
        | "packaging"
        | "other"
      invoice_kind: "invoice" | "credit_memo"
      invoice_line_kind:
        | "sku"
        | "keg_deposit"
        | "keg_deposit_refund"
        | "adjustment"
      keg_container_source:
        | "owned_fleet"
        | "per_fill_rental"
        | "one_way_material"
      keg_event_reason:
        | "acquired"
        | "retired"
        | "shipped"
        | "returned"
        | "lost"
        | "found"
        | "transferred_out"
        | "transferred_in"
      keg_pool_kind: "owned" | "leased" | "pay_per_fill"
      keg_size:
        | "half_bbl"
        | "quarter_bbl"
        | "sixth_bbl"
        | "fifty_l"
        | "thirty_l"
        | "twenty_l"
      location_kind: "warehouse" | "taproom" | "storage"
      material_category:
        | "malt"
        | "hop"
        | "yeast"
        | "adjunct"
        | "chemical"
        | "packaging"
        | "other"
      material_movement_type:
        | "opening_balance"
        | "receipt"
        | "consumption"
        | "return_to_stock"
        | "loss"
        | "adjustment"
        | "count_adjustment"
        | "transfer_out"
        | "transfer_in"
      movement_type:
        | "opening_balance"
        | "production_in"
        | "adjustment"
        | "sale_removal"
        | "taproom_transfer"
        | "depletion"
        | "return_in"
        | "destruction"
        | "loss"
        | "sample"
        | "festival_removal"
        | "location_transfer"
        | "repack"
      order_kind: "wholesale" | "taproom_transfer"
      order_status:
        | "draft"
        | "submitted"
        | "confirmed"
        | "picked"
        | "shipped"
        | "cancelled"
      package_type: "keg" | "can" | "bottle"
      po_status:
        | "draft"
        | "sent"
        | "partially_received"
        | "received"
        | "cancelled"
      qbo_remote_state: "live" | "voided" | "deleted"
      qbo_sync_status: "pending" | "pushed" | "push_failed"
      staff_role: "admin" | "sales" | "warehouse" | "brewer" | "taproom"
      stock_transfer_status:
        | "draft"
        | "submitted"
        | "picked"
        | "in_transit"
        | "received"
        | "cancelled"
      tax_treatment:
        | "taxable"
        | "export"
        | "vessel_supplies"
        | "research"
        | "transfer_in_bond"
      uom: "lb" | "kg" | "oz" | "g" | "each" | "l" | "gal" | "ml"
      vessel_kind: "fermenter" | "brite" | "barrel" | "kettle" | "other"
      volume_adjustment_reason: "loss" | "dump" | "gain" | "measurement"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      allocation_source: ["order_line", "taproom_standing"],
      allocation_status: ["open", "fulfilled", "released"],
      approval_kind: ["cola", "formula"],
      cellar_removal_class: ["loss", "sample", "taproom", "destruction"],
      customer_type: ["distributor", "retailer", "brewery", "other"],
      format_basis: ["packaged", "poured"],
      format_material_disposition: ["consumed", "return_to_stock"],
      ingredient_stage: [
        "mash",
        "boil",
        "whirlpool",
        "fermentation",
        "dry_hop",
        "packaging",
        "other",
      ],
      invoice_kind: ["invoice", "credit_memo"],
      invoice_line_kind: [
        "sku",
        "keg_deposit",
        "keg_deposit_refund",
        "adjustment",
      ],
      keg_container_source: [
        "owned_fleet",
        "per_fill_rental",
        "one_way_material",
      ],
      keg_event_reason: [
        "acquired",
        "retired",
        "shipped",
        "returned",
        "lost",
        "found",
        "transferred_out",
        "transferred_in",
      ],
      keg_pool_kind: ["owned", "leased", "pay_per_fill"],
      keg_size: [
        "half_bbl",
        "quarter_bbl",
        "sixth_bbl",
        "fifty_l",
        "thirty_l",
        "twenty_l",
      ],
      location_kind: ["warehouse", "taproom", "storage"],
      material_category: [
        "malt",
        "hop",
        "yeast",
        "adjunct",
        "chemical",
        "packaging",
        "other",
      ],
      material_movement_type: [
        "opening_balance",
        "receipt",
        "consumption",
        "return_to_stock",
        "loss",
        "adjustment",
        "count_adjustment",
        "transfer_out",
        "transfer_in",
      ],
      movement_type: [
        "opening_balance",
        "production_in",
        "adjustment",
        "sale_removal",
        "taproom_transfer",
        "depletion",
        "return_in",
        "destruction",
        "loss",
        "sample",
        "festival_removal",
        "location_transfer",
        "repack",
      ],
      order_kind: ["wholesale", "taproom_transfer"],
      order_status: [
        "draft",
        "submitted",
        "confirmed",
        "picked",
        "shipped",
        "cancelled",
      ],
      package_type: ["keg", "can", "bottle"],
      po_status: [
        "draft",
        "sent",
        "partially_received",
        "received",
        "cancelled",
      ],
      qbo_remote_state: ["live", "voided", "deleted"],
      qbo_sync_status: ["pending", "pushed", "push_failed"],
      staff_role: ["admin", "sales", "warehouse", "brewer", "taproom"],
      stock_transfer_status: [
        "draft",
        "submitted",
        "picked",
        "in_transit",
        "received",
        "cancelled",
      ],
      tax_treatment: [
        "taxable",
        "export",
        "vessel_supplies",
        "research",
        "transfer_in_bond",
      ],
      uom: ["lb", "kg", "oz", "g", "each", "l", "gal", "ml"],
      vessel_kind: ["fermenter", "brite", "barrel", "kettle", "other"],
      volume_adjustment_reason: ["loss", "dump", "gain", "measurement"],
    },
  },
} as const
