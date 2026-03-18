import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  deleteClinicalDocument,
  updateClinicalDocument,
} from "@/lib/db/queries";
import type { ClinicalDocumentStatus } from "@/lib/documents/types";
import { CLINICAL_DOCUMENT_STATUSES } from "@/lib/documents/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const body = await request.json();
  const {
    title,
    content,
    status,
    reviewedAt,
  }: {
    title?: string;
    content?: Record<string, string>;
    status?: ClinicalDocumentStatus;
    reviewedAt?: string;
  } = body;

  if (status !== undefined && !CLINICAL_DOCUMENT_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: "Invalid status value" },
      { status: 400 }
    );
  }

  try {
    const updated = await updateClinicalDocument({
      id,
      therapistId: session.user.id,
      ...(title !== undefined && { title }),
      ...(content !== undefined && { content }),
      ...(status !== undefined && { status }),
      ...(reviewedAt !== undefined && { reviewedAt }),
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      { error: "Failed to update document" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await deleteClinicalDocument({ id, therapistId: session.user.id });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}
