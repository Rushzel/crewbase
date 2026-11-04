
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "audit_log": {
                  Row: {
                    "action": string,"actor": string | null,"at": string,"id": number,"new_value": Json | null,"old_value": Json | null,"org_id": string,"reason": string | null,"row_id": string | null,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor"?: string | null,"at"?: string,"id"?: never,"new_value"?: Json | null,"old_value"?: Json | null,"org_id": string,"reason"?: string | null,"row_id"?: string | null,"table_name": string
                  }
                  Update: {
                    "action"?: string,"actor"?: string | null,"at"?: string,"id"?: never,"new_value"?: Json | null,"old_value"?: Json | null,"org_id"?: string,"reason"?: string | null,"row_id"?: string | null,"table_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"breaks": {
                  Row: {
                    "break_end": string | null,"break_start": string,"entry_id": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "break_end"?: string | null,"break_start": string,"entry_id": string,"id"?: string
                  }
                  Update: {
                    "break_end"?: string | null,"break_start"?: string,"entry_id"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "breaks_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "time_entries"
      referencedColumns: ["id"]
    }
                  ]
                },"change_log": {
                  Row: {
                    "action": string,"changed_at": string,"changed_by": string,"entry_id": string | null,"id": number,"membership_id": string,"new_value": Json | null,"old_value": Json | null,"org_id": string,"reason": string,"request_id": string | null,"self_approved": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"changed_at"?: string,"changed_by": string,"entry_id"?: string | null,"id"?: never,"membership_id": string,"new_value"?: Json | null,"old_value"?: Json | null,"org_id": string,"reason": string,"request_id"?: string | null,"self_approved"?: boolean
                  }
                  Update: {
                    "action"?: string,"changed_at"?: string,"changed_by"?: string,"entry_id"?: string | null,"id"?: never,"membership_id"?: string,"new_value"?: Json | null,"old_value"?: Json | null,"org_id"?: string,"reason"?: string,"request_id"?: string | null,"self_approved"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "change_log_changed_by_fkey"
      columns: ["changed_by"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "change_log_membership_id_fkey"
      columns: ["membership_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "change_log_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "change_log_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "correction_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"clock_challenges": {
                  Row: {
                    "actions": (string)[],"expires_at": string,"id": string,"issued_at": string,"membership_id": string,"used_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actions": (string)[],"expires_at"?: string,"id"?: string,"issued_at"?: string,"membership_id": string,"used_at"?: string | null
                  }
                  Update: {
                    "actions"?: (string)[],"expires_at"?: string,"id"?: string,"issued_at"?: string,"membership_id"?: string,"used_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "clock_challenges_membership_id_fkey"
      columns: ["membership_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id"]
    }
                  ]
                },"clock_events": {
                  Row: {
                    "accepted": boolean,"accuracy_m": number | null,"challenge_id": string | null,"distance_to_edge_m": number | null,"entry_id": string | null,"face_result": string | null,"face_similarity": number | null,"flagged": boolean,"id": number,"inside_fence": boolean | null,"kind": Database["public"]['Enums']["punch_kind"],"liveness_passed": boolean | null,"location": unknown,"location_result": string | null,"membership_id": string,"org_id": string,"reading_age_s": number | null,"reason": string | null,"server_time": string,"site_id": string | null,"travel_kmh": number | null,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted": boolean,"accuracy_m"?: number | null,"challenge_id"?: string | null,"distance_to_edge_m"?: number | null,"entry_id"?: string | null,"face_result"?: string | null,"face_similarity"?: number | null,"flagged"?: boolean,"id"?: never,"inside_fence"?: boolean | null,"kind": Database["public"]['Enums']["punch_kind"],"liveness_passed"?: boolean | null,"location"?: unknown,"location_result"?: string | null,"membership_id": string,"org_id": string,"reading_age_s"?: number | null,"reason"?: string | null,"server_time"?: string,"site_id"?: string | null,"travel_kmh"?: number | null,"user_agent"?: string | null
                  }
                  Update: {
                    "accepted"?: boolean,"accuracy_m"?: number | null,"challenge_id"?: string | null,"distance_to_edge_m"?: number | null,"entry_id"?: string | null,"face_result"?: string | null,"face_similarity"?: number | null,"flagged"?: boolean,"id"?: never,"inside_fence"?: boolean | null,"kind"?: Database["public"]['Enums']["punch_kind"],"liveness_passed"?: boolean | null,"location"?: unknown,"location_result"?: string | null,"membership_id"?: string,"org_id"?: string,"reading_age_s"?: number | null,"reason"?: string | null,"server_time"?: string,"site_id"?: string | null,"travel_kmh"?: number | null,"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "clock_events_membership_id_fkey"
      columns: ["membership_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clock_events_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clock_events_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"correction_requests": {
                  Row: {
                    "created_at": string,"entry_id": string | null,"evidence_link": string | null,"id": string,"kind": Database["public"]['Enums']["request_kind"],"membership_id": string,"old_break_minutes": number | null,"old_clock_in": string | null,"old_clock_out": string | null,"org_id": string,"reason": string,"requested_break_minutes": number | null,"requested_in": string | null,"requested_out": string | null,"review_note": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"self_approved": boolean,"site_id": string | null,"status": Database["public"]['Enums']["request_status"],"work_date": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"entry_id"?: string | null,"evidence_link"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["request_kind"],"membership_id": string,"old_break_minutes"?: number | null,"old_clock_in"?: string | null,"old_clock_out"?: string | null,"org_id": string,"reason": string,"requested_break_minutes"?: number | null,"requested_in"?: string | null,"requested_out"?: string | null,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"self_approved"?: boolean,"site_id"?: string | null,"status"?: Database["public"]['Enums']["request_status"],"work_date": string
                  }
                  Update: {
                    "created_at"?: string,"entry_id"?: string | null,"evidence_link"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["request_kind"],"membership_id"?: string,"old_break_minutes"?: number | null,"old_clock_in"?: string | null,"old_clock_out"?: string | null,"org_id"?: string,"reason"?: string,"requested_break_minutes"?: number | null,"requested_in"?: string | null,"requested_out"?: string | null,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"self_approved"?: boolean,"site_id"?: string | null,"status"?: Database["public"]['Enums']["request_status"],"work_date"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "correction_requests_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "time_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "correction_requests_membership_id_fkey"
      columns: ["membership_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "correction_requests_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "correction_requests_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "correction_requests_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"customer_applications": {
                  Row: {
                    "address": string | null,"created_at": string,"customer_email": string,"customer_name": string,"customer_phone": string | null,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"id": string,"incentive_minor": number,"membership_id": string,"notes": string | null,"org_id": string,"price_minor": number,"product_id": string,"resend_count": number,"site_id": string | null,"status": Database["public"]['Enums']["application_status"],"token_expires_at": string | null,"token_hash": string | null,"verification_sent_at": string | null,"verified_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"created_at"?: string,"customer_email": string,"customer_name": string,"customer_phone"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"id"?: string,"incentive_minor"?: number,"membership_id": string,"notes"?: string | null,"org_id": string,"price_minor": number,"product_id": string,"resend_count"?: number,"site_id"?: string | null,"status": Database["public"]['Enums']["application_status"],"token_expires_at"?: string | null,"token_hash"?: string | null,"verification_sent_at"?: string | null,"verified_at"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"created_at"?: string,"customer_email"?: string,"customer_name"?: string,"customer_phone"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"id"?: string,"incentive_minor"?: number,"membership_id"?: string,"notes"?: string | null,"org_id"?: string,"price_minor"?: number,"product_id"?: string,"resend_count"?: number,"site_id"?: string | null,"status"?: Database["public"]['Enums']["application_status"],"token_expires_at"?: string | null,"token_hash"?: string | null,"verification_sent_at"?: string | null,"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_applications_decided_by_org_id_fkey"
      columns: ["decided_by","org_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "customer_applications_membership_id_org_id_fkey"
      columns: ["membership_id","org_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "customer_applications_product_id_org_id_fkey"
      columns: ["product_id","org_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "customer_applications_site_id_org_id_fkey"
      columns: ["site_id","org_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"deduction_rules": {
                  Row: {
                    "active": boolean,"brackets": Json | null,"id": string,"is_sample": boolean,"kind": Database["public"]['Enums']["deduction_kind"],"name": string,"org_id": string,"value": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"brackets"?: Json | null,"id"?: string,"is_sample"?: boolean,"kind": Database["public"]['Enums']["deduction_kind"],"name": string,"org_id": string,"value"?: number | null
                  }
                  Update: {
                    "active"?: boolean,"brackets"?: Json | null,"id"?: string,"is_sample"?: boolean,"kind"?: Database["public"]['Enums']["deduction_kind"],"name"?: string,"org_id"?: string,"value"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "deduction_rules_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"embedding_fingerprints": {
                  Row: {
                    "hash": string,"membership_id": string,"seen_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "hash": string,"membership_id": string,"seen_at"?: string
                  }
                  Update: {
                    "hash"?: string,"membership_id"?: string,"seen_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "embedding_fingerprints_membership_id_fkey"
      columns: ["membership_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id"]
    }
                  ]
                },"face_enrollments": {
                  Row: {
                    "consent_at": string,"embedding": (number)[],"enrolled_at": string,"enrolled_by": string,"expires_at": string | null,"frames_used": number,"membership_id": string,"model_version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consent_at": string,"embedding": (number)[],"enrolled_at"?: string,"enrolled_by"?: string,"expires_at"?: string | null,"frames_used": number,"membership_id": string,"model_version": string
                  }
                  Update: {
                    "consent_at"?: string,"embedding"?: (number)[],"enrolled_at"?: string,"enrolled_by"?: string,"expires_at"?: string | null,"frames_used"?: number,"membership_id"?: string,"model_version"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "face_enrollments_membership_id_fkey"
      columns: ["membership_id"]
isOneToOne: true
      referencedRelation: "memberships"
      referencedColumns: ["id"]
    }
                  ]
                },"geofences": {
                  Row: {
                    "area": unknown,"center": unknown,"id": string,"kind": string,"radius_m": number | null,"site_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "area": unknown,"center"?: unknown,"id"?: string,"kind": string,"radius_m"?: number | null,"site_id": string
                  }
                  Update: {
                    "area"?: unknown,"center"?: unknown,"id"?: string,"kind"?: string,"radius_m"?: number | null,"site_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "geofences_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"email": string,"expires_at": string,"id": string,"membership_id": string,"org_id": string,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"email": string,"expires_at"?: string,"id"?: string,"membership_id": string,"org_id": string,"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"email"?: string,"expires_at"?: string,"id"?: string,"membership_id"?: string,"org_id"?: string,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_membership_id_fkey"
      columns: ["membership_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"leave_requests": {
                  Row: {
                    "attachment_path": string | null,"created_at": string,"days": number,"ends_on": string,"id": string,"leave_type_id": string,"membership_id": string,"org_id": string,"reason": string | null,"review_note": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"starts_on": string,"status": Database["public"]['Enums']["leave_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "attachment_path"?: string | null,"created_at"?: string,"days": number,"ends_on": string,"id"?: string,"leave_type_id": string,"membership_id": string,"org_id": string,"reason"?: string | null,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"starts_on": string,"status"?: Database["public"]['Enums']["leave_status"]
                  }
                  Update: {
                    "attachment_path"?: string | null,"created_at"?: string,"days"?: number,"ends_on"?: string,"id"?: string,"leave_type_id"?: string,"membership_id"?: string,"org_id"?: string,"reason"?: string | null,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"starts_on"?: string,"status"?: Database["public"]['Enums']["leave_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "leave_requests_leave_type_id_org_id_fkey"
      columns: ["leave_type_id","org_id"]
isOneToOne: false
      referencedRelation: "leave_types"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "leave_requests_membership_id_org_id_fkey"
      columns: ["membership_id","org_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "leave_requests_reviewed_by_org_id_fkey"
      columns: ["reviewed_by","org_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"leave_types": {
                  Row: {
                    "active": boolean,"id": string,"name": string,"needs_attachment": boolean,"org_id": string,"paid": boolean,"yearly_days": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"id"?: string,"name": string,"needs_attachment"?: boolean,"org_id": string,"paid"?: boolean,"yearly_days"?: number | null
                  }
                  Update: {
                    "active"?: boolean,"id"?: string,"name"?: string,"needs_attachment"?: boolean,"org_id"?: string,"paid"?: boolean,"yearly_days"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "leave_types_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"member_sites": {
                  Row: {
                    "is_leader": boolean,"membership_id": string,"org_id": string,"site_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "is_leader"?: boolean,"membership_id": string,"org_id": string,"site_id": string
                  }
                  Update: {
                    "is_leader"?: boolean,"membership_id"?: string,"org_id"?: string,"site_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_sites_membership_id_org_id_fkey"
      columns: ["membership_id","org_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "member_sites_site_id_org_id_fkey"
      columns: ["site_id","org_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "created_at": string,"display_name": string,"employee_code": string | null,"employment_type": Database["public"]['Enums']["employment_type"],"hired_on": string | null,"id": string,"manager_id": string | null,"org_id": string,"role_id": string,"status": Database["public"]['Enums']["membership_status"],"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"employee_code"?: string | null,"employment_type"?: Database["public"]['Enums']["employment_type"],"hired_on"?: string | null,"id"?: string,"manager_id"?: string | null,"org_id": string,"role_id": string,"status"?: Database["public"]['Enums']["membership_status"],"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"employee_code"?: string | null,"employment_type"?: Database["public"]['Enums']["employment_type"],"hired_on"?: string | null,"id"?: string,"manager_id"?: string | null,"org_id"?: string,"role_id"?: string,"status"?: Database["public"]['Enums']["membership_status"],"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_manager_id_org_id_fkey"
      columns: ["manager_id","org_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "memberships_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_role_id_org_id_fkey"
      columns: ["role_id","org_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"org_features": {
                  Row: {
                    "enabled": boolean,"feature": Database["public"]['Enums']["feature_key"],"org_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "enabled"?: boolean,"feature": Database["public"]['Enums']["feature_key"],"org_id": string
                  }
                  Update: {
                    "enabled"?: boolean,"feature"?: Database["public"]['Enums']["feature_key"],"org_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_features_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"org_settings": {
                  Row: {
                    "absent_after_minutes": number,"area_label": string,"area_label_plural": string,"currency": string,"default_start_time": string,"earliest_clock_in": string | null,"face_fail_policy": Database["public"]['Enums']["fail_policy"],"face_threshold": number,"follow_up_hours": number,"full_day_minutes": number,"grace_minutes": number,"half_day_minutes": number,"keep_audit_frames": boolean,"liveness_required": boolean,"location_fail_policy": Database["public"]['Enums']["fail_policy"],"location_max_accuracy_m": number,"location_mode": Database["public"]['Enums']["location_mode"],"org_id": string,"overtime_multiplier": number,"pay_frequency": Database["public"]['Enums']["pay_frequency"],"probation_months": number,"regular_minutes_per_day": number,"timezone": string,"week_start": number,"work_days": (number)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "absent_after_minutes"?: number,"area_label"?: string,"area_label_plural"?: string,"currency"?: string,"default_start_time"?: string,"earliest_clock_in"?: string | null,"face_fail_policy"?: Database["public"]['Enums']["fail_policy"],"face_threshold"?: number,"follow_up_hours"?: number,"full_day_minutes"?: number,"grace_minutes"?: number,"half_day_minutes"?: number,"keep_audit_frames"?: boolean,"liveness_required"?: boolean,"location_fail_policy"?: Database["public"]['Enums']["fail_policy"],"location_max_accuracy_m"?: number,"location_mode"?: Database["public"]['Enums']["location_mode"],"org_id": string,"overtime_multiplier"?: number,"pay_frequency"?: Database["public"]['Enums']["pay_frequency"],"probation_months"?: number,"regular_minutes_per_day"?: number,"timezone"?: string,"week_start"?: number,"work_days"?: (number)[]
                  }
                  Update: {
                    "absent_after_minutes"?: number,"area_label"?: string,"area_label_plural"?: string,"currency"?: string,"default_start_time"?: string,"earliest_clock_in"?: string | null,"face_fail_policy"?: Database["public"]['Enums']["fail_policy"],"face_threshold"?: number,"follow_up_hours"?: number,"full_day_minutes"?: number,"grace_minutes"?: number,"half_day_minutes"?: number,"keep_audit_frames"?: boolean,"liveness_required"?: boolean,"location_fail_policy"?: Database["public"]['Enums']["fail_policy"],"location_max_accuracy_m"?: number,"location_mode"?: Database["public"]['Enums']["location_mode"],"org_id"?: string,"overtime_multiplier"?: number,"pay_frequency"?: Database["public"]['Enums']["pay_frequency"],"probation_months"?: number,"regular_minutes_per_day"?: number,"timezone"?: string,"week_start"?: number,"work_days"?: (number)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_settings_org_id_fkey"
      columns: ["org_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "brand_color": string,"created_at": string,"id": string,"is_demo": boolean,"logo_path": string | null,"name": string,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_color"?: string,"created_at"?: string,"id"?: string,"is_demo"?: boolean,"logo_path"?: string | null,"name": string,"slug": string
                  }
                  Update: {
                    "brand_color"?: string,"created_at"?: string,"id"?: string,"is_demo"?: boolean,"logo_path"?: string | null,"name"?: string,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"output_records": {
                  Row: {
                    "created_at": string,"id": string,"membership_id": string,"metric": string,"note": string | null,"org_id": string,"quantity": number,"work_date": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"membership_id": string,"metric": string,"note"?: string | null,"org_id": string,"quantity": number,"work_date": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"membership_id"?: string,"metric"?: string,"note"?: string | null,"org_id"?: string,"quantity"?: number,"work_date"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "output_records_membership_id_org_id_fkey"
      columns: ["membership_id","org_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"output_targets": {
                  Row: {
                    "employment_type": Database["public"]['Enums']["employment_type"],"metric": string,"org_id": string,"per_month": number
                  }
                  ComputedFields: never
                  Insert: {
                    "employment_type": Database["public"]['Enums']["employment_type"],"metric": string,"org_id": string,"per_month": number
                  }
                  Update: {
                    "employment_type"?: Database["public"]['Enums']["employment_type"],"metric"?: string,"org_id"?: string,"per_month"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "output_targets_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"pay_periods": {
                  Row: {
                    "ends_on": string,"finalized_at": string | null,"finalized_by": string | null,"id": string,"lock_override_reason": string | null,"locked_at": string | null,"locked_by": string | null,"org_id": string,"starts_on": string,"status": Database["public"]['Enums']["period_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "ends_on": string,"finalized_at"?: string | null,"finalized_by"?: string | null,"id"?: string,"lock_override_reason"?: string | null,"locked_at"?: string | null,"locked_by"?: string | null,"org_id": string,"starts_on": string,"status"?: Database["public"]['Enums']["period_status"]
                  }
                  Update: {
                    "ends_on"?: string,"finalized_at"?: string | null,"finalized_by"?: string | null,"id"?: string,"lock_override_reason"?: string | null,"locked_at"?: string | null,"locked_by"?: string | null,"org_id"?: string,"starts_on"?: string,"status"?: Database["public"]['Enums']["period_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "pay_periods_finalized_by_fkey"
      columns: ["finalized_by"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pay_periods_locked_by_fkey"
      columns: ["locked_by"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pay_periods_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"pay_rates": {
                  Row: {
                    "amount_minor": number,"basis": Database["public"]['Enums']["pay_basis"],"effective_from": string,"id": string,"membership_id": string,"org_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"basis": Database["public"]['Enums']["pay_basis"],"effective_from": string,"id"?: string,"membership_id": string,"org_id": string
                  }
                  Update: {
                    "amount_minor"?: number,"basis"?: Database["public"]['Enums']["pay_basis"],"effective_from"?: string,"id"?: string,"membership_id"?: string,"org_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pay_rates_membership_id_org_id_fkey"
      columns: ["membership_id","org_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"payslip_lines": {
                  Row: {
                    "amount_minor": number,"id": string,"kind": string,"label": string,"payslip_id": string,"position": number,"quantity": number | null,"rate_minor": number | null,"unit": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"id"?: string,"kind": string,"label": string,"payslip_id": string,"position": number,"quantity"?: number | null,"rate_minor"?: number | null,"unit"?: string | null
                  }
                  Update: {
                    "amount_minor"?: number,"id"?: string,"kind"?: string,"label"?: string,"payslip_id"?: string,"position"?: number,"quantity"?: number | null,"rate_minor"?: number | null,"unit"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payslip_lines_payslip_id_fkey"
      columns: ["payslip_id"]
isOneToOne: false
      referencedRelation: "payslips"
      referencedColumns: ["id"]
    }
                  ]
                },"payslips": {
                  Row: {
                    "absent_days": number,"deductions_minor": number,"generated_at": string,"gross_minor": number,"id": string,"late_minutes": number,"membership_id": string,"net_minor": number,"org_id": string,"overtime_minutes": number,"period_id": string,"rates_snapshot": NonNullable<Json>,"regular_minutes": number,"status": Database["public"]['Enums']["payslip_status"],"void_reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "absent_days"?: number,"deductions_minor"?: number,"generated_at"?: string,"gross_minor"?: number,"id"?: string,"late_minutes"?: number,"membership_id": string,"net_minor"?: number,"org_id": string,"overtime_minutes"?: number,"period_id": string,"rates_snapshot"?: NonNullable<Json>,"regular_minutes"?: number,"status"?: Database["public"]['Enums']["payslip_status"],"void_reason"?: string | null
                  }
                  Update: {
                    "absent_days"?: number,"deductions_minor"?: number,"generated_at"?: string,"gross_minor"?: number,"id"?: string,"late_minutes"?: number,"membership_id"?: string,"net_minor"?: number,"org_id"?: string,"overtime_minutes"?: number,"period_id"?: string,"rates_snapshot"?: NonNullable<Json>,"regular_minutes"?: number,"status"?: Database["public"]['Enums']["payslip_status"],"void_reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payslips_membership_id_fkey"
      columns: ["membership_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payslips_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payslips_period_id_fkey"
      columns: ["period_id"]
isOneToOne: false
      referencedRelation: "pay_periods"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "active": boolean,"auto_approve": boolean,"description": string | null,"id": string,"incentive_minor": number,"name": string,"needs_verification": boolean,"org_id": string,"price_minor": number,"sort": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"auto_approve"?: boolean,"description"?: string | null,"id"?: string,"incentive_minor"?: number,"name": string,"needs_verification"?: boolean,"org_id": string,"price_minor": number,"sort"?: number
                  }
                  Update: {
                    "active"?: boolean,"auto_approve"?: boolean,"description"?: string | null,"id"?: string,"incentive_minor"?: number,"name"?: string,"needs_verification"?: boolean,"org_id"?: string,"price_minor"?: number,"sort"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"role_permissions": {
                  Row: {
                    "permission": Database["public"]['Enums']["app_permission"],"role_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "permission": Database["public"]['Enums']["app_permission"],"role_id": string
                  }
                  Update: {
                    "permission"?: Database["public"]['Enums']["app_permission"],"role_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_permissions_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"roles": {
                  Row: {
                    "id": string,"is_owner": boolean,"name": string,"org_id": string,"scope": Database["public"]['Enums']["role_scope"]
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"is_owner"?: boolean,"name": string,"org_id": string,"scope"?: Database["public"]['Enums']["role_scope"]
                  }
                  Update: {
                    "id"?: string,"is_owner"?: boolean,"name"?: string,"org_id"?: string,"scope"?: Database["public"]['Enums']["role_scope"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "roles_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"shifts": {
                  Row: {
                    "ends_at": string,"id": string,"membership_id": string,"org_id": string,"site_id": string | null,"starts_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ends_at": string,"id"?: string,"membership_id": string,"org_id": string,"site_id"?: string | null,"starts_at": string
                  }
                  Update: {
                    "ends_at"?: string,"id"?: string,"membership_id"?: string,"org_id"?: string,"site_id"?: string | null,"starts_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shifts_membership_id_org_id_fkey"
      columns: ["membership_id","org_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "shifts_site_id_org_id_fkey"
      columns: ["site_id","org_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"sites": {
                  Row: {
                    "active": boolean,"address": string | null,"id": string,"name": string,"org_id": string,"timezone": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"address"?: string | null,"id"?: string,"name": string,"org_id": string,"timezone"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"address"?: string | null,"id"?: string,"name"?: string,"org_id"?: string,"timezone"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sites_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"time_entries": {
                  Row: {
                    "break_minutes": number,"clock_in": string,"clock_out": string | null,"edited": boolean,"flagged": boolean,"id": string,"membership_id": string,"org_id": string,"site_id": string | null,"source": Database["public"]['Enums']["entry_source"],"status": Database["public"]['Enums']["entry_status"],"work_date": string,"worked_minutes": number
                  }
                  ComputedFields: never
                  Insert: {
                    "break_minutes"?: number,"clock_in": string,"clock_out"?: string | null,"edited"?: boolean,"flagged"?: boolean,"id"?: string,"membership_id": string,"org_id": string,"site_id"?: string | null,"source"?: Database["public"]['Enums']["entry_source"],"status"?: Database["public"]['Enums']["entry_status"],"work_date": string,"worked_minutes"?: number
                  }
                  Update: {
                    "break_minutes"?: number,"clock_in"?: string,"clock_out"?: string | null,"edited"?: boolean,"flagged"?: boolean,"id"?: string,"membership_id"?: string,"org_id"?: string,"site_id"?: string | null,"source"?: Database["public"]['Enums']["entry_source"],"status"?: Database["public"]['Enums']["entry_status"],"work_date"?: string,"worked_minutes"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "time_entries_membership_id_org_id_fkey"
      columns: ["membership_id","org_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "time_entries_site_id_org_id_fkey"
      columns: ["site_id","org_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"timesheet_approvals": {
                  Row: {
                    "approved_at": string,"approved_by": string,"membership_id": string,"note": string | null,"period_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string,"approved_by": string,"membership_id": string,"note"?: string | null,"period_id": string
                  }
                  Update: {
                    "approved_at"?: string,"approved_by"?: string,"membership_id"?: string,"note"?: string | null,"period_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "timesheet_approvals_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "timesheet_approvals_membership_id_fkey"
      columns: ["membership_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "timesheet_approvals_period_id_fkey"
      columns: ["period_id"]
isOneToOne: false
      referencedRelation: "pay_periods"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "member_day_facts": {
                  Row: {
                    "day": string | null,"edited_entries": number | null,"entries": number | null,"flagged_entries": number | null,"grace_minutes": number,"late_minutes": number | null,"membership_id": string | null,"missing_outs": number | null,"org_id": string | null,"overtime_minutes": number | null,"scheduled": boolean | null,"scheduled_minutes": number | null,"worked": boolean | null,"worked_minutes": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_token": string }; Returns: string
                           },
"add_circle_geofence":
{ Args: { "p_lat": number,"p_lng": number,"p_radius_m": number,"p_site": string }; Returns: string
                           },
"add_polygon_geofence":
{ Args: { "p_points": Json,"p_site": string }; Returns: string
                           },
"admin_add_entry":
{ Args: { "p_break": number,"p_in": string,"p_member": string,"p_out": string,"p_reason": string,"p_site": string }; Returns: string
                           },
"admin_delete_entry":
{ Args: { "p_entry": string,"p_reason": string }; Returns: undefined
                           },
"admin_edit_entry":
{ Args: { "p_break": number,"p_entry": string,"p_in": string,"p_out": string,"p_reason": string }; Returns: undefined
                           },
"approve_request":
{ Args: { "p_note"?: string,"p_request": string }; Returns: undefined
                           },
"approve_timesheet":
{ Args: { "p_member": string,"p_note"?: string,"p_period": string }; Returns: undefined
                           },
"attendance_days":
{ Args: { "p_from": string,"p_org": string,"p_to": string }; Returns: {
              "day": string,"display_name": string,"expected": boolean,"first_in": string,"last_out": string,"late_minutes": number,"leave_type": string,"membership_id": string,"status": string,"worked_minutes": number,"working": boolean
            }[]
                           },
"cancel_application":
{ Args: { "p_application": string,"p_reason": string }; Returns: undefined
                           },
"clock_in":
{ Args: { "p_accuracy_m"?: number,"p_age_s"?: number,"p_challenge"?: string,"p_embedding"?: (number)[],"p_lat"?: number,"p_liveness"?: Json,"p_lng"?: number,"p_site": string,"p_user_agent"?: string }; Returns: Json
                           },
"clock_out":
{ Args: { "p_accuracy_m"?: number,"p_age_s"?: number,"p_challenge"?: string,"p_embedding"?: (number)[],"p_lat"?: number,"p_liveness"?: Json,"p_lng"?: number,"p_org": string,"p_user_agent"?: string }; Returns: Json
                           },
"create_organization":
{ Args: { "p_currency"?: string,"p_display_name": string,"p_name": string,"p_slug": string,"p_template"?: string,"p_timezone"?: string }; Returns: string
                           },
"create_pay_period":
{ Args: { "p_ends": string,"p_org": string,"p_starts": string }; Returns: string
                           },
"daily_totals":
{ Args: { "p_from": string,"p_org": string,"p_to": string }; Returns: {
              "day": string,"late_people": number,"people_scheduled": number,"people_worked": number,"worked_minutes": number
            }[]
                           },
"decide_application":
{ Args: { "p_application": string,"p_approve": boolean,"p_note"?: string }; Returns: undefined
                           },
"delete_shift":
{ Args: { "p_shift": string }; Returns: undefined
                           },
"end_break":
{ Args: { "p_org": string }; Returns: undefined
                           },
"enroll_face":
{ Args: { "p_consent": boolean,"p_embeddings": Json,"p_member": string,"p_model_version": string }; Returns: undefined
                           },
"face_status":
{ Args: { "p_member": string }; Returns: {
              "enrolled": boolean,"enrolled_at": string,"model_version": string
            }[]
                           },
"finalize_period":
{ Args: { "p_period": string }; Returns: undefined
                           },
"generate_payslips":
{ Args: { "p_period": string }; Returns: number
                           },
"invite_member":
{ Args: { "p_display_name": string,"p_email": string,"p_employment_type"?: Database["public"]['Enums']["employment_type"],"p_manager"?: string,"p_org": string,"p_role": string }; Returns: string
                           },
"issue_clock_challenge":
{ Args: { "p_org": string }; Returns: Json
                           },
"leave_balances":
{ Args: { "p_member": string,"p_year"?: number }; Returns: {
              "leave_type_id": string,"name": string,"paid": boolean,"remaining": number,"used": number,"yearly_days": number
            }[]
                           },
"lock_period":
{ Args: { "p_override_reason"?: string,"p_period": string }; Returns: undefined
                           },
"log_application":
{ Args: { "p_address"?: string,"p_customer_email": string,"p_customer_name": string,"p_customer_phone"?: string,"p_notes"?: string,"p_org": string,"p_product": string }; Returns: Json
                           },
"member_metrics":
{ Args: { "p_from": string,"p_org": string,"p_to": string }; Returns: {
              "attendance_rate": number,"correction_rate": number,"days_absent": number,"days_scheduled": number,"days_worked": number,"display_name": string,"employment_type": Database["public"]['Enums']["employment_type"],"enough_data": boolean,"hours_vs_schedule": number,"manager_id": string,"median_late_minutes": number,"membership_id": string,"missing_out_rate": number,"on_time_rate": number,"overtime_share": number,"punches": number,"scheduled_minutes": number,"verification_failure_rate": number,"worked_minutes": number
            }[]
                           },
"my_team":
{ Args: { "p_org": string }; Returns: {
              "display_name": string,"membership_id": string,"role_name": string
            }[]
                           },
"period_without_payslip":
{ Args: { "p_period": string }; Returns: {
              "display_name": string,"membership_id": string,"reason": string
            }[]
                           },
"reissue_payslip":
{ Args: { "p_member": string,"p_period": string }; Returns: string
                           },
"reject_request":
{ Args: { "p_note": string,"p_request": string }; Returns: undefined
                           },
"request_leave":
{ Args: { "p_attachment"?: string,"p_from": string,"p_org": string,"p_reason"?: string,"p_to": string,"p_type": string }; Returns: string
                           },
"resend_verification":
{ Args: { "p_application": string }; Returns: string
                           },
"review_leave":
{ Args: { "p_approve": boolean,"p_note"?: string,"p_request": string }; Returns: undefined
                           },
"save_member":
{ Args: { "p_display_name": string,"p_employee_code"?: string,"p_employment_type": Database["public"]['Enums']["employment_type"],"p_hired_on"?: string,"p_manager": string,"p_member": string,"p_role": string,"p_status": Database["public"]['Enums']["membership_status"] }; Returns: undefined
                           },
"save_shift":
{ Args: { "p_ends": string,"p_member": string,"p_shift"?: string,"p_site": string,"p_starts": string }; Returns: string
                           },
"site_geofences":
{ Args: { "p_org": string }; Returns: {
              "id": string,"kind": string,"radius_m": number,"ring": Json,"site_id": string
            }[]
                           },
"start_break":
{ Args: { "p_org": string }; Returns: undefined
                           },
"start_review":
{ Args: { "p_period": string }; Returns: undefined
                           },
"submit_request":
{ Args: { "p_entry": string,"p_evidence_link"?: string,"p_kind": Database["public"]['Enums']["request_kind"],"p_org"?: string,"p_reason": string,"p_requested_break"?: number,"p_requested_in"?: string,"p_requested_out"?: string,"p_site"?: string }; Returns: string
                           },
"time_in_points":
{ Args: { "p_day": string,"p_org": string }; Returns: {
              "accepted": boolean,"flagged": boolean,"lat": number,"lng": number,"membership_id": string,"reason": string,"server_time": string
            }[]
                           },
"unlock_period":
{ Args: { "p_period": string,"p_reason": string }; Returns: undefined
                           },
"update_application":
{ Args: { "p_address"?: string,"p_application": string,"p_customer_email": string,"p_customer_name": string,"p_customer_phone"?: string,"p_notes"?: string }; Returns: string
                           },
"verify_application":
{ Args: { "p_token": string }; Returns: Json
                           },
"void_payslip":
{ Args: { "p_payslip": string,"p_reason": string }; Returns: undefined
                           },
"withdraw_leave":
{ Args: { "p_request": string }; Returns: undefined
                           },
"withdraw_request":
{ Args: { "p_request": string }; Returns: undefined
                           }
          }
          Enums: {
            "app_permission": "time.clock"|"time.edit"|"requests.review"|"schedule.manage"|"payroll.run"|"people.manage"|"sites.manage"|"settings.manage"|"analytics.view"|"face.enroll_others"|"leave.review"|"sales.log"|"sales.review"|"products.manage"|"audit.view","application_status": "awaiting_verification"|"follow_up"|"for_approval"|"approved"|"rejected"|"cancelled","deduction_kind": "fixed"|"percent"|"bracket","employment_type": "regular"|"provisional"|"contract","entry_source": "app"|"manual","entry_status": "working"|"on_break"|"closed"|"missing_out","fail_policy": "block"|"flag","feature_key": "time_tracking"|"face_verification"|"geofence"|"breaks"|"corrections"|"scheduling"|"payroll"|"analytics"|"output_tracking"|"leave"|"sales","leave_status": "pending"|"approved"|"rejected"|"withdrawn","location_mode": "strict"|"balanced","membership_status": "invited"|"active"|"inactive","pay_basis": "hourly"|"daily"|"monthly","pay_frequency": "weekly"|"biweekly"|"semimonthly"|"monthly","payslip_status": "draft"|"final"|"void","period_status": "open"|"in_review"|"locked"|"finalized","punch_kind": "in"|"out"|"break_start"|"break_end","request_kind": "change_times"|"missing_time_out"|"missing_entry"|"delete_entry","request_status": "pending"|"approved"|"rejected"|"withdrawn","role_scope": "own"|"team"|"all"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "app_permission": ["time.clock", "time.edit", "requests.review", "schedule.manage", "payroll.run", "people.manage", "sites.manage", "settings.manage", "analytics.view", "face.enroll_others", "leave.review", "sales.log", "sales.review", "products.manage", "audit.view"],"application_status": ["awaiting_verification", "follow_up", "for_approval", "approved", "rejected", "cancelled"],"deduction_kind": ["fixed", "percent", "bracket"],"employment_type": ["regular", "provisional", "contract"],"entry_source": ["app", "manual"],"entry_status": ["working", "on_break", "closed", "missing_out"],"fail_policy": ["block", "flag"],"feature_key": ["time_tracking", "face_verification", "geofence", "breaks", "corrections", "scheduling", "payroll", "analytics", "output_tracking", "leave", "sales"],"leave_status": ["pending", "approved", "rejected", "withdrawn"],"location_mode": ["strict", "balanced"],"membership_status": ["invited", "active", "inactive"],"pay_basis": ["hourly", "daily", "monthly"],"pay_frequency": ["weekly", "biweekly", "semimonthly", "monthly"],"payslip_status": ["draft", "final", "void"],"period_status": ["open", "in_review", "locked", "finalized"],"punch_kind": ["in", "out", "break_start", "break_end"],"request_kind": ["change_times", "missing_time_out", "missing_entry", "delete_entry"],"request_status": ["pending", "approved", "rejected", "withdrawn"],"role_scope": ["own", "team", "all"]
          }
        }
} as const
