import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

interface RequestBody {
  email: string;
  password: string;
  full_name?: string;
  role: 'super_admin' | 'manager' | 'staff';
  warehouse_id?: string;
}

serve(async (req) => {
  // #region agent log
  console.log(JSON.stringify({location:'create-admin-user:17',message:'Edge Function called',data:{method:req.method,hasAuthHeader:!!req.headers.get("Authorization")},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'}));
  // #endregion
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    // Only allow POST
    if (req.method !== "POST") {
      // #region agent log
      console.log(JSON.stringify({location:'create-admin-user:28',message:'Method not allowed',data:{method:req.method},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'}));
      // #endregion
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get Supabase environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // #region agent log
    console.log(JSON.stringify({location:'create-admin-user:42',message:'Environment variables check',data:{hasUrl:!!supabaseUrl,hasAnonKey:!!supabaseAnonKey,hasServiceKey:!!supabaseServiceKey},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'}));
    // #endregion

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      console.error("Missing Supabase environment variables");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    // #region agent log
    console.log(JSON.stringify({location:'create-admin-user:55',message:'Authorization header check',data:{hasAuthHeader:!!authHeader,authHeaderLength:authHeader?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'}));
    // #endregion
    
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Extract JWT token from Authorization header
    const token = authHeader.replace("Bearer ", "");

    // Create Supabase client with anon key
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    // Verify JWT token and get user
    const {
      data: { user: currentUser },
      error: userError,
    } = await supabaseClient.auth.getUser(token);

    // #region agent log
    console.log(JSON.stringify({location:'create-admin-user:75',message:'Token verification',data:{hasUser:!!currentUser,hasError:!!userError,errorMessage:userError?.message||null,userId:currentUser?.id?.substring(0,8)+'...'||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'}));
    // #endregion

    if (userError || !currentUser) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ 
          error: "Unauthorized",
          details: userError?.message || "Invalid or expired token",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if current user has users.manage permission
    const { data: hasPermission, error: permError } = await supabaseClient.rpc(
      "has_permission",
      {
        _user_id: currentUser.id,
        _permission_code: "users.manage",
      }
    );

    // #region agent log
    console.log(JSON.stringify({location:'create-admin-user:100',message:'Permission check',data:{hasPermission:!!hasPermission,hasError:!!permError,errorMessage:permError?.message||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'}));
    // #endregion

    if (permError || !hasPermission) {
      return new Response(
        JSON.stringify({ error: "Forbidden: You don't have permission to manage users" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse request body
    const body = await req.json();
    const { email, password, full_name, role, warehouse_id }: RequestBody = body;
    
    // #region agent log
    console.log(JSON.stringify({location:'create-admin-user:111',message:'Request body parsed',data:{hasEmail:!!email,hasPassword:!!password,hasRole:!!role,role:role||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'}));
    // #endregion

    // Validate input
    if (!email || !password || !role) {
      // #region agent log
      console.log(JSON.stringify({location:'create-admin-user:115',message:'Validation failed - missing fields',data:{hasEmail:!!email,hasPassword:!!password,hasRole:!!role},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'}));
      // #endregion
      return new Response(
        JSON.stringify({ error: "Missing required fields: email, password, role" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate role
    if (!['super_admin', 'manager', 'staff'].includes(role)) {
      // #region agent log
      console.log(JSON.stringify({location:'create-admin-user:125',message:'Validation failed - invalid role',data:{role:role},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I'}));
      // #endregion
      return new Response(
        JSON.stringify({ error: "Invalid role. Must be one of: super_admin, manager, staff" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const warehouseId = String(warehouse_id || "").trim() || null;
    if (role !== "super_admin" && !warehouseId) {
      return new Response(
        JSON.stringify({ error: "Chọn chi nhánh phụ trách cho quản lý hoặc nhân viên" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Validate password strength
    if (password.length < 6) {
      // #region agent log
      console.log(JSON.stringify({location:'create-admin-user:136',message:'Validation failed - password too short',data:{passwordLength:password.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'J'}));
      // #endregion
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create Supabase Admin client (with service role key for admin operations)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    let warehouse: { id: string; code: string; name: string } | null = null;
    if (warehouseId) {
      const { data, error } = await supabaseAdmin
        .from("warehouses")
        .select("id, code, name")
        .eq("id", warehouseId)
        .maybeSingle();
      if (error || !data) {
        return new Response(JSON.stringify({ error: "Chi nhánh không hợp lệ" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      warehouse = data;
    }

    // Create user in auth.users
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password: password,
      email_confirm: true, // Auto-confirm email for admin-created users
      user_metadata: {
        full_name: full_name || "",
        warehouse_id: warehouse?.id || null,
        warehouse_code: warehouse?.code || null,
      },
    });

    // #region agent log
    console.log(JSON.stringify({location:'create-admin-user:155',message:'User creation attempt',data:{hasUser:!!newUser?.user,hasError:!!createError,errorMessage:createError?.message||null,userId:newUser?.user?.id?.substring(0,8)+'...'||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'K'}));
    // #endregion

    if (createError) {
      console.error("Error creating user:", createError);
      return new Response(
        JSON.stringify({ 
          error: createError.message || "Failed to create user",
          details: createError.message,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!newUser.user) {
      return new Response(
        JSON.stringify({ error: "User creation failed: No user returned" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Assign role in user_roles table
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: newUser.user.id,
        role: role,
      });

    // #region agent log
    console.log(JSON.stringify({location:'create-admin-user:189',message:'Role assignment attempt',data:{hasError:!!roleError,errorMessage:roleError?.message||null,role:role},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'L'}));
    // #endregion

    if (roleError) {
      // If role assignment fails, try to clean up the created user
      console.error("Error assigning role:", roleError);
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id).catch(() => {
        // Ignore cleanup errors
      });

      return new Response(
        JSON.stringify({ 
          error: "Failed to assign role",
          details: roleError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
      {
        user_id: newUser.user.id,
        full_name: full_name || "",
        warehouse_id: warehouse?.id || null,
      },
      { onConflict: "user_id" },
    );
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      return new Response(JSON.stringify({ error: "Failed to assign branch", details: profileError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (role === "manager" && warehouse) {
      const { error: scopeError } = await supabaseAdmin
        .from("branch_manager_scopes")
        .upsert(
          { manager_user_id: newUser.user.id, warehouse_id: warehouse.id },
          { onConflict: "manager_user_id,warehouse_id" },
        );
      if (scopeError) {
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
        return new Response(JSON.stringify({ error: "Failed to assign manager scope", details: scopeError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUser.user.id,
          email: newUser.user.email,
          role: role,
        },
        message: `User ${email} created successfully with role ${role}`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    // #region agent log
    console.log(JSON.stringify({location:'create-admin-user:231',message:'Unhandled error',data:{errorMessage:error instanceof Error ? error.message : String(error),errorType:error?.constructor?.name||typeof error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'M'}));
    // #endregion
    console.error("Error in create-admin-user function:", error);
    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

