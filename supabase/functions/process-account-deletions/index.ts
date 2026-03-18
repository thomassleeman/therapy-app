// Schedule this function to run every 15 minutes via pg_cron + pg_net:
//
// SELECT cron.schedule(
//   'process-account-deletions',
//   '*/15 * * * *',
//   $$SELECT net.http_post(
//     url := 'https://<project-ref>.supabase.co/functions/v1/process-account-deletions',
//     headers := jsonb_build_object(
//       'Authorization', 'Bearer ' || current_setting('supabase.service_role_key')
//     )
//   );$$
// );

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface AuditEntry {
  action: string;
  timestamp: string;
  details: {
    storage_files_deleted: number;
    therapy_sessions_deleted: number;
    chats_deleted: number;
    clients_deleted: number;
    therapist_profile_deleted: boolean;
    auth_user_deleted: boolean;
    errors: string[];
  };
}

interface DeletionRequest {
  id: string;
  user_id: string;
  user_email: string | null;
  status: string;
  audit_log: AuditEntry[];
}

async function deleteStorageFiles(userId: string): Promise<{
  count: number;
  error: string | null;
}> {
  try {
    // List top-level folders for this user (each is a sessionId)
    const { data: sessionFolders, error: listError } = await supabase.storage
      .from("session-audio")
      .list(userId);

    if (listError) {
      // Bucket may not exist or user has no folder — treat as success with 0 files
      if (
        listError.message.includes("not found") ||
        listError.message.includes("does not exist")
      ) {
        return { count: 0, error: null };
      }
      return { count: 0, error: `Storage list error: ${listError.message}` };
    }

    if (!sessionFolders || sessionFolders.length === 0) {
      return { count: 0, error: null };
    }

    let totalDeleted = 0;

    for (const folder of sessionFolders) {
      // Each folder is a session directory — list files within it
      const folderPath = `${userId}/${folder.name}`;
      const { data: files, error: filesError } = await supabase.storage
        .from("session-audio")
        .list(folderPath);

      if (filesError) {
        // Log but continue — don't abort over a single subfolder
        console.error(
          `Failed to list files in ${folderPath}: ${filesError.message}`,
        );
        continue;
      }

      if (!files || files.length === 0) continue;

      const filePaths = files.map((f) => `${folderPath}/${f.name}`);
      const { error: deleteError } = await supabase.storage
        .from("session-audio")
        .remove(filePaths);

      if (deleteError) {
        console.error(
          `Failed to delete files in ${folderPath}: ${deleteError.message}`,
        );
        continue;
      }

      totalDeleted += filePaths.length;
    }

    return { count: totalDeleted, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { count: 0, error: `Storage deletion exception: ${message}` };
  }
}

async function deleteFromTable(
  table: string,
  column: string,
  userId: string,
): Promise<{ count: number; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from(table)
      .delete()
      .eq(column, userId)
      .select("id");

    if (error) {
      return { count: 0, error: `Delete from ${table}: ${error.message}` };
    }

    return { count: data?.length ?? 0, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { count: 0, error: `Delete from ${table} exception: ${message}` };
  }
}

async function deleteAuthUser(
  userId: string,
): Promise<{ deleted: boolean; error: string | null }> {
  try {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
      return { deleted: false, error: `Auth deletion: ${error.message}` };
    }
    return { deleted: true, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { deleted: false, error: `Auth deletion exception: ${message}` };
  }
}

async function processRequest(request: DeletionRequest): Promise<boolean> {
  const userId = request.user_id;
  const errors: string[] = [];

  console.log(
    `Processing deletion for user ${userId} (request ${request.id})`,
  );

  // Mark as processing
  await supabase
    .from("account_deletion_requests")
    .update({ status: "processing" })
    .eq("id", request.id);

  // Step 1: Delete audio files from storage
  const storage = await deleteStorageFiles(userId);
  if (storage.error) errors.push(storage.error);
  console.log(`  Storage: ${storage.count} files deleted`);

  // Step 2: Delete therapy_sessions (cascades: session_segments, session_consents, clinical_notes)
  const sessions = await deleteFromTable(
    "therapy_sessions",
    "therapist_id",
    userId,
  );
  if (sessions.error) errors.push(sessions.error);
  console.log(`  therapy_sessions: ${sessions.count} deleted`);

  // Step 3: Delete Chats (cascades: Message_v2, Stream, Vote_v2)
  const chats = await deleteFromTable("Chat", "userId", userId);
  if (chats.error) errors.push(chats.error);
  console.log(`  Chat: ${chats.count} deleted`);

  // Step 4: Delete clients (cascades: client_tag_assignments, clinical_documents → clinical_document_references)
  const clients = await deleteFromTable("clients", "therapist_id", userId);
  if (clients.error) errors.push(clients.error);
  console.log(`  clients: ${clients.count} deleted`);

  // Step 5: Delete therapist profile
  const profile = await deleteFromTable("therapist_profiles", "id", userId);
  if (profile.error) errors.push(profile.error);
  console.log(`  therapist_profiles: ${profile.count} deleted`);

  // Step 6: Delete auth user (critical step)
  const auth = await deleteAuthUser(userId);
  if (auth.error) errors.push(auth.error);
  console.log(`  auth user: ${auth.deleted ? "deleted" : "FAILED"}`);

  // Build audit entry
  const auditEntry: AuditEntry = {
    action: "executed",
    timestamp: new Date().toISOString(),
    details: {
      storage_files_deleted: storage.count,
      therapy_sessions_deleted: sessions.count,
      chats_deleted: chats.count,
      clients_deleted: clients.count,
      therapist_profile_deleted: profile.count > 0,
      auth_user_deleted: auth.deleted,
      errors,
    },
  };

  // Auth user deletion is the only truly critical step
  const succeeded = auth.deleted;
  const existingLog = Array.isArray(request.audit_log)
    ? request.audit_log
    : [];

  await supabase
    .from("account_deletion_requests")
    .update({
      status: succeeded ? "completed" : "failed",
      completed_at: new Date().toISOString(),
      error_message: succeeded
        ? null
        : "Auth user deletion failed — see audit_log",
      audit_log: [...existingLog, auditEntry],
    })
    .eq("id", request.id);

  console.log(
    `  Request ${request.id}: ${succeeded ? "completed" : "FAILED"}${errors.length > 0 ? ` (${errors.length} errors)` : ""}`,
  );

  return succeeded;
}

Deno.serve(async (req) => {
  // Only allow POST (from pg_cron) and GET (for manual invocation / health check)
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Fetch pending requests ready for execution
    const { data: requests, error: fetchError } = await supabase
      .from("account_deletion_requests")
      .select("*")
      .eq("status", "pending")
      .lte("execute_after", new Date().toISOString())
      .order("requested_at", { ascending: true })
      .limit(5);

    if (fetchError) {
      console.error(`Failed to fetch pending requests: ${fetchError.message}`);
      return new Response(
        JSON.stringify({ error: `Fetch failed: ${fetchError.message}` }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!requests || requests.length === 0) {
      console.log("No pending deletion requests");
      return new Response(
        JSON.stringify({ processed: 0, completed: 0, failed: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(`Found ${requests.length} pending deletion request(s)`);

    let completed = 0;
    let failed = 0;

    for (const request of requests) {
      const success = await processRequest(request as DeletionRequest);
      if (success) {
        completed++;
      } else {
        failed++;
      }
    }

    const result = {
      processed: requests.length,
      completed,
      failed,
    };

    console.log(`Done: ${JSON.stringify(result)}`);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Unhandled error: ${message}`);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
