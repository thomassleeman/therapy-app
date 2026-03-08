"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createStandaloneClinicalNote } from "@/lib/db/queries";
import type { NoteContent, NoteFormat } from "@/lib/db/types";

export async function createStandaloneNoteAction({
  clientId,
  noteFormat,
  content,
}: {
  clientId: string;
  noteFormat: NoteFormat;
  content: NoteContent;
}) {
  const session = await auth();
  if (!session) {
    throw new Error("Unauthorized");
  }

  const note = await createStandaloneClinicalNote({
    clientId,
    therapistId: session.user.id,
    noteFormat,
    content,
  });

  revalidatePath(`/clients/${clientId}`);

  return note;
}
