export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      booster_config_slots: {
        Row: {
          config_id: number
          count: number
          id: number
          sheet_id: number
        }
        Insert: {
          config_id: number
          count?: number
          id?: number
          sheet_id: number
        }
        Update: {
          config_id?: number
          count?: number
          id?: number
          sheet_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "booster_config_slots_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "booster_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booster_config_slots_sheet_id_fkey"
            columns: ["sheet_id"]
            isOneToOne: false
            referencedRelation: "booster_sheets"
            referencedColumns: ["id"]
          },
        ]
      }
      booster_configs: {
        Row: {
          id: number
          product_id: number
          weight: number
        }
        Insert: {
          id?: number
          product_id: number
          weight?: number
        }
        Update: {
          id?: number
          product_id?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "booster_configs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "booster_products"
            referencedColumns: ["id"]
          },
        ]
      }
      booster_products: {
        Row: {
          code: string
          created_at: string
          id: number
          name: string
          set_code: string
          set_name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: number
          name: string
          set_code: string
          set_name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: number
          name?: string
          set_code?: string
          set_name?: string
        }
        Relationships: []
      }
      booster_sheets: {
        Row: {
          id: number
          name: string
          product_id: number
          total_weight: number
        }
        Insert: {
          id?: number
          name: string
          product_id: number
          total_weight: number
        }
        Update: {
          id?: number
          name?: string
          product_id?: number
          total_weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "booster_sheets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "booster_products"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_players: {
        Row: {
          draft_id: string
          joined_at: string
          seat_position: number | null
          user_id: string
        }
        Insert: {
          draft_id: string
          joined_at?: string
          seat_position?: number | null
          user_id: string
        }
        Update: {
          draft_id?: string
          joined_at?: string
          seat_position?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_players_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_proposals: {
        Row: {
          config: Json | null
          created_at: string
          cube_id: string | null
          format: string
          group_id: string
          id: string
          player_count: number
          proposed_by: string
          scheduled_at: string | null
          set_code: string | null
          set_name: string | null
          status: string
          title: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          cube_id?: string | null
          format: string
          group_id: string
          id?: string
          player_count: number
          proposed_by: string
          scheduled_at?: string | null
          set_code?: string | null
          set_name?: string | null
          status?: string
          title: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          cube_id?: string | null
          format?: string
          group_id?: string
          id?: string
          player_count?: number
          proposed_by?: string
          scheduled_at?: string | null
          set_code?: string | null
          set_name?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_proposals_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drafts: {
        Row: {
          completed_at: string | null
          config: Json
          created_at: string
          format: string
          group_id: string | null
          host_id: string
          id: string
          is_simulated: boolean
          proposal_id: string | null
          result: Json | null
          set_code: string | null
          set_name: string | null
          started_at: string | null
          state: Json | null
          status: string
          version: number
        }
        Insert: {
          completed_at?: string | null
          config?: Json
          created_at?: string
          format: string
          group_id?: string | null
          host_id: string
          id?: string
          is_simulated?: boolean
          proposal_id?: string | null
          result?: Json | null
          set_code?: string | null
          set_name?: string | null
          started_at?: string | null
          state?: Json | null
          status?: string
          version?: number
        }
        Update: {
          completed_at?: string | null
          config?: Json
          created_at?: string
          format?: string
          group_id?: string | null
          host_id?: string
          id?: string
          is_simulated?: boolean
          proposal_id?: string | null
          result?: Json | null
          set_code?: string | null
          set_name?: string | null
          started_at?: string | null
          state?: Json | null
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "drafts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drafts_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drafts_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "draft_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      group_invites: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          group_id: string
          id: string
          token: string
          use_count: number
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string
          group_id: string
          id?: string
          token?: string
          use_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          group_id?: string
          id?: string
          token?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_invites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          emoji: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          emoji?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          emoji?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string
          favorite_color: string | null
          id: string
          is_site_admin: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name: string
          favorite_color?: string | null
          id: string
          is_site_admin?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          favorite_color?: string | null
          id?: string
          is_site_admin?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      proposal_votes: {
        Row: {
          proposal_id: string
          user_id: string
          vote: string
          voted_at: string
        }
        Insert: {
          proposal_id: string
          user_id: string
          vote: string
          voted_at?: string
        }
        Update: {
          proposal_id?: string
          user_id?: string
          vote?: string
          voted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_votes_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "draft_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sheet_cards: {
        Row: {
          collector_number: string
          id: number
          is_foil: boolean
          set_code: string
          sheet_id: number
          weight: number
        }
        Insert: {
          collector_number: string
          id?: number
          is_foil?: boolean
          set_code: string
          sheet_id: number
          weight?: number
        }
        Update: {
          collector_number?: string
          id?: number
          is_foil?: boolean
          set_code?: string
          sheet_id?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "sheet_cards_sheet_id_fkey"
            columns: ["sheet_id"]
            isOneToOne: false
            referencedRelation: "booster_sheets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_group_invite: { Args: { p_token: string }; Returns: string }
      get_booster_product_json: {
        Args: { p_code: string }
        Returns: Record<string, unknown>
      }
      get_invite_info: {
        Args: { p_token: string }
        Returns: {
          expires_at: string
          group_description: string
          group_name: string
          is_expired: boolean
        }[]
      }
      is_group_admin: {
        Args: { p_group_id: string; p_user_id: string }
        Returns: boolean
      }
      user_draft_ids: { Args: { p_user_id: string }; Returns: string[] }
      user_group_ids: { Args: { p_user_id: string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
